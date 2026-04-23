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


@api_router.get("/gate/check")
async def gate_check(code: str = ""):
    """Lightweight check if an access code is authorized (without committing any data)."""
    c = (code or "").strip().upper()
    if len(c) < 3:
        raise HTTPException(status_code=400, detail="Código inválido")
    # Check authorized pre-registrations
    doc = await db.authorized.find_one({"code": c}, {"_id": 0})
    if doc:
        return {"ok": True, "name": doc.get("name"), "tier": doc.get("tier", "black")}
    # Also accept existing member's invite code so they can re-enter
    member = await db.members.find_one({"invite_code": c}, {"_id": 0})
    if member:
        return {"ok": True, "name": member.get("name"), "tier": member.get("tier", "black")}
    raise HTTPException(status_code=404, detail="Código não autorizado")


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
    # ========== FÍSICO / SAÚDE ==========
    {
        "id": "nutrologo",
        "name": "Dr. Rafael Moretti",
        "title": "Nutrólogo",
        "category": "fisico",
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

    # ========== MENTE / PSICOLÓGICO ==========
    {
        "id": "psiquiatra",
        "name": "Dr. Marcos Vilela",
        "title": "Psiquiatra",
        "category": "mental",
        "tagline": "Ansiedade, depressão, TDAH e sono",
        "description": "Psiquiatra do BLACKSCLUB. Fala sobre ansiedade, depressão, TDAH, insônia, transtornos de humor e uso consciente de medicação.",
        "color": "#B287FF",
        "avatar": "https://images.pexels.com/photos/5234490/pexels-photo-5234490.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["Como saber se é ansiedade ou só estresse?", "Insônia já virou problema, o que fazer?", "TDAH em adulto, como é?", "Quando procurar psiquiatra?"],
        "topics": [
            {"title": "Ansiedade não é frescura", "body": "É real, tem base neuroquímica (serotonina, GABA, noradrenalina). Dá pra tratar com terapia, hábito e, quando precisa, remédio certo."},
            {"title": "Sono é remédio", "body": "Insônia crônica piora ansiedade, humor, peso e até imunidade. Higiene do sono resolve muita coisa antes de qualquer comprimido."},
        ],
        "persona": "Você é Dr. Marcos Vilela, psiquiatra do BLACKSCLUB. Conversa de igual pra igual, sem aquele papo frio de médico. Fala simples, acolhedor, como um amigo médico que te recebe no escritório. Áreas: ansiedade, depressão, transtorno bipolar, TDAH adulto, pânico, insônia, uso responsável de psicotrópicos, dependência química leve.",
    },
    {
        "id": "psicologo",
        "name": "Léo Figueiredo",
        "title": "Psicólogo",
        "category": "mental",
        "tagline": "Relacionamentos, autoestima e propósito",
        "description": "Psicólogo do BLACKSCLUB. Escuta aberta sobre relacionamentos, autoestima, propósito, carreira e emoções do dia a dia.",
        "color": "#7FD7E5",
        "avatar": "https://images.pexels.com/photos/8410096/pexels-photo-8410096.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["Brigo com minha esposa toda semana, como mudar isso?", "Autoestima baixa, por onde começar?", "Tô perdido com carreira, me ajuda?", "Como lidar com medo de falhar?"],
        "topics": [
            {"title": "A gente não nasce sabendo sentir", "body": "Emoção se aprende a nomear e a regular. Quem consegue colocar em palavras o que sente, sofre menos — literalmente."},
            {"title": "Relacionamento não é intuição", "body": "Comunicação não-violenta, escuta ativa, fronteiras. Isso se treina. Não existe relação saudável sem trabalho de dois."},
        ],
        "persona": "Você é Léo Figueiredo, psicólogo do BLACKSCLUB. Fala manso, sem julgamento, curioso pela história da pessoa. Evita jargão de terapia (tipo 'projeção', 'gatilho', 'resiliente') — usa palavra do dia a dia. Áreas: terapia cognitivo-comportamental, relacionamento, autoestima, carreira, propósito, luto, paternidade/maternidade.",
    },
    {
        "id": "cientista",
        "name": "Prof. André Tavares",
        "title": "Cientista / Pesquisador",
        "category": "mental",
        "tagline": "Ciência do dia a dia, estudos e verdade",
        "description": "Doutor em biologia molecular. Desmonta fake news, explica estudos recentes e traz ciência pro dia a dia sem complicar.",
        "color": "#4EE07F",
        "avatar": "https://images.pexels.com/photos/2280547/pexels-photo-2280547.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["Esse estudo que saiu é verdade?", "Como saber se uma notícia de saúde é confiável?", "Genética influencia quanto no shape?", "IA vai dominar mesmo?"],
        "topics": [
            {"title": "Correlação não é causa", "body": "Só porque duas coisas andam juntas, não quer dizer que uma causa a outra. Saber essa diferença muda como você lê o mundo."},
            {"title": "Método científico é chato de propósito", "body": "Pra descobrir o que funciona de verdade, precisa repetir teste, ter grupo controle, cegar estudo. Parece burocracia — na real é proteção contra a gente mesmo se enganar."},
        ],
        "persona": "Você é Prof. André Tavares, pesquisador do BLACKSCLUB, PhD em biologia molecular. Explica ciência com analogia de mercado, cozinha, esporte — tudo menos com palavrão de artigo. Áreas: metodologia científica, estudos clínicos, genética básica, epidemiologia, biotecnologia, IA aplicada à saúde, filosofia da ciência, como pensar com dados.",
    },

    # ========== VIDA / EMERGÊNCIA / DIREITO ==========
    {
        "id": "advogado",
        "name": "Dra. Renata Dias",
        "title": "Advogada",
        "category": "vida",
        "tagline": "Direito do dia a dia: trabalho, família, contratos",
        "description": "Advogada com ~20 anos de OAB. Explica direitos de forma simples: trabalho, consumidor, família, contratos, imóveis.",
        "color": "#D4AF37",
        "avatar": "https://images.pexels.com/photos/5668473/pexels-photo-5668473.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["Fui demitido, o que tenho direito?", "Compra em loja online que não entregou, e agora?", "Separei, como funciona divisão de bens?", "Fui multado injusto, posso contestar?"],
        "topics": [
            {"title": "O brasileiro não sabe seus direitos", "body": "Isso faz muita gente aceitar muita coisa errada por medo ou falta de info. Saber o básico da CLT, CDC e Constituição resolve 80% das brigas."},
            {"title": "Contrato verbal vale — às vezes", "body": "Dependendo do caso, sim. Mas sempre o escrito protege mais. Se for coisa séria, põe no papel."},
        ],
        "persona": "Você é Dra. Renata Dias, advogada do BLACKSCLUB. Fala direto, sem juridiquês, como uma amiga que te explica o que fazer. Sempre deixa claro quando o caso precisa de advogado presencial de verdade. Áreas: direito do trabalho, direito do consumidor, família, contratos, imóveis, trânsito, LGPD básico.",
    },
    {
        "id": "policial",
        "name": "Carlos 'Sargento' Mendes",
        "title": "Policial Militar (reserva)",
        "category": "vida",
        "tagline": "Segurança pessoal, o que fazer em situações de risco",
        "description": "Sargento da PM na reserva, instrutor de defesa pessoal. Orienta sobre segurança pessoal, residencial e do dia a dia.",
        "color": "#4E8FE0",
        "avatar": "https://images.pexels.com/photos/8065590/pexels-photo-8065590.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["Fui abordado na rua, o que devo fazer?", "Como deixar minha casa mais segura?", "Vale a pena ter arma em casa?", "Me seguindo no carro, e agora?"],
        "topics": [
            {"title": "Atitude > arma", "body": "A maioria dos assaltos é por oportunidade. Quem anda atento, evita. Arma sem treino e cabeça fria cria mais problema que resolve."},
            {"title": "Em assalto, bens não valem a vida", "body": "Entregue celular, carteira, tudo. Foco é sair vivo. Polícia depois."},
        ],
        "persona": "Você é Carlos Mendes, sargento PM reserva do BLACKSCLUB. Fala firme, curto, prático, como um instrutor de curso de segurança. Sem papo furado. Áreas: segurança pessoal, residencial e veicular, prevenção de assaltos e sequestros, abordagem policial, legítima defesa, posse/porte de arma.",
    },
    {
        "id": "bombeiro",
        "name": "Ten. Diego Prado",
        "title": "Bombeiro",
        "category": "vida",
        "tagline": "Emergências, incêndio e resgate",
        "description": "Tenente do Corpo de Bombeiros. Ensina o que fazer em incêndio, acidente, afogamento, choque e outras emergências do dia a dia.",
        "color": "#FF7A4D",
        "avatar": "https://images.pexels.com/photos/8942879/pexels-photo-8942879.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["Tem fumaça em casa, o que faço?", "Como agir em acidente de carro?", "Alguém engasgou, e agora?", "Extintor em casa precisa mesmo?"],
        "topics": [
            {"title": "30 segundos fazem diferença", "body": "Em incêndio residencial, os 30 primeiros segundos definem se você sai a tempo. Ter plano de fuga e detector de fumaça muda o jogo."},
            {"title": "Fogo na cozinha com óleo: NUNCA água", "body": "Óleo quente + água = explosão. Abafa com tampa ou pano molhado e desliga o gás. Água em óleo é receita de UTI."},
        ],
        "persona": "Você é Ten. Diego Prado, bombeiro do BLACKSCLUB. Fala claro e rápido, como um instrutor de APH. Explica passos numerados quando é emergência (1, 2, 3). Áreas: incêndio residencial/veicular, acidente de trânsito, engasgo, afogamento, choque elétrico, acidente doméstico, plano de fuga.",
    },
    {
        "id": "socorrista",
        "name": "Enf. Marina Albuquerque",
        "title": "Socorrista / Enfermeira",
        "category": "vida",
        "tagline": "Primeiros socorros e o básico que salva",
        "description": "Enfermeira de UTI e resgate. Ensina primeiros socorros reais pra quem não tem noção: parada, convulsão, queimadura, corte, febre em criança.",
        "color": "#FF6BD5",
        "avatar": "https://images.pexels.com/photos/7407784/pexels-photo-7407784.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["Bebê com febre alta, o que fazer?", "Como fazer massagem cardíaca?", "Queimadura de óleo, passo o quê?", "Convulsão na família, ajudo como?"],
        "topics": [
            {"title": "Massagem cardíaca salva vida de verdade", "body": "30 compressões fortes no meio do peito, ritmo de 'Stayin' Alive'. Qualquer um pode fazer. Não precisa ter medo de quebrar costela — desmaio sem massagem mata em 4 minutos."},
            {"title": "Queimadura: água corrente, sempre", "body": "10 minutos de água corrente fria. Nada de pasta de dente, manteiga, gelo direto. Simples, funciona, evita infecção."},
        ],
        "persona": "Você é Marina Albuquerque, enfermeira do BLACKSCLUB. Fala calma, firme, como quem já viu muita gente em emergência. Ensina passo a passo, sem assustar. Áreas: primeiros socorros, PCR, engasgo, convulsão, queimadura, corte, febre (adulto e criança), desidratação, reação alérgica.",
    },

    # ========== ESPIRITUAL ==========
    {
        "id": "pastor",
        "name": "Pastor Eliseu Batista",
        "title": "Pastor / Bíblia",
        "category": "espiritual",
        "tagline": "Bíblia, fé e vida prática",
        "description": "Pastor com décadas estudando as Escrituras. Ajuda a entender passagens, aplicar a Bíblia na vida real e responder dúvidas de fé sem julgar.",
        "color": "#F5C150",
        "avatar": "https://images.pexels.com/photos/8107967/pexels-photo-8107967.jpeg?auto=compress&cs=tinysrgb&w=400",
        "starters": ["O que a Bíblia diz sobre perdão?", "Tô passando por tempo difícil, como orar?", "Qual é o significado de Romanos 8?", "Fé e ciência se batem mesmo?"],
        "topics": [
            {"title": "A Bíblia é prática, não só ritual", "body": "Provérbios, Eclesiastes, Cartas de Paulo — tem conselho pra trabalho, dinheiro, casamento, ansiedade. Ler com calma muda como você enxerga o dia."},
            {"title": "Oração é conversa, não fórmula", "body": "Não precisa palavra bonita nem voz de culto. Abrir o coração, agradecer, pedir, ouvir. Simples assim."},
        ],
        "persona": "Você é Pastor Eliseu Batista, pastor do BLACKSCLUB, ~60 anos, décadas estudando a Bíblia (Antigo e Novo Testamento, grego e hebraico básico). Fala com amor, sem julgamento, sem 'cara de igreja'. Conhece profundamente as Escrituras e cita versículo só quando agrega. Respeita quem não tem fé. Áreas: exegese bíblica, teologia, vida cristã, oração, dúvidas de fé, ética, família, relação fé x ciência.",
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
            "category": s.get("category", "fisico"),
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
async def create_product(data: ProductCreate, admin: dict = Depends(require_staff)):
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
async def update_product(product_id: str, data: ProductUpdate, admin: dict = Depends(require_staff)):
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
async def delete_product(product_id: str, admin: dict = Depends(require_staff)):
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
    await seed_groups()
    await seed_events()
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


# ============================================
# COMMUNITY (MSN-style)
# ============================================

class ProfileUpdate(BaseModel):
    nickname: Optional[str] = None
    bio: Optional[str] = None
    age: Optional[int] = None
    profession: Optional[str] = None
    gym: Optional[str] = None
    city: Optional[str] = None
    avatar_base64: Optional[str] = None  # data URL


def _public_member(m: Dict[str, Any], online_cutoff: datetime) -> Dict[str, Any]:
    online_at = m.get("online_at")
    # Normalize: MongoDB may return naive datetimes even when stored with tz
    if online_at is not None and getattr(online_at, "tzinfo", None) is None:
        online_at = online_at.replace(tzinfo=timezone.utc)
    is_online = bool(online_at and online_at > online_cutoff)
    return {
        "member_id": m.get("member_id"),
        "member_number": m.get("member_number"),
        "nickname": m.get("nickname") or m.get("name", "Membro").split(" ")[0],
        "tier": m.get("tier", "black"),
        "avatar_base64": m.get("avatar_base64"),
        "age": m.get("age"),
        "profession": m.get("profession"),
        "gym": m.get("gym"),
        "city": m.get("city"),
        "bio": m.get("bio"),
        "is_online": is_online,
    }


@api_router.put("/members/{member_id}/profile")
async def update_member_profile(member_id: str, data: ProfileUpdate):
    updates: Dict[str, Any] = {}
    if data.nickname is not None:
        nick = data.nickname.strip()
        if len(nick) > 24:
            nick = nick[:24]
        updates["nickname"] = nick or None
    if data.bio is not None:
        updates["bio"] = data.bio.strip()[:240] or None
    if data.age is not None:
        try:
            updates["age"] = int(data.age) if 10 <= int(data.age) <= 110 else None
        except Exception:
            pass
    if data.profession is not None:
        updates["profession"] = data.profession.strip()[:60] or None
    if data.gym is not None:
        updates["gym"] = data.gym.strip()[:60] or None
    if data.city is not None:
        updates["city"] = data.city.strip()[:60] or None
    if data.avatar_base64 is not None:
        v = data.avatar_base64.strip()
        # Only accept data URLs up to ~1MB to avoid DB bloat
        if len(v) > 1_300_000:
            raise HTTPException(status_code=400, detail="Avatar muito grande (máx 1MB)")
        updates["avatar_base64"] = v or None
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    r = await db.members.update_one({"member_id": member_id}, {"$set": updates})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return {"ok": True}


@api_router.post("/members/{member_id}/heartbeat")
async def heartbeat(member_id: str):
    now = datetime.now(timezone.utc)
    await db.members.update_one({"member_id": member_id}, {"$set": {"online_at": now}})
    return {"ok": True, "now": now.isoformat()}


@api_router.get("/community/members")
async def community_members(exclude: Optional[str] = None):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=5)
    q: Dict[str, Any] = {"active": {"$ne": False}}
    if exclude:
        q["member_id"] = {"$ne": exclude}
    cur = db.members.find(q, {"_id": 0, "password_hash": 0}).limit(500)
    members = await cur.to_list(length=500)
    items = [_public_member(m, cutoff) for m in members]
    # Online first, then by member_number
    items.sort(key=lambda x: (not x["is_online"], x.get("member_number") or 0))
    return items


@api_router.get("/community/members/{member_id}")
async def community_member_detail(member_id: str):
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=5)
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "password_hash": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return _public_member(m, cutoff)


# ---- DMs ----

class DMSend(BaseModel):
    text: str


def _dm_thread(a: str, b: str) -> str:
    return "dm_" + "_".join(sorted([a, b]))


@api_router.get("/community/dms/{me_id}/{other_id}")
async def dm_list(me_id: str, other_id: str):
    tid = _dm_thread(me_id, other_id)
    cur = db.dm_messages.find({"thread_id": tid}, {"_id": 0}).sort("created_at", 1).limit(400)
    return await cur.to_list(length=400)


@api_router.post("/community/dms/{me_id}/{other_id}")
async def dm_send(me_id: str, other_id: str, data: DMSend):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    tid = _dm_thread(me_id, other_id)
    doc = {
        "dm_id": f"dm_{uuid.uuid4().hex[:12]}",
        "thread_id": tid,
        "from_id": me_id,
        "to_id": other_id,
        "text": text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.dm_messages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/community/dms/{me_id}")
async def dm_threads(me_id: str):
    """List all DM partners with last message + unread-ish info"""
    cur = db.dm_messages.find(
        {"$or": [{"from_id": me_id}, {"to_id": me_id}]},
        {"_id": 0},
    ).sort("created_at", -1).limit(500)
    msgs = await cur.to_list(length=500)
    by_partner: Dict[str, Dict[str, Any]] = {}
    for m in msgs:
        partner = m["to_id"] if m["from_id"] == me_id else m["from_id"]
        if partner not in by_partner:
            by_partner[partner] = {"partner_id": partner, "last_text": m["text"], "last_at": m["created_at"]}
    return list(by_partner.values())


# ---- Groups ----

class GroupMessage(BaseModel):
    member_id: str
    text: str


DEFAULT_GROUPS = [
    {"group_id": "g_glp1", "name": "GLP-1 e Emagrecimento", "description": "Ozempic, Mounjaro, Retatrutida, experiências e dúvidas.", "icon": "flash", "color": "#F5C150"},
    {"group_id": "g_hipert", "name": "Hipertrofia & Força", "description": "Treino, volume, periodização, PRs.", "icon": "barbell", "color": "#FF7A4D"},
    {"group_id": "g_cut", "name": "Cutting & Dieta", "description": "Estratégias, macros, rotinas alimentares.", "icon": "nutrition", "color": "#4EE07F"},
    {"group_id": "g_pept", "name": "Peptídeos", "description": "BPC-157, TB-500, CJC-1295, Ipamorelina.", "icon": "flask", "color": "#7FD7E5"},
    {"group_id": "g_hormon", "name": "Hormônios & TRT", "description": "Testosterona, HGH, HCG, reposição.", "icon": "sparkles", "color": "#E57FD7"},
    {"group_id": "g_mulheres", "name": "Mulheres do Clube", "description": "Grupo privado feminino do BLACKSCLUB.", "icon": "female", "color": "#E57FD7"},
    {"group_id": "g_negocios", "name": "Negócios & Parcerias", "description": "Networking entre membros.", "icon": "trending-up", "color": "#4E8FE0"},
]


async def seed_groups():
    for g in DEFAULT_GROUPS:
        await db.groups.update_one({"group_id": g["group_id"]}, {"$setOnInsert": g}, upsert=True)


@api_router.get("/community/groups")
async def list_groups(member_id: Optional[str] = None):
    # Show all official groups + only custom groups where member_id is invited (or owner)
    query: Dict[str, Any] = {
        "$or": [
            {"is_custom": {"$ne": True}},  # official groups visible to everyone
        ]
    }
    if member_id:
        query["$or"].append({"is_custom": True, "invited_ids": member_id})
        query["$or"].append({"is_custom": True, "owner_id": member_id})
    else:
        # Without member_id, show only official groups
        query = {"is_custom": {"$ne": True}}
    cur = db.groups.find(query, {"_id": 0}).sort("name", 1)
    groups = await cur.to_list(length=200)
    for g in groups:
        g["members_count"] = await db.group_members.count_documents({"group_id": g["group_id"]})
    return groups


@api_router.post("/community/groups/{group_id}/join/{member_id}")
async def group_join(group_id: str, member_id: str):
    await db.group_members.update_one(
        {"group_id": group_id, "member_id": member_id},
        {"$setOnInsert": {"joined_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"ok": True}


@api_router.post("/community/groups/{group_id}/leave/{member_id}")
async def group_leave(group_id: str, member_id: str):
    await db.group_members.delete_one({"group_id": group_id, "member_id": member_id})
    return {"ok": True}


@api_router.get("/community/groups/{group_id}/is-member/{member_id}")
async def group_is_member(group_id: str, member_id: str):
    m = await db.group_members.find_one({"group_id": group_id, "member_id": member_id})
    return {"is_member": bool(m)}


@api_router.get("/community/groups/{group_id}/messages")
async def group_messages(group_id: str):
    cur = db.group_messages.find({"group_id": group_id}, {"_id": 0}).sort("created_at", 1).limit(300)
    msgs = await cur.to_list(length=300)
    # Attach nickname/avatar
    ids = list({m["member_id"] for m in msgs})
    mem_map = {}
    if ids:
        async for mem in db.members.find({"member_id": {"$in": ids}}, {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "avatar_base64": 1, "tier": 1}):
            mem_map[mem["member_id"]] = {
                "nickname": mem.get("nickname") or mem.get("name", "Membro").split(" ")[0],
                "avatar_base64": mem.get("avatar_base64"),
                "tier": mem.get("tier", "black"),
            }
    for m in msgs:
        info = mem_map.get(m["member_id"], {})
        m["nickname"] = info.get("nickname", "Membro")
        m["avatar_base64"] = info.get("avatar_base64")
        m["tier"] = info.get("tier", "black")
    return msgs


@api_router.post("/community/groups/{group_id}/messages")
async def group_message_send(group_id: str, data: GroupMessage):
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    doc = {
        "gm_id": f"gm_{uuid.uuid4().hex[:12]}",
        "group_id": group_id,
        "member_id": data.member_id,
        "text": text,
        "created_at": datetime.now(timezone.utc),
    }
    await db.group_messages.insert_one(doc)
    # Ensure the sender is a member
    await db.group_members.update_one(
        {"group_id": group_id, "member_id": data.member_id},
        {"$setOnInsert": {"joined_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    doc.pop("_id", None)
    return doc


# ---- Events ----

DEFAULT_EVENTS = [
    {
        "event_id": "e_encontro_sp", "title": "Encontro BLACKSCLUB São Paulo",
        "description": "Noite de networking e bate-papo fechado com membros da região.",
        "city": "São Paulo - SP", "place": "Club House privado",
        "when_label": "15 de maio · 20h",
        "icon": "wine", "color": "#D4AF37",
    },
    {
        "event_id": "e_workout", "title": "Workout Coletivo do Clube",
        "description": "Treino conjunto dos membros com acompanhamento dos coaches parceiros.",
        "city": "São Paulo - SP", "place": "Academia Gold Core",
        "when_label": "22 de maio · 7h",
        "icon": "barbell", "color": "#FF7A4D",
    },
    {
        "event_id": "e_palestra", "title": "Palestra: GLP-1 sem mitos",
        "description": "Palestra presencial com médico nutrólogo parceiro. Vagas limitadas.",
        "city": "Online + São Paulo",
        "place": "Auditório Privado + Zoom",
        "when_label": "30 de maio · 19h",
        "icon": "school", "color": "#4EE07F",
    },
]


async def seed_events():
    for e in DEFAULT_EVENTS:
        await db.events.update_one({"event_id": e["event_id"]}, {"$setOnInsert": e}, upsert=True)


@api_router.get("/community/events")
async def list_events():
    cur = db.events.find({}, {"_id": 0}).sort("when_label", 1)
    return await cur.to_list(length=100)


# ============================================
# PLANS + MARKETPLACE + WALLET + STORIES + FEED
# ============================================

PLANS = {
    "silver": {
        "id": "silver",
        "name": "BLACK SILVER",
        "price_monthly": 99,
        "color": "#C8C8C8",
        "discount": 0,
        "can_sell": False,
        "can_buy": True,
        "features": [
            "Acesso ao marketplace privado",
            "Chat com vendedores verificados",
            "Participar dos grupos e eventos",
            "Consultoria com a BLACK AI",
        ],
    },
    "gold": {
        "id": "gold",
        "name": "BLACK GOLD",
        "price_monthly": 499,
        "color": "#D4AF37",
        "discount": 15,
        "can_sell": False,
        "can_buy": True,
        "features": [
            "Tudo do Silver",
            "15% de desconto em todo marketplace",
            "Selo Gold no perfil",
            "Prioridade no suporte",
            "Acesso a eventos exclusivos",
        ],
    },
    "diamond": {
        "id": "diamond",
        "name": "BLACK DIAMOND",
        "price_monthly": 999,
        "color": "#7FD7E5",
        "discount": 30,
        "can_sell": True,
        "can_buy": True,
        "features": [
            "Tudo do Gold",
            "30% de desconto em todo marketplace",
            "PODE VENDER no marketplace",
            "Selo Diamond e verificação premium",
            "Conta com especialistas 1:1",
            "Acesso vitalício a novas funcionalidades",
        ],
    },
}


def _plan_discount(plan_id: str) -> int:
    return PLANS.get(plan_id or "silver", PLANS["silver"])["discount"]


def _can_sell(plan_id: str) -> bool:
    return PLANS.get(plan_id or "silver", PLANS["silver"])["can_sell"]


@api_router.get("/plans")
async def list_plans():
    return list(PLANS.values())


@api_router.put("/admin/members/{member_id}/plan")
async def admin_update_plan(member_id: str, body: dict, user=Depends(require_staff)):
    plan_id = body.get("plan")
    if plan_id not in PLANS:
        raise HTTPException(status_code=400, detail="Plano inválido")
    r = await db.members.update_one({"member_id": member_id}, {"$set": {"tier": plan_id}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return {"ok": True, "plan": plan_id}


# ---------- MARKETPLACE ADS ----------

class AdCreate(BaseModel):
    seller_id: str
    title: str
    description: str
    price_full: float  # preço cheio, desconto aplicado automaticamente na compra
    category: str
    images: List[str] = []  # base64
    stock: int = 1


@api_router.get("/ads")
async def list_ads(category: Optional[str] = None, q: Optional[str] = None):
    query: Dict[str, Any] = {"active": True}
    if category and category != "all":
        query["category"] = category
    if q:
        query["$or"] = [
            {"title": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]
    cur = db.ads.find(query, {"_id": 0}).sort("created_at", -1).limit(200)
    ads = await cur.to_list(length=200)
    # enrich with seller nickname + tier
    for a in ads:
        m = await db.members.find_one({"member_id": a.get("seller_id")}, {"_id": 0, "nickname": 1, "name": 1, "tier": 1, "avatar_base64": 1})
        if m:
            a["seller_nickname"] = m.get("nickname") or (m.get("name") or "Membro").split(" ")[0]
            a["seller_tier"] = m.get("tier", "diamond")
            a["seller_avatar"] = m.get("avatar_base64")
    return ads


@api_router.get("/ads/{ad_id}")
async def get_ad(ad_id: str):
    a = await db.ads.find_one({"ad_id": ad_id}, {"_id": 0})
    if not a:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado")
    m = await db.members.find_one({"member_id": a.get("seller_id")}, {"_id": 0, "nickname": 1, "name": 1, "tier": 1, "avatar_base64": 1})
    if m:
        a["seller_nickname"] = m.get("nickname") or (m.get("name") or "Membro").split(" ")[0]
        a["seller_tier"] = m.get("tier", "diamond")
        a["seller_avatar"] = m.get("avatar_base64")
    return a


@api_router.post("/ads")
async def create_ad(data: AdCreate):
    m = await db.members.find_one({"member_id": data.seller_id})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    if not _can_sell(m.get("tier", "silver")):
        raise HTTPException(status_code=403, detail="Apenas membros BLACK DIAMOND podem anunciar no marketplace.")
    ad = {
        "ad_id": f"ad_{uuid.uuid4().hex[:12]}",
        "seller_id": data.seller_id,
        "title": data.title[:120],
        "description": data.description[:2000],
        "price_full": float(data.price_full),
        "category": data.category,
        "images": [img for img in (data.images or []) if isinstance(img, str)][:6],
        "stock": max(int(data.stock or 1), 1),
        "active": True,
        "created_at": datetime.now(timezone.utc),
    }
    await db.ads.insert_one(ad.copy())
    ad.pop("_id", None)
    return ad


@api_router.delete("/ads/{ad_id}")
async def delete_ad(ad_id: str, seller_id: str):
    r = await db.ads.update_one({"ad_id": ad_id, "seller_id": seller_id}, {"$set": {"active": False}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado")
    return {"ok": True}


@api_router.get("/ads/member/{member_id}")
async def ads_by_member(member_id: str):
    cur = db.ads.find({"seller_id": member_id, "active": True}, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(length=100)


# ---------- WALLET (BLACK COINS) ----------
# 1 BLACK = R$ 1,00. Topup via mock Pix. Purchases go into ESCROW until buyer confirms.

async def _wallet_get_or_create(member_id: str) -> dict:
    w = await db.wallets.find_one({"member_id": member_id}, {"_id": 0})
    if not w:
        w = {"member_id": member_id, "balance": 0.0, "escrow_in": 0.0, "escrow_out": 0.0, "created_at": datetime.now(timezone.utc)}
        await db.wallets.insert_one(w.copy())
        w.pop("_id", None)
    return w


@api_router.get("/wallet/{member_id}")
async def get_wallet(member_id: str):
    w = await _wallet_get_or_create(member_id)
    return w


@api_router.get("/wallet/{member_id}/transactions")
async def wallet_txs(member_id: str):
    cur = db.wallet_txs.find({"$or": [{"from_id": member_id}, {"to_id": member_id}]}, {"_id": 0}).sort("created_at", -1).limit(50)
    return await cur.to_list(length=50)


class TopupRequest(BaseModel):
    member_id: str
    amount: float


@api_router.post("/wallet/topup")
async def wallet_topup(data: TopupRequest):
    """Mock Pix: instantly credits member wallet. Replace with real Pix gateway when API keys are provided."""
    amt = float(data.amount)
    if amt <= 0 or amt > 100000:
        raise HTTPException(status_code=400, detail="Valor inválido")
    await _wallet_get_or_create(data.member_id)
    await db.wallets.update_one({"member_id": data.member_id}, {"$inc": {"balance": amt}})
    tx = {
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "type": "topup",
        "from_id": None,
        "to_id": data.member_id,
        "amount": amt,
        "status": "settled",
        "note": "Recarga via Pix (simulado)",
        "created_at": datetime.now(timezone.utc),
    }
    await db.wallet_txs.insert_one(tx.copy())
    tx.pop("_id", None)
    return tx


class WithdrawRequest(BaseModel):
    member_id: str
    amount: float
    pix_key: Optional[str] = None


@api_router.post("/wallet/withdraw")
async def wallet_withdraw(data: WithdrawRequest):
    w = await _wallet_get_or_create(data.member_id)
    amt = float(data.amount)
    if amt <= 0 or amt > w["balance"]:
        raise HTTPException(status_code=400, detail="Saldo insuficiente")
    await db.wallets.update_one({"member_id": data.member_id}, {"$inc": {"balance": -amt}})
    tx = {
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "type": "withdraw",
        "from_id": data.member_id,
        "to_id": None,
        "amount": amt,
        "status": "settled",
        "note": f"Saque Pix {data.pix_key or ''} (simulado)",
        "created_at": datetime.now(timezone.utc),
    }
    await db.wallet_txs.insert_one(tx.copy())
    tx.pop("_id", None)
    return tx


class PurchaseRequest(BaseModel):
    ad_id: str
    buyer_id: str
    qty: int = 1


@api_router.post("/wallet/purchase")
async def wallet_purchase(data: PurchaseRequest):
    ad = await db.ads.find_one({"ad_id": data.ad_id, "active": True}, {"_id": 0})
    if not ad:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado")
    buyer = await db.members.find_one({"member_id": data.buyer_id})
    if not buyer:
        raise HTTPException(status_code=404, detail="Comprador não encontrado")
    seller_id = ad["seller_id"]
    if seller_id == data.buyer_id:
        raise HTTPException(status_code=400, detail="Você não pode comprar seu próprio anúncio.")
    disc = _plan_discount(buyer.get("tier", "silver"))
    qty = max(int(data.qty or 1), 1)
    final = round(float(ad["price_full"]) * (100 - disc) / 100, 2) * qty
    wb = await _wallet_get_or_create(data.buyer_id)
    if wb["balance"] < final:
        raise HTTPException(status_code=400, detail=f"Saldo insuficiente. Você precisa de {final:.2f} BLACK Coins.")
    await _wallet_get_or_create(seller_id)
    # move buyer balance -> escrow_out ; seller escrow_in
    await db.wallets.update_one({"member_id": data.buyer_id}, {"$inc": {"balance": -final, "escrow_out": final}})
    await db.wallets.update_one({"member_id": seller_id}, {"$inc": {"escrow_in": final}})
    tx = {
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "type": "escrow",
        "from_id": data.buyer_id,
        "to_id": seller_id,
        "ad_id": data.ad_id,
        "ad_title": ad["title"],
        "qty": qty,
        "price_full": ad["price_full"],
        "discount": disc,
        "amount": final,
        "status": "escrow",
        "note": f"Compra aguardando entrega: {ad['title']}",
        "created_at": datetime.now(timezone.utc),
    }
    await db.wallet_txs.insert_one(tx.copy())
    tx.pop("_id", None)
    # Also create a DM thread message so buyer can talk to seller
    return tx


@api_router.post("/wallet/confirm/{tx_id}")
async def wallet_confirm(tx_id: str, body: dict):
    buyer_id = body.get("buyer_id")
    tx = await db.wallet_txs.find_one({"tx_id": tx_id})
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    if tx.get("status") != "escrow" or tx.get("from_id") != buyer_id:
        raise HTTPException(status_code=400, detail="Transação não pode ser liberada")
    amt = tx["amount"]
    await db.wallets.update_one({"member_id": tx["from_id"]}, {"$inc": {"escrow_out": -amt}})
    await db.wallets.update_one({"member_id": tx["to_id"]}, {"$inc": {"escrow_in": -amt, "balance": amt}})
    await db.wallet_txs.update_one({"tx_id": tx_id}, {"$set": {"status": "settled", "settled_at": datetime.now(timezone.utc)}})
    return {"ok": True}


@api_router.post("/wallet/refund/{tx_id}")
async def wallet_refund(tx_id: str, body: dict):
    admin_request = bool(body.get("admin"))
    tx = await db.wallet_txs.find_one({"tx_id": tx_id})
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    if tx.get("status") != "escrow":
        raise HTTPException(status_code=400, detail="Transação já liberada")
    amt = tx["amount"]
    await db.wallets.update_one({"member_id": tx["from_id"]}, {"$inc": {"escrow_out": -amt, "balance": amt}})
    await db.wallets.update_one({"member_id": tx["to_id"]}, {"$inc": {"escrow_in": -amt}})
    await db.wallet_txs.update_one({"tx_id": tx_id}, {"$set": {"status": "refunded", "settled_at": datetime.now(timezone.utc)}})
    return {"ok": True}


# ---------- STORIES (24h) ----------

class StoryCreate(BaseModel):
    member_id: str
    image_base64: Optional[str] = None
    text: Optional[str] = None


@api_router.post("/stories")
async def create_story(data: StoryCreate):
    if not data.image_base64 and not data.text:
        raise HTTPException(status_code=400, detail="Adicione foto ou texto")
    now = datetime.now(timezone.utc)
    s = {
        "story_id": f"st_{uuid.uuid4().hex[:12]}",
        "member_id": data.member_id,
        "image_base64": data.image_base64,
        "text": (data.text or "")[:200],
        "created_at": now,
        "expires_at": now + timedelta(hours=24),
        "views": 0,
    }
    await db.stories.insert_one(s.copy())
    s.pop("_id", None)
    return s


@api_router.get("/stories")
async def list_stories():
    now = datetime.now(timezone.utc)
    cur = db.stories.find({"expires_at": {"$gt": now}}, {"_id": 0}).sort("created_at", -1).limit(200)
    items = await cur.to_list(length=200)
    # group by member_id
    grouped: Dict[str, Any] = {}
    for s in items:
        mid = s["member_id"]
        if mid not in grouped:
            m = await db.members.find_one({"member_id": mid}, {"_id": 0, "nickname": 1, "name": 1, "tier": 1, "avatar_base64": 1})
            grouped[mid] = {
                "member_id": mid,
                "nickname": (m or {}).get("nickname") or ((m or {}).get("name", "Membro").split(" ")[0] if m else "Membro"),
                "tier": (m or {}).get("tier", "silver"),
                "avatar_base64": (m or {}).get("avatar_base64"),
                "stories": [],
            }
        grouped[mid]["stories"].append(s)
    return list(grouped.values())


# ---------- FEED (posts) ----------

class PostCreate(BaseModel):
    member_id: str
    text: str
    image_base64: Optional[str] = None
    tags: List[str] = []


@api_router.post("/feed/posts")
async def create_post(data: PostCreate):
    now = datetime.now(timezone.utc)
    p = {
        "post_id": f"p_{uuid.uuid4().hex[:12]}",
        "member_id": data.member_id,
        "text": (data.text or "").strip()[:1000],
        "image_base64": data.image_base64,
        "tags": [t.strip()[:32] for t in (data.tags or []) if t.strip()][:8],
        "reactions": {"fire": 0, "heart": 0, "muscle": 0},
        "comments_count": 0,
        "created_at": now,
    }
    await db.posts.insert_one(p.copy())
    p.pop("_id", None)
    return p


@api_router.get("/feed/posts")
async def list_posts(filter: str = "recent"):
    cur = db.posts.find({}, {"_id": 0}).sort("created_at", -1).limit(50)
    items = await cur.to_list(length=50)
    # enrich with author info
    for p in items:
        m = await db.members.find_one({"member_id": p.get("member_id")}, {"_id": 0, "nickname": 1, "name": 1, "tier": 1, "avatar_base64": 1, "city": 1})
        if m:
            p["author_nickname"] = m.get("nickname") or (m.get("name") or "Membro").split(" ")[0]
            p["author_tier"] = m.get("tier", "silver")
            p["author_avatar"] = m.get("avatar_base64")
            p["author_city"] = m.get("city")
    return items


@api_router.post("/feed/posts/{post_id}/react")
async def react_post(post_id: str, body: dict):
    kind = body.get("kind", "fire")
    if kind not in ("fire", "heart", "muscle"):
        raise HTTPException(status_code=400, detail="Reação inválida")
    r = await db.posts.update_one({"post_id": post_id}, {"$inc": {f"reactions.{kind}": 1}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Post não encontrado")
    return {"ok": True}


# ---------- PROFILE PHOTOS (up to 10) ----------

class PhotosUpdate(BaseModel):
    photos: List[str]  # data URLs


@api_router.put("/members/{member_id}/photos")
async def update_photos(member_id: str, data: PhotosUpdate):
    photos = [p for p in (data.photos or []) if isinstance(p, str) and p][:10]
    # enforce size
    total = sum(len(p) for p in photos)
    if total > 30 * 1_300_000:
        raise HTTPException(status_code=400, detail="Galeria muito grande (máx 10 fotos)")
    r = await db.members.update_one({"member_id": member_id}, {"$set": {"photos": photos}})
    if r.matched_count == 0:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return {"ok": True, "count": len(photos)}


@api_router.get("/members/{member_id}/photos")
async def get_photos(member_id: str):
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "photos": 1})
    return {"photos": (m or {}).get("photos", [])}


# ---------- CUSTOM GROUPS (user-created with invites) ----------

class CustomGroupCreate(BaseModel):
    owner_id: str
    name: str
    description: Optional[str] = ""
    color: Optional[str] = "#D4AF37"
    icon: Optional[str] = "people"
    invite_ids: List[str] = []


@api_router.post("/community/groups/custom")
async def create_custom_group(data: CustomGroupCreate):
    gid = f"g_c_{uuid.uuid4().hex[:10]}"
    g = {
        "group_id": gid,
        "name": data.name.strip()[:60],
        "description": (data.description or "").strip()[:200],
        "color": data.color or "#D4AF37",
        "icon": data.icon or "people",
        "members_count": 1 + len(data.invite_ids or []),
        "is_custom": True,
        "owner_id": data.owner_id,
        "invited_ids": [data.owner_id] + list(data.invite_ids or []),
        "created_at": datetime.now(timezone.utc),
    }
    await db.groups.insert_one(g.copy())
    g.pop("_id", None)
    # Each member joins
    for mid in [data.owner_id] + list(data.invite_ids or []):
        await db.group_members.update_one(
            {"group_id": gid, "member_id": mid},
            {"$setOnInsert": {"group_id": gid, "member_id": mid, "joined_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
    return g


# ---------- NOTIFICATIONS (aggregated, virtual feed) ----------

@api_router.get("/notifications/{member_id}")
async def get_notifications(member_id: str):
    """Aggregated notifications feed: new DMs, purchases, escrow updates, group invites, ads activity."""
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    items: List[Dict[str, Any]] = []

    # New DMs received (last 30d)
    dm_cur = db.dms.find({"to_id": member_id, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).limit(30)
    async for dm in dm_cur:
        sender = await db.members.find_one({"member_id": dm.get("from_id")}, {"_id": 0, "nickname": 1, "name": 1, "avatar_base64": 1})
        items.append({
            "id": f"dm_{dm.get('dm_id')}",
            "type": "dm",
            "title": f"Nova mensagem de {(sender or {}).get('nickname') or 'Membro'}",
            "body": (dm.get("text") or "")[:80],
            "avatar": (sender or {}).get("avatar_base64"),
            "route": f"/community/dm/{dm.get('from_id')}",
            "created_at": dm.get("created_at"),
            "icon": "chatbubble",
            "color": "#D4AF37",
        })

    # Wallet transactions (escrow & settled)
    wx_cur = db.wallet_txs.find({"$or": [{"from_id": member_id}, {"to_id": member_id}], "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).limit(30)
    async for tx in wx_cur:
        iAmBuyer = tx.get("from_id") == member_id
        iAmSeller = tx.get("to_id") == member_id
        typ = tx.get("type")
        if typ == "topup":
            items.append({"id": f"tx_{tx.get('tx_id')}", "type": "wallet", "title": "Recarga confirmada", "body": f"R$ {tx.get('amount',0):.2f} adicionadas à sua carteira", "route": "/(tabs)/wallet", "created_at": tx.get("created_at"), "icon": "add-circle", "color": "#4EE07F"})
        elif typ == "withdraw":
            items.append({"id": f"tx_{tx.get('tx_id')}", "type": "wallet", "title": "Saque solicitado", "body": f"R$ {tx.get('amount',0):.2f} para sua chave Pix", "route": "/(tabs)/wallet", "created_at": tx.get("created_at"), "icon": "arrow-down-circle", "color": "#F5C150"})
        elif typ == "escrow":
            if iAmBuyer:
                items.append({"id": f"tx_{tx.get('tx_id')}", "type": "order", "title": f"Compra efetuada: {tx.get('ad_title','Anúncio')}", "body": f"R$ {tx.get('amount',0):.2f} em escrow. Confirme o recebimento quando chegar.", "route": "/(tabs)/wallet", "created_at": tx.get("created_at"), "icon": "lock-closed", "color": "#F5C150"})
            elif iAmSeller:
                items.append({"id": f"tx_{tx.get('tx_id')}", "type": "sale", "title": f"Nova venda: {tx.get('ad_title','Anúncio')}", "body": f"R$ {tx.get('amount',0):.2f} aguardando entrega.", "route": "/(tabs)/wallet", "created_at": tx.get("created_at"), "icon": "cash", "color": "#4EE07F"})

    # Group invites (custom groups where I'm invited)
    g_cur = db.groups.find({"is_custom": True, "invited_ids": member_id, "owner_id": {"$ne": member_id}, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).limit(10)
    async for g in g_cur:
        owner = await db.members.find_one({"member_id": g.get("owner_id")}, {"_id": 0, "nickname": 1, "name": 1})
        items.append({"id": f"g_{g.get('group_id')}", "type": "group", "title": f"{(owner or {}).get('nickname') or 'Alguém'} te convidou para o grupo '{g.get('name')}'", "body": g.get("description") or "Entre e interaja!", "route": f"/community/group/{g.get('group_id')}", "created_at": g.get("created_at"), "icon": "people", "color": g.get("color", "#D4AF37")})

    items.sort(key=lambda x: x.get("created_at") or now, reverse=True)
    # Serialize datetimes
    for it in items:
        if isinstance(it.get("created_at"), datetime):
            it["created_at"] = it["created_at"].isoformat()
    return items[:40]


@api_router.get("/notifications/{member_id}/count")
async def notifications_count(member_id: str):
    since = datetime.now(timezone.utc) - timedelta(days=7)
    dm_count = await db.dms.count_documents({"to_id": member_id, "created_at": {"$gte": since}})
    sales_count = await db.wallet_txs.count_documents({"to_id": member_id, "type": "escrow", "created_at": {"$gte": since}})
    return {"count": dm_count + sales_count}


# ---------- MARKETPLACE SEED (fictional members + 60+ realistic ads) ----------

FICTIONAL_MEMBERS = [
    {"nickname": "Renato Black", "name": "Renato Santos", "phone": "5511988880001", "city": "São Paulo - SP", "age": 38, "profession": "Empresário", "gym": "Bio Ritmo Paulista"},
    {"nickname": "Caio Diamond", "name": "Caio Oliveira", "phone": "5521988880002", "city": "Rio de Janeiro - RJ", "age": 34, "profession": "Investidor", "gym": "Smart Fit Ipanema"},
    {"nickname": "Fábio King", "name": "Fábio Martins", "phone": "5531988880003", "city": "Belo Horizonte - MG", "age": 41, "profession": "Médico", "gym": "Cia Athletica BH"},
    {"nickname": "Lucas Peak", "name": "Lucas Almeida", "phone": "5541988880004", "city": "Curitiba - PR", "age": 29, "profession": "Advogado", "gym": "Bluefit Batel"},
    {"nickname": "Diego Prime", "name": "Diego Ferreira", "phone": "5561988880005", "city": "Brasília - DF", "age": 36, "profession": "Piloto", "gym": "Selfit Asa Sul"},
    {"nickname": "Marcelo Wolf", "name": "Marcelo Costa", "phone": "5551988880006", "city": "Porto Alegre - RS", "age": 43, "profession": "Consultor", "gym": "Companhia Atlética Moinhos"},
    {"nickname": "Vini Sharp", "name": "Vinícius Pereira", "phone": "5571988880007", "city": "Salvador - BA", "age": 31, "profession": "Arquiteto", "gym": "Runner Shopping da Bahia"},
    {"nickname": "Ricardo Elite", "name": "Ricardo Lima", "phone": "5581988880008", "city": "Recife - PE", "age": 45, "profession": "Cirurgião", "gym": "Bodytech RioMar"},
    {"nickname": "André Stark", "name": "André Ribeiro", "phone": "5511988880009", "city": "São Paulo - SP", "age": 33, "profession": "Trader", "gym": "Bodytech Itaim"},
    {"nickname": "Thiago Ace", "name": "Thiago Nascimento", "phone": "5511988880010", "city": "Santos - SP", "age": 27, "profession": "Empresário", "gym": "Les Cinq Gonzaga"},
]

CATEGORY_IMAGES: Dict[str, List[str]] = {
    "emagrecedores": [
        "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1550572017-edd951b55104?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1631549916768-4119b2e5f926?auto=format&fit=crop&w=600&q=80",
    ],
    "peptideos": [
        "https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1632053002434-ea2a14c30e51?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&w=600&q=80",
    ],
    "hormonios": [
        "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1585435557343-3b092031a831?auto=format&fit=crop&w=600&q=80",
    ],
    "pre_treinos": [
        "https://images.unsplash.com/photo-1583500178690-f7fd39a9f4f5?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1599901571879-6b22ba2daf64?auto=format&fit=crop&w=600&q=80",
    ],
    "suplementos": [
        "https://images.unsplash.com/photo-1579722821273-0f6c1f1d7b54?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=600&q=80",
        "https://images.unsplash.com/photo-1609942072337-c3370e0bdf4e?auto=format&fit=crop&w=600&q=80",
    ],
    "outros": [
        "https://images.unsplash.com/photo-1584362917165-526a968579e8?auto=format&fit=crop&w=600&q=80",
    ],
}

SEED_ADS_CATALOG: List[Dict[str, Any]] = [
    # RETATRUTIDA (emagrecedores)
    {"cat": "emagrecedores", "title": "RETAGEN OXYGEN 40mg (caneta)", "price": 1875, "desc": "Retatrutida 40mg em caneta aplicadora. Lacrado, validade longa."},
    {"cat": "emagrecedores", "title": "RETAGEN OXYGEN 40mg (liofilizada c/ água)", "price": 1750, "desc": "Retatrutida 40mg liofilizada com água bacteriostática inclusa."},
    {"cat": "emagrecedores", "title": "RETAGEN OXYGEN 40mg (4 ampolas)", "price": 1750, "desc": "Kit com 4 ampolas de Retatrutida 40mg."},
    {"cat": "emagrecedores", "title": "Reta SYNEDICA 40mg (caneta verde)", "price": 1875, "desc": "Retatrutida Synedica em caneta verde premium."},
    {"cat": "emagrecedores", "title": "Reta PEPTI SCIENCES 40mg (liofilizada)", "price": 1500, "desc": "Retatrutida PeptiSciences 40mg liofilizada. Alta pureza."},
    {"cat": "emagrecedores", "title": "Reta ZPHC 60mg (caneta)", "price": 3125, "desc": "Retatrutida ZPHC 60mg em caneta. Dose concentrada."},
    {"cat": "emagrecedores", "title": "Reta VELTRANE 90mg (1 ampola 6ml)", "price": 1875, "desc": "Retatrutida Veltrane 90mg ampola 6ml."},
    # TIRZEPATIDA (emagrecedores)
    {"cat": "emagrecedores", "title": "GLUCONEX 15mg", "price": 1162.50, "desc": "Tirzepatida Gluconex 15mg lacrado."},
    {"cat": "emagrecedores", "title": "LIPOLAND 15mg", "price": 1162.50, "desc": "Tirzepatida Lipoland 15mg."},
    {"cat": "emagrecedores", "title": "LIPOLESS MD 15mg", "price": 937.50, "desc": "Tirzepatida Lipoless MD 15mg."},
    {"cat": "emagrecedores", "title": "LIPOLESS 15mg", "price": 962.50, "desc": "Tirzepatida Lipoless 15mg."},
    {"cat": "emagrecedores", "title": "T.G 15mg", "price": 1075, "desc": "Tirzepatida T.G 15mg."},
    {"cat": "emagrecedores", "title": "TIRZEC 15mg", "price": 1025, "desc": "Tirzepatida Tirzec 15mg."},
    {"cat": "emagrecedores", "title": "TIRZEGEN 60mg (caneta)", "price": 1625, "desc": "Tirzepatida Tirzegen 60mg em caneta."},
    {"cat": "emagrecedores", "title": "Ozempic 1mg lacrado", "price": 1200, "desc": "Semaglutida Ozempic 1mg caneta lacrada."},
    {"cat": "emagrecedores", "title": "Ozempic 2mg", "price": 1600, "desc": "Semaglutida Ozempic 2mg."},
    {"cat": "emagrecedores", "title": "Mounjaro 12.5mg (caneta)", "price": 1500, "desc": "Tirzepatida Mounjaro 12.5mg original."},
    {"cat": "emagrecedores", "title": "Mounjaro 15mg (caneta)", "price": 1700, "desc": "Tirzepatida Mounjaro 15mg Eli Lilly."},
    {"cat": "emagrecedores", "title": "Wegovy 1.7mg", "price": 1400, "desc": "Semaglutida Wegovy 1.7mg."},
    {"cat": "emagrecedores", "title": "Saxenda 18mg (caneta)", "price": 900, "desc": "Liraglutida Saxenda 18mg."},
    # PEPTÍDEOS (~35)
    {"cat": "peptideos", "title": "AOD9604 10mg (pepline)", "price": 900, "desc": "AOD9604 10mg Pepline. Lipolítico."},
    {"cat": "peptideos", "title": "BB20 20mg (usa)", "price": 900, "desc": "BB20 20mg importado USA."},
    {"cat": "peptideos", "title": "CBL514 3ml 60mg (biotirz)", "price": 900, "desc": "CBL514 60mg em 3ml Biotirz."},
    {"cat": "peptideos", "title": "CJC1295 + IPAMORELIN 10mg c/água", "price": 750, "desc": "CJC1295 + Ipamorelin 10mg Oxygenkw."},
    {"cat": "peptideos", "title": "EPITHALON 10mg (usa)", "price": 700, "desc": "Epithalon 10mg importado USA."},
    {"cat": "peptideos", "title": "EPITHALON 50mg (peptisciences)", "price": 1400, "desc": "Epithalon 50mg PeptiSciences."},
    {"cat": "peptideos", "title": "GHK-CU 50mg DILUIDO", "price": 600, "desc": "GHK-CU 50mg Oxygenkw já diluído."},
    {"cat": "peptideos", "title": "GHK-CU 100mg DILUIDO", "price": 750, "desc": "GHK-CU 100mg diluído."},
    {"cat": "peptideos", "title": "GHK-CU 100mg (biogenesis)", "price": 750, "desc": "GHK-CU 100mg Biogenesis."},
    {"cat": "peptideos", "title": "GHK-CU 100mg (bionexis)", "price": 750, "desc": "GHK-CU 100mg Bionexis."},
    {"cat": "peptideos", "title": "GHK-CU 100mg (pepline)", "price": 750, "desc": "GHK-CU 100mg Pepline."},
    {"cat": "peptideos", "title": "GLOW 70mg (biogenesis)", "price": 800, "desc": "Glow 70mg Biogenesis."},
    {"cat": "peptideos", "title": "GLOW 70mg (peptisciences)", "price": 800, "desc": "Glow 70mg PeptiSciences."},
    {"cat": "peptideos", "title": "KLOW 80mg (biogenesis)", "price": 950, "desc": "Klow 80mg Biogenesis."},
    {"cat": "peptideos", "title": "KLOW 80mg (usa)", "price": 950, "desc": "Klow 80mg importado."},
    {"cat": "peptideos", "title": "HGH FRAG 176 10mg (usa)", "price": 800, "desc": "HGH Frag 176 10mg USA."},
    {"cat": "peptideos", "title": "HGH FRAG 176 10mg c/água", "price": 1100, "desc": "HGH Frag 176 10mg MuscleLabs com água."},
    {"cat": "peptideos", "title": "IPAMORELIN 10mg (oxygen)", "price": 600, "desc": "Ipamorelin 10mg Oxygen."},
    {"cat": "peptideos", "title": "KISSPETIN 10mg (peptisciences)", "price": 800, "desc": "Kisspetin 10mg PeptiSciences."},
    {"cat": "peptideos", "title": "KPV 10mg (usa)", "price": 600, "desc": "KPV 10mg importado."},
    {"cat": "peptideos", "title": "MELANOTAN2 10mg (usa)", "price": 500, "desc": "Melanotan2 10mg bronzeador."},
    {"cat": "peptideos", "title": "MOTS-C 10mg (usa)", "price": 800, "desc": "MOTS-C 10mg longevidade."},
    {"cat": "peptideos", "title": "NAD+ 500mg (usa)", "price": 700, "desc": "NAD+ 500mg USA."},
    {"cat": "peptideos", "title": "NAD+ 2500mg c/água (zphc)", "price": 1600, "desc": "NAD+ 2500mg ZPHC com água."},
    {"cat": "peptideos", "title": "PT141 10mg (peptisciences)", "price": 700, "desc": "PT-141 10mg libido."},
    {"cat": "peptideos", "title": "SELANK 10mg (peptisciences)", "price": 900, "desc": "Selank 10mg ansiolítico."},
    {"cat": "peptideos", "title": "SEMAX 10mg (usa)", "price": 800, "desc": "Semax 10mg nootrópico."},
    {"cat": "peptideos", "title": "SS31 10mg (usa)", "price": 650, "desc": "SS-31 10mg USA."},
    {"cat": "peptideos", "title": "SS31 50mg (peptisciences)", "price": 1300, "desc": "SS-31 50mg PeptiSciences."},
    {"cat": "peptideos", "title": "TESAMORELIN 10mg c/água", "price": 900, "desc": "Tesamorelin 10mg Oxygenkw c/água."},
    {"cat": "peptideos", "title": "TESAMORELIN 10mg (usa)", "price": 800, "desc": "Tesamorelin 10mg USA."},
    {"cat": "peptideos", "title": "GLOW 70mg caneta (alluvi)", "price": 1500, "desc": "Glow 70mg em caneta Alluvi."},
    {"cat": "peptideos", "title": "GLOW 70mg caneta (oxygenkw)", "price": 1500, "desc": "Glow 70mg em caneta Oxygenkw."},
    {"cat": "peptideos", "title": "GHK-CU 100mg caneta (oxygenkw)", "price": 1500, "desc": "GHK-CU 100mg em caneta Oxygenkw."},
    {"cat": "peptideos", "title": "NAD+ 1000mg + B12 4000mcg caneta", "price": 1500, "desc": "NAD+ 1000mg + B12 4000mcg Oxygenkw."},
    # HORMÔNIOS (15)
    {"cat": "hormonios", "title": "Testosterona Cipionato 200mg/ml", "price": 450, "desc": "Cipionato 200mg/ml, 10ml."},
    {"cat": "hormonios", "title": "Testosterona Enantato 250mg", "price": 400, "desc": "Enantato 250mg, 10ml."},
    {"cat": "hormonios", "title": "Testosterona Undecilato Nebido", "price": 850, "desc": "Nebido trimestral."},
    {"cat": "hormonios", "title": "Oxandrolona 10mg (100 comp)", "price": 520, "desc": "Oxandrolona 10mg 100 comp."},
    {"cat": "hormonios", "title": "Stanozolol injetável 100mg/ml", "price": 380, "desc": "Stanozolol 100mg/ml 10ml."},
    {"cat": "hormonios", "title": "Boldenona 250mg/ml", "price": 420, "desc": "Boldenona 250mg/ml 10ml."},
    {"cat": "hormonios", "title": "HCG 5000 UI Choriomon", "price": 290, "desc": "HCG Choriomon 5000 UI, 2 ampolas."},
    {"cat": "hormonios", "title": "HGH Somatropina 100 UI", "price": 1800, "desc": "Somatropina 100 UI completo."},
    {"cat": "hormonios", "title": "Proviron 25mg Bayer (20 comp)", "price": 280, "desc": "Proviron Bayer original 25mg."},
    {"cat": "hormonios", "title": "Anastrozol 1mg (30 comp)", "price": 180, "desc": "Anastrozol 1mg controle de estrógeno."},
    {"cat": "hormonios", "title": "Clomifeno 50mg (24 comp)", "price": 140, "desc": "Clomifeno 50mg pós-ciclo."},
    {"cat": "hormonios", "title": "Tamoxifeno 20mg (30 comp)", "price": 120, "desc": "Tamoxifeno 20mg."},
    # PRÉ-TREINOS (10)
    {"cat": "pre_treinos", "title": "Hybrid Superhuman Alpha Lion", "price": 480, "desc": "Pré-treino ultra forte Alpha Lion."},
    {"cat": "pre_treinos", "title": "Bucked Up Pre Workout", "price": 420, "desc": "Bucked Up importado."},
    {"cat": "pre_treinos", "title": "C4 Ultimate 40 doses", "price": 320, "desc": "C4 Ultimate Cellucor."},
    {"cat": "pre_treinos", "title": "Redcon1 Total War", "price": 380, "desc": "Redcon1 Total War."},
    {"cat": "pre_treinos", "title": "Predator Pre Black Label", "price": 350, "desc": "Predator Pre Black Label."},
    {"cat": "pre_treinos", "title": "Amino Growth 300g Integral", "price": 160, "desc": "Amino Growth 300g."},
    {"cat": "pre_treinos", "title": "Beta Alanina Integral 100g", "price": 75, "desc": "Beta alanina pura 100g."},
    {"cat": "pre_treinos", "title": "Citrulina Malato 300g", "price": 180, "desc": "Citrulina Malato 2:1 300g."},
    # SUPLEMENTOS (14)
    {"cat": "suplementos", "title": "Whey Isolado Importado 2kg", "price": 480, "desc": "Whey isolado Gold Standard 2kg."},
    {"cat": "suplementos", "title": "Creatina Creapure 500g", "price": 220, "desc": "Creatina Creapure 500g."},
    {"cat": "suplementos", "title": "Albumina 500g Naturovos", "price": 90, "desc": "Albumina 500g."},
    {"cat": "suplementos", "title": "Caseína Micellar 900g", "price": 280, "desc": "Caseína Micellar 900g."},
    {"cat": "suplementos", "title": "BCAA 10:1:1 300g", "price": 150, "desc": "BCAA 10:1:1 300g."},
    {"cat": "suplementos", "title": "Glutamina Micronizada 500g", "price": 140, "desc": "Glutamina 500g."},
    {"cat": "suplementos", "title": "Animal Pak 44 packs", "price": 320, "desc": "Animal Pak Universal 44 packs."},
    {"cat": "suplementos", "title": "ZMA Universal 90 caps", "price": 180, "desc": "ZMA Universal."},
    {"cat": "suplementos", "title": "Ômega 3 1000mg (120 caps)", "price": 95, "desc": "Ômega 3 120 caps."},
    {"cat": "suplementos", "title": "Vitamina D3 10.000 UI", "price": 75, "desc": "Vit D3 10k 60 caps."},
    {"cat": "suplementos", "title": "Magnésio Dimalato 300mg", "price": 110, "desc": "Magnésio dimalato 120 caps."},
    {"cat": "suplementos", "title": "Stack Whey+Creatina+Pré", "price": 850, "desc": "Kit 30 dias completo."},
    # OUTROS (4)
    {"cat": "outros", "title": "Água Bacteriostática 3ml", "price": 50, "desc": "Água bacteriostática 3ml."},
    {"cat": "outros", "title": "Água Bacteriostática 10ml", "price": 100, "desc": "Água bacteriostática 10ml."},
    {"cat": "outros", "title": "Kit Seringas 1ml (10un)", "price": 80, "desc": "10 seringas insulina 1ml."},
    {"cat": "outros", "title": "Kit Agulhas descartáveis", "price": 60, "desc": "Agulhas descartáveis."},
]

FICTIONAL_AVATARS = [
    "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1528892952291-009c663ce843?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=200&q=80",
    "https://images.unsplash.com/photo-1504257432389-52343af06ae3?auto=format&fit=crop&w=200&q=80",
]


async def _ensure_fictional_members() -> List[str]:
    ids: List[str] = []
    for i, m in enumerate(FICTIONAL_MEMBERS):
        existing = await db.members.find_one({"phone": m["phone"]})
        if existing:
            ids.append(existing["member_id"]); continue
        mid = f"mem_fk_{uuid.uuid4().hex[:8]}"
        cnt_doc = await db.counters.find_one_and_update({"_id": "member_number"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
        number = ((cnt_doc or {}).get("seq", 0)) + 10100
        await db.members.insert_one({
            "member_id": mid, "member_number": number, "name": m["name"], "nickname": m["nickname"],
            "phone": m["phone"], "city": m["city"], "age": m["age"], "profession": m["profession"],
            "gym": m["gym"], "tier": "diamond", "is_fictional": True,
            "invite_code": f"FK{uuid.uuid4().hex[:4].upper()}",
            "avatar_base64": FICTIONAL_AVATARS[i % len(FICTIONAL_AVATARS)],
            "photos": [],
            "created_at": datetime.now(timezone.utc),
        })
        ids.append(mid)
    return ids


@api_router.post("/admin/seed-marketplace")
async def seed_marketplace(force: bool = False):
    import random
    existing_count = await db.ads.count_documents({"active": True})
    if existing_count >= 50 and not force:
        return {"ok": True, "skipped": True, "existing": existing_count}
    seller_ids = await _ensure_fictional_members()
    created = 0
    for item in SEED_ADS_CATALOG:
        seller = random.choice(seller_ids)
        imgs = CATEGORY_IMAGES.get(item["cat"], [])
        img = random.choice(imgs) if imgs else None
        ad = {
            "ad_id": f"ad_{uuid.uuid4().hex[:12]}",
            "seller_id": seller,
            "title": item["title"],
            "description": item["desc"],
            "price_full": float(item["price"]),
            "category": item["cat"],
            "images": [img] if img else [],
            "stock": random.randint(2, 12),
            "active": True,
            "is_seed": True,
            "created_at": datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 200)),
        }
        await db.ads.insert_one(ad)
        created += 1
    return {"ok": True, "created": created, "sellers": len(seller_ids)}


@api_router.delete("/admin/seed-marketplace")
async def clear_seed_marketplace():
    r = await db.ads.delete_many({"is_seed": True})
    await db.members.delete_many({"is_fictional": True})
    return {"ok": True, "deleted_ads": r.deleted_count}


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ============================================================
# PERFORMANCE CENTRAL — Goals / Entries / Insights
# ============================================================

GOAL_TYPES = ("fitness", "financial", "habit", "productivity")
GOAL_DIRECTIONS = ("increase", "decrease")  # increase: target > current, decrease: target < current


class GoalCreate(BaseModel):
    member_id: str
    type: str  # fitness | financial | habit | productivity
    title: str
    current_value: float
    target_value: float
    unit: str = ""  # kg, R$, %, h, etc.
    start_date: Optional[str] = None  # ISO "YYYY-MM-DD"
    end_date: str  # ISO
    note: Optional[str] = ""


class GoalEntryCreate(BaseModel):
    value: float
    note: Optional[str] = ""
    date: Optional[str] = None  # ISO


def _parse_date(s: Optional[str]) -> datetime:
    if not s:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return datetime.utcnow()


def _compute_goal_snapshot(goal: dict, entries: List[dict]) -> dict:
    """Compute progress %, days elapsed/remaining, rhythm and forecast."""
    try:
        start = goal.get("start_date") or goal.get("created_at")
        start_dt = _parse_date(start) if isinstance(start, str) else (start or datetime.utcnow())
        end_dt = _parse_date(goal["end_date"]) if isinstance(goal["end_date"], str) else goal["end_date"]
        current = float(entries[-1]["value"]) if entries else float(goal["current_value"])
        initial = float(goal["current_value"])
        target = float(goal["target_value"])

        direction = "increase" if target >= initial else "decrease"

        # Progress
        denom = abs(target - initial) or 1e-9
        delta_done = (current - initial) if direction == "increase" else (initial - current)
        progress_pct = max(0.0, min(100.0, (delta_done / denom) * 100.0))

        # Time
        total_days = max(1, (end_dt - start_dt).days)
        elapsed = max(0, min(total_days, (datetime.utcnow() - start_dt).days))
        days_remaining = max(0, (end_dt - datetime.utcnow()).days)
        time_pct = (elapsed / total_days) * 100.0 if total_days > 0 else 0.0

        # Rhythm: progress% - time%. Positive = ahead.
        rhythm = progress_pct - time_pct

        # Forecast: days to finish at current pace
        pace = (delta_done / max(1, elapsed)) if elapsed > 0 else 0
        remaining_work = max(0.0, abs(target - current))
        forecast_days = int(round(remaining_work / pace)) if pace > 0 else None

        status = "on_track"
        if rhythm >= 5:
            status = "ahead"
        elif rhythm <= -10:
            status = "behind"
        elif rhythm < -2:
            status = "slightly_behind"

        return {
            "current_value": current,
            "progress_pct": round(progress_pct, 1),
            "time_pct": round(time_pct, 1),
            "rhythm": round(rhythm, 1),
            "days_elapsed": elapsed,
            "days_total": total_days,
            "days_remaining": days_remaining,
            "forecast_days": forecast_days,
            "rhythm_status": status,
            "direction": direction,
        }
    except Exception as e:
        logger.exception("goal snapshot failed: %s", e)
        return {
            "current_value": goal.get("current_value"),
            "progress_pct": 0,
            "time_pct": 0,
            "rhythm": 0,
            "days_elapsed": 0,
            "days_total": 0,
            "days_remaining": 0,
            "forecast_days": None,
            "rhythm_status": "on_track",
            "direction": "increase",
        }


def _serialize_goal(goal: dict, entries: Optional[List[dict]] = None) -> dict:
    if entries is None:
        entries = []
    snap = _compute_goal_snapshot(goal, entries)
    return {
        "goal_id": goal["goal_id"],
        "member_id": goal["member_id"],
        "type": goal["type"],
        "title": goal["title"],
        "initial_value": goal["current_value"],
        "target_value": goal["target_value"],
        "unit": goal.get("unit", ""),
        "start_date": goal.get("start_date"),
        "end_date": goal["end_date"],
        "note": goal.get("note", ""),
        "created_at": goal.get("created_at"),
        "status": goal.get("status", "active"),
        **snap,
        "entries_count": len(entries),
    }


@api_router.post("/goals")
async def create_goal(body: GoalCreate):
    if body.type not in GOAL_TYPES:
        raise HTTPException(status_code=400, detail="tipo inválido")
    if not body.title.strip():
        raise HTTPException(status_code=400, detail="título obrigatório")
    goal = {
        "goal_id": f"g_{uuid.uuid4().hex[:12]}",
        "member_id": body.member_id,
        "type": body.type,
        "title": body.title.strip(),
        "current_value": float(body.current_value),
        "target_value": float(body.target_value),
        "unit": (body.unit or "").strip(),
        "start_date": body.start_date or datetime.utcnow().isoformat(),
        "end_date": body.end_date,
        "note": (body.note or "").strip(),
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",
    }
    await db.goals.insert_one(goal)
    return _serialize_goal(goal, [])


@api_router.get("/goals/{member_id}")
async def list_goals(member_id: str):
    cursor = db.goals.find({"member_id": member_id, "status": {"$ne": "archived"}}).sort("created_at", -1)
    out = []
    async for g in cursor:
        entries = await db.goal_entries.find({"goal_id": g["goal_id"]}).sort("date", 1).to_list(length=1000)
        out.append(_serialize_goal(g, entries))
    return out


@api_router.get("/goals/dashboard/{member_id}")
async def goals_dashboard(member_id: str):
    """Aggregated dashboard data for the Home card."""
    goals = await list_goals(member_id)
    if not goals:
        return {"has_goals": False, "active_count": 0, "overall_progress": 0,
                "avg_rhythm": 0, "days_left": None, "score": None,
                "critical_goal": None, "message": "Defina sua primeira meta e a IA te guia."}
    active = [g for g in goals if g["status"] == "active"]
    if not active:
        return {"has_goals": False, "active_count": 0, "overall_progress": 0,
                "avg_rhythm": 0, "days_left": None, "score": None,
                "critical_goal": None, "message": "Crie sua próxima meta."}

    overall = round(sum(g["progress_pct"] for g in active) / len(active), 1)
    avg_rhythm = round(sum(g["rhythm"] for g in active) / len(active), 1)
    # Critical = smallest rhythm (most behind)
    critical = min(active, key=lambda g: g["rhythm"])
    # Score: 50 + rhythm * 2 (clamped 0..100)
    score = max(0, min(100, int(round(50 + avg_rhythm * 2))))

    if avg_rhythm >= 5:
        msg = f"Você está {avg_rhythm:.0f}% acima do ritmo ideal. Siga firme!"
    elif avg_rhythm >= -2:
        msg = "Você está no ritmo ideal. Consistência é a chave."
    elif avg_rhythm >= -10:
        msg = f"Você está {abs(avg_rhythm):.0f}% abaixo do ritmo ideal."
    else:
        msg = f"Você está {abs(avg_rhythm):.0f}% abaixo do ritmo — precisamos acelerar."

    return {
        "has_goals": True,
        "active_count": len(active),
        "overall_progress": overall,
        "avg_rhythm": avg_rhythm,
        "days_left": critical["days_remaining"],
        "score": score,
        "weekly_delta": 0,  # TODO: compute from entries week-over-week
        "critical_goal": critical,
        "message": msg,
    }


@api_router.post("/goals/{goal_id}/entries")
async def add_goal_entry(goal_id: str, body: GoalEntryCreate):
    goal = await db.goals.find_one({"goal_id": goal_id})
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")
    entry = {
        "entry_id": f"ge_{uuid.uuid4().hex[:10]}",
        "goal_id": goal_id,
        "value": float(body.value),
        "note": (body.note or "").strip(),
        "date": body.date or datetime.utcnow().isoformat(),
    }
    await db.goal_entries.insert_one(entry)
    # Update goal.current_value
    await db.goals.update_one({"goal_id": goal_id}, {"$set": {"current_value": float(body.value)}})
    return {"ok": True, "entry_id": entry["entry_id"]}


@api_router.get("/goals/{goal_id}/entries")
async def list_goal_entries(goal_id: str):
    entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=1000)
    for e in entries:
        e.pop("_id", None)
    return entries


@api_router.delete("/goals/{goal_id}")
async def archive_goal(goal_id: str):
    await db.goals.update_one({"goal_id": goal_id}, {"$set": {"status": "archived"}})
    return {"ok": True}


@api_router.post("/goals/{goal_id}/what-to-do")
async def goal_what_to_do(goal_id: str):
    """AI-generated actionable suggestion for today."""
    goal = await db.goals.find_one({"goal_id": goal_id})
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")
    entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=500)
    snap = _compute_goal_snapshot(goal, entries)

    prompt = (
        f"Você é o ASSISTENTE BLACK do BLACKSCLUB — um coach premium.\n"
        f"Meta do membro: '{goal['title']}' ({goal['type']}).\n"
        f"Valor atual: {snap['current_value']} {goal.get('unit','')}, meta: {goal['target_value']} {goal.get('unit','')}.\n"
        f"Progresso: {snap['progress_pct']}% em {snap['days_elapsed']}/{snap['days_total']} dias.\n"
        f"Ritmo: {snap['rhythm']}% ({snap['rhythm_status']}). Faltam {snap['days_remaining']} dias.\n\n"
        f"Retorne em JSON:\n"
        f"{{\n"
        f'  "headline": "frase curta motivadora (máx 80 chars)",\n'
        f'  "actions": ["ação 1 concreta e específica", "ação 2", "ação 3"],\n'
        f'  "warning": "um alerta se necessário ou string vazia"\n'
        f"}}\n"
        f"Seja direto, premium, sem clichês. Ações concretas (ex: 'Treino de 45min tipo HIIT')."
    )

    try:
        llm = _get_llm_chat(system="Você é um coach premium objetivo. Responda APENAS JSON válido.")
        from emergentintegrations.llm.chat import UserMessage  # type: ignore
        reply = await llm.send_message(UserMessage(text=prompt))
        import re as _re, json as _json
        match = _re.search(r"\{.*\}", reply, _re.DOTALL)
        if match:
            data = _json.loads(match.group(0))
        else:
            data = {"headline": reply.strip()[:80], "actions": [], "warning": ""}
    except Exception as e:
        logger.exception("what-to-do failed: %s", e)
        data = {
            "headline": "Foque no próximo passo pequeno, hoje.",
            "actions": [
                "Registre seu progresso agora para não perder o ritmo.",
                "Faça 30 minutos da ação principal da sua meta.",
                "Revise sua meta e elimine uma distração comum.",
            ],
            "warning": "",
        }
    return data



@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)

