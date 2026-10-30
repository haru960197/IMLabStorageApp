import os
import io
import csv
import json
import uuid
import shutil
from typing import Optional, List
from PIL import Image, ImageOps
from bson import ObjectId
from fastapi import APIRouter, HTTPException, UploadFile, File, Query, Response, Depends
from fastapi.responses import StreamingResponse
from app.models import ItemResponse, ItemCreate, ItemBorrowRequest, ShelfResponse, UsageLogResponse
from app.database import db
from app.config import settings
from app.auth import verify_auth

router = APIRouter(prefix="/items", tags=["items"])

@router.get("", response_model=List[ItemResponse])
async def list_items(
    q: Optional[str] = Query(None, description="検索キーワード"),
    shelf_id: Optional[str] = Query(None, description="棚ID"),
    status: Optional[str] = Query(None, description="ステータス (available / in_use)"),
    category: Optional[str] = Query(None, description="カテゴリ"),
    user_id: Optional[str] = Query(None, description="使用者ID")
):
    """備品一覧を取得 (検索・フィルタ対応)"""
    return await db.get_items(
        query=q,
        shelf_id=shelf_id,
        status=status,
        category=category,
        user_id=user_id
    )

@router.post("", response_model=ItemResponse, dependencies=[Depends(verify_auth)])
async def create_item(item_in: ItemCreate):
    """新しい備品を登録"""
    # Shelf validation
    shelf = await db.get_shelf(item_in.shelf_id)
    if not shelf:
        raise HTTPException(status_code=400, detail=f"棚 {item_in.shelf_id} が存在しません。")

    if item_in.image_id and not ObjectId.is_valid(item_in.image_id):
        raise HTTPException(status_code=400, detail="画像IDが正しくありません。")

    user = await db.get_user(item_in.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません。")

    created = await db.create_item(item_in.model_dump(), user)
    return created

@router.post("/upload-image", dependencies=[Depends(verify_auth)])
async def upload_image(file: UploadFile = File(...)):
    """備品画像のアップロード (MongoDB保存 & 自動圧縮WebP変換)"""
    allowed_exts = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="許可されていない画像形式です。jpg/png/webp/gifをご使用ください。")

    contents = await file.read()
    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="画像サイズは15MB以下にしてください。")

    try:
        # Optimize image with Pillow
        image = Image.open(io.BytesIO(contents))
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "P"):
            image = image.convert("RGBA")
        else:
            image = image.convert("RGB")

        # Resize if dimension > 1200
        max_size = 1200
        if image.width > max_size or image.height > max_size:
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

        output = io.BytesIO()
        image.save(output, format="WEBP", quality=82, method=4)
        optimized_bytes = output.getvalue()

        # Save to MongoDB
        image_id = await db.save_image(
            image_bytes=optimized_bytes,
            content_type="image/webp",
            filename=file.filename or "image.webp"
        )
        return {"image_id": image_id}
    except Exception as e:
        # Fallback to saving raw bytes
        image_id = await db.save_image(
            image_bytes=contents,
            content_type=file.content_type or "image/jpeg",
            filename=file.filename or "image"
        )
        return {"image_id": image_id}

@router.get("/export/json")
async def export_json():
    """備品一覧をJSON形式でエクスポート"""
    items = [ItemResponse.model_validate(i).model_dump(mode="json") for i in await db.get_items()]
    json_str = json.dumps(items, ensure_ascii=False, indent=2)
    return Response(
        content=json_str,
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="imlab_items.json"'}
    )

@router.get("/export/csv")
async def export_csv():
    """備品一覧をCSV形式でエクスポート"""
    items = [ItemResponse.model_validate(i) for i in await db.get_items()]
    output = io.StringIO()
    # Write UTF-8 BOM so Excel opens it correctly with Japanese characters
    output.write('\ufeff')
    writer = csv.writer(output)
    writer.writerow([
        "備品ID", "管理番号", "品名", "保管棚", "ジャンル", "状態",
        "現在の使用者", "最後に使用した人", "最終使用日時", "詳細情報", "画像URL"
    ])
    for item in items:
        status_label = "使用中" if item.status == "in_use" else "貸出可能"
        writer.writerow([
            item.id,
            item.label,
            item.product_name,
            item.shelf_label or "",
            item.category,
            status_label,
            item.current_user_name or "",
            item.last_user_name or "",
            item.last_used_at.isoformat() if item.last_used_at else "",
            item.description,
            item.image_url or ""
        ])

    csv_data = output.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="imlab_items.csv"'}
    )

@router.get("/{item_id}")
async def get_item_detail(item_id: str):
    """備品詳細と過去の利用履歴を取得"""
    item = await db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    shelf = await db.get_shelf(str(item["shelf_id"]))
    logs = await db.get_logs(item_id=item_id, limit=20)

    return {
        "item": ItemResponse.model_validate(item),
        "shelf": ShelfResponse.model_validate(shelf) if shelf else None,
        "logs": [UsageLogResponse.model_validate(log) for log in logs]
    }

@router.post("/{item_id}/borrow", response_model=ItemResponse, dependencies=[Depends(verify_auth)])
async def borrow_item(item_id: str, req: ItemBorrowRequest):
    """備品を使用中にする"""
    item = await db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if item.get("status") == "in_use":
        raise HTTPException(
            status_code=400,
            detail=f"この備品はすでに {item.get('current_user_name', '別のユーザー')} が使用中です。"
        )

    user = await db.get_user(req.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません。")

    updated = await db.borrow_item(item_id, user)
    return updated

@router.post("/{item_id}/return", response_model=ItemResponse, dependencies=[Depends(verify_auth)])
async def return_item(item_id: str, req: Optional[ItemBorrowRequest] = None):
    """備品を返却する"""
    item = await db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    # ユーザーが分からなければ None (使用中のユーザーが返却したことになる)
    user = await db.get_user(req.user_id) if req and req.user_id else None

    updated = await db.return_item(item_id, user)
    return updated

@router.delete("/{item_id}", dependencies=[Depends(verify_auth)])
async def delete_item(item_id: str, user_id: str = Query(..., description="削除するユーザーのID")):
    """備品を削除 (論理削除。削除の履歴をログに残す)"""
    item = await db.get_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    user = await db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="ユーザーが見つかりません。")

    deleted = await db.delete_item(item_id, user)
    if not deleted:
        raise HTTPException(status_code=500, detail="備品の削除に失敗しました。")
    return {"status": "ok", "deleted_id": item_id}


