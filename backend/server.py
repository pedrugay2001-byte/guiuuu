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
import re
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

app = FastAPI(title="BLACKSCLUB API")
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


def normalize_phone(phone: str) -> str:
    return re.sub(r"\D+", "", phone or "")


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip().lower())


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


async def require_staff(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in ("admin", "support"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


# -------------- Auth models --------------
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


# -------------- Member Gate (authorized-only) --------------
class MemberEnter(BaseModel):
    name: str
    phone: str
    email: EmailStr
    password: str
    neighborhood: str
    city: str
    state: str
    code: str


class MemberLogin(BaseModel):
    email: EmailStr
    password: str


class ForgotRequest(BaseModel):
    email: EmailStr
    code: str


class ResetRequest(BaseModel):
    token: str
    new_password: str


class MemberPublic(BaseModel):
    member_id: str
    name: str
    phone: str
    neighborhood: str
    city: str
    state: str
    invite_code: str
    parent_code: str
    parent_name: Optional[str] = None
    tier: str = "black"
    nickname: Optional[str] = None
    created_at: datetime


def _gen_suffix() -> str:
    return random.choice(string.ascii_uppercase) + random.choice(string.digits)


async def _send_new_member_email(member: dict, total_members: int) -> None:
    notify = os.environ.get("NOTIFY_EMAIL", "")
    api_key = os.environ.get("RESEND_API_KEY", "")
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")

    subject = f"Novo membro BLACKSCLUB — {member['name']}"
    addr = f"{member.get('neighborhood','')}, {member.get('city','')}/{member.get('state','')}"
    html = f"""
    <div style="font-family: Arial, sans-serif; background:#050505; color:#F5F5F5; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#0B0B0B; border:1px solid #1F1F1F; border-radius:8px; padding:24px;">
        <p style="color:#C0C0C0; letter-spacing:3px; font-size:11px; font-weight:800; margin:0 0 8px;">BLACKSCLUB</p>
        <h1 style="color:#FFFFFF; font-size:22px; margin:0 0 16px;">Novo membro autenticado</h1>
        <table cellpadding="8" cellspacing="0" style="width:100%; border-collapse:collapse; color:#F5F5F5; font-size:14px;">
          <tr><td style="color:#A3A3A3; width:40%;">Nome</td><td><strong>{member['name']}</strong></td></tr>
          <tr><td style="color:#A3A3A3;">Telefone</td><td>{member['phone']}</td></tr>
          <tr><td style="color:#A3A3A3;">Localização</td><td>{addr}</td></tr>
          <tr><td style="color:#A3A3A3;">Plano</td><td style="color:#FFFFFF; font-weight:700;">{member.get('tier','black').upper()}</td></tr>
          <tr><td style="color:#A3A3A3;">Código usado</td><td style="font-family:monospace; color:#C0C0C0;">{member['parent_code']}</td></tr>
        </table>
        <div style="margin-top:24px; padding:16px; background:#141414; border:1px solid #1F1F1F; border-radius:6px;">
          <p style="margin:0; color:#A3A3A3; font-size:12px;">Total de membros</p>
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
        params = {"from": sender, "to": [notify], "subject": subject, "html": html}
        await asyncio.to_thread(resend.Emails.send, params)
        logger.info("[EMAIL SENT] -> %s", notify)
    except Exception as e:  # pragma: no cover
        logger.error("[EMAIL FAILED] %s", e)


@api_router.post("/members/enter", response_model=dict)
async def member_enter(data: MemberEnter):
    name = data.name.strip()
    phone = data.phone.strip()
    email = data.email.strip().lower()
    code = data.code.strip().upper()

    if not name or not phone or not data.neighborhood.strip() or not data.city.strip() or not data.state.strip():
        raise HTTPException(status_code=400, detail="Acesso não autorizado")
    if len(name.split()) < 2:
        raise HTTPException(status_code=400, detail="Acesso não autorizado")
    if len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Senha muito curta")

    nname = normalize_name(name)
    nphone = normalize_phone(phone)

    auth_doc = await db.authorized.find_one({
        "name_norm": nname,
        "phone_norm": nphone,
        "code": code,
    }, {"_id": 0})

    tier = "black"
    parent_name: Optional[str] = None

    if auth_doc:
        tier = auth_doc.get("tier", "black")
        parent_name = auth_doc.get("parent_name")
    else:
        raise HTTPException(status_code=401, detail="Acesso não autorizado")

    # Idempotent: if already registered, update password (user may be re-signing up)
    existing = await db.members.find_one({"phone_norm": nphone, "name_norm": nname}, {"_id": 0})
    email_taken = await db.members.find_one({"email": email, "phone_norm": {"$ne": nphone}})
    if email_taken:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado por outro membro")

    if existing:
        await db.members.update_one(
            {"member_id": existing["member_id"]},
            {"$set": {"email": email, "password_hash": hash_password(data.password)}},
        )
        return {
            "member_id": existing["member_id"],
            "name": existing["name"],
            "email": email,
            "invite_code": existing["invite_code"],
            "parent_code": existing.get("parent_code", code),
            "parent_name": existing.get("parent_name"),
            "tier": existing.get("tier", tier),
            "nickname": existing.get("nickname"),
            "neighborhood": existing.get("neighborhood", data.neighborhood),
            "city": existing.get("city", data.city),
            "state": existing.get("state", data.state),
            "total_members": await db.members.count_documents({}),
            "created_at": existing["created_at"],
        }

    base_prefix = code[:3] if len(code) >= 3 else code
    invite_code = ""
    for _ in range(30):
        candidate = base_prefix + _gen_suffix()
        exists = await db.members.find_one({"invite_code": candidate})
        if not exists:
            invite_code = candidate
            break
    if not invite_code:
        invite_code = base_prefix + _gen_suffix() + _gen_suffix()

    member_id = f"mem_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    member_doc = {
        "member_id": member_id,
        "name": name,
        "name_norm": nname,
        "phone": phone,
        "phone_norm": nphone,
        "email": email,
        "password_hash": hash_password(data.password),
        "neighborhood": data.neighborhood.strip(),
        "city": data.city.strip(),
        "state": data.state.strip().upper(),
        "parent_code": code,
        "parent_name": parent_name,
        "invite_code": invite_code,
        "tier": tier,
        "nickname": None,
        "created_at": now,
    }
    await db.members.insert_one(member_doc)

    total = await db.members.count_documents({})

    try:
        await _send_new_member_email(member_doc, total)
    except Exception as e:
        logger.error("email notify failed: %s", e)

    return {
        "member_id": member_id,
        "name": name,
        "email": email,
        "invite_code": invite_code,
        "parent_code": code,
        "parent_name": parent_name,
        "tier": tier,
        "nickname": None,
        "neighborhood": member_doc["neighborhood"],
        "city": member_doc["city"],
        "state": member_doc["state"],
        "total_members": total,
        "created_at": now,
    }


@api_router.post("/members/login")
async def member_login(data: MemberLogin):
    email = data.email.strip().lower()
    member = await db.members.find_one({"email": email}, {"_id": 0})
    if not member or not member.get("password_hash"):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    if not verify_password(data.password, member["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha inválidos")
    member.pop("password_hash", None)
    member.pop("name_norm", None)
    member.pop("phone_norm", None)
    return member


@api_router.post("/members/forgot")
async def member_forgot(data: ForgotRequest):
    email = data.email.strip().lower()
    code = data.code.strip().upper()
    member = await db.members.find_one({"email": email, "invite_code": code}, {"_id": 0})
    if not member:
        # Generic response to avoid leaking which field is wrong
        return {"ok": True}
    token = uuid.uuid4().hex
    expires = datetime.now(timezone.utc) + timedelta(hours=2)
    await db.members.update_one(
        {"member_id": member["member_id"]},
        {"$set": {"reset_token": token, "reset_expires": expires}},
    )
    # Try to send email (mocked if no RESEND_API_KEY)
    notify_to = email
    api_key = os.environ.get("RESEND_API_KEY", "")
    sender = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
    html = f"""
    <div style="font-family: Arial, sans-serif; background:#050505; color:#F5F5F5; padding:24px;">
      <div style="max-width:500px; margin:0 auto; background:#0B0B0B; border:1px solid #1F1F1F; border-radius:8px; padding:24px;">
        <p style="color:#C0C0C0; letter-spacing:3px; font-size:11px; font-weight:800; margin:0 0 8px;">BLACKSCLUB</p>
        <h1 style="color:#FFFFFF; font-size:22px; margin:0 0 12px;">Redefinir sua senha</h1>
        <p style="color:#A3A3A3;">Use o código abaixo no app para criar uma nova senha:</p>
        <p style="font-family:monospace; font-size:22px; color:#FFFFFF; padding:14px; background:#141414; border-radius:6px;">{token[:12].upper()}</p>
        <p style="color:#666; font-size:11px; margin-top:20px;">Esse código expira em 2 horas.</p>
      </div>
    </div>
    """
    if not api_key or resend is None:
        logger.info("[RESET MOCKED] email=%s token=%s short=%s", email, token, token[:12].upper())
    else:
        try:
            resend.api_key = api_key
            await asyncio.to_thread(resend.Emails.send, {
                "from": sender, "to": [notify_to],
                "subject": "BLACKSCLUB — redefinição de senha",
                "html": html,
            })
        except Exception as e:
            logger.error("forgot email failed: %s", e)
    return {"ok": True, "short_token": token[:12].upper()}  # short_token exposed only in mock


@api_router.post("/members/reset")
async def member_reset(data: ResetRequest):
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="Senha muito curta")
    token_up = data.token.strip().upper()
    now = datetime.now(timezone.utc)
    # Match either full hex or short (12 chars upper)
    cursor = db.members.find({"reset_token": {"$exists": True}}, {"_id": 0})
    async for m in cursor:
        rt = m.get("reset_token", "")
        if rt[:12].upper() == token_up or rt == data.token.strip():
            exp = m.get("reset_expires")
            if exp and exp < now:
                raise HTTPException(status_code=400, detail="Código expirado")
            await db.members.update_one(
                {"member_id": m["member_id"]},
                {"$set": {"password_hash": hash_password(data.new_password)},
                 "$unset": {"reset_token": "", "reset_expires": ""}},
            )
            return {"ok": True}
    raise HTTPException(status_code=400, detail="Código inválido")


@api_router.get("/members/stats")
async def members_stats():
    total = await db.members.count_documents({})
    return {"total_members": total}


@api_router.get("/members/{member_id}")
async def member_detail(member_id: str):
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "name_norm": 0, "phone_norm": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return m


class NicknameUpdate(BaseModel):
    nickname: str


@api_router.put("/members/{member_id}/nickname")
async def update_nickname(member_id: str, data: NicknameUpdate):
    nick = data.nickname.strip()
    if len(nick) < 2 or len(nick) > 24:
        raise HTTPException(status_code=400, detail="Apelido deve ter entre 2 e 24 caracteres")
    await db.members.update_one({"member_id": member_id}, {"$set": {"nickname": nick}})
    return {"ok": True, "nickname": nick}


# -------------- Admin: Authorized members --------------
class AuthorizedCreate(BaseModel):
    name: str
    phone: str
    code: str
    tier: str = "black"
    parent_name: Optional[str] = None


@api_router.post("/admin/authorized")
async def admin_authorize(data: AuthorizedCreate, admin: dict = Depends(require_admin)):
    nname = normalize_name(data.name)
    nphone = normalize_phone(data.phone)
    code = data.code.strip().upper()
    if not nname or not nphone or not code:
        raise HTTPException(status_code=400, detail="Dados obrigatórios")
    doc = {
        "auth_id": f"auth_{uuid.uuid4().hex[:12]}",
        "name": data.name.strip(),
        "name_norm": nname,
        "phone": data.phone.strip(),
        "phone_norm": nphone,
        "code": code,
        "tier": (data.tier or "black").lower(),
        "parent_name": data.parent_name,
        "created_at": datetime.now(timezone.utc),
    }
    await db.authorized.update_one(
        {"name_norm": nname, "phone_norm": nphone},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "code": code}


@api_router.get("/admin/authorized")
async def admin_list_authorized(admin: dict = Depends(require_admin)):
    cursor = db.authorized.find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=500)


@api_router.delete("/admin/authorized/{auth_id}")
async def admin_delete_authorized(auth_id: str, admin: dict = Depends(require_admin)):
    r = await db.authorized.delete_one({"auth_id": auth_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")
    return {"ok": True}


# -------------- Orders & Chat --------------
class OrderItem(BaseModel):
    product_id: str
    name: str
    quantity: int
    price: float


class OrderCreate(BaseModel):
    member_id: str
    items: List[OrderItem]
    total: float


class ChatSend(BaseModel):
    text: str


@api_router.post("/orders")
async def create_order(data: OrderCreate):
    member = await db.members.find_one({"member_id": data.member_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    order_id = f"ord_{uuid.uuid4().hex[:12]}"
    now = datetime.now(timezone.utc)
    await db.orders.insert_one({
        "order_id": order_id,
        "member_id": data.member_id,
        "member_name": member["name"],
        "items": [i.dict() for i in data.items],
        "total": data.total,
        "status": "open",
        "created_at": now,
    })

    lines = [f"• {i.name} x{i.quantity} — R$ {i.price * i.quantity:.2f}" for i in data.items]
    addr = f"{member.get('neighborhood','')}, {member.get('city','')}/{member.get('state','')}"
    summary = (
        f"🛒 *NOVO PEDIDO #{order_id[-6:].upper()}*\n\n"
        f"Cliente: {member['name']}\n"
        f"Telefone: {member['phone']}\n"
        f"Região: {addr}\n\n"
        f"Itens:\n" + "\n".join(lines) + f"\n\n*Total: R$ {data.total:.2f}*"
    )
    await db.messages.insert_one({
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "thread_id": data.member_id,
        "sender": "member",
        "sender_name": member["name"],
        "text": summary,
        "order_id": order_id,
        "created_at": now,
    })
    return {"order_id": order_id, "status": "open"}


@api_router.get("/chat/member/{member_id}")
async def chat_member_get(member_id: str):
    cursor = db.messages.find({"thread_id": member_id}, {"_id": 0}).sort("created_at", 1)
    msgs = await cursor.to_list(length=500)
    # If empty, seed welcome message
    if not msgs:
        member = await db.members.find_one({"member_id": member_id}, {"_id": 0})
        if member:
            welcome = {
                "message_id": f"msg_{uuid.uuid4().hex[:12]}",
                "thread_id": member_id,
                "sender": "support",
                "sender_name": "BLACKSCLUB",
                "text": (
                    f"Olá, {member['name'].split()[0]}. Como podemos ajudar?\n\n"
                    f"• Tirar uma dúvida\n"
                    f"• Fazer um pedido\n"
                    f"• Solicitar um orçamento"
                ),
                "created_at": datetime.now(timezone.utc),
            }
            await db.messages.insert_one(welcome)
            welcome.pop("_id", None)
            msgs = [welcome]
    return msgs


@api_router.post("/chat/member/{member_id}")
async def chat_member_send(member_id: str, data: ChatSend):
    member = await db.members.find_one({"member_id": member_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "thread_id": member_id,
        "sender": "member",
        "sender_name": member["name"],
        "text": text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    return msg


@api_router.get("/chat/threads")
async def chat_threads(staff: dict = Depends(require_staff)):
    pipeline = [
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$thread_id",
            "last_message": {"$first": "$text"},
            "last_sender": {"$first": "$sender"},
            "last_at": {"$first": "$created_at"},
            "unread_support": {
                "$sum": {"$cond": [{"$eq": ["$sender", "member"]}, 1, 0]},
            },
        }},
        {"$sort": {"last_at": -1}},
    ]
    rows = await db.messages.aggregate(pipeline).to_list(length=500)
    threads = []
    for r in rows:
        member = await db.members.find_one({"member_id": r["_id"]}, {"_id": 0})
        if not member:
            continue
        threads.append({
            "member_id": r["_id"],
            "member_name": member["name"],
            "member_phone": member["phone"],
            "tier": member.get("tier", "black"),
            "last_message": r["last_message"][:120],
            "last_sender": r["last_sender"],
            "last_at": r["last_at"],
            "unread": r["unread_support"],
        })
    return threads


@api_router.get("/chat/support/{member_id}")
async def chat_support_get(member_id: str, staff: dict = Depends(require_staff)):
    cursor = db.messages.find({"thread_id": member_id}, {"_id": 0}).sort("created_at", 1)
    msgs = await cursor.to_list(length=500)
    await db.messages.update_many(
        {"thread_id": member_id, "sender": "member"},
        {"$set": {"read_by_support": True}},
    )
    return msgs


@api_router.post("/chat/support/{member_id}")
async def chat_support_send(member_id: str, data: ChatSend, staff: dict = Depends(require_staff)):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "thread_id": member_id,
        "sender": "support",
        "sender_name": staff.get("name", "BLACKSCLUB"),
        "text": text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.messages.insert_one(msg)
    msg.pop("_id", None)
    return msg


@api_router.get("/orders/member/{member_id}")
async def orders_member(member_id: str):
    cursor = db.orders.find({"member_id": member_id}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=100)


# -------------- Quotes (Orçamento) --------------
class QuoteRequest(BaseModel):
    member_id: str
    description: str
    budget: Optional[str] = None


@api_router.post("/quotes/request")
async def quote_request(data: QuoteRequest):
    member = await db.members.find_one({"member_id": data.member_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    desc = data.description.strip()
    if len(desc) < 6:
        raise HTTPException(status_code=400, detail="Descreva com mais detalhes")
    quote_id = f"qt_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)
    await db.quotes.insert_one({
        "quote_id": quote_id,
        "member_id": data.member_id,
        "member_name": member["name"],
        "description": desc,
        "budget": (data.budget or "").strip() or None,
        "status": "open",
        "created_at": now,
    })

    # Also post into chat as a "orçamento" message
    body = (
        f"💎 *SOLICITAÇÃO DE ORÇAMENTO #{quote_id[-6:].upper()}*\n\n"
        f"{desc}"
    )
    if data.budget:
        body += f"\n\n*Faixa de orçamento:* {data.budget}"
    await db.messages.insert_one({
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "thread_id": data.member_id,
        "sender": "member",
        "sender_name": member["name"],
        "text": body,
        "quote_id": quote_id,
        "created_at": now,
    })
    return {"quote_id": quote_id, "status": "open"}


# -------------- Products --------------
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


@api_router.get("/categories")
async def get_categories():
    return [
        {"id": "emagrecedores", "name": "Emagrecedores", "icon": "flame"},
        {"id": "peptideos", "name": "Peptídeos", "icon": "flask"},
        {"id": "landerlan", "name": "Linha Landerlan", "icon": "shield-checkmark"},
        {"id": "hormonios", "name": "Hormônios", "icon": "pulse"},
        {"id": "pre_treinos", "name": "Pré-treinos", "icon": "rocket"},
        {"id": "suplementos", "name": "Suplementos", "icon": "nutrition"},
        {"id": "tecnologia", "name": "Tecnologia", "icon": "hardware-chip"},
        {"id": "bem_estar", "name": "Bem-estar", "icon": "leaf"},
    ]


# -------------- Seed --------------
SEED_PRODUCTS = [
    {
        "name": "Ozempic 1mg (Semaglutida)",
        "category": "emagrecedores",
        "description": "Caneta aplicadora 1mg. Análogo de GLP-1 para controle de peso e glicemia.",
        "price": 1250.00, "member_price": 999.00,
        "image_url": "https://images.unsplash.com/photo-1704018731170-f30899f60917?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwyfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 12, "featured": True,
    },
    {
        "name": "Mounjaro 5mg (Tirzepatida)",
        "category": "emagrecedores",
        "description": "Agonista duplo GIP/GLP-1. Redução de apetite e perda de peso progressiva.",
        "price": 1890.00, "member_price": 1499.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 8, "featured": True,
    },
    {
        "name": "BPC-157 5mg",
        "category": "peptideos",
        "description": "Peptídeo regenerativo. Auxilia recuperação muscular e tecidual.",
        "price": 420.00, "member_price": 329.00,
        "image_url": "https://images.unsplash.com/photo-1549505415-e16dbd446231?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 25, "featured": True,
    },
    {
        "name": "TB-500 5mg",
        "category": "peptideos",
        "description": "Fragmento de Timosina Beta 4. Recuperação e flexibilidade.",
        "price": 480.00, "member_price": 379.00,
        "image_url": "https://images.pexels.com/photos/36591369/pexels-photo-36591369.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 18, "featured": False,
    },
    {
        "name": "Durateston Landerlan 250mg",
        "category": "landerlan",
        "description": "Blend de 4 ésteres de testosterona. Ampola 1ml. Produto autêntico.",
        "price": 180.00, "member_price": 139.00,
        "image_url": "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 30, "featured": True,
    },
    {
        "name": "HGH Somatropina 10UI",
        "category": "hormonios",
        "description": "Hormônio do crescimento recombinante. Caixa com 10 frascos.",
        "price": 1350.00, "member_price": 1099.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 7, "featured": True,
    },
    {
        "name": "Whey Protein Isolado 900g",
        "category": "suplementos",
        "description": "Proteína isolada hidrolisada. 27g de proteína por dose.",
        "price": 219.00, "member_price": 169.00,
        "image_url": "https://images.pexels.com/photos/36591369/pexels-photo-36591369.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 45, "featured": False,
    },
    {
        "name": "Creatina Monohidratada 300g",
        "category": "suplementos",
        "description": "Creatina pura micronizada. Força, volume e performance.",
        "price": 119.00, "member_price": 89.00,
        "image_url": "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 60, "featured": True,
    },
]


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

    support_email = "suporte@blacksclub.com"
    support_password = "suporte123"
    support_existing = await db.users.find_one({"email": support_email})
    if not support_existing:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": support_email,
            "name": "Equipe BLACKSCLUB",
            "password_hash": hash_password(support_password),
            "role": "support",
            "created_at": datetime.now(timezone.utc),
        })
    elif not verify_password(support_password, support_existing["password_hash"]):
        await db.users.update_one(
            {"email": support_email},
            {"$set": {"password_hash": hash_password(support_password), "role": "support"}},
        )


async def seed_authorized():
    # Demo authorized entry so testing works. Admin can add more via API.
    demo = {
        "name": "Guilherme Demo",
        "phone": "+5511999990000",
        "code": "BLACK-SEED",
        "tier": "diamond",
        "parent_name": None,
    }
    nname = normalize_name(demo["name"])
    nphone = normalize_phone(demo["phone"])
    exists = await db.authorized.find_one({"name_norm": nname, "phone_norm": nphone})
    if not exists:
        await db.authorized.insert_one({
            "auth_id": f"auth_{uuid.uuid4().hex[:12]}",
            "name": demo["name"], "name_norm": nname,
            "phone": demo["phone"], "phone_norm": nphone,
            "code": demo["code"], "tier": demo["tier"],
            "parent_name": demo["parent_name"],
            "created_at": datetime.now(timezone.utc),
        })


async def seed_products():
    count = await db.products.count_documents({})
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    docs = []
    for p in SEED_PRODUCTS:
        docs.append({"product_id": f"prod_{uuid.uuid4().hex[:12]}", "created_at": now, **p})
    await db.products.insert_many(docs)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("category")
    await db.members.create_index("invite_code", unique=True)
    await db.members.create_index([("phone_norm", 1), ("name_norm", 1)])
    await db.authorized.create_index([("name_norm", 1), ("phone_norm", 1)], unique=True)
    await db.messages.create_index("thread_id")
    await db.messages.create_index("created_at")
    await db.orders.create_index("member_id")
    await db.quotes.create_index("member_id")
    await seed_admin()
    await seed_authorized()
    await seed_products()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
