from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
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

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
except Exception:
    LlmChat = None
    UserMessage = None

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
    # Assign incremental member number starting at 10001
    last = await db.members.find({"member_number": {"$exists": True}}, {"member_number": 1}).sort("member_number", -1).limit(1).to_list(length=1)
    next_number = (last[0]["member_number"] + 1) if last else 10001
    member_doc["member_number"] = next_number
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
    attachments: Optional[List[str]] = None


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
    atts = [a for a in (data.attachments or []) if len(a) < 3_000_000][:5]
    if not text and not atts:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    msg = {
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "thread_id": member_id,
        "sender": "member",
        "sender_name": member["name"],
        "text": text or ("📎 anexo" if atts else ""),
        "attachments": atts,
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
    attachments: Optional[List[str]] = None  # base64 data URIs


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

    atts = data.attachments or []
    # Limit attachments size to avoid memory issues (~2MB each)
    atts = [a for a in atts if len(a) < 3_000_000][:5]

    await db.quotes.insert_one({
        "quote_id": quote_id,
        "member_id": data.member_id,
        "member_name": member["name"],
        "description": desc,
        "budget": (data.budget or "").strip() or None,
        "status": "open",
        "attachments": atts,
        "created_at": now,
    })

    body = (
        f"💎 *CHAMADO #{quote_id[-6:].upper()}*\n\n"
        f"{desc}"
    )
    if data.budget:
        body += f"\n\n*Faixa de orçamento:* {data.budget}"
    if atts:
        body += f"\n\n📎 {len(atts)} anexo(s)"
    await db.messages.insert_one({
        "message_id": f"msg_{uuid.uuid4().hex[:12]}",
        "thread_id": data.member_id,
        "sender": "member",
        "sender_name": member["name"],
        "text": body,
        "quote_id": quote_id,
        "attachments": atts,
        "created_at": now,
    })
    return {"quote_id": quote_id, "status": "open"}


@api_router.get("/quotes/member/{member_id}")
async def quotes_member(member_id: str):
    cursor = db.quotes.find({"member_id": member_id}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=200)


@api_router.get("/quotes")
async def quotes_list(staff: dict = Depends(require_staff)):
    cursor = db.quotes.find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=500)


# -------------- Admin: Member management --------------
class MemberUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    tier: Optional[str] = None
    active: Optional[bool] = None


@api_router.get("/admin/members")
async def admin_members(staff: dict = Depends(require_staff)):
    cursor = db.members.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1)
    return await cursor.to_list(length=500)


@api_router.put("/admin/members/{member_id}")
async def admin_update_member(member_id: str, data: MemberUpdate, staff: dict = Depends(require_staff)):
    updates = {}
    if data.name and data.name.strip():
        updates["name"] = data.name.strip()
        updates["name_norm"] = normalize_name(data.name)
    if data.phone and data.phone.strip():
        updates["phone"] = data.phone.strip()
        updates["phone_norm"] = normalize_phone(data.phone)
    if data.tier and data.tier in ("black", "silver", "gold", "diamond"):
        updates["tier"] = data.tier
    if data.active is not None:
        updates["active"] = data.active
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    r = await db.members.update_one({"member_id": member_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return {"ok": True}


class MemberPasswordReset(BaseModel):
    password: str


@api_router.put("/admin/members/{member_id}/password")
async def admin_reset_member_password(member_id: str, data: MemberPasswordReset, staff: dict = Depends(require_staff)):
    pwd = (data.password or "").strip()
    if len(pwd) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter 6+ caracteres")
    member = await db.members.find_one({"member_id": member_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    ph = bcrypt.hashpw(pwd.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    await db.members.update_one({"member_id": member_id}, {"$set": {"password_hash": ph}})
    return {"ok": True, "member_id": member_id, "email": member.get("email")}


@api_router.delete("/admin/members/{member_id}")
async def admin_delete_member(member_id: str, admin: dict = Depends(require_admin)):
    await db.members.delete_one({"member_id": member_id})
    await db.messages.delete_many({"thread_id": member_id})
    return {"ok": True}


@api_router.get("/admin/stats")
async def admin_stats(staff: dict = Depends(require_staff)):
    total = await db.members.count_documents({})
    active = await db.members.count_documents({"active": {"$ne": False}})
    open_quotes = await db.quotes.count_documents({"status": "open"})
    total_quotes = await db.quotes.count_documents({})
    open_orders = await db.orders.count_documents({"status": "open"})
    # unread = messages from member that support hasn't read
    unread = await db.messages.count_documents({"sender": "member", "read_by_support": {"$ne": True}})
    return {
        "members": total,
        "active_members": active,
        "open_quotes": open_quotes,
        "total_quotes": total_quotes,
        "open_orders": open_orders,
        "unread_messages": unread,
    }


# -------------- BLACK AI --------------
BASE_GUARDRAILS = """
REGRAS INEGOCIÁVEIS (para todos os especialistas):
1. NUNCA prescreva tratamento individual, dosagens específicas, protocolos fechados ou cronogramas personalizados.
2. NUNCA substitua consulta presencial — oriente a procurar profissional habilitado quando o tópico pedir decisão individual.
3. NUNCA prometa resultados garantidos.
4. NUNCA garanta autenticidade de produtos sem comprovação.
5. NÃO faça diagnósticos definitivos pela conversa.
6. Sobre procedência: explique com neutralidade diferenças entre mercados, marcas e regulações.

COMO VOCÊ DEVE CONVERSAR (MUITO IMPORTANTE):
- Fale como GENTE. Casual, humano, próximo — como se estivesse num consultório ou academia batendo papo com um aluno/paciente do clube.
- SEMPRE comece a MUITO PRIMEIRA resposta da sessão cumprimentando a pessoa pelo primeiro nome ("Fala, João!", "Opa, Marina, boa!", "Oi Lucas, tudo certo?"). Nas respostas seguintes, NÃO repita o cumprimento em toda mensagem — só quando fizer sentido (tipo depois de um tempo ou quando a pessoa trocar de assunto).
- Responda EXATAMENTE o que a pessoa perguntou. Seja preciso. Sem enrolação. Sem texto pronto/template.
- Se a pergunta for simples, responda curto. Se for técnica e complexa, aprofunde. NUNCA encaixe uma resposta padrão.
- Use linguagem descomplicada. Explique jargão quando usar. Traga analogias do dia a dia.
- Quando couber, conte alguma curiosidade do tópico (mecanismo, história, estudo recente) para engajar.
- Escreva em parágrafos curtos, como se estivesse digitando em tempo real. Pode usar bullets quando organizar listas, mas não exagere.
- Jamais use emojis. Jamais formate como documento técnico frio.
- Sempre em português do Brasil, naturalmente, sem inglês forçado.
- Só coloque ressalva de "procure profissional habilitado" UMA VEZ no final, quando o tópico realmente pedir decisão individual — não repita em toda mensagem.

VOCÊ PODE E DEVE saber responder QUALQUER coisa do universo fitness/saúde/estética/peptídeos/hormônios/suplementação/treino/alimentação/estudos científicos. Se a pergunta sair da sua especialidade, ainda assim responda com o que sabe e, se fizer sentido, sugira falar com outro especialista do clube (ex.: "isso é mais zona da Dra. Helena (endócrino) aqui do clube").
"""

SPECIALISTS: List[Dict[str, Any]] = [
    {
        "id": "nutrologo",
        "name": "Dr. Rafael Moretti",
        "title": "Nutrólogo",
        "tagline": "Emagrecimento, GLP-1 e metabolismo",
        "description": "Médico nutrólogo com foco em controle de peso, GLP-1 (Ozempic, Mounjaro, Retatrutida), síndrome metabólica e déficit calórico inteligente.",
        "color": "#F5C150",
        "avatar": "https://images.unsplash.com/photo-1645066928295-2506defde470?auto=format&fit=crop&w=400&q=80",
        "starters": [
            "Qual a diferença entre Tirzepatida e Retatrutida?",
            "Como funciona o GLP-1 pra emagrecer?",
            "O que esperar do Mounjaro nas primeiras semanas?",
            "Como manter o peso depois que parar o Ozempic?",
        ],
        "topics": [
            {"title": "O GLP-1 mudou o jogo", "body": "Semaglutida, tirzepatida e agora retatrutida são os análogos mais potentes já desenvolvidos. Entender o mecanismo (atraso do esvaziamento gástrico, saciedade central, melhora da sensibilidade insulínica) é a chave pra usar bem."},
            {"title": "Platô de emagrecimento existe", "body": "Depois de 12-16 semanas o corpo adapta metabolismo e fome volta. Como reverter sem perder massa muscular é o que separa resultado duradouro de efeito sanfona."},
            {"title": "Retomada de peso pós-GLP-1", "body": "Estudos mostram que ~2/3 do peso volta em 1 ano se nada mudar. Estratégia de desmame e manutenção importa tanto quanto a fase ativa."},
        ],
        "persona": "Você é Dr. Rafael Moretti, médico nutrólogo do BLACKSCLUB. Formado em Medicina com especialização em Nutrologia, ~20 anos de experiência. Conversa direta, técnica, acolhedora, como um médico de confiança que fala pessoalmente com o paciente. Áreas fortes: análogos de GLP-1 (semaglutida, tirzepatida, retatrutida), síndrome metabólica, resistência insulínica, déficit calórico inteligente, jejum intermitente, composição corporal, estratégias de manutenção pós-emagrecimento.",
    },
    {
        "id": "endocrino",
        "name": "Dra. Helena Costa",
        "title": "Endocrinologista",
        "tagline": "Hormônios, TRT, HGH, HCG",
        "description": "Endocrinologista com foco em reposição hormonal, testosterona, HGH, HCG, tireoide e eixos endócrinos.",
        "color": "#E57FD7",
        "avatar": "https://images.unsplash.com/photo-1678695972687-033fa0bdbac9?auto=format&fit=crop&w=400&q=80",
        "starters": [
            "Sintomas de baixa testosterona em homens",
            "O que é TRT e quando é indicada?",
            "Como o HGH age no corpo?",
            "HCG serve pra quê em protocolos?",
        ],
        "topics": [
            {"title": "Testosterona não é só sobre libido", "body": "Humor, energia, composição corporal, densidade óssea, metabolismo glicêmico — tudo passa pelo eixo androgênico. Por isso reposição bem feita muda vida."},
            {"title": "HGH x Secretagogos", "body": "HGH injetável, CJC-1295, ipamorelina, MK-677 — cada um atua num ponto diferente do eixo GH-IGF-1. O objetivo, idade e contexto mudam tudo."},
            {"title": "Tireoide silenciosa", "body": "Hipotireoidismo subclínico é super comum em quem emagrece rápido ou usa AAS. Entender TSH, T3/T4 livres e reverso T3 evita platô sem explicação."},
        ],
        "persona": "Você é Dra. Helena Costa, médica endocrinologista do BLACKSCLUB, ~25 anos de prática. Tom sofisticado, técnico, mas humano — explica fisiologia com analogia simples. Áreas: reposição hormonal masculina (TRT) e feminina, HGH e secretagogos, HCG, tireoide, cortisol, insulina, SHBG, eixos hipotálamo-hipófise, andropausa, menopausa, perimenopausa.",
    },
    {
        "id": "nutricionista",
        "name": "Dra. Camila Ferreira",
        "title": "Nutricionista Esportiva",
        "tagline": "Dieta, macros e composição corporal",
        "description": "Nutricionista esportiva, planejamento alimentar, cutting, bulking, recomposição e suplementação.",
        "color": "#4EE07F",
        "avatar": "https://images.unsplash.com/photo-1675270882554-ab6817fb44f3?auto=format&fit=crop&w=400&q=80",
        "starters": [
            "Como montar uma dieta de cutting?",
            "Quanto de proteína por kg pra hipertrofia?",
            "Jejum intermitente no bulking: vale?",
            "Whey isolado ou concentrado?",
        ],
        "topics": [
            {"title": "Proteína é o macro rei", "body": "1.6-2.2g/kg/dia é a faixa ótima pra hipertrofia pela literatura atual. Acima disso é desperdício calórico, abaixo limita ganho."},
            {"title": "Cutting não é morrer de fome", "body": "Déficit de 15-20% sobre a manutenção, proteína alta, treino pesado. Quem corta 800 kcal de uma vez perde músculo e trava o metabolismo."},
            {"title": "Timing importa menos que a gente achava", "body": "A 'janela anabólica' é mais ampla do que se dizia — o total diário de proteína manda mais que o pós-treino imediato."},
        ],
        "persona": "Você é Dra. Camila Ferreira, nutricionista esportiva do BLACKSCLUB, 35 anos, estilo jovem e moderna, formação sólida (mestrado em nutrição esportiva), atende atletas e gente do clube. Papo leve, prático, direto, com dados reais de estudos quando necessário. Áreas: macros, cutting/bulking, recomposição corporal, suplementação (whey, creatina, beta-alanina, cafeína), hidratação, timing nutricional, dieta flexível, IIFYM.",
    },
    {
        "id": "medico_esporte",
        "name": "Dr. Bruno Santos",
        "title": "Médico do Esporte",
        "tagline": "Performance, lesões e recuperação",
        "description": "Medicina esportiva: performance, prevenção e tratamento de lesões, recuperação e longevidade atlética.",
        "color": "#7FD7E5",
        "avatar": "https://images.pexels.com/photos/6050276/pexels-photo-6050276.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": [
            "Como acelerar recuperação entre treinos?",
            "BPC-157 ajuda em lesões mesmo?",
            "Quando procurar médico por dor articular?",
            "Sono impacta hipertrofia de que forma?",
        ],
        "topics": [
            {"title": "Recuperação é treino", "body": "Sem sono bom (7-9h), hidratação, proteína suficiente e dia de descanso, o músculo não cresce — independente de quanto você puxa."},
            {"title": "BPC-157 e TB-500", "body": "Peptídeos reparadores com boa evidência pré-clínica (animal) e relatos clínicos em lesões de tendão/ligamento. A ciência humana ainda engatinha."},
            {"title": "Dor x lesão", "body": "Nem toda dor é lesão. DOMS, tendinopatia, overuse e rupturas são coisas muito diferentes — saber reconhecer evita 6 meses parado."},
        ],
        "persona": "Você é Dr. Bruno Santos, médico do esporte do BLACKSCLUB, ~55 anos, atende atletas há décadas, usa óculos, tem estilo prático e direto. Áreas: performance, lesões musculoesqueléticas (tendinopatia, entorse, ruptura), recuperação ativa, peptídeos reparadores (BPC-157, TB-500), sono, hidratação, fisioterapia, longevidade atlética, overtraining, saúde cardiovascular do atleta.",
    },
    {
        "id": "personal",
        "name": "Coach Ricardo Lima",
        "title": "Personal Trainer",
        "tagline": "Hipertrofia, força e periodização",
        "description": "Preparador físico experiente: hipertrofia, força, técnica de execução e periodização.",
        "color": "#FF7A4D",
        "avatar": "https://images.pexels.com/photos/32695890/pexels-photo-32695890.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": [
            "Qual o melhor split pra hipertrofia?",
            "Periodizar treino pra força máxima, como?",
            "Treinar até a falha vale a pena?",
            "Quantos sets por grupo por semana?",
        ],
        "topics": [
            {"title": "Volume é o driver #1", "body": "10-20 séries por grupo muscular por semana cobre 90% do povo. Mais que isso só com recuperação de elite."},
            {"title": "Intensidade de esforço > falha", "body": "RIR 1-3 na maioria das séries gera tanto estímulo quanto ir à falha, com menos fadiga acumulada."},
            {"title": "Progressão não é só peso", "body": "Pode progredir em reps, cadência (tempo sob tensão), amplitude, qualidade da execução. Carga é só uma variável."},
        ],
        "persona": "Você é Coach Ricardo Lima, personal trainer do BLACKSCLUB, ~50 anos, preparador físico com CREF ativo, experiência com atleta amador e de alto nível. Fala firme, prático, sem floreio, usa gírias da musculação com moderação ('destravar o shape', 'carregar volume'). Áreas: hipertrofia, força máxima, periodização (linear, ondulatória, blocos), técnica de execução, progressão de cargas, splits (PPL, upper/lower, fullbody), mobilidade e aquecimento.",
    },
    {
        "id": "farmaceutico",
        "name": "Dr. Paulo Almeida",
        "title": "Farmacêutico Clínico",
        "tagline": "Peptídeos, interações e procedência",
        "description": "Farmácia clínica: peptídeos, farmacocinética, interações, armazenamento e rastreabilidade.",
        "color": "#D4AF37",
        "avatar": "https://images.pexels.com/photos/8376273/pexels-photo-8376273.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": [
            "Como armazenar peptídeos direito?",
            "O que verificar na procedência de um produto?",
            "CJC-1295 com e sem DAC: qual a diferença?",
            "Interações comuns de GLP-1?",
        ],
        "topics": [
            {"title": "Peptídeo é proteína curta e frágil", "body": "Calor, luz e repetidos congelamentos destroem a molécula. Refrigeração 2-8°C e reconstituição correta são básicos que muita gente erra."},
            {"title": "Procedência: o que olhar", "body": "Lote, fabricante, documento de análise (COA/laudo), selo de pureza, embalagem intacta e validade. Preço muito abaixo do mercado é bandeira vermelha."},
            {"title": "Interação silenciosa", "body": "GLP-1 atrasa o esvaziamento gástrico e pode mudar absorção de anticoncepcional oral, antibiótico, levotiroxina. Saber disso evita falha terapêutica."},
        ],
        "persona": "Você é Dr. Paulo Almeida, farmacêutico clínico do BLACKSCLUB, ~60 anos, óculos, experiência enorme em manipulação e farmácia hospitalar. Tom didático, didata, tranquilo, explica o 'por que' de cada coisa. Áreas: peptídeos (mecanismo, meia-vida, reconstituição), farmacocinética, interações medicamentosas, armazenamento, rastreabilidade, lote, fabricante, biossegurança, diferenças entre mercados.",
    },
    {
        "id": "dermato",
        "name": "Dra. Juliana Reis",
        "title": "Dermatologista",
        "tagline": "Pele, colágeno e longevidade",
        "description": "Dermatologia: colágeno, peptídeos estéticos (GHK-Cu, Epitalon), anti-aging e skincare.",
        "color": "#A8E04E",
        "avatar": "https://images.unsplash.com/photo-1635784134333-e359347877d6?auto=format&fit=crop&w=400&q=80",
        "starters": [
            "Como aumentar colágeno de forma inteligente?",
            "O que é GHK-Cu e pra que serve?",
            "Skincare básico pra homem que treina?",
            "Acne por AAS: o que fazer?",
        ],
        "topics": [
            {"title": "Colágeno é estímulo, não suplemento", "body": "Colágeno hidrolisado ajuda um pouco via aminoácidos. O que realmente faz pele firmar é estímulo (laser, microagulhamento, bioestimuladores, vitamina C tópica)."},
            {"title": "GHK-Cu é o peptídeo estrela", "body": "Tripeptídeo cobre com efeito regenerativo documentado na pele, ação anti-inflamatória e antioxidante. Tópico tem evidência, injetável ainda é off-label."},
            {"title": "Fotoproteção é anti-aging real", "body": "Filtro solar diário previne mais rugas do que qualquer creme caro do mercado. Simples assim."},
        ],
        "persona": "Você é Dra. Juliana Reis, médica dermatologista do BLACKSCLUB, ~55 anos, usa óculos, atende público sofisticado. Papo elegante, claro, didático. Áreas: saúde da pele, estrutura do colágeno, peptídeos estéticos (GHK-Cu, Epitalon, Matrixyl), bioestimuladores injetáveis, acne (inclusive induzida por AAS), skincare masculino/feminino, fotoproteção, longevidade cutânea, queda de cabelo.",
    },
    {
        "id": "preparadora",
        "name": "Coach Bianca Souza",
        "title": "Preparadora Física Feminina",
        "tagline": "Estética feminina e emagrecimento",
        "description": "Preparação física com foco feminino: glúteos, emagrecimento, ciclo menstrual e treino.",
        "color": "#4E8FE0",
        "avatar": "https://images.unsplash.com/photo-1746559845070-10aa66800280?auto=format&fit=crop&w=400&q=80",
        "starters": [
            "Melhor treino pra hipertrofia de glúteos?",
            "Como treinar conforme o ciclo menstrual?",
            "Emagrecer sem perder curvas: dá?",
            "Cardio no bulking feminino é necessário?",
        ],
        "topics": [
            {"title": "Glúteo é músculo como qualquer outro", "body": "Precisa de volume (12-18 séries/semana), variedade de ângulos (empurrar, levantar, abduzir) e progressão. 3 vezes por semana em dias não seguidos."},
            {"title": "Ciclo menstrual afeta performance", "body": "Fase folicular: força e recuperação melhores. Luteal tardia: retenção e fadiga. Usar a favor, não ignorar."},
            {"title": "Curva vem de força + volume alimentar", "body": "Musculatura desenvolvida + um pouco de gordura estratégica = o shape que a maioria busca. Magreza extrema achata tudo."},
        ],
        "persona": "Você é Coach Bianca Souza, preparadora física feminina do BLACKSCLUB, ~48 anos, experiência longa atendendo público feminino. Tom firme, empático, direto ao ponto, moderna. Áreas: hipertrofia feminina, glúteos e posterior de coxa, emagrecimento preservando musculatura, ciclo menstrual e treino, postura, estética feminina realista, autoestima corporal.",
    },
]


def _get_specialist(specialist_id: Optional[str]) -> Dict[str, Any]:
    if not specialist_id:
        return SPECIALISTS[0]
    for s in SPECIALISTS:
        if s["id"] == specialist_id:
            return s
    return SPECIALISTS[0]


def _system_prompt_for(specialist: Dict[str, Any], member_name: str) -> str:
    first_name = (member_name or "").split(" ")[0] if member_name else "membro"
    return f"""{specialist['persona']}

INFORMAÇÃO DA PESSOA COM QUEM VOCÊ ESTÁ FALANDO:
- Nome: {member_name or 'Membro'}
- Primeiro nome (use nas mensagens): {first_name}

{BASE_GUARDRAILS}
"""


class AIMessage(BaseModel):
    member_id: str
    text: str
    specialist_id: Optional[str] = None
    image_base64: Optional[str] = None  # data URL or raw base64 of an image


@api_router.get("/ai/specialists")
async def list_specialists():
    # Public-safe payload (no persona / prompt leaked)
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "title": s["title"],
            "tagline": s["tagline"],
            "description": s["description"],
            "color": s["color"],
            "avatar": s["avatar"],
            "starters": s["starters"],
            "topics": s.get("topics", []),
        }
        for s in SPECIALISTS
    ]


@api_router.post("/ai/chat")
async def ai_chat(data: AIMessage):
    if not LlmChat:
        raise HTTPException(status_code=503, detail="IA temporariamente indisponível")
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="LLM não configurada")
    text = data.text.strip()
    has_image = bool(data.image_base64)
    if not text and not has_image:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    member = await db.members.find_one({"member_id": data.member_id}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    specialist = _get_specialist(data.specialist_id)
    session_id = f"black_ai_{specialist['id']}_{data.member_id}"
    member_name = member.get("name", "Membro")
    chat = LlmChat(
        api_key=key,
        session_id=session_id,
        system_message=_system_prompt_for(specialist, member_name),
    ).with_model("openai", "gpt-4o")

    now = datetime.now(timezone.utc)
    await db.ai_messages.insert_one({
        "ai_msg_id": f"aim_{uuid.uuid4().hex[:12]}",
        "session_id": session_id,
        "specialist_id": specialist["id"],
        "member_id": data.member_id,
        "sender": "member",
        "text": text or "(enviou uma imagem)",
        "has_image": has_image,
        "created_at": now,
    })

    # Build user message — with image support if provided
    try:
        if has_image:
            # Try import helper for image message
            try:
                from emergentintegrations.llm.chat import ImageContent  # type: ignore
                img_b64 = data.image_base64
                if "," in img_b64 and img_b64.startswith("data:"):
                    img_b64 = img_b64.split(",", 1)[1]
                msg = UserMessage(
                    text=text or "Analise esta imagem e comente de forma natural, como se estivesse vendo num atendimento.",
                    file_contents=[ImageContent(image_base64=img_b64)],
                )
            except Exception:
                # Fallback: tell the model there's an image but we couldn't process
                msg = UserMessage(
                    text=(text or "") + "\n\n(O usuário enviou uma imagem, mas o recurso de visão está temporariamente indisponível. Peça desculpas brevemente e peça descrição textual.)",
                )
        else:
            msg = UserMessage(text=text)
        reply = await chat.send_message(msg)
    except Exception as e:
        logger.error("AI error: %s", e)
        raise HTTPException(status_code=500, detail=f"Falha na BLACK AI: {e}")

    await db.ai_messages.insert_one({
        "ai_msg_id": f"aim_{uuid.uuid4().hex[:12]}",
        "session_id": session_id,
        "specialist_id": specialist["id"],
        "member_id": data.member_id,
        "sender": "ai",
        "text": reply,
        "created_at": datetime.now(timezone.utc),
    })
    return {"reply": reply, "specialist_id": specialist["id"]}


@api_router.get("/ai/history/{member_id}")
async def ai_history(member_id: str, specialist_id: Optional[str] = None):
    if specialist_id:
        session_id = f"black_ai_{specialist_id}_{member_id}"
        q = {"session_id": session_id}
    else:
        # Legacy fallback: return everything for this member
        q = {"member_id": member_id}
    cursor = db.ai_messages.find(q, {"_id": 0}).sort("created_at", 1).limit(200)
    return await cursor.to_list(length=200)


@api_router.delete("/ai/history/{member_id}")
async def ai_history_clear(member_id: str, specialist_id: Optional[str] = None):
    if specialist_id:
        session_id = f"black_ai_{specialist_id}_{member_id}"
        await db.ai_messages.delete_many({"session_id": session_id})
    else:
        await db.ai_messages.delete_many({"member_id": member_id})
    return {"ok": True}


# -------------- Products --------------
class ProductCreate(BaseModel):
    name: str
    category: str
    subcategory: Optional[str] = None
    description: str
    price: float
    member_price: float
    image_url: str
    stock: int = 10
    featured: bool = False


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
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
    subcategory: Optional[str] = None
    description: str
    price: float
    member_price: float
    image_url: str
    stock: int
    featured: bool
    created_at: datetime


@api_router.get("/products", response_model=List[Product])
async def list_products(category: Optional[str] = None, subcategory: Optional[str] = None, q: Optional[str] = None):
    query: dict = {}
    if category and category != "all":
        query["category"] = category
    if subcategory and subcategory != "all":
        query["subcategory"] = subcategory
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.products.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=500)
    return [Product(**item) for item in items]


@api_router.get("/subcategories/{category}")
async def subcategories(category: str):
    cursor = db.products.aggregate([
        {"$match": {"category": category, "subcategory": {"$ne": None}}},
        {"$group": {"_id": "$subcategory", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])
    rows = await cursor.to_list(length=100)
    return [{"id": r["_id"], "name": r["_id"], "count": r["count"]} for r in rows if r["_id"]]


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
    # EMAGRECEDORES — Semaglutida
    {
        "name": "Ozempic 1mg (Semaglutida)", "category": "emagrecedores", "subcategory": "Semaglutida",
        "description": "Caneta 1mg. Análogo de GLP-1 para controle de peso e glicemia. Aplicação semanal.",
        "price": 1250.00, "member_price": 999.00,
        "image_url": "https://images.unsplash.com/photo-1704018731170-f30899f60917?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwyfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 12, "featured": True,
    },
    {
        "name": "Wegovy 2.4mg (Semaglutida)", "category": "emagrecedores", "subcategory": "Semaglutida",
        "description": "Alta dosagem GLP-1 dedicada ao manejo de obesidade. Caneta semanal.",
        "price": 1650.00, "member_price": 1299.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 6, "featured": False,
    },
    # EMAGRECEDORES — Tirzepatida
    {
        "name": "Mounjaro 5mg (Tirzepatida)", "category": "emagrecedores", "subcategory": "Tirzepatida",
        "description": "Agonista duplo GIP/GLP-1. Redução de apetite e perda de peso progressiva.",
        "price": 1890.00, "member_price": 1499.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 8, "featured": True,
    },
    {
        "name": "Mounjaro 10mg (Tirzepatida)", "category": "emagrecedores", "subcategory": "Tirzepatida",
        "description": "Dose intermediária. Caneta aplicadora pronta para uso semanal.",
        "price": 2190.00, "member_price": 1749.00,
        "image_url": "https://images.unsplash.com/photo-1704018731170-f30899f60917?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwyfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 5, "featured": False,
    },
    # EMAGRECEDORES — Retatrutida
    {
        "name": "Retatrutida 10mg (Ampola)", "category": "emagrecedores", "subcategory": "Retatrutida",
        "description": "Tri-agonista (GLP-1, GIP, Glucagon). Ampola para reconstituição. Uso semanal.",
        "price": 2450.00, "member_price": 1999.00,
        "image_url": "https://images.unsplash.com/photo-1549505415-e16dbd446231?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 4, "featured": True,
    },
    # PEPTIDEOS
    {
        "name": "BPC-157 5mg", "category": "peptideos", "subcategory": "Regenerativos",
        "description": "Peptídeo regenerativo. Auxilia recuperação muscular e tecidual.",
        "price": 420.00, "member_price": 329.00,
        "image_url": "https://images.unsplash.com/photo-1549505415-e16dbd446231?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 25, "featured": True,
    },
    {
        "name": "TB-500 5mg", "category": "peptideos", "subcategory": "Regenerativos",
        "description": "Fragmento de Timosina Beta 4. Recuperação e flexibilidade tecidual.",
        "price": 480.00, "member_price": 379.00,
        "image_url": "https://images.pexels.com/photos/36591369/pexels-photo-36591369.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 18, "featured": False,
    },
    {
        "name": "Ipamorelina 5mg", "category": "peptideos", "subcategory": "GH-releasers",
        "description": "Secretagogo de GH. Liberação pulsátil, sem aumentar cortisol.",
        "price": 380.00, "member_price": 299.00,
        "image_url": "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 14, "featured": False,
    },
    {
        "name": "CJC-1295 DAC 5mg", "category": "peptideos", "subcategory": "GH-releasers",
        "description": "Análogo de GHRH de longa duração. Liberação sustentada de GH.",
        "price": 520.00, "member_price": 399.00,
        "image_url": "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 10, "featured": False,
    },
    # LANDERLAN
    {
        "name": "Durateston Landerlan 250mg", "category": "landerlan", "subcategory": "Testosterona",
        "description": "Blend de 4 ésteres de testosterona. Ampola 1ml. Produto autêntico.",
        "price": 180.00, "member_price": 139.00,
        "image_url": "https://images.unsplash.com/photo-1709315957145-a4bad1feef28?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwzfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 30, "featured": True,
    },
    {
        "name": "Deca-durabolin Landerlan 300mg", "category": "landerlan", "subcategory": "Nandrolona",
        "description": "Decanoato de nandrolona. Ampola 10ml. Linha Paraguai autêntica.",
        "price": 240.00, "member_price": 189.00,
        "image_url": "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 22, "featured": False,
    },
    # HORMONIOS (com Wonderland seeds)
    {
        "name": "HGH Somatropina Wonderland 10UI", "category": "hormonios", "subcategory": "Wonderland",
        "description": "Hormônio do crescimento recombinante. Linha Wonderland. Caixa com 10 frascos.",
        "price": 1350.00, "member_price": 1099.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 7, "featured": True,
    },
    {
        "name": "HCG Wonderland 5000UI", "category": "hormonios", "subcategory": "Wonderland",
        "description": "Gonadotrofina coriônica humana. Linha Wonderland. Ampola + diluente.",
        "price": 240.00, "member_price": 189.00,
        "image_url": "https://images.unsplash.com/photo-1704018731170-f30899f60917?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwyfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 15, "featured": False,
    },
    # PRE-TREINOS
    {
        "name": "C4 Ultimate 380g", "category": "pre_treinos", "subcategory": "Estimulante",
        "description": "Pré-treino de alta intensidade. Cafeína, beta-alanina e citrulina.",
        "price": 199.00, "member_price": 149.00,
        "image_url": "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 40, "featured": False,
    },
    # SUPLEMENTOS
    {
        "name": "Whey Protein Isolado 900g", "category": "suplementos", "subcategory": "Proteínas",
        "description": "Proteína isolada hidrolisada. 27g de proteína por dose.",
        "price": 219.00, "member_price": 169.00,
        "image_url": "https://images.pexels.com/photos/36591369/pexels-photo-36591369.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 45, "featured": False,
    },
    {
        "name": "Creatina Monohidratada 300g", "category": "suplementos", "subcategory": "Performance",
        "description": "Creatina pura micronizada. Força, volume e performance.",
        "price": 119.00, "member_price": 89.00,
        "image_url": "https://images.pexels.com/photos/29611432/pexels-photo-29611432.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 60, "featured": True,
    },
    # TECNOLOGIA — balanças e auxiliares
    {
        "name": "Balança Bioimpedância Premium", "category": "tecnologia", "subcategory": "Balanças",
        "description": "Análise de 14 métricas corporais (gordura, músculo, hidratação, idade metabólica). App integrado.",
        "price": 499.00, "member_price": 389.00,
        "image_url": "https://images.unsplash.com/photo-1549505415-e16dbd446231?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 20, "featured": True,
    },
    {
        "name": "Fita Métrica Digital Corporal", "category": "tecnologia", "subcategory": "Medidores",
        "description": "Medição automática de circunferências. Bluetooth + app de histórico.",
        "price": 189.00, "member_price": 139.00,
        "image_url": "https://images.pexels.com/photos/36591369/pexels-photo-36591369.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 35, "featured": False,
    },
    {
        "name": "Kit Seringas Aplicação (100un)", "category": "tecnologia", "subcategory": "Aplicação",
        "description": "Seringas estéreis descartáveis para aplicação subcutânea e intramuscular.",
        "price": 89.00, "member_price": 69.00,
        "image_url": "https://images.unsplash.com/photo-1700225195232-c55a4e9db6aa?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2MzR8MHwxfHNlYXJjaHwxfHxibGFjayUyMGx1eHVyeSUyMHN1cHBsZW1lbnQlMjBib3R0bGV8ZW58MHx8fHwxNzc2ODAyNTA3fDA&ixlib=rb-4.1.0&q=85",
        "stock": 80, "featured": False,
    },
    {
        "name": "Água Bacteriostática 30ml", "category": "tecnologia", "subcategory": "Diluentes",
        "description": "Diluente estéril para reconstituição de peptídeos liofilizados. 30ml.",
        "price": 69.00, "member_price": 49.00,
        "image_url": "https://images.unsplash.com/photo-1549505415-e16dbd446231?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxkYXJrJTIwZ3ltJTIwZml0bmVzcyUyMGF0aGxldGV8ZW58MHx8fHwxNzc2NzY2Njc2fDA&ixlib=rb-4.1.0&q=85",
        "stock": 100, "featured": False,
    },
    # BEM-ESTAR
    {
        "name": "Magnésio Dimalato 60 caps", "category": "bem_estar", "subcategory": "Minerais",
        "description": "Biodisponibilidade superior. Sono, relaxamento muscular e energia celular.",
        "price": 89.00, "member_price": 59.00,
        "image_url": "https://images.pexels.com/photos/29825227/pexels-photo-29825227.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "stock": 50, "featured": False,
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
    # Re-seed if existing products lack subcategory
    count = await db.products.count_documents({})
    missing_subcat = await db.products.count_documents({"subcategory": {"$exists": False}})
    if count > 0 and missing_subcat == 0:
        return
    if missing_subcat > 0:
        await db.products.delete_many({})
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
    # Backfill member_number for existing members (one-time migration)
    await backfill_member_numbers()


async def backfill_member_numbers():
    existing = await db.members.find({"member_number": {"$exists": False}}, {"_id": 0, "member_id": 1, "created_at": 1}).sort("created_at", 1).to_list(length=2000)
    if not existing:
        return
    last = await db.members.find({"member_number": {"$exists": True}}, {"member_number": 1}).sort("member_number", -1).limit(1).to_list(length=1)
    next_num = (last[0]["member_number"] + 1) if last else 10001
    for m in existing:
        await db.members.update_one({"member_id": m["member_id"]}, {"$set": {"member_number": next_num}})
        next_num += 1
    logger.info("[migration] assigned member_number to %d existing members", len(existing))


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
