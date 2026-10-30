import asyncio
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.collation import Collation
from pymongo.errors import DuplicateKeyError
from app.config import settings
from app.seed import DEFAULT_SHELVES

# ユーザー名の比較で大文字小文字を区別しない (一意インデックスと検索の両方で使う)
USER_NAME_COLLATION = Collation(locale="en", strength=2)

# 備品の管理番号は「ジャンルの先頭3文字-連番」。重複で採番し直す回数の上限
LABEL_PREFIX_LENGTH = 3
LABEL_RETRY_LIMIT = 5


def get_user_display_name(user: Dict[str, Any]) -> str:
    """画面に出すユーザー名 (名 姓)"""
    return f"{user['first_name']} {user['last_name']}"


class DatabaseManager:
    def __init__(self):
        self.client: Optional[AsyncIOMotorClient] = None
        self.db = None
        self._lock = asyncio.Lock()

    async def connect(self):
        """MongoDB に接続する。繋がらなければ例外で起動を止める。"""
        client = AsyncIOMotorClient(
            settings.MONGODB_URL,
            serverSelectionTimeoutMS=1500,
            tz_aware=True
        )
        await client.admin.command('ping')
        self.client = client
        self.db = client[settings.DATABASE_NAME]
        print(" Connected to MongoDB successfully.")
        await self._ensure_indexes()
        await self._seed_shelves_if_empty()

    async def _ensure_indexes(self):
        # 起動のたびに呼ばれるが、作成済みなら何もしない
        await self.db.users.create_index(
            [("first_name", 1), ("last_name", 1)],  # 名 + 姓の組み合わせ
            unique=True,                            # 重複を禁止
            collation=USER_NAME_COLLATION,          # 大文字小文字は区別しない
        )
        await self.db.shelves.create_index("label", unique=True)
        await self.db.items.create_index(
            "label",
            unique=True,
            partialFilterExpression={"label": {"$type": "string"}},  # label のない古い備品があっても作れるようにする
        )
        await self.db.usage_logs.create_index([("item_id", 1), ("timestamp", -1)])

    async def _seed_shelves_if_empty(self):
        if await self.db.shelves.count_documents({}) == 0:
            print("🌱 Seeding MongoDB shelves (A-1 to C-6-6)...")
            await self.db.shelves.insert_many([dict(s) for s in DEFAULT_SHELVES])

    # ---------------- Item state (usage_logs から導出) ----------------
    async def _get_item_states(self, item_ids: List[ObjectId]) -> Dict[ObjectId, Dict[str, Any]]:
        """備品ごとの現在の状態を、最新の borrow / return のログから導く"""
        states = {
            item_id: {"status": "available", "current_user_id": None, "last_user_id": None, "last_used_at": None}
            for item_id in item_ids
        }
        if not item_ids:
            return states

        latest_logs = self.db.usage_logs.aggregate([
            {"$match": {"item_id": {"$in": item_ids}, "action": {"$in": ["borrow", "return"]}}},
            {"$sort": {"timestamp": -1, "_id": -1}},
            {"$group": {
                "_id": "$item_id",
                "action": {"$first": "$action"},
                "user_id": {"$first": "$user_id"},
                "timestamp": {"$first": "$timestamp"},
            }},
        ])
        async for log in latest_logs:
            is_borrowed = log["action"] == "borrow"
            states[log["_id"]] = {
                "status": "in_use" if is_borrowed else "available",
                "current_user_id": log["user_id"] if is_borrowed else None,
                "last_user_id": log["user_id"],
                "last_used_at": log["timestamp"],
            }
        return states

    # ---------------- Shelves ----------------
    async def _attach_item_counts(self, shelves: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """各棚に、備品の数 (item_count) と貸出可能な数 (available_count) を付ける"""
        items = await self.db.items.find(
            {"shelf_id": {"$in": [s["_id"] for s in shelves]}, "deleted_at": None},
            {"shelf_id": 1},
        ).to_list(None)
        states = await self._get_item_states([i["_id"] for i in items])

        for shelf in shelves:
            item_ids = [i["_id"] for i in items if i["shelf_id"] == shelf["_id"]]
            shelf["item_count"] = len(item_ids)
            shelf["available_count"] = sum(1 for i in item_ids if states[i]["status"] == "available")
        return shelves

    async def get_shelves(self) -> List[Dict[str, Any]]:
        shelves = await self.db.shelves.find().to_list(None)
        await self._attach_item_counts(shelves)
        return sorted(shelves, key=lambda s: (s["row"], s["col"], s["label"]))

    async def get_shelf(self, shelf_id: str) -> Optional[Dict[str, Any]]:
        if not ObjectId.is_valid(shelf_id):
            return None
        shelf = await self.db.shelves.find_one({"_id": ObjectId(shelf_id)})
        if not shelf:
            return None
        await self._attach_item_counts([shelf])
        return shelf

    # ---------------- Users ----------------
    async def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        if not ObjectId.is_valid(user_id):
            return None
        return await self.db.users.find_one({"_id": ObjectId(user_id)})

    async def list_users_by_grade(self, grade: str) -> List[Dict[str, Any]]:
        return await self.db.users.find(
            {"grade": grade},
            {"first_name": 1, "last_name": 1},
        ).sort([("last_name", 1), ("first_name", 1)]).collation(USER_NAME_COLLATION).to_list(None)

    async def find_user_by_name(self, first_name: str, last_name: str) -> Optional[Dict[str, Any]]:
        return await self.db.users.find_one(
            {"first_name": first_name, "last_name": last_name},
            collation=USER_NAME_COLLATION,
        )

    async def create_user(self, first_name: str, last_name: str, grade: str) -> Dict[str, Any]:
        user = {
            "first_name": first_name,
            "last_name": last_name,
            "grade": grade,
            "created_at": datetime.now(timezone.utc),
        }
        try:
            res = await self.db.users.insert_one(user)
        except DuplicateKeyError:
            return await self.find_user_by_name(first_name, last_name)
        return dict(user, _id=res.inserted_id)

    # ---------------- Items ----------------
    async def get_items(
        self,
        shelf_id: Optional[str] = None,
        query: Optional[str] = None,
        status: Optional[str] = None,
        category: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        mongo_filter: Dict[str, Any] = {"deleted_at": None}
        if shelf_id:
            if not ObjectId.is_valid(shelf_id):
                return []
            mongo_filter["shelf_id"] = ObjectId(shelf_id)
        if category:
            mongo_filter["category"] = category
        if query:
            pattern = {"$regex": re.escape(query), "$options": "i"}
            mongo_filter["$or"] = [{"label": pattern}, {"product_name": pattern}, {"description": pattern}, {"category": pattern}]

        items = await self.db.items.find(mongo_filter).to_list(None)
        await self._attach_item_states(items)

        # status と使用者は、ログから導いた値なので、導いたあとに絞る
        if status:
            items = [i for i in items if i["status"] == status]
        if user_id:
            items = [i for i in items if str(i["current_user_id"]) == user_id]
        return items

    async def get_item(self, item_id: str) -> Optional[Dict[str, Any]]:
        if not ObjectId.is_valid(item_id):
            return None
        item = await self.db.items.find_one({"_id": ObjectId(item_id), "deleted_at": None})
        if not item:
            return None
        await self._attach_item_states([item])
        return item

    async def _attach_item_states(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """備品に、ログから導いた状態と、表示用の名前 (使用者の名前、棚の label) を付ける"""
        states = await self._get_item_states([i["_id"] for i in items])
        user_ids = {uid for s in states.values() for uid in (s["current_user_id"], s["last_user_id"]) if uid}
        users = await self.db.users.find({"_id": {"$in": list(user_ids)}}).to_list(None)
        user_names = {u["_id"]: get_user_display_name(u) for u in users}
        shelves = await self.db.shelves.find({"_id": {"$in": list({i["shelf_id"] for i in items})}}, {"label": 1}).to_list(None)
        shelf_labels = {s["_id"]: s["label"] for s in shelves}

        for item in items:
            state = states[item["_id"]]
            item.update(state)
            item["current_user_name"] = user_names.get(state["current_user_id"])
            item["last_user_name"] = user_names.get(state["last_user_id"])
            item["shelf_label"] = shelf_labels.get(item["shelf_id"])
        return items

    async def _next_item_label(self, category: str) -> str:
        """管理番号を採番する。ジャンルの先頭3文字に、同じ接頭辞の最大番号 + 1 を付ける (削除済みの備品の番号も数える)"""
        prefix = category[:LABEL_PREFIX_LENGTH].upper()
        pattern = {"$regex": f"^{re.escape(prefix)}-\\d+$"}
        docs = await self.db.items.find({"label": pattern}, {"label": 1}).to_list(None)
        last = max((int(d["label"].rsplit("-", 1)[1]) for d in docs), default=0)
        return f"{prefix}-{last + 1:03d}"

    async def create_item(self, data: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
        """備品を登録して、register のログを残す"""
        now = datetime.now(timezone.utc)
        category = data.get("category") or "その他"
        item = {
            "product_name": data["product_name"],
            "shelf_id": ObjectId(data["shelf_id"]),
            "category": category,
            "description": data.get("description", ""),
            "image_id": ObjectId(data["image_id"]) if data.get("image_id") else None,
            "created_at": now,
            "updated_at": now,
            "deleted_at": None,
        }
        # 同時に登録されて番号が重なったら (一意インデックスで弾かれる)、採番し直す
        for _ in range(LABEL_RETRY_LIMIT):
            item["label"] = await self._next_item_label(category)
            try:
                res = await self.db.items.insert_one(item)
                break
            except DuplicateKeyError:
                item.pop("_id", None)
        else:
            raise RuntimeError("管理番号の採番に失敗しました。もう一度登録してください。")
        await self.create_log(res.inserted_id, user["_id"], "register")
        return await self.get_item(str(res.inserted_id))

    async def delete_item(self, item_id: str, user: Dict[str, Any]) -> bool:
        """備品を論理削除して、delete のログを残す。見つからなければ False"""
        if not ObjectId.is_valid(item_id):
            return False
        now = datetime.now(timezone.utc)
        res = await self.db.items.update_one(
            {"_id": ObjectId(item_id), "deleted_at": None},
            {"$set": {"deleted_at": now, "updated_at": now}},
        )
        if res.matched_count == 0:
            return False
        await self.create_log(ObjectId(item_id), user["_id"], "delete")
        return True

    async def borrow_item(self, item_id: str, user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        async with self._lock:
            item = await self.get_item(item_id)
            if not item:
                return None
            await self.create_log(item["_id"], user["_id"], "borrow")
            return await self.get_item(item_id)

    async def return_item(self, item_id: str, user: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
        """返却する。user を省略すると、使用中のユーザーが返却したことにする"""
        async with self._lock:
            item = await self.get_item(item_id)
            if not item:
                return None
            if item["status"] != "in_use":
                return item
            returned_by = user["_id"] if user else item["current_user_id"]
            await self.create_log(item["_id"], returned_by, "return")
            return await self.get_item(item_id)

    # ---------------- Usage Logs ----------------
    async def create_log(self, item_id: ObjectId, user_id: ObjectId, action: str) -> Dict[str, Any]:
        """action: register / delete / borrow / return"""
        log = {
            "item_id": item_id,
            "user_id": user_id,
            "action": action,
            "timestamp": datetime.now(timezone.utc),
        }
        res = await self.db.usage_logs.insert_one(log)
        return dict(log, _id=res.inserted_id)

    async def get_logs(self, item_id: Optional[str] = None, user_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        for field, value in (("item_id", item_id), ("user_id", user_id)):
            if value:
                if not ObjectId.is_valid(value):
                    return []
                query[field] = ObjectId(value)
        logs = await self.db.usage_logs.find(query).sort([("timestamp", -1), ("_id", -1)]).limit(limit).to_list(None)

        # 表示用に、備品名とユーザー名を ID から引いて付ける
        items = await self.db.items.find({"_id": {"$in": [l["item_id"] for l in logs]}}, {"product_name": 1}).to_list(None)
        users = await self.db.users.find({"_id": {"$in": [l["user_id"] for l in logs]}}).to_list(None)
        item_names = {i["_id"]: i["product_name"] for i in items}
        user_names = {u["_id"]: get_user_display_name(u) for u in users}
        for log in logs:
            log["item_name"] = item_names.get(log["item_id"], "不明")
            log["user_name"] = user_names.get(log["user_id"], "不明")
        return logs

    # ---------------- Images (MongoDB Binary Storage) ----------------
    async def save_image(self, image_bytes: bytes, content_type: str = "image/webp", filename: str = "") -> str:
        res = await self.db.images.insert_one({
            "data": image_bytes,
            "content_type": content_type,
            "filename": filename,
            "size": len(image_bytes),
            "created_at": datetime.now(timezone.utc),
        })
        return str(res.inserted_id)

    async def get_image(self, image_id: str) -> Optional[tuple[bytes, str]]:
        if not ObjectId.is_valid(image_id):
            return None
        doc = await self.db.images.find_one({"_id": ObjectId(image_id)})
        if not doc:
            return None
        return bytes(doc["data"]), doc["content_type"]

db = DatabaseManager()

