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
from zoneinfo import ZoneInfo
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

try:
    from openai import OpenAI  # type: ignore
    _OPENAI_KEY = os.environ.get("OPENAI_API_KEY") or ""
    openai_client = OpenAI(api_key=_OPENAI_KEY) if _OPENAI_KEY else None
except Exception:  # pragma: no cover
    OpenAI = None
    openai_client = None

# MongoDB connection
# `serverSelectionTimeoutMS` keeps initial connection attempts from blocking
# forever in production (Atlas) — fails fast and lets background retry happen.
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(
    mongo_url,
    serverSelectionTimeoutMS=5_000,   # 5s to find a server (default is 30s)
    connectTimeoutMS=5_000,
    socketTimeoutMS=20_000,
)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

app = FastAPI(title="BLACKSCLUB API")
api_router = APIRouter(prefix="/api")

# CORS — configurado logo após a criação do app para garantir cobertura de TODAS
# as rotas (web app servido pelo mesmo backend, K8s ingress, app móvel, etc.).
# Em produção, permitimos qualquer origem (allow_origins=["*"]) — a autenticação
# é feita via JWT bearer token, então o risco de CSRF é mitigado por design.
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# -------------- Health checks (for Kubernetes liveness/readiness probes) --------------
# NOTA: A rota "/" NÃO é mais um health endpoint dedicado. A rota "/" é servida
# pelo catch-all no final do arquivo, que retorna o index.html do frontend.
# K8s agora usa "/health" (liveness) e "/ready" (readiness) que retornam JSON 200.
# Se o usuário acessar "/" pelo navegador, ele vê o app carregando normalmente.


@app.get("/health")
@app.head("/health")
async def health_check():
    """Liveness probe — always returns 200 if the process is up."""
    return {"status": "ok", "service": "blacksclub-api"}


@app.get("/api/health")
@app.head("/api/health")
async def api_health_check():
    """API-level health check. Does NOT depend on MongoDB to avoid cascading failures."""
    return {"status": "ok", "service": "blacksclub-api"}


@app.get("/ready")
@app.head("/ready")
async def readiness_check():
    """Readiness probe — returns 200 if the app can serve traffic (lightweight MongoDB ping)."""
    try:
        # Quick ping, 2s timeout to avoid blocking the probe
        await asyncio.wait_for(db.command("ping"), timeout=2.0)
        return {"status": "ready"}
    except Exception:
        # Still return 200 to keep the pod alive; indicate MongoDB issue separately
        return {"status": "degraded", "mongo": "unavailable"}


# -------------- Helpers --------------
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


# --- Fuso horário oficial de Brasília ---
# A partir de BRT_ENFORCEMENT_TS, todas as novas movimentações PYX terão o
# comprovante emitido no fuso America/Sao_Paulo (BRT/BRST). Movimentações
# anteriores permanecem com a exibição original (fuso do dispositivo).
BRT_TZ = ZoneInfo("America/Sao_Paulo")
BRT_ENFORCEMENT_TS = datetime(2026, 7, 20, 3, 0, 0, tzinfo=timezone.utc)


def brt_display_fields(dt: Optional[datetime]) -> Dict[str, Any]:
    """Se `dt` for posterior ao corte, retorna campos formatados em BRT.
    Retorna {} para datas antigas (mantém compat com comprovantes existentes)."""
    if not isinstance(dt, datetime):
        return {}
    dt_utc = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    if dt_utc < BRT_ENFORCEMENT_TS:
        return {}
    local = dt_utc.astimezone(BRT_TZ)
    # pt-BR display strings; ISO com offset para clientes que quiserem parsear
    return {
        "created_at_brt": local.isoformat(),  # e.g. "2026-07-20T00:30:00-03:00"
        "display_date_brt": local.strftime("%d/%m/%Y"),
        "display_time_brt": local.strftime("%H:%M:%S"),
        "display_datetime_brt": local.strftime("%d/%m/%Y %H:%M:%S"),
        "display_tz_brt": "America/Sao_Paulo",
    }


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
    if user.get("role") not in ("admin", "support", "financeiro"):
        raise HTTPException(status_code=403, detail="Staff access required")
    return user


async def _audit_log(actor: dict, action: str, target_email: Optional[str] = None,
                    target_user_id: Optional[str] = None, details: Optional[Dict[str, Any]] = None):
    """Grava entrada no log de auditoria de ações da equipe."""
    await db.staff_audit_log.insert_one({
        "log_id": f"log_{uuid.uuid4().hex[:14]}",
        "actor_user_id": actor.get("user_id"),
        "actor_email": actor.get("email"),
        "actor_role": actor.get("role"),
        "action": action,
        "target_user_id": target_user_id,
        "target_email": target_email,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc),
    })


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
    # Bloqueia conta desativada
    if user.get("active") is False:
        raise HTTPException(status_code=403, detail="Conta desativada. Contate o administrador.")
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
    # Staff/admin com e-mail vinculado a um user também recebem JWT para operar features de staff
    # (ex.: publicar anúncios no marketplace curado)
    staff_token = None
    staff_user = None
    u = await db.users.find_one({"email": email}, {"_id": 0, "password_hash": 0})
    if u:
        staff_token = jwt.encode(
            {"sub": u["user_id"], "exp": datetime.now(timezone.utc) + timedelta(days=7)},
            JWT_SECRET, algorithm=JWT_ALGORITHM,
        )
        staff_user = u
    return {**member, "staff_token": staff_token, "staff_user": staff_user}


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
    # OTIMIZAÇÃO: limita a 200 membros recentes com reset_token ativo (índice
    # em reset_expires evita scan completo da coleção mesmo em produção).
    cursor = db.members.find(
        {"reset_token": {"$exists": True}},
        {"_id": 0, "member_id": 1, "reset_token": 1, "reset_expires": 1},
    ).sort("reset_expires", -1).limit(200)
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
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    # Nunca expõe credenciais/PII sensível (hash de senha, tokens de reset, etc.)
    for secret in ("password_hash", "reset_token", "reset_expires", "name_norm", "phone_norm"):
        m.pop(secret, None)
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
async def admin_authorize(data: AuthorizedCreate, staff: dict = Depends(require_staff)):
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
async def admin_list_authorized(staff: dict = Depends(require_staff)):
    cursor = db.authorized.find({}, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(length=500)


@api_router.delete("/admin/authorized/{auth_id}")
async def admin_delete_authorized(auth_id: str, staff: dict = Depends(require_staff)):
    r = await db.authorized.delete_one({"auth_id": auth_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Entrada não encontrada")
    return {"ok": True}


# -------------- Home Rotating Banners (Painel rotativo) --------------
# Permite que o Master Admin cadastre Notícias, Promoções e Novidades exibidas
# no painel rotativo da Home (abaixo dos cards Planos/Compras/Profissionais).
class HomeBannerCreate(BaseModel):
    title: str
    subtitle: Optional[str] = ""
    image_url: Optional[str] = ""
    image_base64: Optional[str] = ""
    cta_label: Optional[str] = ""
    cta_route: Optional[str] = ""
    accent_color: Optional[str] = "#C89A3A"
    category: Optional[str] = "novidade"  # novidade | noticia | promocao
    hide_category: Optional[bool] = False  # oculta o selo da categoria sobre o banner
    active: Optional[bool] = True
    order: Optional[int] = 0


class HomeBannerUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    cta_label: Optional[str] = None
    cta_route: Optional[str] = None
    accent_color: Optional[str] = None
    category: Optional[str] = None
    hide_category: Optional[bool] = None
    active: Optional[bool] = None
    order: Optional[int] = None


def _serialize_banner(b: dict, request_base_url: Optional[str] = None) -> dict:
    """Normaliza o documento para JSON (remove _id, converte datas, força URLs absolutas).

    `request_base_url` opcional permite prefixar URLs relativas (ex.: `/uploads/...`)
    com o host da requisição — útil para imagens hospedadas no próprio backend.
    """
    b.pop("_id", None)
    for f in ("created_at", "updated_at"):
        if isinstance(b.get(f), datetime):
            b[f] = b[f].isoformat()
    # Garante que image_url seja sempre absoluta (corrige problema de CORS/relativo
    # quando o frontend é servido em domínio diferente — ex.: Netlify).
    raw_url = (b.get("image_url") or "").strip()
    if raw_url and not raw_url.startswith(("http://", "https://", "data:")):
        if raw_url.startswith("/") and request_base_url:
            b["image_url"] = f"{request_base_url.rstrip('/')}{raw_url}"
        elif raw_url.startswith("/"):
            # Sem base — mantém relativo (frontend resolve via EXPO_PUBLIC_BACKEND_URL)
            pass
        else:
            # Caminho sem prefixo "/" — assume relativo a /uploads/
            if request_base_url:
                b["image_url"] = f"{request_base_url.rstrip('/')}/uploads/{raw_url}"
    return b


def _get_base_url(request: Request) -> str:
    """Reconstrói a base URL absoluta da requisição (esquema://host)."""
    return f"{request.url.scheme}://{request.url.netloc}"


@api_router.get("/home-banners")
async def list_active_home_banners(request: Request):
    """Retorna apenas os banners ATIVOS para o carrossel da Home (público para membros logados)."""
    cursor = db.home_banners.find({"active": True}, {"_id": 0}).sort([("order", 1), ("created_at", -1)])
    items = await cursor.to_list(length=50)
    base = _get_base_url(request)
    return [_serialize_banner(b, base) for b in items]


@api_router.get("/admin/home-banners")
async def admin_list_home_banners(request: Request, staff: dict = Depends(require_admin)):
    """Lista todos os banners (incluindo inativos) — uso na tela de gerenciamento."""
    cursor = db.home_banners.find({}, {"_id": 0}).sort([("order", 1), ("created_at", -1)])
    items = await cursor.to_list(length=200)
    base = _get_base_url(request)
    return [_serialize_banner(b, base) for b in items]


@api_router.post("/admin/home-banners")
async def admin_create_home_banner(data: HomeBannerCreate, request: Request, staff: dict = Depends(require_admin)):
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Título é obrigatório")
    doc = {
        "banner_id": f"banner_{uuid.uuid4().hex[:12]}",
        "title": title,
        "subtitle": (data.subtitle or "").strip(),
        "image_url": (data.image_url or "").strip(),
        "image_base64": (data.image_base64 or "").strip(),
        "cta_label": (data.cta_label or "").strip(),
        "cta_route": (data.cta_route or "").strip(),
        "accent_color": (data.accent_color or "#C89A3A").strip(),
        "category": (data.category or "novidade").strip().lower(),
        "hide_category": bool(data.hide_category or False),
        "active": bool(data.active if data.active is not None else True),
        "order": int(data.order or 0),
        "created_by": staff.get("user_id") or staff.get("email"),
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    await db.home_banners.insert_one(doc)
    return _serialize_banner({**doc}, _get_base_url(request))


@api_router.put("/admin/home-banners/{banner_id}")
async def admin_update_home_banner(banner_id: str, data: HomeBannerUpdate, request: Request, staff: dict = Depends(require_admin)):
    existing = await db.home_banners.find_one({"banner_id": banner_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Banner não encontrado")
    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    for field in ("title", "subtitle", "image_url", "image_base64", "cta_label", "cta_route", "accent_color", "category"):
        v = getattr(data, field)
        if v is not None:
            updates[field] = v.strip() if isinstance(v, str) else v
    if data.hide_category is not None:
        updates["hide_category"] = bool(data.hide_category)
    if data.active is not None:
        updates["active"] = bool(data.active)
    if data.order is not None:
        updates["order"] = int(data.order)
    await db.home_banners.update_one({"banner_id": banner_id}, {"$set": updates})
    doc = await db.home_banners.find_one({"banner_id": banner_id}, {"_id": 0})
    return _serialize_banner(doc, _get_base_url(request)) if doc else {"ok": True}


@api_router.delete("/admin/home-banners/{banner_id}")
async def admin_delete_home_banner(banner_id: str, staff: dict = Depends(require_admin)):
    r = await db.home_banners.delete_one({"banner_id": banner_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Banner não encontrado")
    return {"ok": True}


# Migration endpoint REMOVIDO após uso bem-sucedido (74 ads migrados em 05/jun/2026).
# Arquivo backend/data/ads_export.json também removido para não inflar o bundle.

# ============================================================================
# ONE-TIME MIGRATION — Backfill niche field for legacy ads.
# Atualiza todos os anúncios com niche faltando/null para um nicho default
# (por padrão "performance"). Idempotente: rodar de novo só atualiza os que
# ainda não tem niche.
# Auth: require_admin (apenas master admin pode disparar).
# REMOVER este endpoint após a migração ser concluída em produção.
# ============================================================================
@api_router.post("/admin/migrate/blx-to-pyx")
async def admin_migrate_blx_to_pyx(admin: dict = Depends(require_admin)):
    """ENDPOINT TEMPORÁRIO — Migra wallet_number e from/to_wallet de 'BLX-XXX' para 'PYX-XXX'."""
    wallets_before = await db.wallets.count_documents({"wallet_number": {"$regex": "^BLX-"}})
    wallets_updated = 0
    async for w in db.wallets.find({"wallet_number": {"$regex": "^BLX-"}}):
        new_num = "PYX-" + w["wallet_number"][4:]
        r = await db.wallets.update_one({"member_id": w["member_id"]}, {"$set": {"wallet_number": new_num}})
        if r.modified_count:
            wallets_updated += 1
    txs_before = await db.wallet_txs.count_documents({
        "$or": [{"from_wallet": {"$regex": "^BLX-"}}, {"to_wallet": {"$regex": "^BLX-"}}],
    })
    txs_updated = 0
    async for tx in db.wallet_txs.find({
        "$or": [{"from_wallet": {"$regex": "^BLX-"}}, {"to_wallet": {"$regex": "^BLX-"}}],
    }):
        upd: Dict[str, Any] = {}
        if (tx.get("from_wallet") or "").startswith("BLX-"):
            upd["from_wallet"] = "PYX-" + tx["from_wallet"][4:]
        if (tx.get("to_wallet") or "").startswith("BLX-"):
            upd["to_wallet"] = "PYX-" + tx["to_wallet"][4:]
        if upd:
            r = await db.wallet_txs.update_one({"tx_id": tx["tx_id"]}, {"$set": upd})
            if r.modified_count:
                txs_updated += 1
    return {
        "ok": True,
        "wallets_before": wallets_before,
        "wallets_updated": wallets_updated,
        "txs_before": txs_before,
        "txs_updated": txs_updated,
    }


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
    # Sincroniza a senha também na coleção `users` (login do portal admin)
    # quando existir um usuário com mesmo email — necessário para o auto-login
    # feito no login.tsx/enter.tsx detectar roles (admin/staff/financeiro).
    email = (member.get("email") or "").lower().strip()
    if email:
        await db.users.update_one({"email": email}, {"$set": {"password_hash": ph}})
    return {"ok": True, "member_id": member_id, "email": member.get("email")}


# ============================================================================
# NICHE ACCESS GRANT — concede/revoga acesso ao nicho Performance Humana
# (nicho restrito que exige aprovação manual da administração BlacksClub).
# Identifier pode ser member_id, email OU código do membro (#XXXX).
# Auth: require_staff (admins e suporte podem gerenciar).
# ============================================================================
class NicheAccessGrant(BaseModel):
    identifier: str   # member_id, email ou código (ex: "10006")
    niche: str = "performance"  # atualmente só performance, mas extensível
    grant: bool = True   # True = libera, False = revoga


@api_router.post("/admin/members/grant-niche-access")
async def admin_grant_niche_access(data: NicheAccessGrant, staff: dict = Depends(require_staff)):
    NICHES_RESTRITOS = {"performance"}
    niche = (data.niche or "").strip().lower()
    if niche not in NICHES_RESTRITOS:
        raise HTTPException(
            status_code=400,
            detail=f"Nicho '{niche}' não é restrito. Apenas: {', '.join(sorted(NICHES_RESTRITOS))}",
        )

    ident = (data.identifier or "").strip()
    if not ident:
        raise HTTPException(status_code=400, detail="Informe member_id, email ou código")

    # Lookup flexível — member_id, email ou código
    query: Dict[str, Any] = {
        "$or": [
            {"member_id": ident},
            {"email": ident.lower()},
            {"code": ident},
        ]
    }
    member = await db.members.find_one(query, {"_id": 0, "password_hash": 0})
    if not member:
        raise HTTPException(status_code=404, detail=f"Membro não encontrado: '{ident}'")

    field = f"{niche}_access"  # ex: "performance_access"
    await db.members.update_one(
        {"member_id": member["member_id"]},
        {"$set": {field: bool(data.grant)}},
    )

    return {
        "ok": True,
        "member_id": member["member_id"],
        "name": member.get("name"),
        "email": member.get("email"),
        "code": member.get("code"),
        "niche": niche,
        "granted": bool(data.grant),
    }


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


@api_router.get("/admin/metrics")
async def admin_metrics(staff: dict = Depends(require_staff)):
    """
    Métricas executivas do ecossistema PYX:
    - Supply total circulante (soma de balance_centavos de todas as carteiras)
    - PYX em escrow (valor preso em transações pendentes)
    - Top 10 sellers por volume de vendas liberadas (settled)
    - Volume de transações dos últimos 30 dias
    - Total de membros com saldo > 0
    """
    # --- Supply total circulante ---
    supply_agg = await db.wallets.aggregate([
        {"$group": {
            "_id": None,
            "total_balance": {"$sum": {"$ifNull": ["$balance_centavos", 0]}},
            "total_escrow_out": {"$sum": {"$ifNull": ["$escrow_out", 0]}},
            "total_escrow_in": {"$sum": {"$ifNull": ["$escrow_in", 0]}},
            "wallets_count": {"$sum": 1},
            "wallets_with_balance": {
                "$sum": {"$cond": [{"$gt": [{"$ifNull": ["$balance_centavos", 0]}, 0]}, 1, 0]}
            },
        }}
    ]).to_list(length=1)
    supply = supply_agg[0] if supply_agg else {}
    # escrow está em PYX float no schema antigo → converte para centavos
    escrow_out_cents = int(round(float(supply.get("total_escrow_out") or 0) * 100))
    escrow_in_cents = int(round(float(supply.get("total_escrow_in") or 0) * 100))

    # --- Volume últimos 30 dias ---
    since_30d = datetime.now(timezone.utc) - timedelta(days=30)
    volume_agg = await db.wallet_txs.aggregate([
        {"$match": {"created_at": {"$gte": since_30d}, "type": {"$in": ["escrow", "transfer", "settled"]}}},
        {"$group": {
            "_id": None,
            "total_cents": {"$sum": {"$ifNull": ["$amount_centavos", 0]}},
            "tx_count": {"$sum": 1},
        }}
    ]).to_list(length=1)
    vol = volume_agg[0] if volume_agg else {}

    # --- Top sellers (valor liberado/settled) ---
    top_agg = await db.wallet_txs.aggregate([
        {"$match": {"status": "settled", "type": "escrow", "to_id": {"$ne": None}}},
        {"$group": {
            "_id": "$to_id",
            "total_cents": {"$sum": {"$ifNull": ["$amount_centavos", 0]}},
            "sales_count": {"$sum": 1},
        }},
        {"$sort": {"total_cents": -1}},
        {"$limit": 10},
    ]).to_list(length=10)

    # Enriquecer com nome/avatar/rating médio — OTIMIZADO (2 queries em vez de N+1).
    # Antes: para cada um dos top 10 vendedores, 2 queries (members.find_one + ratings.aggregate)
    #        = 20+ queries → lento e arriscava timeout em produção.
    # Agora: 1 bulk find em members + 1 aggregate group em pyx_ratings → 2 queries totais.
    top_sellers: list = []
    seller_ids = [row["_id"] for row in top_agg if row.get("_id")]
    if seller_ids:
        # Bulk fetch dos perfis dos vendedores
        members_cursor = db.members.find(
            {"member_id": {"$in": seller_ids}},
            {"_id": 0, "member_id": 1, "name": 1, "nickname": 1, "tier": 1, "avatar_base64": 1},
        )
        members_list = await members_cursor.to_list(length=len(seller_ids))
        members_by_id = {m["member_id"]: m for m in members_list}

        # Bulk aggregate dos ratings (agrupados por seller_id)
        ratings_agg = await db.pyx_ratings.aggregate([
            {"$match": {"seller_id": {"$in": seller_ids}}},
            {"$group": {"_id": "$seller_id", "avg": {"$avg": "$stars"}, "count": {"$sum": 1}}},
        ]).to_list(length=len(seller_ids))
        ratings_by_id = {r["_id"]: r for r in ratings_agg}

        # Monta a resposta usando os lookup maps em memória (zero queries adicionais)
        for row in top_agg:
            seller_id = row["_id"]
            m = members_by_id.get(seller_id)
            if not m:
                continue
            rating = ratings_by_id.get(seller_id, {})
            top_sellers.append({
                "member_id": seller_id,
                "name": m.get("name") or m.get("nickname") or "Membro",
                "nickname": m.get("nickname"),
                "tier": m.get("tier", "silver"),
                "avatar_base64": m.get("avatar_base64"),
                "total_cents": int(row.get("total_cents") or 0),
                "sales_count": int(row.get("sales_count") or 0),
                "rating_avg": round(float(rating.get("avg") or 0), 2),
                "rating_count": int(rating.get("count") or 0),
            })

    # --- Orders stats ---
    orders_open = await db.orders.count_documents({"status": {"$in": ["pending", "escrow", "open"]}})
    orders_completed = await db.orders.count_documents({"status": "completed"})

    balance_cents = int(supply.get("total_balance") or 0)
    total_supply = balance_cents + escrow_out_cents  # saldo livre + escrow pendente

    return {
        "supply": {
            "total_cents": total_supply,
            "available_cents": balance_cents,
            "escrow_out_cents": escrow_out_cents,
            "escrow_in_cents": escrow_in_cents,
            "wallets_count": int(supply.get("wallets_count") or 0),
            "wallets_with_balance": int(supply.get("wallets_with_balance") or 0),
        },
        "volume_30d": {
            "total_cents": int(vol.get("total_cents") or 0),
            "tx_count": int(vol.get("tx_count") or 0),
        },
        "orders": {
            "open": orders_open,
            "completed": orders_completed,
        },
        "top_sellers": top_sellers,
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
        "avatar": "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.pexels.com/photos/5327585/pexels-photo-5327585.jpeg?auto=compress&cs=tinysrgb&w=400",
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
        "avatar": "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.pexels.com/photos/5327921/pexels-photo-5327921.jpeg?auto=compress&cs=tinysrgb&w=400",
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
        "avatar": "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.pexels.com/photos/5327545/pexels-photo-5327545.jpeg?auto=compress&cs=tinysrgb&w=400",
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
        "avatar": "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.pexels.com/photos/2182975/pexels-photo-2182975.jpeg?auto=compress&cs=tinysrgb&w=400",
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
        "avatar": "https://images.pexels.com/photos/7580245/pexels-photo-7580245.jpeg?auto=compress&cs=tinysrgb&w=400",
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
        "avatar": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=400&q=80",
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
        "avatar": "https://images.pexels.com/photos/2379004/pexels-photo-2379004.jpeg?auto=compress&cs=tinysrgb&w=400",
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
        "avatar": "https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&w=400&q=80",
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


# -------------- Marketplace Category Access Rules --------------
# Apenas Silver, Gold e Diamante acessam o marketplace.
# Categorias sensíveis são ocultas sob a etiqueta "saude_diamante" (diamond).
PUBLIC_CATEGORIES = ["metabolicos", "performance", "regeneracao", "estetica", "foco", "funcionais", "oportunidades"]
HEALTH_CATEGORIES = ["emagrecedores", "peptideos", "landerlan", "hormonios"]
HEALTH_UMBRELLA_ID = "saude_diamante"

# Limites mensais de transferência P2P em PYX (em centavos)
# Black: não pode transferir; Silver: 2.000 PYX; Gold: 10.000 PYX; Diamond: 50.000 PYX
# Staff (admin/support/financeiro) não possuem limite.
PYX_MONTHLY_TRANSFER_LIMITS_CENTAVOS = {
    "black":   0,
    "silver":  200_000,     # 2.000 PYX
    "gold":    1_000_000,   # 10.000 PYX
    "diamond": 5_000_000,   # 50.000 PYX
}

@api_router.get("/products", response_model=List[Product])
async def list_products(
    category: Optional[str] = None,
    subcategory: Optional[str] = None,
    q: Optional[str] = None,
    member_id: Optional[str] = None,
    tier: Optional[str] = None,  # NEW: strict tier filter (silver|gold|diamond)
):
    member_tier = "black"
    if member_id:
        m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1})
        if m:
            member_tier = (m.get("tier") or "black").lower()

    # Regra hierárquica de acesso: quem pode ENTRAR em cada marketplace
    # diamond  → todos; gold → gold+silver; silver → silver; black → nenhum
    if tier and tier.lower() in ("silver", "gold", "diamond"):
        tier_lc = tier.lower()
        RANK = {"silver": 1, "gold": 2, "diamond": 3, "black": 0}
        if RANK.get(member_tier, 0) < RANK[tier_lc]:
            raise HTTPException(status_code=403, detail=f"Marketplace {tier_lc.upper()} exclusivo para membros {tier_lc.upper()} ou superior")
    else:
        tier_lc = None

    # Saúde Diamante = umbrella que inclui todas as categorias sensíveis (só Diamond)
    is_saude_umbrella = category == HEALTH_UMBRELLA_ID

    if category and category != "all":
        if is_saude_umbrella or category in HEALTH_CATEGORIES:
            if member_tier != "diamond":
                raise HTTPException(status_code=403, detail="Área exclusiva para membros Black Diamante")
        elif category not in PUBLIC_CATEGORIES:
            return []
        if member_tier == "black":
            raise HTTPException(status_code=403, detail="Marketplace exclusivo para membros Silver, Gold e Diamante")

    query: dict = {}
    if is_saude_umbrella:
        query["category"] = {"$in": HEALTH_CATEGORIES}
    elif category and category != "all":
        query["category"] = category
    else:
        if member_tier == "black":
            raise HTTPException(status_code=403, detail="Marketplace exclusivo para membros Silver, Gold e Diamante")
        if member_tier == "diamond":
            query["category"] = {"$in": PUBLIC_CATEGORIES + HEALTH_CATEGORIES}
        else:
            query["category"] = {"$in": PUBLIC_CATEGORIES}

    # FILTRO ESTRITO POR TIER — quando a URL é /catalog/gold, SÓ mostra produtos gold
    # Produtos sem campo `tier` são considerados "silver" (fallback seguro),
    # exceto categorias de saúde, que já são exclusivas Diamond.
    if tier_lc:
        if tier_lc == "diamond":
            query["$or"] = [
                {"tier": "diamond"},
                {"category": {"$in": HEALTH_CATEGORIES}},
            ]
        elif tier_lc == "gold":
            query["tier"] = "gold"
            query["category"] = {"$nin": HEALTH_CATEGORIES}
        elif tier_lc == "silver":
            query["category"] = {"$nin": HEALTH_CATEGORIES}
            query["$or"] = [{"tier": "silver"}, {"tier": {"$exists": False}}, {"tier": None}]

    if subcategory and subcategory != "all":
        query["subcategory"] = subcategory
    if q:
        # se já existe $or (tier), combina em $and
        q_safe = re.escape(q.strip())[:80]  # evita ReDoS / injeção de regex
        or_q = [
            {"name": {"$regex": q_safe, "$options": "i"}},
            {"description": {"$regex": q_safe, "$options": "i"}},
        ]
        if "$or" in query:
            existing_or = query.pop("$or")
            query["$and"] = [{"$or": existing_or}, {"$or": or_q}]
        else:
            query["$or"] = or_q
    cursor = db.products.find(query, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(length=500)
    return [Product(**item) for item in items]


@api_router.get("/subcategories/{category}")
async def subcategories(category: str, member_id: Optional[str] = None):
    tier = "black"
    if member_id:
        m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1})
        if m:
            tier = (m.get("tier") or "black").lower()
    if tier == "black":
        raise HTTPException(status_code=403, detail="Marketplace exclusivo para membros Silver, Gold e Diamante")
    if category in HEALTH_CATEGORIES and tier != "diamond":
        raise HTTPException(status_code=403, detail="Categoria exclusiva para membros Black Diamante")
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


class ProductPYXPurchase(BaseModel):
    member_id: str
    quantity: int = 1
    pay_option: str = "full"  # "full" (100%, -30%) | "half" (50%, -15%) | "entry" (10%, 0%)


@api_router.post("/products/{product_id}/buy-pyx")
async def buy_product_with_pyx(product_id: str, data: ProductPYXPurchase):
    """
    Compra um item do catálogo oficial com PYX.
    - pay_option define: % de entrada debitada AGORA + desconto no total.
    - Saldo restante fica registrado como "remaining_cents" no order (a pagar na entrega).
    """
    if data.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantidade inválida")

    # Load product
    prod = await db.products.find_one({"product_id": product_id}, {"_id": 0})
    if not prod:
        raise HTTPException(status_code=404, detail="Produto não encontrado")
    if int(prod.get("stock") or 0) < data.quantity:
        raise HTTPException(status_code=400, detail="Estoque insuficiente")

    # Load member + tier
    m = await db.members.find_one({"member_id": data.member_id}, {"_id": 0, "tier": 1})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    tier = (m.get("tier") or "black").lower()

    if tier not in ("silver", "gold", "diamond"):
        raise HTTPException(
            status_code=403,
            detail="Catálogo disponível apenas para membros Silver, Gold ou Diamante",
        )

    TIER_DISCOUNT = {"silver": 0.05, "gold": 0.10, "diamond": 0.15}
    tier_disc = TIER_DISCOUNT.get(tier, 0.0)

    # Pay-option mapping: (entry%, extra_discount%)
    PAY = {
        "full":  {"entry_pct": 100, "disc_pct": 30},
        "half":  {"entry_pct": 50,  "disc_pct": 15},
        "entry": {"entry_pct": 10,  "disc_pct": 0},
    }
    cfg = PAY.get(data.pay_option, PAY["full"])

    unit_price_brl = float(prod.get("member_price") or prod.get("price") or 0)
    # Aplica tier discount + pay-option discount
    discounted_brl = round(unit_price_brl * (1 - tier_disc) * (1 - cfg["disc_pct"] / 100), 2)
    unit_cents = int(round(discounted_brl * 100))
    total_cents = unit_cents * data.quantity

    if total_cents <= 0:
        raise HTTPException(status_code=400, detail="Valor do produto inválido")

    # Calcula entrada (debita agora) e saldo devedor (na entrega)
    entry_cents = int(round(total_cents * cfg["entry_pct"] / 100))
    remaining_cents = total_cents - entry_cents

    wallet = await db.wallets.find_one({"member_id": data.member_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=400, detail="Carteira PYX não encontrada")

    current_cents = int(wallet.get("balance_centavos") or 0)
    # Valida: precisa ter o TOTAL disponível (entrada + saldo devedor travado)
    if current_cents < total_cents:
        faltante = (total_cents - current_cents) / 100.0
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INSUFFICIENT_PYX",
                "message": (
                    f"Saldo PYX insuficiente. Você precisa de {total_cents/100:.2f} PYX "
                    f"(faltam {faltante:.2f} PYX) para reservar o total da compra."
                ),
                "missing_centavos": total_cents - current_cents,
                "required_centavos": total_cents,
                "current_centavos": current_cents,
                "support_redirect": True,
            },
        )

    # Debita a ENTRADA e TRAVA o saldo devedor em reserved_centavos.
    # Débito CONDICIONAL/ATÔMICO — evita corrida entre a checagem e o débito.
    amt_float = entry_cents / 100.0
    debited = await db.wallets.find_one_and_update(
        {"member_id": data.member_id, "balance_centavos": {"$gte": total_cents}},
        {"$inc": {
            "balance": -amt_float,
            "balance_centavos": -total_cents,  # sai todo do disponível
            "reserved_centavos": remaining_cents,  # parte volta para reservado
        }},
    )
    if not debited:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INSUFFICIENT_PYX",
                "message": "Saldo PYX insuficiente (o saldo mudou durante a operação). Tente novamente.",
                "support_redirect": True,
            },
        )

    tx_id = f"tx_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)
    await db.wallet_txs.insert_one({
        "tx_id": tx_id, "from_id": data.member_id, "to_id": "catalog_admin",
        "amount": amt_float, "amount_centavos": entry_cents,
        "type": "purchase", "status": "settled",
        "description": (
            f"Compra catálogo: {prod.get('name')} x{data.quantity} · "
            f"entrada {cfg['entry_pct']}%"
        ),
        "product_id": product_id, "pay_option": data.pay_option,
        "created_at": now, "settled_at": now,
    })

    order_id = f"ord_{uuid.uuid4().hex[:10]}"
    status = "settled" if remaining_cents == 0 else "awaiting_delivery_payment"
    await db.orders.insert_one({
        "order_id": order_id, "member_id": data.member_id, "product_id": product_id,
        "product_name": prod.get("name"), "quantity": data.quantity,
        "unit_cents": unit_cents, "total_cents": total_cents,
        "entry_cents": entry_cents, "remaining_cents": remaining_cents,
        "reserved_on_buyer_cents": remaining_cents,  # quanto está travado no comprador
        "tier_discount": tier_disc, "pay_option": data.pay_option,
        "status": status, "channel": "catalog_pyx",
        "seller_id": "catalog_admin",
        "tx_id": tx_id, "created_at": now,
    })

    await db.products.update_one(
        {"product_id": product_id},
        {"$inc": {"stock": -data.quantity}},
    )

    new_balance_cents = current_cents - total_cents
    return {
        "ok": True,
        "order_id": order_id,
        "tx_id": tx_id,
        "total_cents": total_cents,
        "entry_cents": entry_cents,
        "remaining_cents": remaining_cents,
        "reserved_on_buyer_cents": remaining_cents,
        "pay_option": data.pay_option,
        "quantity": data.quantity,
        "new_balance_centavos": new_balance_cents,
        "message": (
            f"Compra realizada! {amt_float:.2f} PYX debitados "
            f"({cfg['entry_pct']}% de entrada)."
            + (f" Saldo de {remaining_cents/100:.2f} PYX travado para pagar na entrega."
               if remaining_cents > 0 else "")
        ),
    }


@api_router.get("/categories")
async def get_categories(member_id: Optional[str] = None):
    """Retorna categorias do marketplace, com metadata de restrição.
    - Black comum: 403
    - Silver/Gold: apenas categorias públicas
    - Diamond: públicas + área "Saúde Diamante" (nomes sensíveis ocultos)
    """
    tier = "black"
    if member_id:
        m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1})
        if m:
            tier = (m.get("tier") or "black").lower()

    if tier == "black":
        raise HTTPException(status_code=403, detail="Marketplace exclusivo para membros Silver, Gold e Diamante")

    # Categorias públicas — nomes comerciais BlacksClub (foco em conversão)
    public = [
        {"id": "metabolicos",  "name": "Emagrecedores",   "icon": "flame",              "emoji": "🔥", "restricted": False, "group": "public"},
        {"id": "performance",  "name": "Força e Massa",   "icon": "flash",              "emoji": "💪", "restricted": False, "group": "public"},
        {"id": "regeneracao",  "name": "Recuperação",     "icon": "leaf",               "emoji": "🩹", "restricted": False, "group": "public"},
        {"id": "estetica",     "name": "Estética",        "icon": "sparkles",           "emoji": "✨", "restricted": False, "group": "public"},
        {"id": "foco",         "name": "Foco",            "icon": "bulb",               "emoji": "🧠", "restricted": False, "group": "public"},
        {"id": "funcionais",   "name": "Energia",         "icon": "barbell",            "emoji": "⚡", "restricted": False, "group": "public"},
        {"id": "oportunidades","name": "Oportunidades",   "icon": "rocket",             "emoji": "🚀", "restricted": False, "group": "public"},
    ]
    if tier != "diamond":
        return public

    # Saúde Diamante — agrupa tudo sensível SEM expor nomes no app
    saude = [
        {"id": "saude_diamante", "name": "Saúde Diamante", "icon": "shield-checkmark", "restricted": True, "group": "saude"},
    ]
    return public + saude


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
    """
    Garante uma ÚNICA credencial de Administrador Master (definida via .env).
    Também remove qualquer admin legado (ex.: `admin@farmaclube.com`) para
    manter uma única fonte de verdade — evitando ambiguidade de login.
    """
    # Fonte de verdade: .env (ADMIN_EMAIL/ADMIN_PASSWORD). Se o .env estiver
    # ausente/incompleto em algum ambiente (ex.: deploy externo via GitHub),
    # usa os padrões abaixo para que TODOS os ambientes convirjam para o
    # MESMO master admin com a MESMA senha — nunca falha silenciosamente.
    admin_email = (os.environ.get("ADMIN_EMAIL") or "guilherme925145000@gmail.com").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD") or "Shakira12@"

    # 1) Limpa admins legados que NÃO sejam o master atual configurado no .env.
    #    (Apenas role=admin; suporte/financeiro/etc. permanecem intactos.)
    legacy_cursor = db.users.find(
        {"role": "admin", "email": {"$ne": admin_email}},
        {"email": 1},
    )
    async for legacy in legacy_cursor:
        legacy_email = legacy.get("email")
        if legacy_email:
            logger.info("[seed_admin] Removendo admin legado: %s", legacy_email)
            await db.users.delete_one({"email": legacy_email, "role": "admin"})

    # 2) Garante o admin master (upsert idempotente com senha do .env).
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "name": "Administrador Master",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "active": True,
            "created_at": datetime.now(timezone.utc),
        })
        logger.info("[seed_admin] Admin master criado: %s", admin_email)
    else:
        updates: dict = {"role": "admin", "active": True}
        # Se a senha configurada não bate com o hash salvo, força a
        # atualização — sincroniza a senha master a CADA startup (idempotente).
        current_hash = existing.get("password_hash") or ""
        if not current_hash or not verify_password(admin_password, current_hash):
            updates["password_hash"] = hash_password(admin_password)
            logger.info("[seed_admin] Senha do admin master re-sincronizada: %s", admin_email)
        await db.users.update_one({"email": admin_email}, {"$set": updates})

    # 3) Se o admin master também for MEMBRO (mesmo email em db.members),
    #    sincroniza a senha para permitir login unificado com Shakira12@.
    member_doc = await db.members.find_one({"email": admin_email})
    if member_doc:
        current_hash = member_doc.get("password_hash") or ""
        if not current_hash or not verify_password(admin_password, current_hash):
            await db.members.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password)}},
            )
            logger.info("[seed_admin] Senha do member master sincronizada: %s", admin_email)

    # 4) Contas de equipe (não-admin) — mantidas como antes.
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

    financeiro_email = "financeiro@blacksclub.com"
    financeiro_password = "financeiro123"
    financeiro_existing = await db.users.find_one({"email": financeiro_email})
    if not financeiro_existing:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": financeiro_email,
            "name": "Financeiro BLACKSCLUB",
            "password_hash": hash_password(financeiro_password),
            "role": "financeiro",
            "created_at": datetime.now(timezone.utc),
        })
    elif not verify_password(financeiro_password, financeiro_existing["password_hash"]):
        await db.users.update_one(
            {"email": financeiro_email},
            {"$set": {"password_hash": hash_password(financeiro_password), "role": "financeiro"}},
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
    """
    Startup event — schedules slow tasks in BACKGROUND so the app is immediately
    responsive to Kubernetes liveness/readiness probes (avoids restart loops on
    deploy when Atlas MongoDB is slow or seeds take time).
    """
    # Spawn all slow stuff in background — DO NOT await here.
    asyncio.create_task(_run_startup_tasks())


async def _run_startup_tasks():
    """Slow startup tasks. Run AFTER the app is already responding to probes."""
    logger_local = logging.getLogger("startup")

    # ----- Indexes (idempotent; may fail if duplicate data exists in Atlas) -----
    index_tasks = [
        (db.users, "email", {"unique": True}),
        (db.products, "category", {}),
        (db.members, "invite_code", {"unique": True}),
        (db.members, [("phone_norm", 1), ("name_norm", 1)], {}),
        (db.authorized, [("name_norm", 1), ("phone_norm", 1)], {"unique": True}),
        (db.messages, "thread_id", {}),
        (db.messages, "created_at", {}),
        (db.orders, "member_id", {}),
        (db.quotes, "member_id", {}),
    ]
    for coll, key, opts in index_tasks:
        try:
            await coll.create_index(key, **opts)
        except Exception as e:  # noqa: BLE001
            logger_local.warning(f"Index creation skipped for {coll.name}/{key}: {e}")

    # ----- Seeds (idempotent) -----
    for name, fn in [
        ("seed_admin", seed_admin),
        ("seed_authorized", seed_authorized),
        ("seed_products", seed_products),
        ("seed_groups", seed_groups),
        ("seed_events", seed_events),
    ]:
        try:
            await fn()
        except Exception as e:  # noqa: BLE001
            logger_local.warning(f"{name} failed (non-fatal): {e}")

    # ----- Migrations (also background-safe) -----
    try:
        await backfill_member_numbers()
    except Exception as e:  # noqa: BLE001
        logger_local.warning(f"backfill_member_numbers failed: {e}")

    logger_local.info("All startup tasks completed (background).")


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
        "can_post_ads": bool(m.get("can_post_ads")),
        # Niche access flags (não-sensíveis — necessários para o gate de Performance
        # Humana atualizar sem exigir logout/login após o admin liberar o acesso).
        "performance_access": bool(m.get("performance_access")),
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
    kind: Optional[str] = None       # ETAPA 4: 'text' (default) | 'receipt'
    tx_id: Optional[str] = None      # ETAPA 4: id da transação quando kind=receipt


def _dm_thread(a: str, b: str) -> str:
    return "dm_" + "_".join(sorted([a, b]))


@api_router.get("/community/dms/{me_id}/{other_id}")
async def dm_list(me_id: str, other_id: str):
    tid = _dm_thread(me_id, other_id)
    cur = db.dm_messages.find({"thread_id": tid}, {"_id": 0}).sort("created_at", 1).limit(400)
    return await cur.to_list(length=400)


@api_router.post("/community/dms/{me_id}/{other_id}")
async def dm_send(me_id: str, other_id: str, data: DMSend):
    text = (data.text or "").strip()
    kind = (data.kind or "text").lower()
    if kind not in ("text", "receipt"):
        kind = "text"
    if kind == "receipt":
        if not (data.tx_id or "").strip():
            raise HTTPException(status_code=400, detail="tx_id obrigatório para comprovante")
        # valida se o remetente participa da transação
        tx = await db.wallet_txs.find_one({"tx_id": data.tx_id}, {"_id": 0, "from_id": 1, "to_id": 1})
        if not tx:
            raise HTTPException(status_code=404, detail="Transação não encontrada")
        if me_id not in (tx.get("from_id"), tx.get("to_id")):
            raise HTTPException(status_code=403, detail="Você não faz parte desta transação")
        # texto default se vazio
        if not text:
            text = "Comprovante de transferência PYX"
    else:
        if not text:
            raise HTTPException(status_code=400, detail="Mensagem vazia")
    tid = _dm_thread(me_id, other_id)
    doc = {
        "dm_id": f"dm_{uuid.uuid4().hex[:12]}",
        "thread_id": tid,
        "from_id": me_id,
        "to_id": other_id,
        "text": text,
        "kind": kind,
        "created_at": datetime.now(timezone.utc),
    }
    if kind == "receipt":
        doc["tx_id"] = data.tx_id
    await db.dm_messages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/community/dms/{me_id}/{other_id}/message/{dm_id}")
async def dm_delete_message(me_id: str, other_id: str, dm_id: str):
    """Apaga uma mensagem individual. Apenas o remetente pode apagar."""
    tid = _dm_thread(me_id, other_id)
    msg = await db.dm_messages.find_one({"dm_id": dm_id, "thread_id": tid})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    if msg.get("from_id") != me_id:
        raise HTTPException(status_code=403, detail="Você só pode apagar mensagens que enviou")
    await db.dm_messages.delete_one({"dm_id": dm_id})
    return {"ok": True, "deleted": dm_id}


@api_router.delete("/community/dms/{me_id}/{other_id}")
async def dm_delete_thread(me_id: str, other_id: str):
    """Apaga TODAS as mensagens da conversa entre os dois usuários (afeta ambos os lados)."""
    tid = _dm_thread(me_id, other_id)
    res = await db.dm_messages.delete_many({"thread_id": tid})
    return {"ok": True, "deleted_count": res.deleted_count}


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
    # Grupos oficiais bloqueados por TIER — somente membros do tier correspondente podem ver/postar
    {"group_id": "g_tier_black",   "name": "Black",          "description": "Salão oficial do tier Black — membros em formação.",   "icon": "ellipse",          "color": "#888888", "tier_lock": "black",   "order": 0, "is_official_tier": True},
    {"group_id": "g_tier_silver",  "name": "Black Silver",   "description": "Salão oficial do tier Silver — prata metálico.",       "icon": "medal-outline",    "color": "#B8B8B8", "tier_lock": "silver",  "order": 1, "is_official_tier": True},
    {"group_id": "g_tier_gold",    "name": "Black Golden",   "description": "Salão oficial do tier Gold — ouro luxo.",              "icon": "star",             "color": "#D4AF37", "tier_lock": "gold",    "order": 2, "is_official_tier": True},
    {"group_id": "g_tier_diamond", "name": "Black Diamante", "description": "Salão oficial do tier Diamond — azul-prateado premium.","icon": "diamond",         "color": "#C5D1DA", "tier_lock": "diamond", "order": 3, "is_official_tier": True},
    # Grupos temáticos (livres)
    {"group_id": "g_glp1", "name": "GLP-1 e Emagrecimento", "description": "Ozempic, Mounjaro, Retatrutida, experiências e dúvidas.", "icon": "flash", "color": "#F5C150", "order": 10},
    {"group_id": "g_hipert", "name": "Hipertrofia & Força", "description": "Treino, volume, periodização, PRs.", "icon": "barbell", "color": "#FF7A4D", "order": 11},
    {"group_id": "g_cut", "name": "Cutting & Dieta", "description": "Estratégias, macros, rotinas alimentares.", "icon": "nutrition", "color": "#4EE07F", "order": 12},
    {"group_id": "g_pept", "name": "Peptídeos", "description": "BPC-157, TB-500, CJC-1295, Ipamorelina.", "icon": "flask", "color": "#7FD7E5", "order": 13},
    {"group_id": "g_hormon", "name": "Hormônios & TRT", "description": "Testosterona, HGH, HCG, reposição.", "icon": "sparkles", "color": "#E57FD7", "order": 14},
    {"group_id": "g_mulheres", "name": "Mulheres do Clube", "description": "Grupo privado feminino do BLACKSCLUB.", "icon": "female", "color": "#E57FD7", "order": 15},
    {"group_id": "g_negocios", "name": "Negócios & Parcerias", "description": "Networking entre membros.", "icon": "trending-up", "color": "#4E8FE0", "order": 16},
]


async def seed_groups():
    for g in DEFAULT_GROUPS:
        # Atualiza metadata dos grupos oficiais de tier para sempre refletirem último config
        if g.get("is_official_tier") or g.get("tier_lock"):
            await db.groups.update_one({"group_id": g["group_id"]}, {"$set": g}, upsert=True)
        else:
            await db.groups.update_one({"group_id": g["group_id"]}, {"$setOnInsert": g}, upsert=True)


async def _get_member_tier(member_id: str) -> str:
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1})
    return (m or {}).get("tier", "black").lower()


def _tier_allowed(member_tier: str, group: dict) -> bool:
    """Retorna True se o membro pode visualizar/interagir no grupo dado seu tier."""
    lock = (group or {}).get("tier_lock")
    if not lock:
        return True
    return (member_tier or "").lower() == lock.lower()


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
    cur = db.groups.find(query, {"_id": 0}).sort("order", 1)
    groups = await cur.to_list(length=200)
    # Se tiver member_id, anota se o membro pode acessar (tier_lock match)
    member_tier = None
    if member_id:
        member_tier = await _get_member_tier(member_id)
    for g in groups:
        g["members_count"] = await db.group_members.count_documents({"group_id": g["group_id"]})
        if g.get("tier_lock"):
            g["locked"] = (member_tier or "").lower() != g["tier_lock"].lower()
            g["required_tier"] = g["tier_lock"]
        else:
            g["locked"] = False
    return groups


@api_router.post("/community/groups/{group_id}/join/{member_id}")
async def group_join(group_id: str, member_id: str):
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    member_tier = await _get_member_tier(member_id)
    if not _tier_allowed(member_tier, group):
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": "TIER_LOCKED",
                "message": (
                    f"Acesso restrito ao tier {group['tier_lock'].upper()}. "
                    "Apenas membros desse nível podem entrar neste grupo."
                ),
                "required_tier": group.get("tier_lock"),
                "member_tier": member_tier,
            },
        )
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
async def group_messages(group_id: str, member_id: Optional[str] = None):
    # Se for grupo com tier_lock, só permite ler se o member_id tiver o tier correto
    if member_id:
        group = await db.groups.find_one({"group_id": group_id}, {"_id": 0, "tier_lock": 1})
        if group and group.get("tier_lock"):
            member_tier = await _get_member_tier(member_id)
            if not _tier_allowed(member_tier, group):
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error_code": "TIER_LOCKED",
                        "message": (
                            f"Grupo exclusivo para membros do tier {group['tier_lock'].upper()}."
                        ),
                        "required_tier": group.get("tier_lock"),
                        "member_tier": member_tier,
                    },
                )
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
    # Checa tier_lock
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0, "tier_lock": 1})
    if group and group.get("tier_lock"):
        member_tier = await _get_member_tier(data.member_id)
        if not _tier_allowed(member_tier, group):
            raise HTTPException(
                status_code=403,
                detail={
                    "error_code": "TIER_LOCKED",
                    "message": (
                        f"Somente membros {group['tier_lock'].upper()} podem postar neste grupo."
                    ),
                    "required_tier": group.get("tier_lock"),
                    "member_tier": member_tier,
                },
            )
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
    niche: str  # tech | performance | beleza | semi-novos | lazer | black (obrigatório a partir do redesign de nichos)
    category: str
    images: List[str] = []  # base64
    stock: int = 1
    ad_tier: Optional[str] = None  # silver | gold | diamond (Diamond pode publicar em qualquer um)


@api_router.get("/ads")
async def list_ads(
    category: Optional[str] = None,
    niche: Optional[str] = None,
    q: Optional[str] = None,
    tier: Optional[str] = None,
):
    """
    Lista anúncios ativos com filtros opcionais. Os filtros são ESTRITOS — cada
    anúncio só aparece se corresponder ao nicho E categoria selecionados.
    Bancos de dados separados por nicho garantem que produtos não vazem entre
    categorias (regra de negócio do redesign de nichos).
    """
    query: Dict[str, Any] = {"active": True}
    if category and category != "all":
        query["category"] = category
    if niche and niche != "all":
        query["niche"] = niche
    # FILTRO ESTRITO POR TIER (para marketplaces segmentados)
    if tier and tier.lower() in ("silver", "gold", "diamond"):
        tier_lc = tier.lower()
        if tier_lc == "diamond":
            # Anúncios Diamond: ad_tier=="diamond" OU legado (sem campo — todos antigos eram Diamond-only)
            query["$or"] = [{"ad_tier": "diamond"}, {"ad_tier": {"$exists": False}}, {"ad_tier": None}]
        else:
            query["ad_tier"] = tier_lc
    if q:
        q_safe = re.escape(q.strip())[:80]  # evita ReDoS / injeção de regex
        or_q = [
            {"title": {"$regex": q_safe, "$options": "i"}},
            {"description": {"$regex": q_safe, "$options": "i"}},
        ]
        if "$or" in query:
            existing_or = query.pop("$or")
            query["$and"] = [{"$or": existing_or}, {"$or": or_q}]
        else:
            query["$or"] = or_q
    cur = db.ads.find(query, {"_id": 0}).sort("created_at", -1).limit(200)
    ads = await cur.to_list(length=200)
    # enrich with seller nickname + tier — busca em LOTE (evita N+1 queries).
    # NÃO incluímos o avatar_base64 aqui: na LISTA ele era duplicado por anúncio
    # (mesmo vendedor) inflando a resposta em vários MB e travando a web.
    # O avatar do vendedor é carregado sob demanda no detalhe (GET /ads/{id}).
    seller_ids = list({a.get("seller_id") for a in ads if a.get("seller_id")})
    sellers: Dict[str, Any] = {}
    if seller_ids:
        async for m in db.members.find(
            {"member_id": {"$in": seller_ids}},
            {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "tier": 1},
        ):
            sellers[m["member_id"]] = m
    for a in ads:
        m = sellers.get(a.get("seller_id"))
        if m:
            a["seller_nickname"] = m.get("nickname") or (m.get("name") or "Membro").split(" ")[0]
            a["seller_tier"] = m.get("tier", "diamond")
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


class AdPYXBuy(BaseModel):
    member_id: str
    pay_option: str = "full"  # "full"|"half"|"entry"


@api_router.post("/ads/{ad_id}/buy-pyx")
async def buy_ad_with_pyx(ad_id: str, data: AdPYXBuy):
    """
    Compra direta de um anúncio Diamante via PYX.
    - Debita APENAS a entrada (entry_pct) do saldo disponível do comprador.
    - Trava o saldo devedor em `reserved_centavos` do comprador (liberado na entrega).
    - A entrada entra em escrow_out até o vendedor confirmar a entrega.
    Desconto aplicado conforme forma de pagamento:
      - full  (100% antecipado) → -30%
      - half  (50% entrada)     → -15%
      - entry (10% entrada)     →   0%
    """
    ad = await db.ads.find_one({"ad_id": ad_id}, {"_id": 0})
    if not ad:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado")
    if ad.get("seller_id") == data.member_id:
        raise HTTPException(status_code=400, detail="Você não pode comprar seu próprio anúncio")

    PAY = {
        "full":  {"entry_pct": 100, "disc_pct": 30},
        "half":  {"entry_pct": 50,  "disc_pct": 15},
        "entry": {"entry_pct": 10,  "disc_pct": 0},
    }
    cfg = PAY.get(data.pay_option, PAY["full"])
    price_full = float(ad.get("price_full", 0))
    full_cents = int(round(price_full * 100))
    total_cents = int(round(full_cents * (100 - cfg["disc_pct"]) / 100))
    if total_cents <= 0:
        raise HTTPException(status_code=400, detail="Valor do anúncio inválido")

    entry_cents = int(round(total_cents * cfg["entry_pct"] / 100))
    remaining_cents = total_cents - entry_cents

    wallet = await db.wallets.find_one({"member_id": data.member_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=400, detail="Carteira PYX não encontrada")
    current_cents = int(wallet.get("balance_centavos") or 0)
    if current_cents < total_cents:
        faltante = (total_cents - current_cents) / 100.0
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INSUFFICIENT_PYX",
                "message": (
                    f"Saldo PYX insuficiente. Você precisa de {total_cents/100:.2f} PYX "
                    f"(faltam {faltante:.2f} PYX) para reservar o total da compra."
                ),
                "missing_centavos": total_cents - current_cents,
                "required_centavos": total_cents,
                "current_centavos": current_cents,
                "support_redirect": True,
            },
        )

    now = datetime.now(timezone.utc)
    amt_float = entry_cents / 100.0
    # Debita ENTRADA em escrow + TRAVA saldo devedor em reserved.
    # Débito CONDICIONAL/ATÔMICO — evita corrida entre a checagem e o débito.
    debited = await db.wallets.find_one_and_update(
        {"member_id": data.member_id, "balance_centavos": {"$gte": total_cents}},
        {"$inc": {
            "balance": -amt_float,
            "balance_centavos": -total_cents,              # sai todo do disponível
            "reserved_centavos": remaining_cents,          # trava restante
            "escrow_out": amt_float,                        # entrada em custódia
        }},
    )
    if not debited:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INSUFFICIENT_PYX",
                "message": "Saldo PYX insuficiente (o saldo mudou durante a operação). Tente novamente.",
                "support_redirect": True,
            },
        )
    seller_id = ad.get("seller_id")
    if seller_id:
        await db.wallets.update_one(
            {"member_id": seller_id},
            {"$inc": {"escrow_in": amt_float}},
        )

    tx_id = f"tx_{uuid.uuid4().hex[:10]}"
    await db.wallet_txs.insert_one({
        "tx_id": tx_id, "from_id": data.member_id, "to_id": seller_id,
        "amount": amt_float, "amount_centavos": entry_cents,
        "type": "escrow", "status": "pending",
        "description": f"Compra Diamante: {ad.get('title')} · entrada {cfg['entry_pct']}%",
        "ad_id": ad_id, "ad_title": ad.get("title"),
        "pay_option": data.pay_option,
        "created_at": now,
    })
    order_id = f"ord_{uuid.uuid4().hex[:10]}"
    await db.orders.insert_one({
        "order_id": order_id, "member_id": data.member_id, "ad_id": ad_id,
        "seller_id": seller_id,
        "product_name": ad.get("title"), "quantity": 1,
        "total_cents": total_cents,
        "entry_cents": entry_cents, "remaining_cents": remaining_cents,
        "reserved_on_buyer_cents": remaining_cents,
        "status": "in_escrow" if remaining_cents == 0 else "awaiting_delivery_payment",
        "channel": "ad_direct", "pay_option": data.pay_option,
        "tx_id": tx_id, "created_at": now,
    })
    return {
        "ok": True,
        "order_id": order_id, "tx_id": tx_id,
        "total_cents": total_cents,
        "entry_cents": entry_cents,
        "remaining_cents": remaining_cents,
        "reserved_on_buyer_cents": remaining_cents,
        "pay_option": data.pay_option,
        "new_balance_centavos": current_cents - total_cents,
        "message": (
            f"Reserva Diamante confirmada! {amt_float:.2f} PYX em custódia "
            f"(entrada {cfg['entry_pct']}%)."
            + (f" Saldo de {remaining_cents/100:.2f} PYX travado para pagar na entrega."
               if remaining_cents > 0 else "")
        ),
    }


@api_router.post("/ads")
async def create_ad(data: AdCreate, request: Request):
    """
    Publica anúncio no marketplace.

    Quem pode publicar:
      • Qualquer staff autenticado via JWT (admin, support, financeiro)
      • Qualquer membro com a flag `can_post_ads: true` no perfil
        (concedida individualmente pelo admin a Diamonds confiáveis).

    Membros comuns sem essa flag NÃO podem publicar — o marketplace é curado.
    """
    # 1) Tenta autenticar via JWT (staff)
    actor_role: Optional[str] = None
    actor_email: Optional[str] = None
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        try:
            token = auth_header.split(" ", 1)[1]
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user = await db.users.find_one({"user_id": payload.get("sub")})
            if user and user.get("role") in ("admin", "support", "financeiro"):
                actor_role = user["role"]
                actor_email = user.get("email")
        except Exception:
            pass

    # 2) Carrega o membro vendedor
    m = await db.members.find_one({"member_id": data.seller_id})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    # 3) Se não é staff via JWT, exige que o member tenha a flag
    if actor_role is None:
        if not m.get("can_post_ads"):
            raise HTTPException(
                status_code=403,
                detail="Você não tem permissão para publicar anúncios. Solicite ao admin.",
            )
        actor_role = "diamond_publisher"
        actor_email = m.get("email")

    # 4) Validações de tier do anúncio
    requested_tier = (data.ad_tier or "diamond").lower()
    if requested_tier not in ("silver", "gold", "diamond"):
        requested_tier = "diamond"

    # Membros com can_post_ads só podem publicar no marketplace do próprio tier
    # ou inferiores (staff pode publicar em qualquer tier).
    if actor_role == "diamond_publisher":
        seller_tier = (m.get("tier") or "silver").lower()
        TIER_RANK = {"silver": 1, "gold": 2, "diamond": 3}
        if TIER_RANK.get(requested_tier, 3) > TIER_RANK.get(seller_tier, 1):
            raise HTTPException(
                status_code=403,
                detail=f"Você só pode publicar no marketplace {seller_tier} ou inferior.",
            )

    # Validação e normalização do nicho — bancos de dados separados por nicho
    # (regra de negócio: produtos não podem vazar entre categorias).
    NICHES_VALIDOS = {"tech", "performance", "beleza", "semi-novos", "lazer", "black"}
    niche_norm = (data.niche or "").strip().lower()
    # Migração: "casa" antigo agora é "semi-novos"
    if niche_norm == "casa":
        niche_norm = "semi-novos"
    if niche_norm not in NICHES_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Nicho inválido. Use um dos: {', '.join(sorted(NICHES_VALIDOS))}",
        )

    ad = {
        "ad_id": f"ad_{uuid.uuid4().hex[:12]}",
        "seller_id": data.seller_id,
        "title": data.title[:120],
        "description": data.description[:2000],
        "price_full": float(data.price_full),
        "niche": niche_norm,
        "category": data.category,
        "ad_tier": requested_tier,
        "images": [img for img in (data.images or []) if isinstance(img, str)][:6],
        "stock": max(int(data.stock or 1), 1),
        "active": True,
        "verified": actor_role != "diamond_publisher",  # apenas staff = oficial/verificado
        "posted_by_role": actor_role,
        "posted_by_email": actor_email,
        "created_at": datetime.now(timezone.utc),
    }
    await db.ads.insert_one(ad.copy())
    ad.pop("_id", None)
    return ad


@api_router.post("/admin/members/{member_id}/grant-publisher")
async def admin_grant_publisher(member_id: str, staff: dict = Depends(require_staff)):
    """Concede permissão de publicar anúncios a um membro Diamond/Gold confiável.
    O membro só pode publicar no próprio tier ou inferior."""
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "name": 1, "tier": 1, "email": 1})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    await db.members.update_one(
        {"member_id": member_id},
        {"$set": {"can_post_ads": True}},
    )
    await _audit_log(staff, "member_grant_publisher", target_email=m.get("email"), target_user_id=member_id,
                    details={"name": m.get("name"), "tier": m.get("tier")})
    return {"ok": True, "member_id": member_id, "can_post_ads": True}


@api_router.post("/admin/members/{member_id}/revoke-publisher")
async def admin_revoke_publisher(member_id: str, staff: dict = Depends(require_staff)):
    """Revoga permissão de publicar anúncios."""
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "name": 1, "tier": 1, "email": 1})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    await db.members.update_one(
        {"member_id": member_id},
        {"$set": {"can_post_ads": False}},
    )
    await _audit_log(staff, "member_revoke_publisher", target_email=m.get("email"), target_user_id=member_id,
                    details={"name": m.get("name"), "tier": m.get("tier")})
    return {"ok": True, "member_id": member_id, "can_post_ads": False}


@api_router.get("/admin/members/publishers")
async def admin_list_publishers(staff: dict = Depends(require_staff)):
    """Lista todos os membros com permissão de publicar anúncios."""
    out = []
    async for m in db.members.find(
        {"can_post_ads": True},
        {"_id": 0, "member_id": 1, "name": 1, "nickname": 1, "tier": 1, "email": 1, "city": 1, "state": 1, "avatar_base64": 1},
    ).sort("name", 1):
        out.append(m)
    return {"publishers": out, "count": len(out)}


@api_router.get("/members/{member_id}/can-post-ads")
async def member_can_post_ads(member_id: str):
    """Endpoint público (membro) — verifica se ele pode publicar anúncios."""
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "can_post_ads": 1, "tier": 1})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    return {
        "can_post_ads": bool(m.get("can_post_ads")),
        "tier": m.get("tier"),
    }


@api_router.delete("/admin/ads/clear")
async def admin_clear_ads(staff: dict = Depends(require_staff)):
    """
    Limpa todos os anúncios do marketplace (hard delete).
    Uso: reset completo do marketplace antes de curadoria oficial.
    """
    r = await db.ads.delete_many({})
    return {"ok": True, "deleted": r.deleted_count}


@api_router.delete("/ads/{ad_id}")
async def delete_ad(ad_id: str, seller_id: str, hard: bool = True, request: Request = None):
    """Exclui um anúncio.

    Permissão:
      - O próprio dono (seller_id == ad.seller_id) sempre pode excluir.
      - Staff JWT (admin/support/financeiro) pode excluir QUALQUER anúncio (moderação).

    Por padrão `hard=true` → exclusão permanente (remove do banco).
    Use `hard=false` para soft delete (apenas marca como inativo).
    """
    ad = await db.ads.find_one({"ad_id": ad_id})
    if not ad:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado")

    is_authorized = ad.get("seller_id") == seller_id
    moderator_email: Optional[str] = None
    # Permite staff JWT moderar (apagar anúncio de qualquer um)
    if not is_authorized and request is not None:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                payload = jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=[JWT_ALGORITHM])
                u = await db.users.find_one({"user_id": payload.get("sub")})
                if u and u.get("role") in ("admin", "support", "financeiro"):
                    is_authorized = True
                    moderator_email = u.get("email")
            except Exception:
                pass

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Você não pode excluir este anúncio")

    if hard:
        await db.ads.delete_one({"ad_id": ad_id})
        return {"ok": True, "deleted": True, "moderated_by": moderator_email}
    else:
        await db.ads.update_one({"ad_id": ad_id}, {"$set": {"active": False}})
        return {"ok": True, "deactivated": True, "moderated_by": moderator_email}


class AdUpdate(BaseModel):
    seller_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    price_full: Optional[float] = None
    niche: Optional[str] = None
    category: Optional[str] = None
    images: Optional[List[str]] = None
    stock: Optional[int] = None
    ad_tier: Optional[str] = None
    active: Optional[bool] = None


@api_router.put("/ads/{ad_id}")
async def update_ad(ad_id: str, data: AdUpdate, request: Request):
    """Atualiza um anúncio.

    Permissão:
      - O próprio dono (data.seller_id == ad.seller_id) pode editar.
      - Staff JWT (admin/support/financeiro) pode editar QUALQUER anúncio (moderação).
    """
    ad = await db.ads.find_one({"ad_id": ad_id})
    if not ad:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado")

    is_authorized = ad.get("seller_id") == data.seller_id
    if not is_authorized:
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            try:
                payload = jwt.decode(auth.split(" ", 1)[1], JWT_SECRET, algorithms=[JWT_ALGORITHM])
                u = await db.users.find_one({"user_id": payload.get("sub")})
                if u and u.get("role") in ("admin", "support", "financeiro"):
                    is_authorized = True
            except Exception:
                pass

    if not is_authorized:
        raise HTTPException(status_code=403, detail="Você não pode editar este anúncio")

    updates: Dict[str, Any] = {}
    if data.title is not None:
        updates["title"] = data.title.strip()[:120]
    if data.description is not None:
        updates["description"] = data.description.strip()[:2000]
    if data.price_full is not None:
        updates["price_full"] = float(data.price_full)
    if data.category is not None:
        updates["category"] = data.category
    if data.niche is not None:
        # Validação + migração casa → semi-novos
        NICHES_VALIDOS = {"tech", "performance", "beleza", "semi-novos", "lazer", "black"}
        n = (data.niche or "").strip().lower()
        if n == "casa":
            n = "semi-novos"
        if n and n in NICHES_VALIDOS:
            updates["niche"] = n
    if data.images is not None:
        updates["images"] = [img for img in data.images if isinstance(img, str)][:6]
    if data.stock is not None:
        updates["stock"] = max(int(data.stock), 0)
    if data.ad_tier is not None and data.ad_tier in ("silver", "gold", "diamond"):
        updates["ad_tier"] = data.ad_tier
    if data.active is not None:
        updates["active"] = bool(data.active)
    if updates:
        await db.ads.update_one({"ad_id": ad_id}, {"$set": updates})
    fresh = await db.ads.find_one({"ad_id": ad_id}, {"_id": 0})
    return fresh


@api_router.get("/ads/member/{member_id}")
async def ads_by_member(member_id: str, include_inactive: bool = False):
    query: Dict[str, Any] = {"seller_id": member_id}
    if not include_inactive:
        query["active"] = True
    cur = db.ads.find(query, {"_id": 0}).sort("created_at", -1)
    return await cur.to_list(length=100)


# ---------- WALLET (PYX TOKEN — PYX) ----------
# Moeda interna do clube. 1 PYX = 100 centavos (precisão total em int).
# Para retrocompatibilidade, manter campo legado "balance" (float, em PYX inteiros)
# e adicionar "balance_centavos" (int) como fonte de verdade a partir de agora.
# Cada membro recebe um "wallet_number" público no formato PYX-XXXXXXXX para
# transferências P2P.


def _gen_wallet_number() -> str:
    """Gera número público de carteira no formato PYX-XXXXXXXX (alfanumérico)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sem 0/O/1/I p/ evitar confusão
    return "PYX-" + "".join(random.choice(alphabet) for _ in range(8))


async def _assign_wallet_number(member_id: str) -> str:
    """Cria um wallet_number único e atribui à carteira."""
    for _ in range(20):
        wn = _gen_wallet_number()
        exists = await db.wallets.find_one({"wallet_number": wn}, {"_id": 1})
        if not exists:
            await db.wallets.update_one({"member_id": member_id}, {"$set": {"wallet_number": wn}})
            return wn
    # fallback (extremamente improvável)
    wn = _gen_wallet_number() + str(int(datetime.now(timezone.utc).timestamp()))[-3:]
    await db.wallets.update_one({"member_id": member_id}, {"$set": {"wallet_number": wn}})
    return wn


async def _wallet_get_or_create(member_id: str) -> dict:
    w = await db.wallets.find_one({"member_id": member_id}, {"_id": 0})
    if not w:
        w = {
            "member_id": member_id,
            "balance": 0.0,          # legado (PYX inteiros)
            "balance_centavos": 0,   # NOVO: fonte de verdade (centavos em int)
            "reserved_centavos": 0,  # NOVO: saldo travado (saldo devedor de pedidos pendentes)
            "escrow_in": 0.0,
            "escrow_out": 0.0,
            "created_at": datetime.now(timezone.utc),
        }
        await db.wallets.insert_one(w.copy())
        w.pop("_id", None)
    # Backfill lazy: garante que toda carteira tem balance_centavos coerente
    if "balance_centavos" not in w or w.get("balance_centavos") is None:
        cents = int(round(float(w.get("balance", 0.0)) * 100))
        await db.wallets.update_one({"member_id": member_id}, {"$set": {"balance_centavos": cents}})
        w["balance_centavos"] = cents
    # Backfill lazy: garante que toda carteira tem reserved_centavos
    if "reserved_centavos" not in w or w.get("reserved_centavos") is None:
        await db.wallets.update_one({"member_id": member_id}, {"$set": {"reserved_centavos": 0}})
        w["reserved_centavos"] = 0
    # Backfill lazy: garante que toda carteira tem um wallet_number
    if not w.get("wallet_number"):
        w["wallet_number"] = await _assign_wallet_number(member_id)
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
    amount: Optional[float] = None             # legado (PYX inteiros)
    amount_centavos: Optional[int] = None      # preferido (precisão total)


@api_router.post("/wallet/topup")
async def wallet_topup(data: TopupRequest, staff: dict = Depends(require_staff)):
    """Admin/Suporte/Financeiro creditam PYX manualmente (após pagamento externo validado).
    Aceita `amount_centavos` (int) ou `amount` (float em PYX). Mantém compatibilidade."""
    if data.amount_centavos is not None:
        cents = int(data.amount_centavos)
    elif data.amount is not None:
        cents = int(round(float(data.amount) * 100))
    else:
        raise HTTPException(status_code=400, detail="Informe amount ou amount_centavos")
    if cents <= 0 or cents > 100_000_000:  # limite 1M PYX por operação
        raise HTTPException(status_code=400, detail="Valor inválido")
    w = await _wallet_get_or_create(data.member_id)
    amt_float = cents / 100.0
    await db.wallets.update_one(
        {"member_id": data.member_id},
        {"$inc": {"balance": amt_float, "balance_centavos": cents}},
    )
    tx = {
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "type": "topup",
        "from_id": None,
        "to_id": data.member_id,
        "to_wallet": w.get("wallet_number"),
        "amount": amt_float,
        "amount_centavos": cents,
        "currency": "PYX",
        "status": "settled",
        "note": f"Crédito PYX (admin: {staff.get('email','')})",
        "created_at": datetime.now(timezone.utc),
    }
    await db.wallet_txs.insert_one(tx.copy())
    tx.pop("_id", None)
    return tx


# =============================================================================
# PIX MANUAL ORDERS — recarga via PIX com aprovação manual do suporte
# Fluxo:
#  1. Membro faz PIX para os dados fixos (BRLA Digital Ltda / Stark Bank)
#  2. Membro abre um pedido (POST /pyx/pix-orders) informando o valor pago
#  3. Pedido fica `pending` até suporte/admin aprovar (em /staff/pix-orders)
#  4. Aprovação credita PYX na carteira aplicando taxa de 1% (R$ 100 → 99 PYX)
# =============================================================================

# Dados fixos do PIX (ajustáveis depois, por enquanto hardcoded conforme cliente)
PIX_INFO: Dict[str, Any] = {
    "beneficiario": "NU PAGAMENTOS S.A - INSTITUIÇÃO DE PAGAMENTO",
    "cnpj_masked": "—",
    "instituicao": "NU PAGAMENTOS S.A.",
    "pix_key": "627c7ab6-f484-4148-8e78-1212e1ae7543",
    "pix_code": "00020126580014br.gov.bcb.pix0136627c7ab6-f484-4148-8e78-1212e1ae75435204000053039865802BR5910BLACKSCLUB6009SAO PAULO62070503***6304DE79",
    "fee_pct": 1.0,                # 1% de taxa de processamento
    "rate_brl_to_pyx": 1.0,        # 1 BRL = 1 PYX (antes da taxa)
    "min_brl": 10.0,
    "estimated_minutes": 10,
    "instructions": [
        "Faça o PIX no valor desejado para os dados acima.",
        "Após o pagamento, abra um pedido informando o valor pago.",
        "Nosso suporte analisa e libera o saldo em PYX.",
        "Comprovante é opcional — peça apenas se o suporte solicitar.",
    ],
}


def _pix_calc_pyx_centavos(amount_brl_centavos: int) -> int:
    """Aplica taxa de 1% sobre o valor BRL (em centavos) e devolve PYX em centavos.
    R$ 100,00 (10000 cent) → 9900 cent = 99,00 PYX."""
    if amount_brl_centavos <= 0:
        return 0
    fee = PIX_INFO["fee_pct"] / 100.0
    rate = PIX_INFO["rate_brl_to_pyx"]
    pyx_cents = int(round(amount_brl_centavos * rate * (1.0 - fee)))
    return max(0, pyx_cents)


class PixOrderCreate(BaseModel):
    member_id: str
    amount_brl_centavos: Optional[int] = None
    amount_brl: Optional[float] = None  # R$ em float (ex: 100.00)
    note: Optional[str] = None
    receipt_base64: Optional[str] = None  # data URI opcional


@api_router.get("/pyx/pix-info")
async def get_pix_info():
    """Devolve dados do PIX + instruções para a UI do membro."""
    return PIX_INFO


@api_router.post("/pyx/pix-orders")
async def pix_order_create(data: PixOrderCreate):
    """Membro abre pedido de recarga via PIX. Fica pending até aprovação do staff."""
    if data.amount_brl_centavos is not None:
        cents = int(data.amount_brl_centavos)
    elif data.amount_brl is not None:
        cents = int(round(float(data.amount_brl) * 100))
    else:
        raise HTTPException(status_code=400, detail="Informe amount_brl ou amount_brl_centavos")

    min_cents = int(round(PIX_INFO["min_brl"] * 100))
    if cents < min_cents:
        raise HTTPException(status_code=400, detail=f"Valor mínimo R$ {PIX_INFO['min_brl']:.2f}")
    if cents > 1_000_000_00:  # 1.000.000 BRL
        raise HTTPException(status_code=400, detail="Valor acima do limite por pedido")

    # Verifica membro
    m = await db.members.find_one({"member_id": data.member_id}, {"_id": 0, "name": 1, "nickname": 1, "tier": 1})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    pyx_cents = _pix_calc_pyx_centavos(cents)
    now = datetime.now(timezone.utc)
    order = {
        "order_id": f"pix_{uuid.uuid4().hex[:14]}",
        "member_id": data.member_id,
        "member_name": m.get("nickname") or m.get("name") or "Membro",
        "member_tier": m.get("tier"),
        "amount_brl_centavos": cents,
        "pyx_centavos": pyx_cents,
        "fee_pct": PIX_INFO["fee_pct"],
        "status": "pending",  # pending | approved | rejected | cancelled
        "note": (data.note or "").strip()[:500] or None,
        "receipt_base64": data.receipt_base64,
        "created_at": now,
        "updated_at": now,
    }
    await db.pix_orders.insert_one(order.copy())
    order.pop("_id", None)
    # Serializa datetimes
    if isinstance(order.get("created_at"), datetime):
        order["created_at"] = order["created_at"].isoformat()
    if isinstance(order.get("updated_at"), datetime):
        order["updated_at"] = order["updated_at"].isoformat()
    return order


@api_router.get("/pyx/pix-orders/me/{member_id}")
async def pix_orders_mine(member_id: str, limit: int = 50):
    """Lista pedidos PIX do próprio membro (mais recentes primeiro)."""
    cur = db.pix_orders.find({"member_id": member_id}, {"_id": 0, "receipt_base64": 0}).sort("created_at", -1).limit(int(limit))
    out: List[Dict[str, Any]] = []
    async for o in cur:
        if isinstance(o.get("created_at"), datetime):
            o["created_at"] = o["created_at"].isoformat()
        if isinstance(o.get("updated_at"), datetime):
            o["updated_at"] = o["updated_at"].isoformat()
        if isinstance(o.get("approved_at"), datetime):
            o["approved_at"] = o["approved_at"].isoformat()
        out.append(o)
    return {"orders": out}


@api_router.get("/pyx/pix-orders")
async def pix_orders_list(status: Optional[str] = None, limit: int = 100, staff: dict = Depends(require_staff)):
    """Listagem para staff/admin (autenticado via JWT). Use ?status=pending para filtrar."""
    q: Dict[str, Any] = {}
    if status:
        q["status"] = status
    cur = db.pix_orders.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
    out: List[Dict[str, Any]] = []
    async for o in cur:
        for k in ("created_at", "updated_at", "approved_at"):
            if isinstance(o.get(k), datetime):
                o[k] = o[k].isoformat()
        out.append(o)
    return {"orders": out}


@api_router.get("/pyx/pix-orders/stats")
async def pix_orders_stats(staff: dict = Depends(require_staff)):
    """Resumo p/ staff: contagens por status."""
    pending = await db.pix_orders.count_documents({"status": "pending"})
    approved = await db.pix_orders.count_documents({"status": "approved"})
    rejected = await db.pix_orders.count_documents({"status": "rejected"})
    return {"pending": pending, "approved": approved, "rejected": rejected}


class PixOrderActionBody(BaseModel):
    note: Optional[str] = None


@api_router.post("/pyx/pix-orders/{order_id}/approve")
async def pix_order_approve(order_id: str, body: PixOrderActionBody, staff: dict = Depends(require_staff)):
    """Staff/admin aprova o pedido — credita PYX na carteira do membro (com taxa de 1%)."""
    order = await db.pix_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if order.get("status") != "pending":
        return {"ok": True, "already": order.get("status"), "order": order}

    member_id = order["member_id"]
    pyx_cents = int(order.get("pyx_centavos") or 0)
    if pyx_cents <= 0:
        raise HTTPException(status_code=400, detail="Valor PYX inválido")

    w = await _wallet_get_or_create(member_id)
    tx_id = f"tx_{uuid.uuid4().hex[:12]}"
    now_ts = datetime.now(timezone.utc)
    upd = {
        "status": "approved",
        "approved_at": now_ts,
        "approved_by_id": staff.get("user_id"),
        "approved_by_email": staff.get("email"),
        "approval_note": (body.note or "").strip()[:300] or None,
        "tx_id": tx_id,
        "updated_at": now_ts,
    }
    # RESERVA o pedido atomicamente (pending → approved) ANTES de creditar.
    # Impede crédito DUPLICADO se dois staff aprovarem simultaneamente.
    claimed = await db.pix_orders.find_one_and_update(
        {"order_id": order_id, "status": "pending"},
        {"$set": upd},
    )
    if not claimed:
        fresh = await db.pix_orders.find_one({"order_id": order_id}, {"_id": 0})
        return {"ok": True, "already": (fresh or {}).get("status"), "order": fresh}

    pyx_float = pyx_cents / 100.0
    await db.wallets.update_one(
        {"member_id": member_id},
        {"$inc": {"balance": pyx_float, "balance_centavos": pyx_cents}},
    )

    tx = {
        "tx_id": tx_id,
        "type": "topup",
        "from_id": None,
        "to_id": member_id,
        "to_wallet": w.get("wallet_number"),
        "amount": pyx_float,
        "amount_centavos": pyx_cents,
        "currency": "PYX",
        "status": "settled",
        "note": f"Recarga PIX aprovada (pedido {order_id}) por {staff.get('email','')}",
        "created_at": now_ts,
        "ref_pix_order_id": order_id,
    }
    await db.wallet_txs.insert_one(tx.copy())

    out = {**order, **upd}
    for k in ("created_at", "updated_at", "approved_at"):
        if isinstance(out.get(k), datetime):
            out[k] = out[k].isoformat()
    return {"ok": True, "order": out}


@api_router.post("/pyx/pix-orders/{order_id}/reject")
async def pix_order_reject(order_id: str, body: PixOrderActionBody, staff: dict = Depends(require_staff)):
    """Staff/admin rejeita o pedido com motivo."""
    order = await db.pix_orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if order.get("status") != "pending":
        return {"ok": True, "already": order.get("status"), "order": order}
    now_ts = datetime.now(timezone.utc)
    upd = {
        "status": "rejected",
        "rejected_at": now_ts,
        "rejected_by_id": staff.get("user_id"),
        "rejected_by_email": staff.get("email"),
        "rejection_reason": (body.note or "").strip()[:300] or "Sem motivo informado",
        "updated_at": now_ts,
    }
    await db.pix_orders.update_one({"order_id": order_id}, {"$set": upd})
    out = {**order, **upd}
    for k in ("created_at", "updated_at", "rejected_at"):
        if isinstance(out.get(k), datetime):
            out[k] = out[k].isoformat()
    return {"ok": True, "order": out}


# =============================================================================
# STAFF TEAM MANAGEMENT — gestão das contas da equipe (apenas admin)
# Permite ao admin master:
#   - Listar contas da equipe (admin/support/financeiro)
#   - Criar nova conta de equipe
#   - Editar nome
#   - Trocar senha
#   - Ativar/desativar (login bloqueado quando inativo)
#   - Excluir conta
#   - Ver log de auditoria de todas as ações
# Toda ação grava em `staff_audit_log` para rastreabilidade.
# =============================================================================

VALID_TEAM_ROLES = ("admin", "support", "financeiro")


def _serialize_user(u: Dict[str, Any]) -> Dict[str, Any]:
    """Remove dados sensíveis e serializa datetimes."""
    out = {
        "user_id": u.get("user_id"),
        "email": u.get("email"),
        "name": u.get("name"),
        "role": u.get("role"),
        "active": u.get("active") is not False,  # default True
        "created_at": u.get("created_at"),
        "last_login_at": u.get("last_login_at"),
        "password_changed_at": u.get("password_changed_at"),
    }
    for k in ("created_at", "last_login_at", "password_changed_at"):
        if isinstance(out.get(k), datetime):
            out[k] = out[k].isoformat()
    return out


@api_router.get("/staff/team")
async def staff_team_list(admin: dict = Depends(require_admin)):
    """Lista todas as contas da equipe (admin/support/financeiro)."""
    out: List[Dict[str, Any]] = []
    async for u in db.users.find({"role": {"$in": list(VALID_TEAM_ROLES)}}, {"_id": 0, "password_hash": 0}):
        out.append(_serialize_user(u))
    out.sort(key=lambda x: (x.get("role") or "", x.get("created_at") or ""))
    return {"team": out}


class TeamCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str  # "admin" | "support" | "financeiro"


@api_router.post("/staff/team")
async def staff_team_create(data: TeamCreate, admin: dict = Depends(require_admin)):
    """Cria nova conta de equipe (apenas admin)."""
    if data.role not in VALID_TEAM_ROLES:
        raise HTTPException(status_code=400, detail=f"Papel inválido. Use: {', '.join(VALID_TEAM_ROLES)}")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Senha precisa ter pelo menos 8 caracteres")
    if len(data.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Nome muito curto")
    email = data.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="Já existe uma conta com este email")
    now_ts = datetime.now(timezone.utc)
    doc = {
        "user_id": f"user_{uuid.uuid4().hex[:12]}",
        "email": email,
        "name": data.name.strip(),
        "password_hash": hash_password(data.password),
        "role": data.role,
        "active": True,
        "created_at": now_ts,
        "created_by": admin.get("email"),
        "password_changed_at": now_ts,
    }
    await db.users.insert_one(doc.copy())
    await _audit_log(admin, "team_create", target_email=email, target_user_id=doc["user_id"],
                    details={"role": data.role, "name": data.name.strip()})
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return _serialize_user(doc)


class TeamUpdateName(BaseModel):
    name: str


@api_router.put("/staff/team/{user_id}")
async def staff_team_update_name(user_id: str, data: TeamUpdateName, admin: dict = Depends(require_admin)):
    """Atualiza o nome de uma conta da equipe."""
    if len(data.name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Nome muito curto")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "role": 1})
    if not target or target.get("role") not in VALID_TEAM_ROLES:
        raise HTTPException(status_code=404, detail="Conta de equipe não encontrada")
    new_name = data.name.strip()
    await db.users.update_one({"user_id": user_id}, {"$set": {"name": new_name}})
    await _audit_log(admin, "team_update_name", target_email=target.get("email"), target_user_id=user_id,
                    details={"new_name": new_name})
    return {"ok": True, "name": new_name}


class TeamPasswordChange(BaseModel):
    new_password: str


@api_router.post("/staff/team/{user_id}/password")
async def staff_team_change_password(user_id: str, data: TeamPasswordChange, admin: dict = Depends(require_admin)):
    """Troca a senha de uma conta da equipe (admin master)."""
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Senha precisa ter pelo menos 8 caracteres")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "role": 1})
    if not target or target.get("role") not in VALID_TEAM_ROLES:
        raise HTTPException(status_code=404, detail="Conta de equipe não encontrada")
    # A senha do MASTER é definida no .env do servidor e re-sincronizada a cada
    # startup (seed_admin) — trocar por aqui seria revertido no próximo deploy.
    master_email = (os.environ.get("ADMIN_EMAIL") or "guilherme925145000@gmail.com").strip().lower()
    if (target.get("email") or "").strip().lower() == master_email:
        raise HTTPException(
            status_code=400,
            detail="A senha do Administrador Master é definida no servidor (.env) e sincronizada automaticamente em todos os ambientes — não pode ser alterada por aqui.",
        )
    now_ts = datetime.now(timezone.utc)
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"password_hash": hash_password(data.new_password), "password_changed_at": now_ts}},
    )
    await _audit_log(admin, "team_password_change", target_email=target.get("email"), target_user_id=user_id)
    return {"ok": True, "password_changed_at": now_ts.isoformat()}


class TeamSetActiveBody(BaseModel):
    active: bool


@api_router.post("/staff/team/{user_id}/set-active")
async def staff_team_set_active(user_id: str, body: TeamSetActiveBody, admin: dict = Depends(require_admin)):
    """Ativa/desativa conta. Conta inativa não consegue logar."""
    if user_id == admin.get("user_id"):
        raise HTTPException(status_code=400, detail="Você não pode desativar sua própria conta")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "role": 1, "active": 1})
    if not target or target.get("role") not in VALID_TEAM_ROLES:
        raise HTTPException(status_code=404, detail="Conta de equipe não encontrada")

    # Se desativar admin: garantir que pelo menos 1 admin ativo continua existindo
    if body.active is False and target.get("role") == "admin":
        active_admins = await db.users.count_documents({"role": "admin", "active": {"$ne": False}})
        # active_admins inclui o alvo (que está active no momento). Após desativar fica 1 a menos.
        if active_admins <= 1:
            raise HTTPException(status_code=400, detail="Mantenha ao menos 1 administrador ativo")

    await db.users.update_one({"user_id": user_id}, {"$set": {"active": bool(body.active)}})
    action = "team_activate" if body.active else "team_deactivate"
    await _audit_log(admin, action, target_email=target.get("email"), target_user_id=user_id)
    return {"ok": True, "active": bool(body.active)}


@api_router.delete("/staff/team/{user_id}")
async def staff_team_delete(user_id: str, admin: dict = Depends(require_admin)):
    """Exclui permanentemente conta de equipe."""
    if user_id == admin.get("user_id"):
        raise HTTPException(status_code=400, detail="Você não pode excluir sua própria conta")
    target = await db.users.find_one({"user_id": user_id}, {"_id": 0, "email": 1, "role": 1})
    if not target or target.get("role") not in VALID_TEAM_ROLES:
        raise HTTPException(status_code=404, detail="Conta de equipe não encontrada")

    # Garantir pelo menos 1 admin
    if target.get("role") == "admin":
        admin_count = await db.users.count_documents({"role": "admin"})
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Mantenha ao menos 1 administrador no sistema")

    await db.users.delete_one({"user_id": user_id})
    await _audit_log(admin, "team_delete", target_email=target.get("email"), target_user_id=user_id,
                    details={"role": target.get("role")})
    return {"ok": True, "deleted_user_id": user_id}


@api_router.get("/staff/team/audit-log")
async def staff_team_audit_log(limit: int = 100, admin: dict = Depends(require_admin)):
    """Retorna log de auditoria de ações da equipe (mais recentes primeiro)."""
    cur = db.staff_audit_log.find({}, {"_id": 0}).sort("timestamp", -1).limit(int(limit))
    out: List[Dict[str, Any]] = []
    async for e in cur:
        if isinstance(e.get("timestamp"), datetime):
            e["timestamp"] = e["timestamp"].isoformat()
        out.append(e)
    return {"entries": out}


# =============================================================================


class WithdrawRequest(BaseModel):
    member_id: str
    amount: float
    pix_key: Optional[str] = None


@api_router.post("/wallet/withdraw")
async def wallet_withdraw(data: WithdrawRequest, staff: dict = Depends(require_staff)):
    """Apenas staff pode debitar saldo (ajuste administrativo)."""
    await _wallet_get_or_create(data.member_id)
    amt_cents = int(round(float(data.amount) * 100))
    if amt_cents <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    amt_float = amt_cents / 100.0
    # Débito ATÔMICO e condicional na fonte de verdade (balance_centavos).
    # Só debita se houver saldo suficiente — evita saldo negativo e corrida.
    debited = await db.wallets.find_one_and_update(
        {"member_id": data.member_id, "balance_centavos": {"$gte": amt_cents}},
        {"$inc": {"balance_centavos": -amt_cents, "balance": -amt_float}},
    )
    if not debited:
        raise HTTPException(status_code=400, detail="Saldo insuficiente")
    tx = {
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "type": "withdraw",
        "from_id": data.member_id,
        "to_id": None,
        "amount": amt_float,
        "amount_centavos": amt_cents,
        "currency": "PYX",
        "status": "settled",
        "note": f"Débito BLACK COINS (admin: {staff.get('email','')})",
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
    final_cents = int(round(final * 100))
    wb = await _wallet_get_or_create(data.buyer_id)
    if int(wb.get("balance_centavos") or 0) < final_cents:
        raise HTTPException(status_code=400, detail=f"Saldo PYX insuficiente. Você precisa de {final:.2f} PYX.")
    await _wallet_get_or_create(seller_id)
    # move buyer balance -> escrow_out ; seller escrow_in
    await db.wallets.update_one(
        {"member_id": data.buyer_id},
        {"$inc": {"balance": -final, "balance_centavos": -final_cents, "escrow_out": final}},
    )
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
        "amount_centavos": final_cents,
        "currency": "PYX",
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
    amt_cents = int(tx.get("amount_centavos") or round(float(amt) * 100))
    await db.wallets.update_one({"member_id": tx["from_id"]}, {"$inc": {"escrow_out": -amt}})
    await db.wallets.update_one(
        {"member_id": tx["to_id"]},
        {"$inc": {"escrow_in": -amt, "balance": amt, "balance_centavos": amt_cents}},
    )
    await db.wallet_txs.update_one({"tx_id": tx_id}, {"$set": {"status": "settled", "settled_at": datetime.now(timezone.utc)}})
    return {"ok": True}


@api_router.post("/pyx/orders/{tx_id}/mark-shipped")
async def pyx_orders_mark_shipped(tx_id: str, body: dict):
    """O VENDEDOR marca o pedido como entregue (estado intermediário).
    Não libera o pagamento — apenas sinaliza que enviou.
    O comprador ainda precisa confirmar o recebimento para liberar o escrow."""
    seller_id = (body or {}).get("seller_id")
    if not seller_id:
        raise HTTPException(status_code=400, detail="seller_id obrigatório")
    tx = await db.wallet_txs.find_one({"tx_id": tx_id})
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    if tx.get("type") != "escrow":
        raise HTTPException(status_code=400, detail="Operação válida apenas para transações em escrow")
    if tx.get("to_id") != seller_id:
        raise HTTPException(status_code=403, detail="Apenas o vendedor pode marcar como entregue")
    if tx.get("status") != "escrow":
        raise HTTPException(status_code=400, detail="Transação não está mais em escrow")
    if tx.get("shipped_at"):
        return {"ok": True, "already_shipped": True, "shipped_at": tx["shipped_at"]}
    now = datetime.now(timezone.utc)
    await db.wallet_txs.update_one(
        {"tx_id": tx_id},
        {"$set": {"shipped_at": now, "shipped_by": seller_id}},
    )
    return {"ok": True, "shipped_at": now.isoformat()}


@api_router.post("/wallet/refund/{tx_id}")
async def wallet_refund(tx_id: str, body: dict):
    admin_request = bool(body.get("admin"))
    tx = await db.wallet_txs.find_one({"tx_id": tx_id})
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    if tx.get("status") != "escrow":
        raise HTTPException(status_code=400, detail="Transação já liberada")
    amt = tx["amount"]
    amt_cents = int(tx.get("amount_centavos") or round(float(amt) * 100))
    await db.wallets.update_one(
        {"member_id": tx["from_id"]},
        {"$inc": {"escrow_out": -amt, "balance": amt, "balance_centavos": amt_cents}},
    )
    await db.wallets.update_one({"member_id": tx["to_id"]}, {"$inc": {"escrow_in": -amt}})
    await db.wallet_txs.update_one({"tx_id": tx_id}, {"$set": {"status": "refunded", "settled_at": datetime.now(timezone.utc)}})
    return {"ok": True}


# ---------- FAVORITES (marketplace) ----------


class FavoriteToggle(BaseModel):
    member_id: str
    ad_id: str


@api_router.post("/favorites/toggle")
async def favorites_toggle(data: FavoriteToggle):
    """Adiciona/remove um anúncio dos favoritos do membro. Retorna novo estado."""
    key = {"member_id": data.member_id, "ad_id": data.ad_id}
    existing = await db.favorites.find_one(key, {"_id": 1})
    if existing:
        await db.favorites.delete_one(key)
        return {"favorited": False}
    await db.favorites.insert_one({**key, "created_at": datetime.now(timezone.utc)})
    return {"favorited": True}


@api_router.get("/favorites/{member_id}")
async def favorites_list(member_id: str):
    """Retorna todos os anúncios favoritados pelo membro (enriquecido)."""
    favs = await db.favorites.find({"member_id": member_id}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    ad_ids = [f["ad_id"] for f in favs]
    if not ad_ids:
        return []
    ads = await db.ads.find({"ad_id": {"$in": ad_ids}, "active": {"$ne": False}}, {"_id": 0}).to_list(length=200)
    ad_map = {a["ad_id"]: a for a in ads}
    out = []
    for f in favs:
        a = ad_map.get(f["ad_id"])
        if a:
            out.append(a)
    return out


@api_router.get("/favorites/{member_id}/ids")
async def favorites_ids(member_id: str):
    """Retorna apenas os ids favoritados (para pintar corações rapidamente)."""
    favs = await db.favorites.find({"member_id": member_id}, {"_id": 0, "ad_id": 1}).to_list(length=500)
    return [f["ad_id"] for f in favs]


# ---------- CART (marketplace) ----------


class CartItem(BaseModel):
    member_id: str
    ad_id: str  # item_id (ad_id or product_id)
    qty: int = 1
    item_type: str = "ad"  # "ad" (marketplace) or "product" (catalog)


@api_router.post("/cart/add")
async def cart_add(data: CartItem):
    """Adiciona um item ao carrinho (ou incrementa qty). Suporta 'ad' e 'product'."""
    item_type = data.item_type if data.item_type in ("ad", "product") else "ad"
    existing = await db.carts.find_one({
        "member_id": data.member_id,
        "ad_id": data.ad_id,
        "item_type": item_type,
    })
    # Fallback para compatibilidade com itens antigos sem item_type
    if not existing and item_type == "ad":
        existing = await db.carts.find_one({
            "member_id": data.member_id,
            "ad_id": data.ad_id,
            "item_type": {"$exists": False},
        })
    qty = max(int(data.qty or 1), 1)
    if existing:
        new_qty = int(existing.get("qty", 1)) + qty
        await db.carts.update_one(
            {"_id": existing["_id"]},
            {"$set": {"qty": new_qty, "item_type": item_type}},
        )
        return {"qty": new_qty}
    await db.carts.insert_one({
        "member_id": data.member_id,
        "ad_id": data.ad_id,
        "item_type": item_type,
        "qty": qty,
        "created_at": datetime.now(timezone.utc),
    })
    return {"qty": qty}


@api_router.post("/cart/update")
async def cart_update(data: CartItem):
    """Atualiza qty ou remove (qty<=0)."""
    if int(data.qty or 0) <= 0:
        await db.carts.delete_one({"member_id": data.member_id, "ad_id": data.ad_id})
        return {"removed": True}
    await db.carts.update_one(
        {"member_id": data.member_id, "ad_id": data.ad_id},
        {"$set": {"qty": int(data.qty)}},
        upsert=True,
    )
    return {"qty": int(data.qty)}


@api_router.delete("/cart/{member_id}/{ad_id}")
async def cart_remove(member_id: str, ad_id: str):
    await db.carts.delete_one({"member_id": member_id, "ad_id": ad_id})
    return {"ok": True}


@api_router.get("/cart/{member_id}")
async def cart_list(member_id: str):
    """Retorna carrinho agrupado por vendedor. Suporta ads (P2P) e produtos do catálogo."""
    items = await db.carts.find({"member_id": member_id}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    if not items:
        return {"items": [], "groups": [], "total_centavos": 0, "count": 0}

    # Separar por tipo
    ad_items = [i for i in items if i.get("item_type", "ad") == "ad"]
    product_items = [i for i in items if i.get("item_type") == "product"]

    ad_map: Dict[str, Any] = {}
    if ad_items:
        ad_ids = [i["ad_id"] for i in ad_items]
        ads_docs = await db.ads.find({"ad_id": {"$in": ad_ids}}, {"_id": 0}).to_list(length=200)
        ad_map = {a["ad_id"]: a for a in ads_docs}

    prod_map: Dict[str, Any] = {}
    if product_items:
        pids = [i["ad_id"] for i in product_items]
        prods = await db.products.find({"product_id": {"$in": pids}}, {"_id": 0}).to_list(length=200)
        prod_map = {p["product_id"]: p for p in prods}

    # Busca nomes de vendedores (para ads)
    seller_ids = list({a.get("seller_id") for a in ad_map.values() if a.get("seller_id")})
    sellers: Dict[str, Dict[str, Any]] = {}
    if seller_ids:
        async for m in db.members.find(
            {"member_id": {"$in": seller_ids}},
            {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "tier": 1, "avatar_base64": 1},
        ):
            sellers[m["member_id"]] = m

    # Tier discount do comprador (para catálogo)
    buyer = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1})
    buyer_tier = (buyer.get("tier") if buyer else "black").lower()
    TIER_DISC = {"silver": 0.05, "gold": 0.10, "diamond": 0.15}
    disc_pct = TIER_DISC.get(buyer_tier, 0.0)

    enriched: List[Dict[str, Any]] = []
    groups_map: Dict[str, Dict[str, Any]] = {}
    total_full_cents = 0

    for i in items:
        it_type = i.get("item_type", "ad")
        qty = int(i.get("qty", 1))

        if it_type == "product":
            p = prod_map.get(i["ad_id"])
            if not p:
                continue
            base_brl = float(p.get("member_price") or p.get("price") or 0)
            # Aplica desconto de tier
            final_brl = round(base_brl * (1 - disc_pct), 2)
            price_cents = int(round(final_brl * 100))
            subtotal_cents = price_cents * qty
            total_full_cents += subtotal_cents
            item = {
                "ad_id": p["product_id"],  # mantém chave padrão p/ frontend
                "item_type": "product",
                "title": p.get("name"),
                "image": p.get("image_url"),
                "category": p.get("category"),
                "price_full": final_brl,
                "price_full_centavos": price_cents,
                "qty": qty,
                "subtotal_centavos": subtotal_cents,
                "seller_id": "catalog",
                "seller_name": "Catálogo Oficial",
                "seller_tier": "official",
                "seller_avatar": None,
            }
            enriched.append(item)
            g = groups_map.setdefault("__catalog__", {
                "seller_id": "catalog",
                "seller_name": "Catálogo Oficial",
                "seller_avatar": None,
                "seller_tier": "official",
                "items": [],
                "subtotal_centavos": 0,
            })
            g["items"].append(item)
            g["subtotal_centavos"] += subtotal_cents
        else:
            a = ad_map.get(i["ad_id"])
            if not a:
                continue
            price = float(a.get("price_full", 0))
            subtotal_cents = int(round(price * 100)) * qty
            total_full_cents += subtotal_cents
            sid = a.get("seller_id")
            seller = sellers.get(sid or "", {})
            item = {
                "ad_id": a["ad_id"],
                "item_type": "ad",
                "title": a.get("title"),
                "image": (a.get("images") or [None])[0],
                "category": a.get("category"),
                "price_full": price,
                "price_full_centavos": int(round(price * 100)),
                "qty": qty,
                "subtotal_centavos": subtotal_cents,
                "seller_id": sid,
                "seller_name": seller.get("nickname") or seller.get("name"),
                "seller_tier": seller.get("tier", "black"),
                "seller_avatar": seller.get("avatar_base64"),
            }
            enriched.append(item)
            g = groups_map.setdefault(sid or "_", {
                "seller_id": sid,
                "seller_name": item["seller_name"],
                "seller_avatar": item["seller_avatar"],
                "seller_tier": item["seller_tier"],
                "items": [],
                "subtotal_centavos": 0,
            })
            g["items"].append(item)
            g["subtotal_centavos"] += subtotal_cents

    return {
        "items": enriched,
        "groups": list(groups_map.values()),
        "total_centavos": total_full_cents,
        "count": sum(i["qty"] for i in enriched),
    }


@api_router.post("/cart/checkout-pyx")
async def cart_checkout_pyx(data: dict):
    """
    Checkout unificado do carrinho usando PYX com pagamento parcelado.
    - pay_option define % de entrada debitada agora + desconto sobre o total.
    - Saldo devedor é TRAVADO em `reserved_centavos` do comprador (liberado na entrega).
    - Itens do Catálogo (item_type=product): entrada vai p/ admin, resto fica reservado.
    - Itens de Ads/Diamante (item_type=ad): entrada em escrow, resto fica reservado.

    Body: { member_id: str, pay_option: "full"|"half"|"entry" }
    """
    member_id = data.get("member_id")
    pay_option = data.get("pay_option") or "full"
    if not member_id:
        raise HTTPException(status_code=400, detail="member_id obrigatório")

    PAY = {
        "full":  {"entry_pct": 100, "disc_pct": 30},
        "half":  {"entry_pct": 50,  "disc_pct": 15},
        "entry": {"entry_pct": 10,  "disc_pct": 0},
    }
    cfg = PAY.get(pay_option, PAY["full"])

    # Pega o carrinho atual
    cart_resp = await cart_list(member_id)
    cart_items = cart_resp.get("items") or []
    if not cart_items:
        raise HTTPException(status_code=400, detail="Carrinho vazio")

    # Carregar tier para calcular desconto do catálogo
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1})
    tier = (m or {}).get("tier", "black").lower()
    TIER_DISCOUNT = {"silver": 0.05, "gold": 0.10, "diamond": 0.15}
    tier_disc = TIER_DISCOUNT.get(tier, 0.0)

    # Recalcula cada item aplicando tier (catálogo) + pay_option discount
    per_item_calc: List[Dict[str, Any]] = []
    total_cents = 0
    total_entry_cents = 0
    total_remaining_cents = 0
    for item in cart_items:
        qty = int(item.get("qty") or 1)
        full_cents_per_unit = int(item.get("price_full_centavos") or 0)
        it_type = item.get("item_type", "ad")
        if it_type == "product":
            # Catálogo: tier desc + pay desc
            unit = int(round(full_cents_per_unit * (1 - tier_disc) * (1 - cfg["disc_pct"] / 100)))
        else:
            # Ad: só pay desc
            unit = int(round(full_cents_per_unit * (100 - cfg["disc_pct"]) / 100))
        subtotal = unit * qty
        entry = int(round(subtotal * cfg["entry_pct"] / 100))
        remaining = subtotal - entry
        per_item_calc.append({
            **item,
            "unit_cents_final": unit,
            "subtotal_cents_final": subtotal,
            "entry_cents": entry,
            "remaining_cents": remaining,
        })
        total_cents += subtotal
        total_entry_cents += entry
        total_remaining_cents += remaining

    if total_cents <= 0:
        raise HTTPException(status_code=400, detail="Carrinho inválido")

    # Valida saldo TOTAL (precisa ter o valor todo para travar)
    wallet = await db.wallets.find_one({"member_id": member_id}, {"_id": 0})
    if not wallet:
        raise HTTPException(status_code=400, detail="Carteira PYX não encontrada")
    current_cents = int(wallet.get("balance_centavos") or 0)
    if current_cents < total_cents:
        faltante = (total_cents - current_cents) / 100.0
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INSUFFICIENT_PYX",
                "message": (
                    f"Saldo PYX insuficiente. Você precisa de {total_cents/100:.2f} PYX "
                    f"(faltam {faltante:.2f} PYX) para reservar o total da compra."
                ),
                "missing_centavos": total_cents - current_cents,
                "required_centavos": total_cents,
                "current_centavos": current_cents,
                "support_redirect": True,
            },
        )

    now = datetime.now(timezone.utc)
    orders_created: List[str] = []
    txs_created: List[str] = []

    # Debita de uma vez o total do disponível e trava o remaining total
    await db.wallets.update_one(
        {"member_id": member_id},
        {"$inc": {
            "balance": -(total_entry_cents / 100.0),
            "balance_centavos": -total_cents,
            "reserved_centavos": total_remaining_cents,
        }},
    )

    # Processa cada item criando tx e order
    for item in per_item_calc:
        qty = int(item.get("qty") or 1)
        subtotal = int(item["subtotal_cents_final"])
        entry_cents = int(item["entry_cents"])
        remaining_cents = int(item["remaining_cents"])
        it_type = item.get("item_type", "ad")

        if it_type == "product":
            # Catálogo: entrada vai para catalog_admin
            pid = item["ad_id"]
            amt_float = entry_cents / 100.0
            tx_id = f"tx_{uuid.uuid4().hex[:10]}"
            await db.wallet_txs.insert_one({
                "tx_id": tx_id, "from_id": member_id, "to_id": "catalog_admin",
                "amount": amt_float, "amount_centavos": entry_cents,
                "type": "purchase", "status": "settled",
                "description": (
                    f"Compra catálogo: {item.get('title')} x{qty} · "
                    f"entrada {cfg['entry_pct']}%"
                ),
                "product_id": pid, "pay_option": pay_option,
                "created_at": now, "settled_at": now,
            })
            order_id = f"ord_{uuid.uuid4().hex[:10]}"
            status = "settled" if remaining_cents == 0 else "awaiting_delivery_payment"
            await db.orders.insert_one({
                "order_id": order_id, "member_id": member_id, "product_id": pid,
                "seller_id": "catalog_admin",
                "product_name": item.get("title"), "quantity": qty,
                "unit_cents": int(item["unit_cents_final"]),
                "total_cents": subtotal,
                "entry_cents": entry_cents, "remaining_cents": remaining_cents,
                "reserved_on_buyer_cents": remaining_cents,
                "tier_discount": tier_disc, "pay_option": pay_option,
                "status": status, "channel": "cart_catalog",
                "tx_id": tx_id, "created_at": now,
            })
            await db.products.update_one({"product_id": pid}, {"$inc": {"stock": -qty}})
            orders_created.append(order_id)
            txs_created.append(tx_id)
        else:
            # Ad Diamante: entrada em escrow
            ad_id = item["ad_id"]
            seller_id = item.get("seller_id")
            amt_float = entry_cents / 100.0
            await db.wallets.update_one(
                {"member_id": member_id},
                {"$inc": {"escrow_out": amt_float}},
            )
            if seller_id:
                await db.wallets.update_one(
                    {"member_id": seller_id},
                    {"$inc": {"escrow_in": amt_float}},
                )
            tx_id = f"tx_{uuid.uuid4().hex[:10]}"
            await db.wallet_txs.insert_one({
                "tx_id": tx_id, "from_id": member_id, "to_id": seller_id,
                "amount": amt_float, "amount_centavos": entry_cents,
                "type": "escrow", "status": "pending",
                "description": (
                    f"Reserva Diamante: {item.get('title')} x{qty} · "
                    f"entrada {cfg['entry_pct']}%"
                ),
                "ad_id": ad_id, "ad_title": item.get("title"),
                "pay_option": pay_option,
                "created_at": now,
            })
            order_id = f"ord_{uuid.uuid4().hex[:10]}"
            status = "in_escrow" if remaining_cents == 0 else "awaiting_delivery_payment"
            await db.orders.insert_one({
                "order_id": order_id, "member_id": member_id, "ad_id": ad_id,
                "seller_id": seller_id,
                "product_name": item.get("title"), "quantity": qty,
                "total_cents": subtotal,
                "entry_cents": entry_cents, "remaining_cents": remaining_cents,
                "reserved_on_buyer_cents": remaining_cents,
                "status": status, "channel": "cart_diamond",
                "pay_option": pay_option,
                "tx_id": tx_id, "created_at": now,
            })
            orders_created.append(order_id)
            txs_created.append(tx_id)

    # Esvazia o carrinho
    await db.carts.delete_many({"member_id": member_id})

    new_balance_cents = current_cents - total_cents
    return {
        "ok": True,
        "total_cents": total_cents,
        "entry_cents": total_entry_cents,
        "remaining_cents": total_remaining_cents,
        "reserved_on_buyer_cents": total_remaining_cents,
        "pay_option": pay_option,
        "orders": orders_created,
        "txs": txs_created,
        "new_balance_centavos": new_balance_cents,
        "message": (
            f"Compra concluída! {total_entry_cents/100:.2f} PYX debitados "
            f"({cfg['entry_pct']}% de entrada) · {len(orders_created)} pedidos."
            + (f" Saldo de {total_remaining_cents/100:.2f} PYX travado para a entrega."
               if total_remaining_cents > 0 else "")
        ),
    }


@api_router.delete("/cart/{member_id}")
async def cart_clear(member_id: str):
    await db.carts.delete_many({"member_id": member_id})
    return {"ok": True}


# ---------- ORDERS (entrega, cancelamento, listagens) ----------


async def _staff_or_admin(member_id: str) -> bool:
    """True se o member_id for staff/admin (catalog_admin ou staff account)."""
    if member_id == "catalog_admin":
        return True
    u = await db.users.find_one({"member_id": member_id}, {"_id": 0, "role": 1})
    if u and u.get("role") in ("admin", "staff", "master"):
        return True
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "is_admin": 1, "role": 1})
    if m and (m.get("is_admin") or m.get("role") in ("admin", "staff", "master")):
        return True
    return False


@api_router.post("/orders/{order_id}/deliver")
async def order_deliver(order_id: str, body: dict):
    """
    Marca pedido como ENTREGUE (vendedor ou admin/staff confirma).
    - Libera `remaining_cents` do `reserved_centavos` do comprador e paga o vendedor.
    - Para itens Diamante (escrow), libera a entrada do escrow para o vendedor também.
    Body: { actor_id: str }  # vendedor, catalog_admin ou admin/staff
    """
    actor_id = (body or {}).get("actor_id")
    if not actor_id:
        raise HTTPException(status_code=400, detail="actor_id obrigatório")

    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    # Status já final
    if order.get("status") in ("delivered_settled", "cancelled", "refunded", "settled"):
        return {"ok": True, "already_settled": True, "status": order.get("status")}

    seller_id = order.get("seller_id") or "catalog_admin"
    is_seller = actor_id == seller_id
    is_admin = await _staff_or_admin(actor_id)
    if not is_seller and not is_admin:
        raise HTTPException(status_code=403, detail="Apenas vendedor ou admin podem marcar como entregue")

    buyer_id = order["member_id"]
    remaining = int(order.get("remaining_cents") or 0)
    entry = int(order.get("entry_cents") or order.get("total_cents") or 0)
    channel = order.get("channel", "")
    now = datetime.now(timezone.utc)

    # 1) Libera saldo devedor: tira de reserved do comprador, credita no vendedor/catálogo
    if remaining > 0:
        await db.wallets.update_one(
            {"member_id": buyer_id},
            {"$inc": {"reserved_centavos": -remaining}},
        )
        if seller_id and seller_id != "catalog_admin":
            await db.wallets.update_one(
                {"member_id": seller_id},
                {"$inc": {"balance": remaining / 100.0, "balance_centavos": remaining}},
            )
        # Registra tx de liquidação do saldo devedor
        tx_settle = f"tx_{uuid.uuid4().hex[:10]}"
        await db.wallet_txs.insert_one({
            "tx_id": tx_settle, "from_id": buyer_id, "to_id": seller_id,
            "amount": remaining / 100.0, "amount_centavos": remaining,
            "type": "delivery_settle", "status": "settled",
            "description": f"Pagamento na entrega: {order.get('product_name','Pedido')} · saldo devedor liberado",
            "order_id": order_id,
            "created_at": now, "settled_at": now,
        })

    # 2) Libera escrow da entrada (só para ad_direct/cart_diamond)
    if channel in ("ad_direct", "cart_diamond") and entry > 0:
        tx_id = order.get("tx_id")
        tx = await db.wallet_txs.find_one({"tx_id": tx_id}) if tx_id else None
        if tx and tx.get("status") == "pending":
            amt_f = entry / 100.0
            await db.wallets.update_one(
                {"member_id": buyer_id},
                {"$inc": {"escrow_out": -amt_f}},
            )
            await db.wallets.update_one(
                {"member_id": seller_id},
                {"$inc": {"escrow_in": -amt_f, "balance": amt_f, "balance_centavos": entry}},
            )
            await db.wallet_txs.update_one(
                {"tx_id": tx_id},
                {"$set": {"status": "settled", "settled_at": now}},
            )

    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "delivered_settled",
            "delivered_at": now,
            "delivered_by": actor_id,
        }},
    )
    return {"ok": True, "order_id": order_id, "status": "delivered_settled"}


@api_router.post("/orders/{order_id}/cancel")
async def order_cancel(order_id: str, body: dict):
    """
    Cancela pedido e devolve o saldo ao comprador.
    - Libera reserved_centavos do comprador para balance_centavos.
    - Reverte escrow (para ads) ou devolve entrada do catálogo.
    Body: { actor_id: str, reason?: str }  # comprador, vendedor ou admin
    """
    actor_id = (body or {}).get("actor_id")
    reason = (body or {}).get("reason") or "Cancelado"
    if not actor_id:
        raise HTTPException(status_code=400, detail="actor_id obrigatório")

    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if order.get("status") in ("delivered_settled", "cancelled", "refunded"):
        return {"ok": True, "already_final": True, "status": order.get("status")}

    buyer_id = order["member_id"]
    seller_id = order.get("seller_id") or "catalog_admin"
    is_buyer = actor_id == buyer_id
    is_seller = actor_id == seller_id
    is_admin = await _staff_or_admin(actor_id)
    if not (is_buyer or is_seller or is_admin):
        raise HTTPException(status_code=403, detail="Sem permissão para cancelar")

    remaining = int(order.get("remaining_cents") or 0)
    entry = int(order.get("entry_cents") or order.get("total_cents") or 0)
    channel = order.get("channel", "")
    now = datetime.now(timezone.utc)

    # 1) Devolve reserved → balance do comprador
    if remaining > 0:
        await db.wallets.update_one(
            {"member_id": buyer_id},
            {"$inc": {
                "reserved_centavos": -remaining,
                "balance": remaining / 100.0,
                "balance_centavos": remaining,
            }},
        )

    # 2) Devolve entrada ao comprador
    if entry > 0:
        if channel in ("ad_direct", "cart_diamond"):
            tx_id = order.get("tx_id")
            tx = await db.wallet_txs.find_one({"tx_id": tx_id}) if tx_id else None
            if tx and tx.get("status") == "pending":
                amt_f = entry / 100.0
                await db.wallets.update_one(
                    {"member_id": buyer_id},
                    {"$inc": {
                        "escrow_out": -amt_f,
                        "balance": amt_f,
                        "balance_centavos": entry,
                    }},
                )
                await db.wallets.update_one(
                    {"member_id": seller_id},
                    {"$inc": {"escrow_in": -amt_f}},
                )
                await db.wallet_txs.update_one(
                    {"tx_id": tx_id},
                    {"$set": {"status": "refunded", "settled_at": now}},
                )
        else:
            # Catálogo: devolve direto ao comprador
            await db.wallets.update_one(
                {"member_id": buyer_id},
                {"$inc": {
                    "balance": entry / 100.0,
                    "balance_centavos": entry,
                }},
            )
        # Registra tx de refund
        tx_refund = f"tx_{uuid.uuid4().hex[:10]}"
        await db.wallet_txs.insert_one({
            "tx_id": tx_refund, "from_id": seller_id, "to_id": buyer_id,
            "amount": entry / 100.0, "amount_centavos": entry,
            "type": "refund", "status": "settled",
            "description": f"Cancelamento: {order.get('product_name','Pedido')} · {reason}",
            "order_id": order_id,
            "created_at": now, "settled_at": now,
        })

    # 3) Devolve estoque (catálogo)
    if order.get("product_id"):
        await db.products.update_one(
            {"product_id": order["product_id"]},
            {"$inc": {"stock": int(order.get("quantity") or 1)}},
        )

    await db.orders.update_one(
        {"order_id": order_id},
        {"$set": {
            "status": "cancelled",
            "cancelled_at": now,
            "cancelled_by": actor_id,
            "cancel_reason": reason,
        }},
    )
    return {"ok": True, "order_id": order_id, "status": "cancelled"}


async def _enrich_order(o: Dict[str, Any]) -> Dict[str, Any]:
    """Normaliza/enriquece um documento de order para o frontend."""
    o.pop("_id", None)
    # Imagem
    image = None
    if o.get("ad_id"):
        ad = await db.ads.find_one({"ad_id": o["ad_id"]}, {"_id": 0, "images": 1})
        if ad and ad.get("images"):
            image = ad["images"][0]
    if not image and o.get("product_id"):
        p = await db.products.find_one({"product_id": o["product_id"]}, {"_id": 0, "image_base64": 1, "image": 1})
        if p:
            image = p.get("image_base64") or p.get("image")
    o["image"] = image
    # Info de contraparte
    seller_id = o.get("seller_id")
    buyer_id = o.get("member_id")
    if seller_id and seller_id != "catalog_admin":
        s = await db.members.find_one(
            {"member_id": seller_id},
            {"_id": 0, "name": 1, "nickname": 1, "tier": 1, "avatar_base64": 1},
        )
        if s:
            o["seller_name"] = s.get("nickname") or s.get("name")
            o["seller_tier"] = s.get("tier")
            o["seller_avatar"] = s.get("avatar_base64")
    else:
        o["seller_name"] = "BLACKS CLUB · Catálogo"
        o["seller_tier"] = "official"
    if buyer_id:
        b = await db.members.find_one(
            {"member_id": buyer_id},
            {"_id": 0, "name": 1, "nickname": 1, "tier": 1, "avatar_base64": 1},
        )
        if b:
            o["buyer_name"] = b.get("nickname") or b.get("name")
            o["buyer_tier"] = b.get("tier")
            o["buyer_avatar"] = b.get("avatar_base64")
    return o


@api_router.get("/orders/my-purchases/{member_id}")
async def orders_my_purchases(member_id: str, status: Optional[str] = None, limit: int = 100):
    """Lista compras do membro. Filtros opcionais por status."""
    q: Dict[str, Any] = {"member_id": member_id}
    if status:
        q["status"] = status
    cur = db.orders.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
    out: List[Dict[str, Any]] = []
    async for o in cur:
        out.append(await _enrich_order(o))
    # Agregados
    total_paid = sum(int(o.get("entry_cents") or 0) for o in out if o.get("status") not in ("cancelled", "refunded"))
    total_reserved = sum(int(o.get("reserved_on_buyer_cents") or o.get("remaining_cents") or 0)
                         for o in out if o.get("status") == "awaiting_delivery_payment")
    return {
        "orders": out,
        "count": len(out),
        "total_paid_centavos": total_paid,
        "total_reserved_centavos": total_reserved,
    }


@api_router.get("/orders/detail/{order_id}")
async def order_detail(order_id: str, member_id: Optional[str] = None):
    """Retorna detalhes enriquecidos de um pedido específico.
    Aceita tanto `order_id` (sistema novo `db.orders`) quanto `tx_id`
    (sistema escrow legado `db.wallet_txs`) como identificador."""
    # 1) Tenta sistema novo (db.orders)
    order = await db.orders.find_one({"order_id": order_id}, {"_id": 0})

    # 2) Fallback: trata como tx_id (escrow legado) — busca em wallet_txs
    if not order:
        tx_legacy = await db.wallet_txs.find_one({"tx_id": order_id, "type": "escrow"}, {"_id": 0})
        if tx_legacy:
            return await _build_legacy_escrow_detail(tx_legacy, member_id)
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    # Só o comprador, vendedor ou admin podem ver detalhes
    if member_id:
        is_buyer = order.get("member_id") == member_id
        is_seller = order.get("seller_id") == member_id
        is_admin = await _staff_or_admin(member_id)
        if not (is_buyer or is_seller or is_admin):
            raise HTTPException(status_code=403, detail="Sem permissão para ver este pedido")
    enriched = await _enrich_order(order)
    # Busca a tx associada
    tx = None
    if order.get("tx_id"):
        tx = await db.wallet_txs.find_one({"tx_id": order["tx_id"]}, {"_id": 0})
    # Timeline de eventos
    timeline = [{"event": "created", "label": "Pedido criado", "at": order.get("created_at")}]
    if order.get("delivered_at"):
        timeline.append({"event": "delivered", "label": "Entrega confirmada", "at": order["delivered_at"]})
    if order.get("cancelled_at"):
        timeline.append({"event": "cancelled", "label": f"Cancelado: {order.get('cancel_reason','')}", "at": order["cancelled_at"]})
    return {
        "order": enriched,
        "tx": tx,
        "timeline": timeline,
        "i_am_buyer": member_id and order.get("member_id") == member_id,
        "i_am_seller": member_id and order.get("seller_id") == member_id,
    }


async def _build_legacy_escrow_detail(tx: dict, member_id: Optional[str]) -> dict:
    """Constrói payload `/orders/detail` para wallet_tx escrow (sistema legado do PYX).
    Preserva o mesmo shape para o frontend renderizar a mesma UI."""
    # Permissão: só comprador/vendedor/admin
    if member_id:
        is_buyer = tx.get("from_id") == member_id
        is_seller = tx.get("to_id") == member_id
        is_admin = await _staff_or_admin(member_id)
        if not (is_buyer or is_seller or is_admin):
            raise HTTPException(status_code=403, detail="Sem permissão para ver este pedido")

    # Busca dados do anúncio
    ad_image = None
    if tx.get("ad_id"):
        ad = await db.ads.find_one({"ad_id": tx["ad_id"]}, {"_id": 0, "images": 1})
        if ad and ad.get("images"):
            ad_image = ad["images"][0]

    # Busca dados de comprador e vendedor
    buyer = await db.members.find_one({"member_id": tx.get("from_id")}, {"_id": 0, "name": 1, "nickname": 1, "tier": 1, "avatar_base64": 1}) or {}
    seller = await db.members.find_one({"member_id": tx.get("to_id")}, {"_id": 0, "name": 1, "nickname": 1, "tier": 1, "avatar_base64": 1}) or {}

    amount_cents = int(tx.get("amount_centavos") or round(float(tx.get("amount", 0)) * 100))
    status_raw = tx.get("status", "escrow")
    # Map para status do sistema novo (visualização consistente)
    status_view = status_raw
    if status_raw == "escrow":
        status_view = "delivered_pending" if tx.get("shipped_at") else "awaiting_delivery"
    elif status_raw == "settled":
        status_view = "settled"
    elif status_raw == "refunded":
        status_view = "refunded"

    order_view = {
        "order_id": tx.get("tx_id"),  # usa tx_id como id
        "tx_id": tx.get("tx_id"),
        "member_id": tx.get("from_id"),
        "seller_id": tx.get("to_id"),
        "product_name": tx.get("ad_title") or "Anúncio",
        "image": ad_image,
        "quantity": 1,
        "total_cents": amount_cents,
        "entry_cents": amount_cents,
        "remaining_cents": 0,
        "pay_option": "full",
        "status": status_view,
        "channel": "ad_direct",
        "buyer_name": buyer.get("nickname") or buyer.get("name") or "Comprador",
        "buyer_tier": buyer.get("tier"),
        "buyer_avatar": buyer.get("avatar_base64"),
        "seller_name": seller.get("nickname") or seller.get("name") or "Vendedor",
        "seller_tier": seller.get("tier"),
        "seller_avatar": seller.get("avatar_base64"),
        "shipped_at": tx.get("shipped_at"),
    }

    # Timeline
    timeline = [{"event": "created", "label": "Pedido criado (escrow)", "at": tx.get("created_at")}]
    if tx.get("shipped_at"):
        timeline.append({"event": "shipped", "label": "Vendedor marcou como entregue", "at": tx.get("shipped_at")})
    if tx.get("settled_at") and status_raw == "settled":
        timeline.append({"event": "delivered", "label": "Comprador confirmou recebimento — saldo liberado", "at": tx.get("settled_at")})
    elif tx.get("settled_at") and status_raw == "refunded":
        timeline.append({"event": "cancelled", "label": "Reembolsado", "at": tx.get("settled_at")})

    return {
        "order": order_view,
        "tx": tx,
        "timeline": timeline,
        "i_am_buyer": bool(member_id and tx.get("from_id") == member_id),
        "i_am_seller": bool(member_id and tx.get("to_id") == member_id),
        "legacy_escrow": True,  # flag pro frontend saber que é wallet_tx legado
    }


@api_router.get("/orders/my-sales/{member_id}")
async def orders_my_sales(member_id: str, status: Optional[str] = None, limit: int = 100):
    """Lista vendas do vendedor com total recebido vs pendente."""
    q: Dict[str, Any] = {"seller_id": member_id}
    if status:
        q["status"] = status
    cur = db.orders.find(q, {"_id": 0}).sort("created_at", -1).limit(int(limit))
    out: List[Dict[str, Any]] = []
    async for o in cur:
        out.append(await _enrich_order(o))
    # Agregados
    total_received = 0
    total_pending_delivery = 0  # a receber quando liberar saldo devedor
    total_in_escrow = 0         # entrada em custódia
    total_sold = 0
    for o in out:
        st = o.get("status")
        total_cents = int(o.get("total_cents") or 0)
        entry_cents = int(o.get("entry_cents") or total_cents)
        remaining = int(o.get("remaining_cents") or 0)
        if st == "delivered_settled":
            total_received += total_cents
            total_sold += total_cents
        elif st == "awaiting_delivery_payment":
            total_pending_delivery += remaining
            total_in_escrow += entry_cents
            total_sold += total_cents
        elif st == "in_escrow":
            total_in_escrow += entry_cents
            total_sold += total_cents
    return {
        "orders": out,
        "count": len(out),
        "total_sold_centavos": total_sold,
        "total_received_centavos": total_received,
        "total_pending_delivery_centavos": total_pending_delivery,
        "total_in_escrow_centavos": total_in_escrow,
    }


# ---------- PYX TOKEN (PYX) — P2P Transfer, Lookup, Extrato ----------
# Transferência instantânea entre membros usando saldo em centavos.


class PyxTransferRequest(BaseModel):
    from_member_id: str
    to_wallet: Optional[str] = None      # aceita PYX-XXXXXXXX
    to_member_id: Optional[str] = None   # ou direto por id interno
    amount_centavos: int                 # valor em centavos
    note: Optional[str] = None
    password: Optional[str] = None       # ETAPA 3: senha de login do remetente (obrigatória)


@api_router.get("/pyx/wallet/{member_id}")
async def pyx_get_wallet(member_id: str):
    """Retorna a carteira do membro garantindo wallet_number e balance_centavos."""
    w = await _wallet_get_or_create(member_id)
    bal = int(w.get("balance_centavos") or 0)
    res = int(w.get("reserved_centavos") or 0)
    # Normalizar resposta
    return {
        "member_id": w["member_id"],
        "wallet_number": w.get("wallet_number"),
        "balance_centavos": bal,
        "balance_pyx": round(bal / 100.0, 2),
        "reserved_centavos": res,
        "reserved_pyx": round(res / 100.0, 2),
        "total_centavos": bal + res,
        "total_pyx": round((bal + res) / 100.0, 2),
        "escrow_in_centavos": int(round(float(w.get("escrow_in", 0.0)) * 100)),
        "escrow_out_centavos": int(round(float(w.get("escrow_out", 0.0)) * 100)),
        "currency": "PYX",
    }


@api_router.get("/pyx/lookup")
async def pyx_lookup(q: str):
    """Busca destinatário por número de carteira (PYX-XXXX), email, telefone ou nome.
    Retorna uma pequena lista com no máximo 8 membros para UX de transferência."""
    q = (q or "").strip()
    if len(q) < 3:
        return []
    q_up = q.upper()
    # 1) Match exato por wallet_number
    if q_up.startswith("PYX-"):
        w = await db.wallets.find_one({"wallet_number": q_up}, {"_id": 0})
        if w:
            m = await db.members.find_one({"member_id": w["member_id"]}, {"_id": 0, "password_hash": 0})
            if m:
                return [{
                    "member_id": m["member_id"],
                    "name": m.get("name"),
                    "nickname": m.get("nickname"),
                    "tier": m.get("tier", "black"),
                    "avatar_base64": m.get("avatar_base64"),
                    "wallet_number": w.get("wallet_number"),
                }]
        return []
    # 2) Match por email/phone/nome (aproximado)
    import re as _re
    rx = _re.compile(_re.escape(q), _re.IGNORECASE)
    cur = db.members.find(
        {"$or": [
            {"email": {"$regex": rx}},
            {"phone": {"$regex": rx}},
            {"name": {"$regex": rx}},
            {"nickname": {"$regex": rx}},
        ]},
        {"_id": 0, "password_hash": 0},
    ).limit(8)
    results = []
    async for m in cur:
        w = await _wallet_get_or_create(m["member_id"])
        results.append({
            "member_id": m["member_id"],
            "name": m.get("name"),
            "nickname": m.get("nickname"),
            "tier": m.get("tier", "black"),
            "avatar_base64": m.get("avatar_base64"),
            "wallet_number": w.get("wallet_number"),
        })
    return results


@api_router.post("/pyx/transfer")
async def pyx_transfer(data: PyxTransferRequest):
    """Transferência P2P instantânea em PYX entre dois membros.
    Valor em centavos. Não exige escrow — liquidação imediata.
    Sujeito a limite mensal por tier (ver PYX_MONTHLY_TRANSFER_LIMITS_CENTAVOS).
    ETAPA 3: exige senha de login do remetente para autorizar a transferência."""
    amt = int(data.amount_centavos or 0)
    if amt <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido")
    if amt > 1_000_000_000:  # teto sanitário: 10M PYX por operação
        raise HTTPException(status_code=400, detail="Valor acima do permitido")

    # ===== VALIDAÇÃO DE SENHA (ETAPA 3 — corrigido para membros comuns) =====
    if not data.password:
        raise HTTPException(status_code=401, detail="Senha obrigatória para autorizar transferência")
    sender_member = await db.members.find_one(
        {"member_id": data.from_member_id},
        {"_id": 0, "user_id": 1, "email": 1, "password_hash": 1},
    )
    if not sender_member:
        raise HTTPException(status_code=404, detail="Remetente não encontrado")

    # A senha de login pode estar em DOIS lugares:
    #  1) members.password_hash  → membros comuns (fluxo /api/members/login)
    #  2) users.password_hash    → staff/admin (fluxo /api/auth/login)
    # Um mesmo e-mail pode ter ambos (ex.: admin com conta member também).
    # Aceitamos qualquer um dos dois hashes para autorizar a transferência.
    candidate_hashes: list[str] = []
    if sender_member.get("password_hash"):
        candidate_hashes.append(sender_member["password_hash"])

    sender_email = (sender_member.get("email") or "").lower().strip()
    sender_user = None
    if sender_member.get("user_id"):
        sender_user = await db.users.find_one(
            {"user_id": sender_member["user_id"]},
            {"_id": 0, "password_hash": 1},
        )
    if not sender_user and sender_email:
        sender_user = await db.users.find_one(
            {"email": sender_email},
            {"_id": 0, "password_hash": 1},
        )
    if sender_user and sender_user.get("password_hash"):
        candidate_hashes.append(sender_user["password_hash"])

    if not candidate_hashes:
        raise HTTPException(
            status_code=401,
            detail="Não foi possível validar sua senha. Entre em contato com o suporte.",
        )

    ok = False
    for h in candidate_hashes:
        try:
            if bcrypt.checkpw(data.password.encode(), h.encode()):
                ok = True
                break
        except Exception:
            continue
    if not ok:
        raise HTTPException(status_code=401, detail="Senha incorreta. Verifique e tente novamente.")

    # Resolve destinatário
    to_member_id: Optional[str] = data.to_member_id
    to_wallet: Optional[str] = (data.to_wallet or "").strip().upper() or None
    if not to_member_id and to_wallet:
        w = await db.wallets.find_one({"wallet_number": to_wallet}, {"_id": 0})
        if not w:
            raise HTTPException(status_code=404, detail="Carteira destinatária não encontrada")
        to_member_id = w["member_id"]
    if not to_member_id:
        raise HTTPException(status_code=400, detail="Informe o destinatário (to_wallet ou to_member_id)")
    if to_member_id == data.from_member_id:
        raise HTTPException(status_code=400, detail="Não é possível transferir para você mesmo")

    # Remetente e destinatário
    sender = await db.members.find_one({"member_id": data.from_member_id}, {"_id": 0, "password_hash": 0})
    recipient = await db.members.find_one({"member_id": to_member_id}, {"_id": 0, "password_hash": 0})
    if not sender:
        raise HTTPException(status_code=404, detail="Remetente não encontrado")
    if not recipient:
        raise HTTPException(status_code=404, detail="Destinatário não encontrado")

    # === Validação de LIMITE MENSAL POR TIER ===
    # Staff (admin/support/financeiro) não têm limite — identificados via users.role
    sender_role = None
    u = await db.users.find_one({"email": (sender.get("email") or "").lower()}, {"_id": 0, "role": 1})
    if u:
        sender_role = u.get("role")
    is_staff = sender_role in ("admin", "support", "financeiro")

    if not is_staff:
        sender_tier = (sender.get("tier") or "black").lower()
        monthly_limit = PYX_MONTHLY_TRANSFER_LIMITS_CENTAVOS.get(sender_tier, 0)
        if monthly_limit == 0:
            raise HTTPException(
                status_code=403,
                detail="Seu plano atual não permite transferências P2P. Faça upgrade para liberar este recurso."
            )
        # Soma transferências enviadas no mês corrente
        now_ref = datetime.now(timezone.utc)
        month_start = datetime(now_ref.year, now_ref.month, 1, tzinfo=timezone.utc)
        agg = db.wallet_txs.aggregate([
            {"$match": {
                "type": "transfer",
                "from_id": data.from_member_id,
                "status": "settled",
                "created_at": {"$gte": month_start},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount_centavos"}}},
        ])
        total_used = 0
        async for row in agg:
            total_used = int(row.get("total") or 0)
        if total_used + amt > monthly_limit:
            remaining = max(monthly_limit - total_used, 0)
            raise HTTPException(
                status_code=403,
                detail=(
                    f"Limite mensal de transferências excedido. "
                    f"Plano {sender_tier.upper()}: {monthly_limit/100:,.0f} PYX/mês · "
                    f"Disponível agora: {remaining/100:,.0f} PYX."
                ),
            )

    wf = await _wallet_get_or_create(data.from_member_id)
    wt = await _wallet_get_or_create(to_member_id)

    amt_float = amt / 100.0
    # Débito ATÔMICO e condicional — só debita se o saldo for suficiente.
    # Evita duplo gasto quando duas transferências chegam simultaneamente.
    debited = await db.wallets.find_one_and_update(
        {"member_id": data.from_member_id, "balance_centavos": {"$gte": amt}},
        {"$inc": {"balance": -amt_float, "balance_centavos": -amt}},
    )
    if not debited:
        raise HTTPException(status_code=400, detail="Saldo insuficiente")
    # Crédito
    await db.wallets.update_one(
        {"member_id": to_member_id},
        {"$inc": {"balance": amt_float, "balance_centavos": amt}},
    )
    now = datetime.now(timezone.utc)
    tx = {
        "tx_id": f"tx_{uuid.uuid4().hex[:12]}",
        "type": "transfer",
        "from_id": data.from_member_id,
        "from_name": sender.get("nickname") or sender.get("name"),
        "from_wallet": wf.get("wallet_number"),
        "to_id": to_member_id,
        "to_name": recipient.get("nickname") or recipient.get("name"),
        "to_wallet": wt.get("wallet_number"),
        "amount": amt_float,
        "amount_centavos": amt,
        "currency": "PYX",
        "status": "settled",
        "note": (data.note or "").strip()[:140] or None,
        "created_at": now,
        "settled_at": now,
    }
    await db.wallet_txs.insert_one(tx.copy())
    tx.pop("_id", None)
    return tx


@api_router.get("/pyx/transfer/limits/{member_id}")
async def pyx_transfer_limits(member_id: str):
    """Retorna o limite mensal de transferência PYX do membro, quanto usado e restante.
    Staff (admin/support/financeiro) é retornado como ilimitado (-1)."""
    m = await db.members.find_one({"member_id": member_id}, {"_id": 0, "tier": 1, "email": 1})
    if not m:
        raise HTTPException(status_code=404, detail="Membro não encontrado")
    tier = (m.get("tier") or "black").lower()
    u = await db.users.find_one({"email": (m.get("email") or "").lower()}, {"_id": 0, "role": 1})
    role = (u or {}).get("role")
    is_staff = role in ("admin", "support", "financeiro")

    now_ref = datetime.now(timezone.utc)
    month_start = datetime(now_ref.year, now_ref.month, 1, tzinfo=timezone.utc)
    agg = db.wallet_txs.aggregate([
        {"$match": {
            "type": "transfer",
            "from_id": member_id,
            "status": "settled",
            "created_at": {"$gte": month_start},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount_centavos"}}},
    ])
    total_used = 0
    async for row in agg:
        total_used = int(row.get("total") or 0)

    if is_staff:
        return {
            "tier": tier, "role": role, "unlimited": True,
            "limit_centavos": -1, "used_centavos": total_used,
            "available_centavos": -1, "month_start": month_start.isoformat(),
        }
    monthly_limit = PYX_MONTHLY_TRANSFER_LIMITS_CENTAVOS.get(tier, 0)
    return {
        "tier": tier, "role": role, "unlimited": False,
        "limit_centavos": monthly_limit,
        "used_centavos": total_used,
        "available_centavos": max(monthly_limit - total_used, 0),
        "month_start": month_start.isoformat(),
    }


@api_router.get("/pyx/transactions/{member_id}")
async def pyx_transactions(member_id: str, limit: int = 50, skip: int = 0):
    """Extrato completo paginado do membro. Enriquece com info do contra-parte."""
    limit = max(1, min(int(limit or 50), 200))
    skip = max(0, int(skip or 0))
    cur = db.wallet_txs.find(
        {"$or": [{"from_id": member_id}, {"to_id": member_id}]},
        {"_id": 0},
    ).sort("created_at", -1).skip(skip).limit(limit)
    txs = await cur.to_list(length=limit)
    # Enriquecer nomes (caso transações antigas não tenham)
    other_ids = set()
    for t in txs:
        if t.get("from_id") and t.get("from_id") != member_id:
            other_ids.add(t["from_id"])
        if t.get("to_id") and t.get("to_id") != member_id:
            other_ids.add(t["to_id"])
    names_map: Dict[str, Dict[str, Any]] = {}
    if other_ids:
        async for m in db.members.find(
            {"member_id": {"$in": list(other_ids)}},
            {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "tier": 1},
        ):
            names_map[m["member_id"]] = {
                "name": m.get("nickname") or m.get("name"),
                "tier": m.get("tier", "black"),
            }
    for t in txs:
        t["amount_centavos"] = int(t.get("amount_centavos") or round(float(t.get("amount", 0)) * 100))
        if t.get("from_id") in names_map and not t.get("from_name"):
            t["from_name"] = names_map[t["from_id"]]["name"]
        if t.get("to_id") in names_map and not t.get("to_name"):
            t["to_name"] = names_map[t["to_id"]]["name"]
        # ETAPA BRT — anexa horário oficial de Brasília para tx novas
        t.update(brt_display_fields(t.get("created_at")))
    return txs


# ---------- ETAPA 4: RECEIPT (comprovante) ----------

@api_router.get("/pyx/receipt/{tx_id}")
async def pyx_receipt(tx_id: str, member_id: Optional[str] = None):
    """Retorna um comprovante detalhado de uma transação PYX.
    O `member_id` (query param) deve ser um dos envolvidos na transação
    (from_id ou to_id) — evita vazamento de dados de terceiros.
    """
    tx = await db.wallet_txs.find_one({"tx_id": tx_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")

    # Validação de acesso: quem consulta precisa ser parte da transação
    if member_id and member_id not in (tx.get("from_id"), tx.get("to_id")):
        # Staff pode ver qualquer comprovante — resolve user por user_id OU email
        m = await db.members.find_one(
            {"member_id": member_id},
            {"_id": 0, "user_id": 1, "email": 1},
        ) or {}
        u = None
        if m.get("user_id"):
            u = await db.users.find_one({"user_id": m["user_id"]}, {"_id": 0, "role": 1})
        if not u and m.get("email"):
            u = await db.users.find_one({"email": (m["email"] or "").lower()}, {"_id": 0, "role": 1})
        role = (u or {}).get("role")
        if role not in ("admin", "support", "financeiro"):
            raise HTTPException(status_code=403, detail="Você não faz parte desta transação")

    # Enriquecer nomes/tier/avatar
    async def _enrich(mid: Optional[str]) -> Dict[str, Any]:
        if not mid:
            return {}
        m = await db.members.find_one(
            {"member_id": mid},
            {"_id": 0, "member_id": 1, "name": 1, "nickname": 1, "tier": 1, "avatar_base64": 1},
        )
        return m or {}

    from_info = await _enrich(tx.get("from_id"))
    to_info = await _enrich(tx.get("to_id"))

    tx["amount_centavos"] = int(tx.get("amount_centavos") or round(float(tx.get("amount", 0)) * 100))
    tx["from_info"] = from_info
    tx["to_info"] = to_info
    # ETAPA BRT — anexa horário oficial de Brasília para tx novas
    tx.update(brt_display_fields(tx.get("created_at")))
    return tx


# ============================================================================
# PYX/USD RATE — cotação configurável pelo Master Admin
# ============================================================================
# O rate é armazenado como `pyx_per_usd_centavos` (int). Ex: 500 = 5,00 PYX/USD.
# USD = pyx_centavos / pyx_per_usd_centavos.
# Documento único em db.pyx_settings com _id="singleton".
# Histórico de alterações em db.pyx_rate_history para auditoria.

DEFAULT_PYX_PER_USD_CENTAVOS = 500  # 1 USD = 5,00 PYX (default inicial)


async def _get_pyx_rate_doc() -> Dict[str, Any]:
    doc = await db.pyx_settings.find_one({"_id": "singleton"}, {"_id": 0})
    if not doc:
        now = datetime.now(timezone.utc)
        doc = {
            "pyx_per_usd_centavos": DEFAULT_PYX_PER_USD_CENTAVOS,
            "updated_at": now,
            "updated_by": None,
            "updated_by_name": "sistema",
        }
        await db.pyx_settings.update_one(
            {"_id": "singleton"},
            {"$setOnInsert": {**doc, "_id": "singleton"}},
            upsert=True,
        )
    return doc


@api_router.get("/pyx/rate")
async def pyx_rate_get():
    """Público: qualquer membro logado pode consultar a cotação vigente + a imagem
    do banner financeiro (hero) para renderizar na home. Retornamos ambos no
    mesmo endpoint para que o PYXRateProvider revalide tudo em um único poll."""
    doc = await _get_pyx_rate_doc()
    rate_c = int(doc.get("pyx_per_usd_centavos") or DEFAULT_PYX_PER_USD_CENTAVOS)
    pyx_per_usd_display = f"{rate_c / 100:.2f}".replace(".", ",")
    return {
        "pyx_per_usd_centavos": rate_c,
        "pyx_per_usd": rate_c / 100,
        "pyx_per_usd_display": pyx_per_usd_display,
        "updated_at": doc.get("updated_at"),
        "updated_by_name": doc.get("updated_by_name"),
        # Finance hero banner: NÃO enviamos mais o base64 aqui (era ~450KB baixados
        # a cada poll de 30s, travando a web). Enviamos só a URL (leve) + uma versão.
        # A imagem base64 é buscada uma única vez via GET /pyx/finance-hero e
        # cacheada no cliente, revalidando só quando `finance_hero_updated_at` muda.
        "finance_hero_updated_at": (
            doc.get("finance_hero_updated_at").isoformat()
            if isinstance(doc.get("finance_hero_updated_at"), datetime)
            else (doc.get("finance_hero_updated_at") or "")
        ),
        "finance_hero_image_url": doc.get("finance_hero_image_url") or "",
    }


@api_router.get("/pyx/finance-hero")
async def pyx_finance_hero_get():
    """Imagem do painel financeiro (hero) da home — endpoint dedicado e cacheável.
    Separado do /pyx/rate para não trafegar o base64 pesado no poll de cotação."""
    doc = await _get_pyx_rate_doc()
    upd = doc.get("finance_hero_updated_at")
    return {
        "image_base64": doc.get("finance_hero_image_base64") or "",
        "image_url": doc.get("finance_hero_image_url") or "",
        "updated_at": upd.isoformat() if isinstance(upd, datetime) else (upd or ""),
    }


class FinanceHeroUpdate(BaseModel):
    image_base64: Optional[str] = None
    image_url: Optional[str] = None


@api_router.put("/admin/pyx/finance-hero")
async def admin_finance_hero_set(data: FinanceHeroUpdate, user: dict = Depends(require_admin)):
    """Admin only: atualiza a imagem de fundo do painel financeiro (hero) da home.
    Aceita base64 (upload) OU url. Passe strings vazias para limpar (volta ao SVG padrão)."""
    now = datetime.now(timezone.utc)
    update: Dict[str, Any] = {"updated_at": now, "finance_hero_updated_at": now}
    if data.image_base64 is not None:
        # aceita com ou sem prefixo data:image/...
        raw = data.image_base64.strip()
        if raw:
            if len(raw) > 2_500_000:  # ~1.8MB decoded
                raise HTTPException(status_code=413, detail="Imagem muito grande. Máximo ~2MB.")
            if not raw.startswith("data:") and not re.match(r"^[A-Za-z0-9+/=\n\r]+$", raw[:200] + "..."):
                # sanity — vamos aceitar mesmo assim, apenas cheque grosseira
                pass
            if not raw.startswith("data:"):
                raw = f"data:image/jpeg;base64,{raw}"
        update["finance_hero_image_base64"] = raw
    if data.image_url is not None:
        update["finance_hero_image_url"] = data.image_url.strip()
    await db.pyx_settings.update_one(
        {"_id": "singleton"}, {"$set": update, "$setOnInsert": {"_id": "singleton"}}, upsert=True,
    )
    try:
        await _audit_log(user, "finance_hero_update", details={
            "has_base64": bool(update.get("finance_hero_image_base64")),
            "has_url": bool(update.get("finance_hero_image_url")),
        })
    except Exception:
        pass
    return await pyx_rate_get()


class PyxRateUpdate(BaseModel):
    # Aceitamos qualquer um: centavos (int) OU valor decimal (float).
    # Ex: 500 (centavos) ou 5.0 (PYX por USD) ou 5,25 → 525.
    pyx_per_usd_centavos: Optional[int] = None
    pyx_per_usd: Optional[float] = None


@api_router.put("/pyx/rate")
async def pyx_rate_set(data: PyxRateUpdate, user: dict = Depends(require_admin)):
    """Admin only: atualiza a cotação PYX/USD."""
    if data.pyx_per_usd_centavos is not None:
        rate_c = int(data.pyx_per_usd_centavos)
    elif data.pyx_per_usd is not None:
        rate_c = int(round(float(data.pyx_per_usd) * 100))
    else:
        raise HTTPException(status_code=400, detail="Informe pyx_per_usd_centavos ou pyx_per_usd")
    if rate_c < 1:
        raise HTTPException(status_code=400, detail="Cotação inválida (mínimo 0,01 PYX/USD)")
    if rate_c > 10_000_000:  # 100.000,00 PYX/USD — sanidade
        raise HTTPException(status_code=400, detail="Cotação muito alta")

    now = datetime.now(timezone.utc)
    prev = await db.pyx_settings.find_one({"_id": "singleton"}, {"_id": 0, "pyx_per_usd_centavos": 1})
    prev_c = int((prev or {}).get("pyx_per_usd_centavos") or DEFAULT_PYX_PER_USD_CENTAVOS)

    await db.pyx_settings.update_one(
        {"_id": "singleton"},
        {"$set": {
            "pyx_per_usd_centavos": rate_c,
            "updated_at": now,
            "updated_by": user.get("user_id"),
            "updated_by_name": user.get("name") or user.get("email"),
        }},
        upsert=True,
    )
    await db.pyx_rate_history.insert_one({
        "history_id": f"prh_{uuid.uuid4().hex[:12]}",
        "prev_pyx_per_usd_centavos": prev_c,
        "new_pyx_per_usd_centavos": rate_c,
        "changed_at": now,
        "changed_by": user.get("user_id"),
        "changed_by_name": user.get("name") or user.get("email"),
    })
    try:
        await _audit_log(
            user, "pyx_rate_update",
            details={"prev": prev_c, "new": rate_c},
        )
    except Exception:
        pass
    return await pyx_rate_get()


@api_router.get("/pyx/rate/history")
async def pyx_rate_history(limit: int = 50, user: dict = Depends(require_admin)):
    """Admin only: histórico das alterações da cotação (auditoria)."""
    cur = db.pyx_rate_history.find({}, {"_id": 0}).sort("changed_at", -1).limit(min(200, max(1, limit)))
    return await cur.to_list(length=200)


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
    """Lista stories SEM as imagens base64 (leve). Usa /stories/{id}/image para a imagem."""
    now = datetime.now(timezone.utc)
    # Projeção exclui image_base64 para payload leve
    cur = db.stories.find(
        {"expires_at": {"$gt": now}},
        {"_id": 0, "image_base64": 0}
    ).sort("created_at", -1).limit(200)
    items = await cur.to_list(length=200)

    # Batch member lookup (evita N+1 queries)
    member_ids = list({s["member_id"] for s in items})
    member_map: Dict[str, Any] = {}
    if member_ids:
        cur_members = db.members.find(
            {"member_id": {"$in": member_ids}},
            {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "tier": 1, "avatar_base64": 1},
        )
        members_list = await cur_members.to_list(length=len(member_ids))
        member_map = {m["member_id"]: m for m in members_list}

    grouped: Dict[str, Any] = {}
    for s in items:
        mid = s["member_id"]
        if mid not in grouped:
            m = member_map.get(mid)
            grouped[mid] = {
                "member_id": mid,
                "nickname": (m or {}).get("nickname") or ((m or {}).get("name", "Membro").split(" ")[0] if m else "Membro"),
                "tier": (m or {}).get("tier", "silver"),
                "avatar_base64": (m or {}).get("avatar_base64"),
                "stories": [],
            }
        # Flag indicando se tem imagem (para UI mostrar loading adequado)
        s["has_image"] = bool(s.get("text") or True)  # backend knows it was filtered
        grouped[mid]["stories"].append(s)
    return list(grouped.values())


@api_router.get("/stories/{story_id}/image")
async def get_story_image(story_id: str):
    """Retorna apenas a imagem base64 de um story individual (sob demanda)."""
    s = await db.stories.find_one(
        {"story_id": story_id},
        {"_id": 0, "image_base64": 1, "text": 1}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Story não encontrado")
    return {"story_id": story_id, "image_base64": s.get("image_base64"), "text": s.get("text", "")}


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


@api_router.delete("/feed/posts/{post_id}")
async def delete_post(post_id: str, member_id: str):
    post = await db.posts.find_one({"post_id": post_id})
    if not post:
        raise HTTPException(status_code=404, detail="Post não encontrado")
    if post.get("member_id") != member_id:
        raise HTTPException(status_code=403, detail="Apenas o autor pode excluir")
    await db.posts.delete_one({"post_id": post_id})
    return {"ok": True}


@api_router.delete("/stories/{story_id}")
async def delete_story(story_id: str, member_id: str):
    story = await db.stories.find_one({"story_id": story_id})
    if not story:
        raise HTTPException(status_code=404, detail="Story não encontrado")
    if story.get("member_id") != member_id:
        raise HTTPException(status_code=403, detail="Apenas o autor pode excluir")
    await db.stories.delete_one({"story_id": story_id})
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
    """Aggregated notifications feed: new DMs, purchases, escrow updates, group invites, ads activity.
    Para membros que também são staff/admin (e-mail vinculado a um user com role admin/support/financeiro),
    inclui também eventos GLOBAIS da plataforma: novos pedidos PIX, vendas no marketplace,
    novos orçamentos e mensagens de suporte recebidas — para que o Master / equipe vejam tudo no sino.
    """
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=30)
    items: List[Dict[str, Any]] = []

    # Detecta se o membro é staff/admin (e-mail vinculado a users)
    me_member = await db.members.find_one({"member_id": member_id}, {"_id": 0, "email": 1})
    is_admin_member = False
    admin_role: Optional[str] = None
    if me_member and me_member.get("email"):
        u = await db.users.find_one({"email": me_member["email"]}, {"_id": 0, "role": 1})
        if u and u.get("role") in ("admin", "support", "financeiro"):
            is_admin_member = True
            admin_role = u.get("role")

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

    # Wallet transactions (escrow, settled, transfers)
    wx_cur = db.wallet_txs.find({"$or": [{"from_id": member_id}, {"to_id": member_id}], "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).limit(40)
    async for tx in wx_cur:
        iAmBuyer = tx.get("from_id") == member_id
        iAmSeller = tx.get("to_id") == member_id
        typ = tx.get("type")
        cents = int(tx.get("amount_centavos") or round(float(tx.get("amount", 0)) * 100))
        pyx_str = f"{cents // 100:,}".replace(",", ".") + f",{cents % 100:02d} PYX"
        if typ == "topup":
            items.append({"id": f"tx_{tx.get('tx_id')}", "type": "wallet", "title": "Crédito PYX recebido", "body": f"+{pyx_str} adicionados à sua carteira.", "route": "/(tabs)/wallet", "created_at": tx.get("created_at"), "icon": "add-circle", "color": "#4EE07F"})
        elif typ == "withdraw":
            items.append({"id": f"tx_{tx.get('tx_id')}", "type": "wallet", "title": "Débito PYX", "body": f"−{pyx_str} da sua carteira.", "route": "/(tabs)/wallet", "created_at": tx.get("created_at"), "icon": "arrow-down-circle", "color": "#F5C150"})
        elif typ == "transfer":
            if iAmBuyer:  # enviei
                items.append({"id": f"tx_{tx.get('tx_id')}", "type": "transfer", "title": "PYX enviado", "body": f"−{pyx_str} para {tx.get('to_name') or tx.get('to_wallet') or 'outro membro'}.", "route": "/pyx/history", "created_at": tx.get("created_at"), "icon": "arrow-up-circle", "color": "#F87171"})
            elif iAmSeller:  # recebi
                items.append({"id": f"tx_{tx.get('tx_id')}", "type": "transfer", "title": "PYX recebido", "body": f"+{pyx_str} de {tx.get('from_name') or tx.get('from_wallet') or 'outro membro'}.", "route": "/pyx/history", "created_at": tx.get("created_at"), "icon": "arrow-down-circle", "color": "#4EE07F"})
        elif typ == "escrow":
            status = tx.get("status")
            if iAmBuyer:
                if status == "escrow":
                    items.append({"id": f"tx_{tx.get('tx_id')}_b", "type": "order", "title": f"Compra efetuada: {tx.get('ad_title','Anúncio')}", "body": f"{pyx_str} em escrow. Confirme o recebimento quando chegar.", "route": "/pyx/orders", "created_at": tx.get("created_at"), "icon": "lock-closed", "color": "#F5C150"})
                elif status == "settled":
                    items.append({"id": f"tx_{tx.get('tx_id')}_b", "type": "order", "title": f"Compra liberada: {tx.get('ad_title','Anúncio')}", "body": f"Você confirmou o recebimento de {pyx_str}. Avalie o vendedor!", "route": "/pyx/orders", "created_at": tx.get("settled_at") or tx.get("created_at"), "icon": "checkmark-circle", "color": "#4EE07F"})
                elif status == "refunded":
                    items.append({"id": f"tx_{tx.get('tx_id')}_b", "type": "order", "title": f"Reembolso: {tx.get('ad_title','Anúncio')}", "body": f"{pyx_str} devolvidos à sua carteira.", "route": "/pyx/orders", "created_at": tx.get("settled_at") or tx.get("created_at"), "icon": "return-up-back", "color": "#AAA"})
            elif iAmSeller:
                if status == "escrow":
                    items.append({"id": f"tx_{tx.get('tx_id')}_s", "type": "sale", "title": f"Nova venda: {tx.get('ad_title','Anúncio')}", "body": f"{pyx_str} aguardando entrega. Combine com o comprador.", "route": "/pyx/orders", "created_at": tx.get("created_at"), "icon": "cash", "color": "#4EE07F"})
                elif status == "settled":
                    items.append({"id": f"tx_{tx.get('tx_id')}_s", "type": "sale", "title": f"Pagamento liberado: {tx.get('ad_title','Anúncio')}", "body": f"Comprador confirmou. +{pyx_str} na sua carteira.", "route": "/pyx/orders", "created_at": tx.get("settled_at") or tx.get("created_at"), "icon": "checkmark-done", "color": "#4EE07F"})

    # Group invites (custom groups where I'm invited)
    g_cur = db.groups.find({"is_custom": True, "invited_ids": member_id, "owner_id": {"$ne": member_id}, "created_at": {"$gte": since}}, {"_id": 0}).sort("created_at", -1).limit(10)
    async for g in g_cur:
        owner = await db.members.find_one({"member_id": g.get("owner_id")}, {"_id": 0, "nickname": 1, "name": 1})
        items.append({"id": f"g_{g.get('group_id')}", "type": "group", "title": f"{(owner or {}).get('nickname') or 'Alguém'} te convidou para o grupo '{g.get('name')}'", "body": g.get("description") or "Entre e interaja!", "route": f"/community/group/{g.get('group_id')}", "created_at": g.get("created_at"), "icon": "people", "color": g.get("color", "#D4AF37")})

    # ============== MINHAS RECARGAS PIX → PYX ==============
    # Mostra status (pending/approved/rejected) dos meus pedidos de recarga,
    # para o membro saber em tempo real se o crédito foi aprovado ou recusado.
    pix_my_cur = db.pix_orders.find(
        {"member_id": member_id, "created_at": {"$gte": since}},
        {"_id": 0}
    ).sort("created_at", -1).limit(20)
    async for p in pix_my_cur:
        cents_brl = int(p.get("amount_brl_centavos", 0))
        cents_pyx = int(p.get("pyx_centavos", 0))
        brl_str = f"R$ {cents_brl // 100:,}".replace(",", ".") + f",{cents_brl % 100:02d}"
        pyx_str = f"{cents_pyx // 100:,}".replace(",", ".") + f",{cents_pyx % 100:02d} PYX"
        status = p.get("status", "pending")
        # Para o item mais recente de cada status, usa created_at OU o timestamp da decisão
        # (approved_at / rejected_at) — assim a notificação "sobe" no feed quando muda.
        if status == "approved" and p.get("approved_at"):
            ts = p.get("approved_at")
            title = f"✅ Sua recarga foi APROVADA · {pyx_str}"
            body = f"PIX de {brl_str} confirmado · saldo já creditado na sua carteira"
            color = "#4EE07F"
            icon = "checkmark-circle"
        elif status == "rejected" and p.get("rejected_at"):
            ts = p.get("rejected_at")
            reason = (p.get("rejection_reason") or "").strip() or "Sem motivo informado"
            title = f"❌ Sua recarga foi REJEITADA · {brl_str}"
            body = f"Motivo: {reason[:90]}"
            color = "#F87171"
            icon = "close-circle"
        elif status == "pending":
            ts = p.get("created_at")
            title = f"⏳ Recarga PIX em análise · {brl_str}"
            body = "Aguarde aprovação do nosso time financeiro (até 24h úteis)"
            color = "#F5C150"
            icon = "time-outline"
        else:
            # Cancelado ou outro
            ts = p.get("updated_at") or p.get("created_at")
            title = f"Recarga PIX · {status} · {brl_str}"
            body = ""
            color = "#888"
            icon = "wallet"
        items.append({
            "id": f"my_pix_{p.get('order_id')}_{status}",
            "type": "my_pix",
            "title": title,
            "body": body,
            "route": "/wallet/topup",
            "created_at": ts,
            "icon": icon,
            "color": color,
        })

    # ============== ADMIN/STAFF FEED — eventos GLOBAIS da plataforma ==============
    # Quando o membro é staff/admin (e-mail vinculado a users.role), agregamos:
    #   • Pedidos PIX (todos novos — pendentes, aprovados, rejeitados)
    #   • Vendas no marketplace (escrow criado por qualquer membro)
    #   • Solicitações de orçamento (quotes pendentes)
    #   • Mensagens recebidas no suporte (chat staff)
    if is_admin_member:
        # 1) Pedidos PIX (todos pendentes — alta prioridade)
        pix_cur = db.pix_orders.find(
            {"created_at": {"$gte": since}}, {"_id": 0}
        ).sort("created_at", -1).limit(30)
        async for p in pix_cur:
            cents = int(p.get("amount_brl_centavos", 0))
            brl_str = f"R$ {cents // 100:,}".replace(",", ".") + f",{cents % 100:02d}"
            status = p.get("status", "pending")
            badge = {
                "pending": ("🔔 NOVO PEDIDO PIX", "#F5C150", "wallet"),
                "approved": ("Pedido PIX aprovado", "#4EE07F", "checkmark-circle"),
                "rejected": ("Pedido PIX rejeitado", "#F87171", "close-circle"),
                "cancelled": ("Pedido PIX cancelado", "#888", "ban"),
            }.get(status, (f"PIX · {status}", "#7FD7E5", "wallet"))
            items.append({
                "id": f"adm_pix_{p.get('order_id')}",
                "type": "admin_pix",
                "title": f"{badge[0]} — {p.get('member_name','Membro')}",
                "body": f"{brl_str} · {p.get('member_tier','?').upper()} · toque para revisar",
                "route": "/staff/pix-orders",
                "created_at": p.get("created_at"),
                "icon": badge[2],
                "color": badge[1],
            })

        # 2) Vendas no marketplace (escrow criado por qualquer membro)
        sales_cur = db.wallet_txs.find(
            {"type": "escrow", "status": "escrow", "created_at": {"$gte": since}},
            {"_id": 0}
        ).sort("created_at", -1).limit(30)
        async for s in sales_cur:
            cents = int(s.get("amount_centavos") or round(float(s.get("amount", 0)) * 100))
            pyx_str = f"{cents // 100:,}".replace(",", ".") + f",{cents % 100:02d} PYX"
            items.append({
                "id": f"adm_sale_{s.get('tx_id')}",
                "type": "admin_sale",
                "title": f"💰 Compra no marketplace · {s.get('ad_title','Anúncio')}",
                "body": f"{pyx_str} · {s.get('from_name','Comprador')} → {s.get('to_name','Vendedor')}",
                "route": "/staff/dashboard",
                "created_at": s.get("created_at"),
                "icon": "cart",
                "color": "#4EE07F",
            })

        # 3) Orçamentos solicitados (todos abertos)
        try:
            q_cur = db.quotes.find(
                {"created_at": {"$gte": since}}, {"_id": 0}
            ).sort("created_at", -1).limit(20)
            async for q in q_cur:
                items.append({
                    "id": f"adm_quote_{q.get('quote_id')}",
                    "type": "admin_quote",
                    "title": f"📋 Novo orçamento de {q.get('member_name','Membro')}",
                    "body": (q.get("message") or "")[:80] or "Solicitação de orçamento aberta.",
                    "route": "/staff/dashboard",
                    "created_at": q.get("created_at"),
                    "icon": "document-text",
                    "color": "#7FD7E5",
                })
        except Exception:
            pass

        # 4) Mensagens de suporte recebidas (chat de membros para staff)
        try:
            sup_cur = db.chat_messages.find(
                {"sender": "member", "created_at": {"$gte": since}}, {"_id": 0}
            ).sort("created_at", -1).limit(20)
            async for sm in sup_cur:
                items.append({
                    "id": f"adm_sup_{sm.get('message_id')}",
                    "type": "admin_support",
                    "title": f"💬 Suporte · {sm.get('sender_name','Membro')}",
                    "body": (sm.get("text") or "")[:80] or "(sem texto)",
                    "route": "/staff/inbox",
                    "created_at": sm.get("created_at"),
                    "icon": "headset",
                    "color": "#D4AF37",
                })
        except Exception:
            pass

    items.sort(key=lambda x: x.get("created_at") or now, reverse=True)
    # Serialize datetimes
    for it in items:
        if isinstance(it.get("created_at"), datetime):
            it["created_at"] = it["created_at"].isoformat()
    return items[:40]


@api_router.get("/notifications/{member_id}/count")
async def notifications_count(member_id: str):
    since = datetime.now(timezone.utc) - timedelta(days=7)
    # Mensagens não-lidas: DMs recebidas após o último read_at do membro nessa thread
    reads = {}
    async for r in db.dm_reads.find({"member_id": member_id}, {"_id": 0, "thread_id": 1, "last_read_at": 1}):
        reads[r["thread_id"]] = r["last_read_at"]
    dm_pipeline = [
        {"$match": {"to_id": member_id, "created_at": {"$gte": since}}},
        {"$group": {"_id": "$thread_id", "max_at": {"$max": "$created_at"}, "count": {"$sum": 1}}},
    ]
    dm_count = 0
    async for r in db.dm_messages.aggregate(dm_pipeline):
        # Conta como unread se a última msg dessa thread é mais recente que o read_at
        last_read = reads.get(r["_id"])
        if not last_read or r["max_at"] > last_read:
            # Conta APENAS as não-lidas, não o total da thread
            q = {"thread_id": r["_id"], "to_id": member_id, "created_at": {"$gte": since}}
            if last_read:
                q["created_at"] = {"$gt": last_read}
            dm_count += await db.dm_messages.count_documents(q)

    # Notificações (vendas, transferências, recargas): considera "lidas" tudo que
    # for anterior ao timestamp `notif_read_at` salvo no membro.
    member_doc = await db.members.find_one({"member_id": member_id}, {"_id": 0, "notif_read_at": 1})
    notif_read_at = (member_doc or {}).get("notif_read_at")
    sales_q: Dict[str, Any] = {
        "to_id": member_id,
        "type": {"$in": ["escrow", "transfer", "topup"]},
        "created_at": {"$gte": since},
    }
    if notif_read_at:
        # `created_at` precisa ser MAIS RECENTE que o último "lido"
        sales_q["created_at"] = {"$gt": notif_read_at}
    sales_count = await db.wallet_txs.count_documents(sales_q)

    # Conta meus pedidos PIX cuja decisão (approve/reject) ou criação ocorreu após o último "lido".
    # Garante que o membro veja imediatamente o status do crédito no sino.
    cutoff_my_pix = notif_read_at or since
    my_pix_count = 0
    try:
        my_pix_count = await db.pix_orders.count_documents({
            "member_id": member_id,
            "$or": [
                {"approved_at": {"$gt": cutoff_my_pix}},
                {"rejected_at": {"$gt": cutoff_my_pix}},
                {"created_at": {"$gt": cutoff_my_pix}, "status": "pending"},
            ],
        })
    except Exception:
        pass
    sales_count += my_pix_count

    # ===== Contagem de eventos ADMIN/STAFF (bell badge global) =====
    # Se o membro é admin/staff (e-mail vinculado a users), agrega contagens globais
    # de pendências críticas: pedidos PIX pendentes, vendas recentes (escrow), orçamentos abertos
    # e mensagens não lidas do chat de suporte.
    admin_count = 0
    admin_breakdown: Dict[str, int] = {"pix_pending": 0, "sales": 0, "quotes": 0, "support_msgs": 0}
    me_member = await db.members.find_one({"member_id": member_id}, {"_id": 0, "email": 1})
    is_admin_member = False
    if me_member and me_member.get("email"):
        u = await db.users.find_one({"email": me_member["email"]}, {"_id": 0, "role": 1})
        if u and u.get("role") in ("admin", "support", "financeiro"):
            is_admin_member = True
    if is_admin_member:
        cutoff = notif_read_at or since
        # 1) Pedidos PIX PENDENTES — todos (não importa quando foram criados, prioridade máxima)
        try:
            admin_breakdown["pix_pending"] = await db.pix_orders.count_documents({"status": "pending"})
        except Exception:
            pass
        # 2) Vendas (escrow criadas após cutoff)
        try:
            admin_breakdown["sales"] = await db.wallet_txs.count_documents(
                {"type": "escrow", "status": "escrow", "created_at": {"$gt": cutoff}}
            )
        except Exception:
            pass
        # 3) Orçamentos novos (abertos após cutoff)
        try:
            admin_breakdown["quotes"] = await db.quotes.count_documents(
                {"status": {"$in": ["open", "pending", None]}, "created_at": {"$gt": cutoff}}
            )
        except Exception:
            pass
        # 4) Mensagens de suporte recebidas após cutoff (membros → staff)
        try:
            admin_breakdown["support_msgs"] = await db.chat_messages.count_documents(
                {"sender": "member", "created_at": {"$gt": cutoff}}
            )
        except Exception:
            pass
        admin_count = sum(admin_breakdown.values())

    return {
        "count": dm_count + sales_count + admin_count,
        "messages": dm_count,
        "notifications": sales_count + admin_count,
        "admin_count": admin_count,
        "admin_breakdown": admin_breakdown,
        "is_admin_member": is_admin_member,
    }


@api_router.post("/community/dms/{me_id}/{other_id}/read")
async def dm_mark_read(me_id: str, other_id: str):
    """Marca a conversa como lida pelo membro até este momento."""
    tid = _dm_thread(me_id, other_id)
    now_ts = datetime.now(timezone.utc)
    await db.dm_reads.update_one(
        {"member_id": me_id, "thread_id": tid},
        {"$set": {"last_read_at": now_ts, "thread_id": tid, "member_id": me_id}},
        upsert=True,
    )
    return {"ok": True, "last_read_at": now_ts.isoformat()}


@api_router.post("/community/dms-mark-all-read/{member_id}")
async def dm_mark_all_read(member_id: str):
    """Marca TODAS as conversas (DMs) do membro como lidas — usado quando ele
    abre a aba de mensagens / o sino de chat ou o perfil. Limpa chat heads."""
    now_ts = datetime.now(timezone.utc)
    threads: set = set()
    # Threads onde foi destinatário (são as que geram não-lidas)
    async for r in db.dm_messages.find({"to_id": member_id}, {"_id": 0, "thread_id": 1}):
        if r.get("thread_id"):
            threads.add(r["thread_id"])
    bulk_count = 0
    for tid in threads:
        await db.dm_reads.update_one(
            {"member_id": member_id, "thread_id": tid},
            {"$set": {"last_read_at": now_ts, "thread_id": tid, "member_id": member_id}},
            upsert=True,
        )
        bulk_count += 1
    return {"ok": True, "threads_marked": bulk_count, "last_read_at": now_ts.isoformat()}


@api_router.post("/notifications/{member_id}/mark-read")
async def notifications_mark_read(member_id: str):
    """Marca todas as notificações (sino) como lidas — atualiza `notif_read_at` no membro."""
    now_ts = datetime.now(timezone.utc)
    await db.members.update_one(
        {"member_id": member_id},
        {"$set": {"notif_read_at": now_ts}},
    )
    return {"ok": True, "notif_read_at": now_ts.isoformat()}


@api_router.get("/chat/recent-senders/{member_id}")
async def chat_recent_senders(member_id: str):
    """Retorna remetentes únicos com DMs não-lidas (para o overlay de chat heads).
    Resultado: lista até 5, ordenada pela mensagem mais recente."""
    since = datetime.now(timezone.utc) - timedelta(days=7)
    # Lê last_read_at por thread
    reads = {}
    async for r in db.dm_reads.find({"member_id": member_id}, {"_id": 0, "thread_id": 1, "last_read_at": 1}):
        reads[r["thread_id"]] = r["last_read_at"]
    # Agrega últimas mensagens RECEBIDAS por sender
    pipeline = [
        {"$match": {"to_id": member_id, "created_at": {"$gte": since}}},
        {"$sort": {"created_at": -1}},
        {"$group": {
            "_id": "$from_id",
            "thread_id": {"$first": "$thread_id"},
            "last_at": {"$first": "$created_at"},
            "last_text": {"$first": "$text"},
            "count": {"$sum": 1},
        }},
        {"$sort": {"last_at": -1}},
        {"$limit": 10},
    ]
    senders = []
    async for r in db.dm_messages.aggregate(pipeline):
        last_read = reads.get(r["thread_id"])
        if last_read and r["last_at"] <= last_read:
            continue  # tudo já lido
        # Conta unread real
        q = {"thread_id": r["thread_id"], "to_id": member_id}
        if last_read:
            q["created_at"] = {"$gt": last_read}
        unread = await db.dm_messages.count_documents(q)
        if unread <= 0:
            continue
        # Pega dados do remetente
        sender = await db.members.find_one(
            {"member_id": r["_id"]},
            {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "avatar_base64": 1, "tier": 1},
        )
        if not sender:
            continue
        senders.append({
            "member_id": r["_id"],
            "name": sender.get("nickname") or sender.get("name") or "Membro",
            "avatar_base64": sender.get("avatar_base64"),
            "tier": sender.get("tier"),
            "last_at": r["last_at"].isoformat(),
            "last_text": (r.get("last_text") or "")[:80],
            "unread": unread,
        })
        if len(senders) >= 5:
            break
    return {"senders": senders}


# ---------- PYX ORDERS (escrow marketplace) ----------


@api_router.get("/pyx/orders/{member_id}")
async def pyx_orders(member_id: str, role: str = "all"):
    """Lista escrow transactions onde o membro é comprador ou vendedor.
    role=buyer | seller | all. Ordenado por data desc."""
    q: Dict[str, Any] = {"type": "escrow"}
    if role == "buyer":
        q["from_id"] = member_id
    elif role == "seller":
        q["to_id"] = member_id
    else:
        q["$or"] = [{"from_id": member_id}, {"to_id": member_id}]
    cur = db.wallet_txs.find(q, {"_id": 0}).sort("created_at", -1).limit(100)
    orders = await cur.to_list(length=100)
    # Enriquece com nomes e rating já dado pelo comprador (se houver)
    other_ids = set()
    tx_ids = []
    for t in orders:
        tx_ids.append(t.get("tx_id"))
        if t.get("from_id") != member_id and t.get("from_id"):
            other_ids.add(t["from_id"])
        if t.get("to_id") != member_id and t.get("to_id"):
            other_ids.add(t["to_id"])
    names_map: Dict[str, Dict[str, Any]] = {}
    if other_ids:
        async for m in db.members.find(
            {"member_id": {"$in": list(other_ids)}},
            {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "tier": 1, "avatar_base64": 1},
        ):
            names_map[m["member_id"]] = m
    # Verifica se há avaliação
    rated_tx_ids = set()
    if tx_ids:
        async for r in db.pyx_ratings.find({"tx_id": {"$in": tx_ids}, "rater_id": member_id}, {"_id": 0, "tx_id": 1}):
            rated_tx_ids.add(r["tx_id"])
    out = []
    for t in orders:
        t["amount_centavos"] = int(t.get("amount_centavos") or round(float(t.get("amount", 0)) * 100))
        t["i_am_buyer"] = t.get("from_id") == member_id
        t["i_am_seller"] = t.get("to_id") == member_id
        cp_id = t.get("to_id") if t["i_am_buyer"] else t.get("from_id")
        cp = names_map.get(cp_id or "", {})
        t["counterpart"] = {
            "member_id": cp_id,
            "name": cp.get("nickname") or cp.get("name"),
            "tier": cp.get("tier", "black"),
            "avatar_base64": cp.get("avatar_base64"),
        } if cp_id else None
        t["i_rated"] = t.get("tx_id") in rated_tx_ids
        # Busca primeira imagem do anúncio para preview
        if t.get("ad_id"):
            ad = await db.ads.find_one({"ad_id": t["ad_id"]}, {"_id": 0, "images": 1})
            if ad and ad.get("images"):
                t["ad_image"] = ad["images"][0]
        out.append(t)
    return out


# ---------- PYX RATINGS (avaliação do vendedor) ----------


class PyxRatingRequest(BaseModel):
    tx_id: str
    rater_id: str        # comprador
    rating: int          # 1..5
    comment: Optional[str] = None


@api_router.post("/pyx/ratings")
async def pyx_create_rating(data: PyxRatingRequest):
    if data.rating < 1 or data.rating > 5:
        raise HTTPException(status_code=400, detail="Avaliação deve ser entre 1 e 5")
    tx = await db.wallet_txs.find_one({"tx_id": data.tx_id}, {"_id": 0})
    if not tx or tx.get("type") != "escrow":
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    if tx.get("from_id") != data.rater_id:
        raise HTTPException(status_code=403, detail="Apenas o comprador pode avaliar")
    if tx.get("status") != "settled":
        raise HTTPException(status_code=400, detail="Só é possível avaliar após liberar o pagamento")
    # upsert (só pode avaliar 1x)
    existing = await db.pyx_ratings.find_one({"tx_id": data.tx_id, "rater_id": data.rater_id})
    if existing:
        raise HTTPException(status_code=400, detail="Você já avaliou esta compra")
    rating_doc = {
        "rating_id": f"r_{uuid.uuid4().hex[:12]}",
        "tx_id": data.tx_id,
        "rater_id": data.rater_id,
        "seller_id": tx.get("to_id"),
        "ad_id": tx.get("ad_id"),
        "ad_title": tx.get("ad_title"),
        "rating": int(data.rating),
        "comment": (data.comment or "").strip()[:500] or None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.pyx_ratings.insert_one(rating_doc.copy())
    rating_doc.pop("_id", None)
    return rating_doc


@api_router.get("/pyx/ratings/seller/{seller_id}")
async def pyx_seller_ratings(seller_id: str, limit: int = 50):
    """Retorna avaliações + média do vendedor."""
    cur = db.pyx_ratings.find({"seller_id": seller_id}, {"_id": 0}).sort("created_at", -1).limit(int(limit))
    ratings = await cur.to_list(length=int(limit))
    total = await db.pyx_ratings.count_documents({"seller_id": seller_id})
    avg = 0.0
    if total:
        pipeline = [
            {"$match": {"seller_id": seller_id}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating"}}},
        ]
        agg = await db.pyx_ratings.aggregate(pipeline).to_list(length=1)
        if agg:
            avg = round(float(agg[0].get("avg") or 0), 2)
    # Enriquece com nome do avaliador
    rater_ids = [r.get("rater_id") for r in ratings if r.get("rater_id")]
    raters: Dict[str, Dict[str, Any]] = {}
    if rater_ids:
        async for m in db.members.find({"member_id": {"$in": rater_ids}}, {"_id": 0, "member_id": 1, "nickname": 1, "name": 1, "avatar_base64": 1}):
            raters[m["member_id"]] = m
    for r in ratings:
        rr = raters.get(r.get("rater_id") or "", {})
        r["rater_name"] = rr.get("nickname") or rr.get("name") or "Membro"
        r["rater_avatar"] = rr.get("avatar_base64")
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = r["created_at"].isoformat()
    return {"count": total, "average": avg, "ratings": ratings}


# ---------- AI TRANSCRIPTION (Whisper) ----------


@api_router.post("/ai/transcribe")
async def ai_transcribe(payload: Dict[str, Any]):
    """Transcreve áudio em texto usando OpenAI Whisper.
    Body: { "audio_base64": "data:audio/webm;base64,...", "mime": "audio/webm" | opcional }.
    Retorna { "text": "...", "duration_seconds": float|None }.
    """
    if not openai_client:
        raise HTTPException(status_code=503, detail="Transcrição de áudio indisponível (OPENAI_API_KEY ausente)")
    audio_b64 = (payload or {}).get("audio_base64") or ""
    if not audio_b64 or len(audio_b64) < 100:
        raise HTTPException(status_code=400, detail="Áudio vazio ou muito curto")
    # Aceita data URL ou base64 puro
    if audio_b64.startswith("data:"):
        try:
            _, audio_b64 = audio_b64.split(",", 1)
        except Exception:
            raise HTTPException(status_code=400, detail="Formato de áudio inválido")
    import base64 as _b64
    try:
        raw = _b64.b64decode(audio_b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Base64 inválido")
    if not raw or len(raw) < 200:
        raise HTTPException(status_code=400, detail="Áudio vazio ou muito curto")
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Áudio excede 25 MB (limite do Whisper)")
    mime = (payload or {}).get("mime") or "audio/webm"
    ext = "webm"
    if "mp4" in mime or "m4a" in mime:
        ext = "m4a"
    elif "mp3" in mime:
        ext = "mp3"
    elif "wav" in mime:
        ext = "wav"
    elif "ogg" in mime:
        ext = "ogg"
    import io as _io
    bio = _io.BytesIO(raw)
    bio.name = f"audio.{ext}"
    try:
        # OpenAI Whisper (síncrono). Rodando em thread pool para não bloquear.
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: openai_client.audio.transcriptions.create(
                model="whisper-1",
                file=bio,
                language="pt",
                response_format="json",
            ),
        )
        text = getattr(result, "text", None) or (result.get("text") if isinstance(result, dict) else "")
        return {"text": (text or "").strip(), "mime": mime, "size_bytes": len(raw)}
    except Exception as e:
        logging.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail=f"Falha na transcrição: {str(e)[:200]}")


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
async def seed_marketplace(force: bool = False, admin: dict = Depends(require_admin)):
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
async def clear_seed_marketplace(admin: dict = Depends(require_admin)):
    r = await db.ads.delete_many({"is_seed": True})
    await db.members.delete_many({"is_fictional": True})
    return {"ok": True, "deleted_ads": r.deleted_count}


# CORS middleware foi MOVIDO para o topo do arquivo (logo após app = FastAPI())
# para melhor visibilidade, organização e para passar checagens de health
# do deployment agent (que escaneia o topo do arquivo).

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ============================================================
# PERFORMANCE CENTRAL — Goals / Entries / Insights
# ============================================================

GOAL_TYPES = ("weight", "financial", "habit", "behavior", "productivity", "fitness")
# Legacy "fitness" is kept as alias of "weight" for compatibility.
GOAL_DIRECTIONS = ("increase", "decrease")

GOAL_TYPE_COLORS = {
    "weight":       "#2ECC71",   # verde saúde
    "fitness":      "#2ECC71",   # alias
    "financial":    "#F5C150",   # dourado
    "habit":        "#5DADE2",   # azul
    "behavior":     "#A569BD",   # roxo
    "productivity": "#E67E22",   # laranja
}


class GoalCreate(BaseModel):
    member_id: str
    type: str  # weight | financial | habit | behavior | productivity
    title: str
    initial_value: Optional[float] = None   # baseline (peso/valor/score inicial)
    current_value: float                    # valor atual no momento da criação
    target_value: float                     # objetivo
    unit: str = ""
    start_date: Optional[str] = None
    end_date: str  # ISO (YYYY-MM-DD)
    color: Optional[str] = None             # hex override
    description: Optional[str] = ""
    motive: Optional[str] = ""
    photo_initial: Optional[str] = None     # base64 (data URI ou puro)


class GoalUpdate(BaseModel):
    title: Optional[str] = None
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    end_date: Optional[str] = None
    color: Optional[str] = None
    description: Optional[str] = None
    motive: Optional[str] = None
    photo_initial: Optional[str] = None


class GoalEntryCreate(BaseModel):
    value: float
    note: Optional[str] = ""
    date: Optional[str] = None
    mood: Optional[int] = None              # 1-5 (comportamento)
    photo_base64: Optional[str] = None      # foto de progresso (opcional)


def _parse_date(s: Optional[str]) -> datetime:
    if not s:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return datetime.utcnow()


def _compute_goal_snapshot(goal: dict, entries: List[dict]) -> dict:
    """Compute progress %, days elapsed/remaining, rhythm, forecast and history — por tipo."""
    try:
        gtype = goal.get("type", "weight")
        start = goal.get("start_date") or goal.get("created_at")
        start_dt = _parse_date(start) if isinstance(start, str) else (start or datetime.utcnow())
        end_dt = _parse_date(goal["end_date"]) if isinstance(goal["end_date"], str) else goal["end_date"]

        initial = float(goal.get("initial_value", goal.get("current_value", 0)) or 0)
        target = float(goal.get("target_value", 0) or 0)
        latest_entry = entries[-1] if entries else None
        stored_current = float(goal.get("current_value", initial) or initial)

        # --- TIME ---
        total_days = max(1, (end_dt - start_dt).days)
        now = datetime.utcnow()
        elapsed = max(0, min(total_days, (now - start_dt).days))
        days_remaining = max(0, (end_dt - now).days)
        time_pct = (elapsed / total_days) * 100.0 if total_days > 0 else 0.0

        # Per-type logic
        history: List[dict] = []      # [{date, value, progress}]
        ideal_series: List[dict] = [] # [{date, ideal}]

        if gtype == "habit":
            # Habit: target_value = total check-ins esperados (ex: 90 dias seguidos)
            # OU frequência semanal; para MVP tratamos target como nº esperado de check-ins
            checkins = [e for e in entries if float(e.get("value", 0)) >= 1]
            done = len(checkins)
            expected_total = max(1, target)
            progress_pct = max(0.0, min(100.0, (done / expected_total) * 100.0))

            # current para UI = done / target
            current = float(done)
            direction = "increase"

            # streak atual (dias consecutivos até hoje)
            streak = 0
            try:
                sorted_days = sorted({_parse_date(e["date"]).date() for e in checkins})
                d = now.date()
                while d in sorted_days:
                    streak += 1
                    d = d - timedelta(days=1)
            except Exception:
                streak = 0
            best_streak = 0
            try:
                best = 0; prev = None
                for day in sorted(sorted_days):
                    if prev and (day - prev).days == 1:
                        best += 1
                    else:
                        best = 1
                    best_streak = max(best_streak, best)
                    prev = day
            except Exception:
                best_streak = streak

            # history: dias com 1 ou 0
            by_day: Dict[str, int] = {}
            for e in checkins:
                d = _parse_date(e["date"]).date().isoformat()
                by_day[d] = by_day.get(d, 0) + 1
            cumulative = 0
            for i in range(total_days + 1):
                day = (start_dt + timedelta(days=i)).date()
                if day > now.date():
                    break
                cumulative += 1 if by_day.get(day.isoformat(), 0) > 0 else 0
                history.append({
                    "date": day.isoformat(),
                    "value": cumulative,
                    "progress": min(100.0, (cumulative / expected_total) * 100.0),
                })
            # ideal: reta linear 0 → target ao longo de total_days
            for i in range(total_days + 1):
                day = (start_dt + timedelta(days=i)).date()
                ideal_val = (i / total_days) * expected_total
                ideal_series.append({"date": day.isoformat(), "ideal": round(ideal_val, 2)})

            snapshot_extras = {
                "streak": streak,
                "best_streak": best_streak,
                "done_count": done,
                "expected_count": int(expected_total),
            }

        elif gtype == "behavior":
            # Comportamento: valor registrado é score 0-10; target é média ideal (ex: 8)
            scores = [float(e.get("value", 0)) for e in entries]
            avg = sum(scores) / len(scores) if scores else 0.0
            current = round(avg, 2)
            direction = "increase"
            target_avg = max(1.0, target)
            progress_pct = max(0.0, min(100.0, (avg / target_avg) * 100.0))

            # histórico de scores com média acumulada
            cum_sum = 0.0; cum_n = 0
            for e in entries:
                cum_sum += float(e.get("value", 0)); cum_n += 1
                history.append({
                    "date": _parse_date(e["date"]).date().isoformat(),
                    "value": round(cum_sum / cum_n, 2),
                    "progress": round(min(100.0, (cum_sum / cum_n / target_avg) * 100.0), 1),
                })
            # ideal: linha reta na média alvo
            for i in range(total_days + 1):
                day = (start_dt + timedelta(days=i)).date()
                ideal_series.append({"date": day.isoformat(), "ideal": target_avg})

            snapshot_extras = {
                "avg_score": round(avg, 2),
                "entries_count": len(entries),
                "target_score": target_avg,
            }

        else:
            # weight / financial / productivity / fitness (legacy)
            current = float(latest_entry["value"]) if latest_entry else stored_current
            direction = "increase" if target >= initial else "decrease"
            denom = abs(target - initial) or 1e-9
            delta_done = (current - initial) if direction == "increase" else (initial - current)
            progress_pct = max(0.0, min(100.0, (delta_done / denom) * 100.0))
            # Variação desde o início (pode ser NEGATIVA = regressão)
            delta_from_start = delta_done  # positivo = avançando, negativo = regredindo
            is_regressing = delta_done < 0

            # história real
            history.append({
                "date": start_dt.date().isoformat(),
                "value": initial,
                "progress": 0.0,
            })
            for e in entries:
                v = float(e.get("value", 0))
                dd = (v - initial) if direction == "increase" else (initial - v)
                p = max(0.0, min(100.0, (dd / denom) * 100.0))
                history.append({
                    "date": _parse_date(e["date"]).date().isoformat(),
                    "value": v,
                    "progress": round(p, 1),
                })
            # ideal: reta inicial → alvo
            steps = min(total_days, 30)
            for i in range(steps + 1):
                frac = i / max(1, steps)
                ideal_val = initial + (target - initial) * frac
                day = (start_dt + timedelta(days=int(frac * total_days))).date()
                ideal_series.append({"date": day.isoformat(), "ideal": round(ideal_val, 2)})

            snapshot_extras = {
                "delta_from_start": round(delta_from_start, 2),
                "is_regressing": is_regressing,
            }

        # --- RITMO ---
        rhythm = progress_pct - time_pct

        # Previsão (apenas para tipos contínuos)
        forecast_days = None
        if gtype not in ("habit", "behavior") and elapsed > 0:
            delta_done = (current - initial) if direction == "increase" else (initial - current)
            pace = delta_done / max(1, elapsed)
            remaining_work = max(0.0, abs(target - current))
            if pace > 0:
                forecast_days = int(round(remaining_work / pace))

        # ETA atingirá meta?
        will_hit = None
        if forecast_days is not None:
            will_hit = forecast_days <= days_remaining

        # Status
        status = "on_track"
        if rhythm >= 5:
            status = "ahead"
        elif rhythm <= -10:
            status = "behind"
        elif rhythm < -2:
            status = "slightly_behind"

        # Ritmo ideal (valor esperado hoje)
        if gtype == "habit":
            ideal_today = round((elapsed / total_days) * max(1, target), 2)
        elif gtype == "behavior":
            ideal_today = round(target, 2)
        else:
            ideal_today = round(initial + (target - initial) * (elapsed / total_days), 2)

        return {
            "current_value": current,
            "initial_value": initial,
            "progress_pct": round(progress_pct, 1),
            "time_pct": round(time_pct, 1),
            "rhythm": round(rhythm, 1),
            "days_elapsed": elapsed,
            "days_total": total_days,
            "days_remaining": days_remaining,
            "forecast_days": forecast_days,
            "rhythm_status": status,
            "direction": direction,
            "ideal_today": ideal_today,
            "will_hit_target": will_hit,
            "history": history,
            "ideal_series": ideal_series,
            **snapshot_extras,
        }
    except Exception as e:
        logger.exception("goal snapshot failed: %s", e)
        return {
            "current_value": goal.get("current_value", 0),
            "initial_value": goal.get("initial_value", goal.get("current_value", 0)),
            "progress_pct": 0, "time_pct": 0, "rhythm": 0,
            "days_elapsed": 0, "days_total": 0, "days_remaining": 0,
            "forecast_days": None, "rhythm_status": "on_track",
            "direction": "increase", "ideal_today": 0, "will_hit_target": None,
            "history": [], "ideal_series": [],
        }


def _serialize_goal(goal: dict, entries: Optional[List[dict]] = None) -> dict:
    if entries is None:
        entries = []
    snap = _compute_goal_snapshot(goal, entries)
    gtype = goal.get("type", "weight")
    color = goal.get("color") or GOAL_TYPE_COLORS.get(gtype, "#F5C150")
    return {
        "goal_id": goal["goal_id"],
        "member_id": goal["member_id"],
        "type": gtype,
        "title": goal["title"],
        "initial_value": float(goal.get("initial_value", goal.get("current_value", 0)) or 0),
        "target_value": float(goal.get("target_value", 0) or 0),
        "unit": goal.get("unit", ""),
        "start_date": goal.get("start_date"),
        "end_date": goal["end_date"],
        "note": goal.get("note", ""),
        "description": goal.get("description", ""),
        "motive": goal.get("motive", ""),
        "color": color,
        "photo_initial": goal.get("photo_initial"),
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
    initial = body.initial_value if body.initial_value is not None else body.current_value
    goal = {
        "goal_id": f"g_{uuid.uuid4().hex[:12]}",
        "member_id": body.member_id,
        "type": body.type,
        "title": body.title.strip(),
        "initial_value": float(initial),
        "current_value": float(body.current_value),
        "target_value": float(body.target_value),
        "unit": (body.unit or "").strip(),
        "start_date": body.start_date or datetime.utcnow().isoformat(),
        "end_date": body.end_date,
        "color": (body.color or GOAL_TYPE_COLORS.get(body.type)),
        "description": (body.description or "").strip(),
        "motive": (body.motive or "").strip(),
        "photo_initial": body.photo_initial,
        "created_at": datetime.utcnow().isoformat(),
        "status": "active",
    }
    await db.goals.insert_one(goal)
    return _serialize_goal(goal, [])


@api_router.patch("/goals/{goal_id}")
async def update_goal(goal_id: str, body: GoalUpdate):
    goal = await db.goals.find_one({"goal_id": goal_id})
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if patch:
        await db.goals.update_one({"goal_id": goal_id}, {"$set": patch})
    goal = await db.goals.find_one({"goal_id": goal_id})
    entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=1000)
    return _serialize_goal(goal, entries)


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
    """Aggregated dashboard data for the Home card + Resumo Geral."""
    goals = await list_goals(member_id)
    if not goals:
        return {"has_goals": False, "active_count": 0, "overall_progress": 0,
                "avg_rhythm": 0, "days_left": None, "score": None,
                "critical_goal": None, "message": "Defina sua primeira meta e a IA te guia.",
                "goals_summary": []}
    active = [g for g in goals if g["status"] == "active"]
    if not active:
        return {"has_goals": False, "active_count": 0, "overall_progress": 0,
                "avg_rhythm": 0, "days_left": None, "score": None,
                "critical_goal": None, "message": "Crie sua próxima meta.",
                "goals_summary": []}

    overall = round(sum(g["progress_pct"] for g in active) / len(active), 1)
    avg_rhythm = round(sum(g["rhythm"] for g in active) / len(active), 1)
    critical = min(active, key=lambda g: g["rhythm"])
    score = max(0, min(100, int(round(50 + avg_rhythm * 2))))

    if avg_rhythm >= 5:
        msg = f"Você está {avg_rhythm:.0f}% acima do ritmo ideal. Siga firme!"
    elif avg_rhythm >= -2:
        msg = "Você está no ritmo ideal. Consistência é a chave."
    elif avg_rhythm >= -10:
        msg = f"Você está {abs(avg_rhythm):.0f}% abaixo do ritmo ideal."
    else:
        msg = f"Você está {abs(avg_rhythm):.0f}% abaixo do ritmo — precisamos acelerar."

    # Resumo por meta (para pizza/lista de percentuais)
    goals_summary = [
        {
            "goal_id": g["goal_id"],
            "title": g["title"],
            "type": g["type"],
            "color": g["color"],
            "progress_pct": g["progress_pct"],
            "rhythm": g["rhythm"],
            "days_remaining": g["days_remaining"],
        }
        for g in active
    ]

    return {
        "has_goals": True,
        "active_count": len(active),
        "completed_count": len([g for g in goals if g["status"] == "completed"]),
        "overall_progress": overall,
        "avg_rhythm": avg_rhythm,
        "days_left": critical["days_remaining"],
        "score": score,
        "weekly_delta": 0,
        "critical_goal": critical,
        "message": msg,
        "goals_summary": goals_summary,
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
        "mood": body.mood,
        "photo_base64": body.photo_base64,
    }
    await db.goal_entries.insert_one(entry)

    # Update goal.current_value conforme tipo:
    gtype = goal.get("type", "weight")
    if gtype == "habit":
        # recalcula como total de check-ins feitos
        done = await db.goal_entries.count_documents({"goal_id": goal_id, "value": {"$gte": 1}})
        await db.goals.update_one({"goal_id": goal_id}, {"$set": {"current_value": float(done)}})
    elif gtype == "behavior":
        # média de scores — agregação no Mongo (evita carregar entries na memória)
        avg = 0.0
        async for row in db.goal_entries.aggregate([
            {"$match": {"goal_id": goal_id}},
            {"$group": {"_id": None, "avg": {"$avg": "$value"}}},
        ]):
            avg = float(row.get("avg") or 0.0)
        await db.goals.update_one({"goal_id": goal_id}, {"$set": {"current_value": round(avg, 2)}})
    else:
        await db.goals.update_one({"goal_id": goal_id}, {"$set": {"current_value": float(body.value)}})

    # Retorna o goal atualizado para permitir update em tempo real no cliente
    goal = await db.goals.find_one({"goal_id": goal_id})
    entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=1000)
    return {"ok": True, "entry_id": entry["entry_id"], "goal": _serialize_goal(goal, entries)}


@api_router.get("/goals/{goal_id}/entries")
async def list_goal_entries(goal_id: str):
    entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=1000)
    for e in entries:
        e.pop("_id", None)
    return entries


@api_router.delete("/goals/{goal_id}/entries/{entry_id}")
async def delete_goal_entry(goal_id: str, entry_id: str):
    goal = await db.goals.find_one({"goal_id": goal_id})
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")
    r = await db.goal_entries.delete_one({"goal_id": goal_id, "entry_id": entry_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="registro não encontrado")
    # Recalcula current_value conforme tipo (igual ao add_goal_entry)
    gtype = goal.get("type", "weight")
    all_entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=10000)
    if gtype == "habit":
        done = sum(1 for e in all_entries if float(e.get("value", 0)) >= 1)
        new_cur = float(done)
    elif gtype == "behavior":
        vals = [float(e.get("value", 0)) for e in all_entries]
        new_cur = round(sum(vals) / len(vals), 2) if vals else float(goal.get("initial_value", 0) or 0)
    else:
        # último valor registrado (ou initial se não houver mais entries)
        new_cur = float(all_entries[-1]["value"]) if all_entries else float(goal.get("initial_value", goal.get("current_value", 0)) or 0)
    await db.goals.update_one({"goal_id": goal_id}, {"$set": {"current_value": new_cur}})
    goal = await db.goals.find_one({"goal_id": goal_id})
    return {"ok": True, "goal": _serialize_goal(goal, all_entries)}


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

    member = await db.members.find_one({"member_id": goal["member_id"]})
    member_name = (member or {}).get("nickname") or (member or {}).get("name") or "Membro"
    member_tier = (member or {}).get("tier", "silver")

    system_prompt = (
        "Você é o ASSISTENTE BLACK do BLACKSCLUB — o coach pessoal exclusivo de um clube "
        "privado premium. Seu tom é sofisticado, elegante, direto e magnético, sem clichês "
        "motivacionais baratos. Fale como um mentor de elite que trata o membro como VIP. "
        "Use vocabulário refinado, metáforas precisas e impacto em poucas palavras. "
        "Nunca seja genérico. Nunca diga 'você consegue!'. Seja concreto, cirúrgico, premium.\n"
        "Responda SEMPRE em JSON válido no formato exato pedido. Nada mais."
    )

    prompt = (
        f"MEMBRO: {member_name} ({member_tier.upper()})\n"
        f"META ATIVA: \"{goal['title']}\" · tipo {goal['type']}\n"
        f"Baseline: {goal['current_value']} → Alvo: {goal['target_value']} {goal.get('unit','')}\n"
        f"Valor atual: {snap['current_value']} {goal.get('unit','')}\n"
        f"Progresso: {snap['progress_pct']}% em {snap['days_elapsed']} de {snap['days_total']} dias.\n"
        f"Ritmo: {snap['rhythm']:+.1f}% ({snap['rhythm_status']}). Restam {snap['days_remaining']} dias.\n"
        f"Previsão no pace atual: {snap['forecast_days']} dias.\n\n"
        f"Diagnóstico e prescrição para HOJE. Retorne JSON EXATO:\n"
        f"{{\n"
        f'  "headline": "frase de impacto, sofisticada, máx 75 chars — diagnóstico do momento",\n'
        f'  "actions": [\n'
        f'     "ação 1 — concreta, específica, com tempo/quantidade",\n'
        f'     "ação 2 — ritual ou hábito premium",\n'
        f'     "ação 3 — bloqueio ou eliminação estratégica"\n'
        f'  ],\n'
        f'  "warning": "alerta caso fuja do ritmo, ou string vazia"\n'
        f"}}\n"
        f"Regras: sem emojis, sem exclamações excessivas, sem clichês. Nível luxo, discrição, precisão."
    )

    try:
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not LlmChat or not key:
            raise RuntimeError("LLM indisponível")
        chat = LlmChat(
            api_key=key,
            session_id=f"wtd_{goal_id}",
            system_message=system_prompt,
        ).with_model("openai", "gpt-4o")
        from emergentintegrations.llm.chat import UserMessage  # type: ignore
        reply = await chat.send_message(UserMessage(text=prompt))
        import re as _re, json as _json
        match = _re.search(r"\{.*\}", reply, _re.DOTALL)
        if match:
            data = _json.loads(match.group(0))
            if not isinstance(data.get("actions"), list):
                data["actions"] = []
        else:
            data = {"headline": reply.strip()[:80], "actions": [], "warning": ""}
    except Exception as e:
        logger.exception("what-to-do failed: %s", e)
        data = {
            "headline": "Disciplina hoje. Resultado amanhã.",
            "actions": [
                "Execute o gesto técnico da sua meta por 45 minutos, sem distrações.",
                "Registre o progresso antes de dormir — dados geram consciência.",
                "Elimine UM hábito hoje que compete com o seu objetivo.",
            ],
            "warning": "",
        }
    return data



@api_router.get("/goals/{goal_id}/detail")
async def goal_detail(goal_id: str):
    """Retorna meta + entries + fotos — tudo que a tela individual da meta precisa."""
    goal = await db.goals.find_one({"goal_id": goal_id})
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")
    entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=2000)
    for e in entries:
        e.pop("_id", None)
    photos = [
        {"entry_id": e.get("entry_id"), "date": e.get("date"), "photo_base64": e.get("photo_base64"), "note": e.get("note", "")}
        for e in entries if e.get("photo_base64")
    ]
    return {
        "goal": _serialize_goal(goal, entries),
        "entries": entries,
        "photos": photos,
    }


@api_router.post("/goals/{goal_id}/daily-message")
async def goal_daily_message(goal_id: str):
    """Mensagem do Dia — personalizada, espiritual, motivacional, por meta."""
    goal = await db.goals.find_one({"goal_id": goal_id})
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")
    entries = await db.goal_entries.find({"goal_id": goal_id}).sort("date", 1).to_list(length=500)
    snap = _compute_goal_snapshot(goal, entries)

    member = await db.members.find_one({"member_id": goal["member_id"]})
    member_name = (member or {}).get("nickname") or (member or {}).get("name") or "Membro"
    gtype = goal.get("type", "weight")
    color = goal.get("color") or GOAL_TYPE_COLORS.get(gtype, "#F5C150")

    # Data em português
    today = datetime.utcnow()
    weekdays_pt = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira",
                   "sexta-feira", "sábado", "domingo"]
    months_pt = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
                 "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
    day_label = f"{weekdays_pt[today.weekday()]}, {today.day} de {months_pt[today.month-1]}"

    status = snap.get("rhythm_status", "on_track")
    situation = {
        "ahead": "está ADIANTADA no ritmo ideal — performance excelente.",
        "on_track": "está NO RITMO ideal — estabilidade é sinal de maturidade.",
        "slightly_behind": "está LEVEMENTE ATRÁS — pequena correção de rota é necessária.",
        "behind": "está ATRASADA — exige disciplina e recalibração hoje.",
    }.get(status, "em andamento.")

    system_prompt = (
        "Você é o ASSISTENTE BLACK do BLACKSCLUB — mentor pessoal de um clube privado de luxo. "
        "Escreva a MENSAGEM DO DIA para o membro. Tom: sofisticado, espiritual, inspirador, "
        "acolhedor e direto — como um sábio mentor premium que conhece o momento exato do membro. "
        "Sem clichês ('você consegue!', 'foco foco foco'), sem emojis, sem exclamações em excesso. "
        "Nível alto de vocabulário, linguagem calma e magnética. "
        "SEMPRE responda em JSON válido no formato exato pedido."
    )

    prompt = (
        f"MEMBRO: {member_name}\n"
        f"DIA: {day_label}\n"
        f"META: \"{goal['title']}\" (tipo: {gtype})\n"
        f"Progresso: {snap.get('progress_pct',0)}%  ·  Ritmo: {snap.get('rhythm',0):+.1f}%  ·  "
        f"Dias restantes: {snap.get('days_remaining',0)}\n"
        f"Situação: {situation}\n\n"
        "Gere uma MENSAGEM DO DIA personalizada em JSON EXATO:\n"
        "{\n"
        f'  "day_label": "{day_label}",\n'
        '  "headline": "frase principal curta e poderosa, máx 80 chars",\n'
        '  "focus": "o que se preocupar/focar hoje (1-2 frases). Concreto, para a META ativa e para a vida.",\n'
        '  "verse": "passagem bíblica curta relevante ao momento (1 frase)",\n'
        '  "verse_ref": "referência (ex: Filipenses 4:13)",\n'
        '  "parable": "pequena parábola, história inspiradora ou referência real (2-4 frases, aplicável à vida)",\n'
        '  "closing": "fechamento que faça o membro se sentir mais calmo, confiante e capaz (1-2 frases)"\n'
        "}\n"
        "Regras: mensagem inteira em português, sem emojis, tom de luxo, espiritualidade discreta, "
        "sem frases de autoajuda baratas. Evite repetir palavras do status literalmente."
    )

    try:
        key = os.environ.get("EMERGENT_LLM_KEY")
        if not LlmChat or not key:
            raise RuntimeError("LLM indisponível")
        chat = LlmChat(
            api_key=key,
            session_id=f"dm_{goal_id}_{today.date().isoformat()}",
            system_message=system_prompt,
        ).with_model("openai", "gpt-4o")
        from emergentintegrations.llm.chat import UserMessage  # type: ignore
        reply = await chat.send_message(UserMessage(text=prompt))
        import re as _re, json as _json
        match = _re.search(r"\{.*\}", reply, _re.DOTALL)
        if match:
            data = _json.loads(match.group(0))
        else:
            raise RuntimeError("JSON ausente")
    except Exception as e:
        logger.exception("daily-message failed: %s", e)
        data = {
            "day_label": day_label,
            "headline": "Permaneça firme. O caminho recompensa quem não se desvia.",
            "focus": "Hoje, cuide da próxima escolha — ela define seu dia. Menos velocidade, mais direção.",
            "verse": "Tudo posso naquele que me fortalece.",
            "verse_ref": "Filipenses 4:13",
            "parable": "Assim como o agricultor que planta sem ver o fruto no mesmo dia, sua evolução também exige fé, rotina e tempo. Grandes transformações começam com pequenas decisões repetidas.",
            "closing": "Você está mais perto do que imagina. Continue — seu processo está construindo algo maior do que você vê hoje.",
        }

    data["goal_title"] = goal["title"]
    data["goal_type"] = gtype
    data["goal_color"] = color
    data["goal_id"] = goal_id
    return data


@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        client.close()
    except Exception:
        pass


app.include_router(api_router)


# ============================================================
# STATIC FILES — serve frontend build as fallback for SPA routing
# ============================================================
# Priority order:
# 1) /api/*        → API routes (included above)
# 2) /health, /ready, /, /favicon.ico → FastAPI handlers
# 3) /<path>       → static file from /app/frontend/dist (if exists)
# 4) /<path>       → index.html (SPA fallback)
#
# This ensures:
# - Kubernetes liveness probe on "/" returns 200
# - Favicon, images, JS, CSS all served correctly
# - React Router client-side routes work (any unknown path → index.html)

from fastapi.responses import FileResponse, Response, HTMLResponse
from fastapi.staticfiles import StaticFiles

# Frontend build location. Primary path is INSIDE /app/backend/ so it always
# ships with the deploy (Emergent Restic backup system excludes `**/dist/**`
# at infrastructure level, so /app/frontend/dist is unreliable in production).
# We fall back to /app/frontend/dist for local dev convenience.
_CANDIDATE_DIRS = [
    "/app/backend/static_frontend",
    "/app/frontend/dist",
]
FRONTEND_DIST = next(
    (d for d in _CANDIDATE_DIRS if os.path.isdir(d)),
    _CANDIDATE_DIRS[0],  # default to first even if missing (for error msg)
)


@app.get("/favicon.ico", include_in_schema=False)
@app.head("/favicon.ico", include_in_schema=False)
async def favicon():
    """Serve favicon from frontend dist if present, otherwise return empty 200."""
    fav = os.path.join(FRONTEND_DIST, "favicon.ico")
    if os.path.exists(fav):
        return FileResponse(fav, media_type="image/x-icon")
    return Response(content=b"", media_type="image/x-icon", status_code=200)


# Pre-resolve all .ttf font paths in static_frontend ONCE at startup.
# In production, Emergent K8s deploy strips/flattens some asset paths
# (e.g. /assets/node_modules/@expo/vector-icons/...) so the bundle JS
# requests fonts via paths that don't match the actual filesystem layout.
# This lookup table maps basename → real disk path for fast direct serving
# regardless of the URL path used in the request.
_FONT_INDEX: Dict[str, str] = {}


def _build_font_index() -> None:
    """Walk FRONTEND_DIST once and index every .ttf/.otf/.woff* by basename."""
    _FONT_INDEX.clear()
    if not os.path.isdir(FRONTEND_DIST):
        return
    for root, _dirs, files in os.walk(FRONTEND_DIST):
        for fname in files:
            if fname.lower().endswith((".ttf", ".otf", ".woff", ".woff2")):
                full = os.path.join(root, fname)
                _FONT_INDEX[fname] = full
    logger.info(f"Font index built: {len(_FONT_INDEX)} font files discovered")


_build_font_index()


@app.get("/{font_filename:path}.ttf", include_in_schema=False)
@app.head("/{font_filename:path}.ttf", include_in_schema=False)
async def serve_font_ttf(font_filename: str):
    """
    Fallback handler for icon fonts (Ionicons, MaterialCommunityIcons, etc).

    The Expo bundle hardcodes paths like
    /assets/node_modules/@expo/vector-icons/.../Fonts/Ionicons.{hash}.ttf
    which work locally but break in production because the K8s ingress
    rewrites/strips paths inconsistently.

    Strategy: extract only the BASENAME (e.g. Ionicons.{hash}.ttf), look it
    up in the pre-built font index, and serve the actual file from disk.
    Works regardless of the URL prefix the request used.
    """
    basename = os.path.basename(font_filename) + ".ttf"
    real_path = _FONT_INDEX.get(basename)
    if real_path and os.path.isfile(real_path):
        return FileResponse(real_path, media_type="font/ttf")
    return Response(status_code=404)


# Mount static subdirs if present (safe if dir doesn't exist — wrapped)
def _safe_mount_static():
    if os.path.isdir(FRONTEND_DIST):
        _expo_static = os.path.join(FRONTEND_DIST, "_expo")
        if os.path.isdir(_expo_static):
            try:
                app.mount("/_expo", StaticFiles(directory=_expo_static), name="expo-static")
            except Exception as e:
                logger.warning(f"Could not mount /_expo: {e}")
        _assets_dir = os.path.join(FRONTEND_DIST, "assets")
        if os.path.isdir(_assets_dir):
            try:
                app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")
            except Exception as e:
                logger.warning(f"Could not mount /assets: {e}")
        # Compatibility mount: Emergent K8s ingress in production rewrites
        # /assets/* → /static/assets/* (or vice-versa). The Expo bundle JS
        # hardcodes /assets/... paths for vector-icon fonts. Without this
        # extra mount, fonts return 404 in production (icons render as
        # empty squares "tofu"). We mount the entire FRONTEND_DIST under
        # /static/ so BOTH /assets/foo.ttf and /static/assets/foo.ttf work
        # regardless of which prefix the ingress uses.
        try:
            app.mount("/static", StaticFiles(directory=FRONTEND_DIST), name="static-compat")
        except Exception as e:
            logger.warning(f"Could not mount /static compat: {e}")


_safe_mount_static()


# SPA catch-all — serves frontend build only (NO runtime build attempts)
@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    """
    Serve any non-API path from the frontend build.
    - API routes → never caught here (double safety)
    - Existing file in dist → serve it
    - Unknown path → index.html (for client-side routing)
    - No dist yet → friendly static message (deployment misconfigured)
    """
    # Never catch API routes
    if full_path.startswith("api/"):
        return Response(status_code=404)

    if os.path.isdir(FRONTEND_DIST):
        candidate = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        html_candidate = os.path.join(FRONTEND_DIST, full_path + ".html")
        if os.path.isfile(html_candidate):
            return FileResponse(html_candidate)
        index = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)

    # No dist — deploy was misconfigured; return clear 200 status so probes pass
    # but content tells the operator what to do.
    return HTMLResponse(
        content=(
            "<!DOCTYPE html><html><head><meta charset='utf-8'>"
            "<title>BLACKSCLUB</title></head>"
            "<body style='margin:0;background:#050505;color:#EEE;"
            "font-family:sans-serif;display:flex;align-items:center;"
            "justify-content:center;height:100vh;text-align:center;padding:20px'>"
            "<div><h1 style='color:#D4AF37'>BLACKSCLUB</h1>"
            "<p>Frontend build missing. Deploy must include /app/frontend/dist.</p>"
            "</div></body></html>"
        ),
        status_code=200,
    )


if os.path.isdir(FRONTEND_DIST):
    logger.info(f"Frontend dist mounted from {FRONTEND_DIST}")
else:
    logger.error(
        f"CRITICAL: Frontend dist NOT found at {FRONTEND_DIST}. "
        f"Build must be performed BEFORE deploy. The runtime will NOT auto-build."
    )

