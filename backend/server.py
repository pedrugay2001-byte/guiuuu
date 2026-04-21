from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, timezone, timedelta
import os
import uuid
import logging
import bcrypt
import jwt
import random
import string
import asyncio

try:
    import resend  # type: ignore
except Exception:  # pragma: no cover
    resend = None

# MongoDB connection
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

app = FastAPI(title="FarmaClube API")
api_router = APIRouter(prefix="/api")


# -------------- Helpers --------------
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# -------------- Models --------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    user_id: str
    email: str
    name: str
    role: str
    created_at: datetime


class AuthResponse(BaseModel):
    user: UserPublic
    token: str


class ProductCreate(BaseModel):
    name: str
    category: str
    description: str
    price: float
    member_price: float
    image_url: str
    stock: int = 10
    featured: bool = False


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    member_price: Optional[float] = None
    image_url: Optional[str] = None
    stock: Optional[int] = None
    featured: Optional[bool] = None


class Product(BaseModel):
    product_id: str
    name: str
    category: str
    description: str
    price: float
    member_price: float
    image_url: str
    stock: int
    featured: bool
    created_at: datetime


# -------------- Auth Routes --------------
@api_router.post("/auth/register", response_model=AuthResponse)
async def register(data: RegisterRequest):
    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "role": "member",
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(doc)
    token = create_access_token(user_id, email)
    return AuthResponse(
        user=UserPublic(
            user_id=user_id,
            email=email,
            name=data.name,
            role="member",
            created_at=doc["created_at"],
        ),
        token=token,
    )


@api_router.post("/auth/login", response_model=AuthResponse)
async def login(data: LoginRequest):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")
    token = create_access_token(user["user_id"], email)
    return AuthResponse(
        user=UserPublic(
            user_id=user["user_id"],
            email=user["email"],
            name=user["name"],
            role=user.get("role", "member"),
            created_at=user["created_at"],
        ),
        token=token,
    )


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return UserPublic(**user)


# -------------- Product Routes --------------
@api_router.get("/products", response_model=List[Product])
async def list_products(category: Optional[str] = None, q: Optional[str] = None):
    query: dict = {}
    if category and category != "all":
        query["category"] = category
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.products.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=500)
    return [Product(**item) for item in items]


@api_router.get("/products/featured", response_model=List[Product])
async def featured_products():
    cursor = db.products.find({"featured": True}, {"_id": 0}).limit(10)
    items = await cursor.to_list(length=10)
    return [Product(**item) for item in items]


@api_router.get("/products/{product_id}", response_model=Product)
async def get_product(product_id: str):
    item = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return Product(**item)


@api_router.post("/products", response_model=Product)
async def create_product(data: ProductCreate, admin: dict = Depends(require_admin)):
    product_id = f"prod_{uuid.uuid4().hex[:12]}"
    doc = {
        "product_id": product_id,
        "created_at": datetime.now(timezone.utc),
        **data.dict(),
    }
    await db.products.insert_one(doc)
    doc.pop("_id", None)
    return Product(**doc)


@api_router.put("/products/{product_id}", response_model=Product)
async def update_product(product_id: str, data: ProductUpdate, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in data.dict().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    result = await db.products.find_one_and_update(
        {"product_id": product_id},
        {"$set": updates},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return Product(**result)


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, admin: dict = Depends(require_admin)):
    result = await db.products.delete_one({"product_id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    return {"ok": True}


# -------------- Members (gate flow) --------------
class MemberEnter(BaseModel):
    name: str
    phone: str
    address: str
    code: str


class MemberPublic(BaseModel):
    member_id: str
    name: str
    phone: str
    address: str
    invite_code: str
    parent_code: str
    parent_name: Optional[str] = None
    created_at: datetime


def _gen_suffix() -> str:
    return random.choice(string.ascii_uppercase) + random.choice(string.digits)


async def _send_new_member_email(member: dict, total_members: int) -> None:
    notify = os.environ.get("NOTIFY_EMAIL", "")
    api_key = os.environ.get("RESEND_API_KEY", "")
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

    subject = f"Novo membro FarmaClube — {member['name']}"
    html = f"""
    <div style="font-family: Arial, sans-serif; background:#050505; color:#F5F5F5; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#121212; border:1px solid #262626; border-radius:8px; padding:24px;">
        <p style="color:#C0C0C0; letter-spacing:2px; font-size:11px; font-weight:700; margin:0 0 8px;">FARMACLUBE</p>
        <h1 style="color:#FFFFFF; font-size:22px; margin:0 0 16px;">Novo membro no clube</h1>
        <table cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; color:#F5F5F5; font-size:14px;">
          <tr><td style="color:#A3A3A3; width:40%;">Nome</td><td><strong>{member['name']}</strong></td></tr>
          <tr><td style="color:#A3A3A3;">Telefone</td><td>{member['phone']}</td></tr>
          <tr><td style="color:#A3A3A3;">Endereço</td><td>{member['address']}</td></tr>
          <tr><td style="color:#A3A3A3;">Código usado</td><td style="font-family:monospace; color:#C0C0C0;">{member['parent_code']}</td></tr>
          <tr><td style="color:#A3A3A3;">Padrinho</td><td>{member.get('parent_name') or 'Guilherme (raiz)'}</td></tr>
          <tr><td style="color:#A3A3A3;">Código gerado</td><td style="font-family:monospace; color:#FFFFFF; font-weight:700;">{member['invite_code']}</td></tr>
          <tr><td style="color:#A3A3A3;">Entrou em</td><td>{member['created_at'].strftime('%d/%m/%Y %H:%M UTC')}</td></tr>
        </table>
        <div style="margin-top:24px; padding:16px; background:#1A1A1A; border:1px solid #262626; border-radius:6px;">
          <p style="margin:0; color:#A3A3A3; font-size:12px;">Total de membros ativos</p>
          <p style="margin:4px 0 0; color:#FFFFFF; font-size:32px; font-weight:900;">{total_members}</p>
        </div>
      </div>
    </div>
    """

    if not api_key or resend is None:
        logger.info(
            "[EMAIL MOCKED] -> %s | subject=%s | member=%s invite=%s total=%d",
            notify, subject, member["name"], member["invite_code"], total_members,
        )
        return

    try:
        resend.api_key = api_key
        params = {
            "from": sender,
            "to": [notify],
            "subject": subject,
            "html": html,
        }
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info("[EMAIL SENT] -> %s", notify)
    except Exception as e:  # pragma: no cover
        logger.error("[EMAIL FAILED] %s", e)


@api_router.post("/members/enter", response_model=dict)
async def member_enter(data: MemberEnter):
    name = data.name.strip()
    phone = data.phone.strip()
    address = data.address.strip()
    code = data.code.strip().upper()

    if not name or not phone or not address:
        raise HTTPException(status_code=400, detail="Nome, telefone e endereço são obrigatórios")
    if len(name) < 3:
        raise HTTPException(status_code=400, detail="Informe seu nome completo")

    root_code = os.environ.get("GATE_ROOT_CODE", "X2T").upper()

    parent_name: Optional[str] = None
    if code == root_code:
        parent_name = "Guilherme (raiz)"
    else:
        parent = await db.members.find_one({"invite_code": code}, {"_id": 0})
        if not parent:
            raise HTTPException(status_code=401, detail="Código de acesso inválido ou revogado")
        parent_name = parent["name"]

    # Generate unique invite code (retry on rare collisions)
    invite_code = ""
    for _ in range(30):
        candidate = code + _gen_suffix()
        exists = await db.members.find_one({"invite_code": candidate})
        if not exists:
            invite_code = candidate
            break
    if not invite_code:
        raise HTTPException(status_code=500, detail="Não foi possível gerar código único")

    member_id = f"mem_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    member_doc = {
        "member_id": member_id,
        "name": name,
        "phone": phone,
        "address": address,
        "parent_code": code,
        "parent_name": parent_name,
        "invite_code": invite_code,
        "created_at": now,
    }
    await db.members.insert_one(member_doc)

    total = await db.members.count_documents({})

    # Fire & forget email notification (MOCKED if RESEND_API_KEY empty)
    try:
        await _send_new_member_email(member_doc, total)
    except Exception as e:
        logger.error("email notify failed: %s", e)

    return {
        "member_id": member_id,
        "name": name,
        "invite_code": invite_code,
        "parent_code": code,
        "parent_name": parent_name,
        "total_members": total,
        "created_at": now,
    }


@api_router.get("/members/stats")
async def members_stats():
    total = await db.members.count_documents({})
    return {"total_members": total}


@api_router.get("/categories")
async def get_categories():
    return [
        {"id": "emagrecedores", "name": "Emagrecedores", "icon": "flame"},
        {"id": "peptideos", "name": "Peptídeos", "icon": "flask"},
        {"id": "landerlan", "name": "Linha Landerlan", "icon": "shield-checkmark"},
        {"id": "hormonios", "name": "Hormônios", "icon": "pulse"},
        {"id": "pre_treinos", "name": "Pré-treinos", "icon": "rocket"},
        {"id": "suplementos", "name": "Suplementos", "icon": "nutrition"},
    ]


# -------------- Startup: seed admin + products --------------
async def seed_admin():
    admin_email = os.environ["ADMIN_EMAIL"].lower()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "name": "Administrador",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
        )


SEED_PRODUCTS = [
    {
        "name": "Ozempic 1mg (Semaglutida)",
        "category": "emagrecedores",
        "description": "Caneta aplicadora 1mg. Análogo de GLP-1 para controle de peso e glicemia. Uso subcutâneo semanal. Atenção: Sob prescrição médica.",
        "price": 1250.00,
        "member_price": 999.00,
        "image_url": "https://images.unsplash.com/photo-1704018731170-f30899f60917?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwyfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 12,
        "featured": True,
    },
    {
        "name": "Mounjaro 5mg (Tirzepatida)",
        "category": "emagrecedores",
        "description": "Agonista duplo GIP/GLP-1. Redução de apetite e perda de peso progressiva. Caneta pré-preenchida.",
        "price": 1890.00,
        "member_price": 1499.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 8,
        "featured": True,
    },
    {
        "name": "BPC-157 5mg",
        "category": "peptideos",
        "description": "Peptídeo de regeneração tecidual. Auxilia recuperação muscular, tendinosa e gástrica. Frasco liofilizado.",
        "price": 420.00,
        "member_price": 329.00,
        "image_url": "https://images.unsplash.com/photo-1549505415-e16dbd446231?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 25,
        "featured": True,
    },
    {
        "name": "TB-500 5mg",
        "category": "peptideos",
        "description": "Fragmento de Timosina Beta 4. Recuperação de lesões, flexibilidade e cicatrização acelerada.",
        "price": 480.00,
        "member_price": 379.00,
        "image_url": "https://images.pexels.com/photos/36591369/pexels-photo-36591369.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 18,
        "featured": False,
    },
    {
        "name": "Durateston Landerlan 250mg",
        "category": "landerlan",
        "description": "Blend de 4 ésteres de testosterona. Ampola 1ml. Linha Landerlan original, lote rastreável.",
        "price": 180.00,
        "member_price": 139.00,
        "image_url": "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 30,
        "featured": True,
    },
    {
        "name": "Deposteron Landerlan 200mg",
        "category": "landerlan",
        "description": "Cipionato de testosterona. Ampola 2ml. Produto Landerlan autêntico, ideal para TRT ou ciclos.",
        "price": 160.00,
        "member_price": 119.00,
        "image_url": "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 40,
        "featured": False,
    },
    {
        "name": "Stanozolol Landerlan 50mg",
        "category": "landerlan",
        "description": "Winstrol injetável. Frasco 30ml. Definição e vascularização, redução de gordura.",
        "price": 220.00,
        "member_price": 169.00,
        "image_url": "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 22,
        "featured": False,
    },
    {
        "name": "HGH Somatropina 10UI",
        "category": "hormonios",
        "description": "Hormônio do crescimento recombinante. Caixa com 10 frascos de 10UI + diluentes. Armazenar refrigerado.",
        "price": 1350.00,
        "member_price": 1099.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 7,
        "featured": True,
    },
    {
        "name": "Insulina Humulin R",
        "category": "hormonios",
        "description": "Insulina regular de ação rápida. Frasco 10ml 100UI. Uso pré/pós treino sob protocolo.",
        "price": 95.00,
        "member_price": 72.00,
        "image_url": "https://images.unsplash.com/photo-1704018731170-f30899f60917?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwyfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 15,
        "featured": False,
    },
    {
        "name": "Pré-treino Black Skull 300g",
        "category": "pre_treinos",
        "description": "Fórmula com cafeína, beta-alanina e citrulina. Energia extrema e foco para treinos pesados.",
        "price": 139.00,
        "member_price": 99.00,
        "image_url": "https://images.unsplash.com/photo-1549505415-e16dbd446231?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 50,
        "featured": True,
    },
    {
        "name": "Whey Protein Isolado 900g",
        "category": "suplementos",
        "description": "Proteína isolada hidrolisada. 27g de proteína por dose. Baixo teor de gordura e lactose.",
        "price": 219.00,
        "member_price": 169.00,
        "image_url": "https://images.pexels.com/photos/36591369/pexels-photo-36591369.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 45,
        "featured": False,
    },
    {
        "name": "Creatina Monohidratada 300g",
        "category": "suplementos",
        "description": "Creatina pura micronizada. Aumento de força, volume muscular e performance anaeróbica.",
        "price": 119.00,
        "member_price": 89.00,
        "image_url": "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 60,
        "featured": True,
    },
]


async def seed_products():
    count = await db.products.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    docs = []
    for p in SEED_PRODUCTS:
        docs.append({
            "product_id": f"prod_{uuid.uuid4().hex[:12]}",
            "created_at": now,
            **p,
        })
    await db.products.insert_many(docs)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("category")
    await db.members.create_index("invite_code", unique=True)
    await seed_admin()
    await seed_products()


# -------------- Include --------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
