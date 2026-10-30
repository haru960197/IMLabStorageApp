from datetime import datetime
from typing import Annotated, Optional, Literal
from pydantic import AliasChoices, BaseModel, BeforeValidator, ConfigDict, Field, StringConstraints, computed_field

# ---------------- Common ----------------
# MongoDB の ObjectId を API では文字列として扱う
PyObjectId = Annotated[str, BeforeValidator(str)]
# 値がないとき (None) は None のまま、ある場合だけ文字列にする
OptionalPyObjectId = Annotated[Optional[str], BeforeValidator(lambda v: None if v is None else str(v))]

# ---------------- Users ----------------
NameStr = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]

GradeType = Literal[
    "B1", "B2", "B3", "B4",
    "M1", "M2",
    "D1", "D2", "D3",
    "教員", "研究員", "OB/OG", "その他"
]

class UserBase(BaseModel):
    first_name: NameStr = Field(..., description="名(英語表記)")
    last_name: NameStr = Field(..., description="姓(英語表記)")
    grade: GradeType = Field(..., description="学年/身分")

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    # Mongo のドキュメントは `_id`、レスポンスは `id` で出す
    id: PyObjectId = Field(validation_alias=AliasChoices("_id", "id"))
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class UserSuggestion(BaseModel):
    """ログイン画面のサジェスト用 (名前と ID のみ)"""
    id: PyObjectId = Field(validation_alias=AliasChoices("_id", "id"))
    first_name: str
    last_name: str

    model_config = ConfigDict(from_attributes=True)

class UserLoginRequest(BaseModel):
    first_name: NameStr
    last_name: NameStr

# ---------------- Shelves ----------------
class ShelfResponse(BaseModel):
    id: PyObjectId = Field(validation_alias=AliasChoices("_id", "id"))
    label: str  # "A-1", "A-2", etc.
    row: str  # "A", "B", "C"
    col: int  # 1, 2, 3
    description: Optional[str] = ""
    item_count: int = 0
    available_count: int = 0

# ---------------- Items ----------------
ItemStatus = Literal["available", "in_use"]

class ItemBase(BaseModel):
    product_name: str = Field(..., min_length=1, description="品名")
    shelf_id: str = Field(..., description="保管棚ID (shelves._id)")
    category: Optional[str] = Field(default="その他", description="ジャンル/カテゴリ")
    description: Optional[str] = Field(default="", description="詳細情報")
    image_id: Optional[str] = Field(default=None, description="備品画像ID (images._id)")

class ItemCreate(ItemBase):
    user_id: str = Field(..., description="登録するユーザーのID")

class ItemUpdate(BaseModel):
    product_name: Optional[str] = None
    shelf_id: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    image_id: Optional[str] = None

class ItemResponse(ItemBase):
    id: PyObjectId = Field(validation_alias=AliasChoices("_id", "id"))
    label: str  # 管理番号 ("VR-001" など)。登録時に自動採番する
    shelf_id: PyObjectId
    shelf_label: Optional[str] = None
    image_id: OptionalPyObjectId = None
    status: ItemStatus = "available"
    current_user_id: OptionalPyObjectId = None
    current_user_name: Optional[str] = None
    last_user_name: Optional[str] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def image_url(self) -> Optional[str]:
        return f"/api/images/{self.image_id}" if self.image_id else None

class ItemBorrowRequest(BaseModel):
    user_id: str

# ---------------- Usage Logs ----------------
class UsageLogResponse(BaseModel):
    id: PyObjectId = Field(validation_alias=AliasChoices("_id", "id"))
    item_id: PyObjectId
    item_name: str
    user_id: PyObjectId
    user_name: str
    action: Literal["register", "delete", "borrow", "return"]
    timestamp: datetime

