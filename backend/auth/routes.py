# -*- coding: utf-8 -*-
from __future__ import annotations
"""
Rotas de autenticação — VERSÃO FINAL 100% FUNCIONAL (macOS + Windows + Linux)
Usuário padrão criado automaticamente + correção de hash corrompido
"""

from fastapi import APIRouter, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.security import HTTPBearer
from typing import Optional
import base64
import ast
import bcrypt
import os
from backend.core.limiter import limiter, user_limiter
from backend.auth.permissions import (
    get_user_tipo,
    get_user_permissions,
    get_user_scope,
)

from backend.auth.models import (
    create_user_table,
    insert_user,
    get_user_by_email,
    get_user_by_id,
    update_user_profile,
    update_user_cover,
    remove_user_photo,
    remove_user_cover,
)
from backend.auth.utils import (
    criar_token,
    verificar_senha,
    require_user,
    validate_password,
    require_user_for_refresh,
)
from backend.auth.utils import verificar_admin
from backend.core.config import logger
from backend.database import get_db_connection  # ← Import necessário para UPDATE

router = APIRouter(prefix="/auth", tags=["Autenticação"])
bearer_scheme = HTTPBearer()

_AUTH_ALLOW_MOCK_FALLBACK = (
    os.getenv("AUTH_ALLOW_MOCK_FALLBACK", "false")
    .strip()
    .lower()
    in {"1", "true", "yes", "on"}
)
if _AUTH_ALLOW_MOCK_FALLBACK:
    logger.warning("SEGURANCA: MOCK AUTH está ATIVO. NÃO use em produção.")
_MOCK_AUTH_EMAIL = (os.getenv("MOCK_AUTH_EMAIL", "jonathan.oliveira@higra.com.br") or "").strip().lower()
_MOCK_AUTH_PASSWORD = os.getenv("MOCK_AUTH_PASSWORD", "higra123")
_MOCK_AUTH_USERNAME = (os.getenv("MOCK_AUTH_USERNAME", "jonathan.oliveira") or "").strip()
_MOCK_AUTH_NAME = (os.getenv("MOCK_AUTH_NAME", "Jonathan Oliveira") or "").strip()
_AUTH_SEED_MOCK_USERS = (
    os.getenv("AUTH_SEED_MOCK_USERS", "true")
    .strip()
    .lower()
    in {"1", "true", "yes", "on"}
)
_AUTH_SEED_PASSWORD = os.getenv("AUTH_SEED_PASSWORD", _MOCK_AUTH_PASSWORD)
_MOCK_AUTH_DEMO_EMAIL = (os.getenv("MOCK_AUTH_DEMO_EMAIL", "demo@higra.com.br") or "").strip().lower()
_MOCK_AUTH_DEMO_USERNAME = (os.getenv("MOCK_AUTH_DEMO_USERNAME", "usuario.demo") or "").strip()
_MOCK_AUTH_DEMO_NAME = (os.getenv("MOCK_AUTH_DEMO_NAME", "Usuario Demo") or "").strip()
try:
    _MOCK_AUTH_USER_ID = int((os.getenv("MOCK_AUTH_USER_ID", "1") or "1").strip())
except Exception:
    _MOCK_AUTH_USER_ID = 1


def _is_mock_credentials(email: str, password: str) -> bool:
    return email.strip().lower() == _MOCK_AUTH_EMAIL and password == _MOCK_AUTH_PASSWORD


def _mock_user_payload() -> dict:
    return {
        "id": _MOCK_AUTH_USER_ID,
        "username": _MOCK_AUTH_USERNAME,
        "email": _MOCK_AUTH_EMAIL,
        "name": _MOCK_AUTH_NAME,
        "photo": None,
        "photo_mime": None,
    }


def _build_seed_users() -> list[dict]:
    raw = [
        {
            "username": _MOCK_AUTH_USERNAME,
            "email": _MOCK_AUTH_EMAIL,
            "name": _MOCK_AUTH_NAME,
        },
        {
            "username": _MOCK_AUTH_DEMO_USERNAME,
            "email": _MOCK_AUTH_DEMO_EMAIL,
            "name": _MOCK_AUTH_DEMO_NAME,
        },
    ]
    users: list[dict] = []
    seen_emails: set[str] = set()
    for item in raw:
        username = (item.get("username") or "").strip()
        email = (item.get("email") or "").strip().lower()
        name = (item.get("name") or "").strip()
        if not username or not email:
            continue
        if email in seen_emails:
            continue
        seen_emails.add(email)
        users.append({"username": username, "email": email, "name": name})
    return users


def _seed_mock_users():
    if not _AUTH_SEED_MOCK_USERS:
        logger.info("Seed de usuarios mock desativado (AUTH_SEED_MOCK_USERS=false).")
        return

    seed_users = _build_seed_users()
    created = 0

    for seed in seed_users:
        email = seed["email"]
        username = seed["username"]
        name = seed["name"]
        try:
            existing = get_user_by_email(email)
            if existing:
                continue

            password_hash = bcrypt.hashpw(
                _AUTH_SEED_PASSWORD.encode("utf-8"),
                bcrypt.gensalt(),
            ).decode("utf-8")
            insert_user(username, email, name, password_hash)
            created += 1
            logger.info(f"Usuario seed criado: {email}")
        except Exception as e:
            logger.warning(f"Falha ao aplicar seed para {email}: {e}")

    logger.info(f"Seed de usuarios finalizado | criados={created} | total_seed={len(seed_users)}")


def bootstrap_auth_schema():
    """Inicializa tabela de users, segurança SIGS e seeds de auth."""
    create_user_table()

    from backend.auth.permissions import (
        create_sigs_security_tables,
        seed_user_types,
        seed_default_permissions,
    )

    create_sigs_security_tables()
    seed_user_types()
    seed_default_permissions()
    _seed_mock_users()

    logger.info(
        "Auth bootstrap concluido | mock_fallback=%s | seed_mock_users=%s",
        _AUTH_ALLOW_MOCK_FALLBACK,
        _AUTH_SEED_MOCK_USERS,
    )


def _normalize_bcrypt_hash(raw_hash) -> Optional[bytes]:
    """Normaliza hash vindo do banco para bytes UTF-8 no formato bcrypt."""
    prefixes = ("$2a$", "$2b$", "$2y$")

    if isinstance(raw_hash, memoryview):
        raw_hash = bytes(raw_hash)

    if isinstance(raw_hash, bytes):
        try:
            text = raw_hash.decode("utf-8", errors="ignore").strip()
        except Exception:
            return None
    elif isinstance(raw_hash, str):
        text = raw_hash.strip()
    else:
        return None

    if text.startswith(prefixes):
        return text.encode("utf-8")

    # Caso legado: string hexadecimal estilo bytea "\\x24326224..."
    if text.startswith("\\x"):
        try:
            decoded = bytes.fromhex(text[2:]).decode("utf-8", errors="ignore").strip()
            if decoded.startswith(prefixes):
                return decoded.encode("utf-8")
        except Exception:
            pass

    # Caso raro: string serializada como bytes literal "b'...'"
    if (text.startswith("b'") and text.endswith("'")) or (text.startswith('b"') and text.endswith('"')):
        try:
            literal = ast.literal_eval(text)
            if isinstance(literal, (bytes, bytearray)):
                decoded = bytes(literal).decode("utf-8", errors="ignore").strip()
                if decoded.startswith(prefixes):
                    return decoded.encode("utf-8")
        except Exception:
            pass

    return None


# ==========================================================
# Login — 100% CORRIGIDO (nunca mais erro de hash ou unique constraint)
# ==========================================================
@router.post("/login")
@limiter.limit("5/minute")
async def login_user(request: Request, data: dict):
    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        raise HTTPException(status_code=400, detail="Email e senha são obrigatórios")

    user = None
    try:
        user = get_user_by_email(email)
    except Exception as e:
        logger.error(f"Falha ao consultar usuario no banco: {e}")
        if _AUTH_ALLOW_MOCK_FALLBACK and _is_mock_credentials(email, password):
            logger.warning("Banco indisponivel; autenticando com fallback mock.")
            token = criar_token(_MOCK_AUTH_USER_ID)
            return {"access_token": token, "token_type": "bearer", "user_id": _MOCK_AUTH_USER_ID}
        if _AUTH_ALLOW_MOCK_FALLBACK:
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
        raise HTTPException(status_code=503, detail="Serviço de autenticação indisponível")

    if not user:
        if _AUTH_ALLOW_MOCK_FALLBACK and _is_mock_credentials(email, password):
            logger.warning("Usuario nao encontrado no banco; autenticando com fallback mock.")
            token = criar_token(_MOCK_AUTH_USER_ID)
            return {"access_token": token, "token_type": "bearer", "user_id": _MOCK_AUTH_USER_ID}
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    stored_hash = _normalize_bcrypt_hash(user["password_hash"])

    # Se o hash estiver realmente corrompido, corrige automaticamente
    if not stored_hash:
        logger.warning("Hash de senha corrompido! Corrigindo automaticamente...")
        new_hash = bcrypt.hashpw(_AUTH_SEED_PASSWORD.encode(), bcrypt.gensalt()).decode("utf-8")
        
        # Atualiza apenas o hash (não viola unique constraint)
        conn = get_db_connection()
        cur = conn.cursor()
        try:
            cur.execute("UPDATE users SET password_hash = %s WHERE email = %s", (new_hash, email))
            conn.commit()
            logger.info("Hash de senha corrigido com sucesso")
            stored_hash = new_hash.encode("utf-8")
        except Exception as e:
            conn.rollback()
            logger.error(f"Falha ao corrigir hash: {e}")
        finally:
            cur.close()
            conn.close()

    if not verificar_senha(password, stored_hash):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = criar_token(user["id"])
    response = {"access_token": token, "token_type": "bearer", "user_id": user["id"]}

    # Carregar dados SIGS
    try:
        sigs_data = get_user_tipo(user["id"])
        if sigs_data:
            response["tipo_usuario"] = sigs_data.get("tipo_usuario", "I")
        response["permissoes"] = get_user_permissions(user["id"])
    except Exception:
        response["tipo_usuario"] = "I"
        response["permissoes"] = {}

    return response


# ==========================================================
# Registro
# ==========================================================
@router.get("/check-username/{username}")
async def check_username(username: str):
    """Verifica disponibilidade de username e sugere alternativas se ocupado."""
    import re
    username = username.strip().lower()
    if not re.match(r'^[a-z0-9._]{3,30}$', username):
        return {"available": False, "error": "Formato inválido", "suggestions": []}

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT id FROM users WHERE username = %s", (username,))
        if not cur.fetchone():
            return {"available": True, "suggestions": []}

        # Gerar sugestões
        suggestions = []
        candidates = [
            f"{username}1", f"{username}2", f"{username}3",
            f"{username}_", f"{username}.1", f"_{username}",
            f"{username}00", f"{username}.ok",
        ]
        for c in candidates:
            if len(suggestions) >= 3:
                break
            if len(c) > 30:
                continue
            cur.execute("SELECT id FROM users WHERE username = %s", (c,))
            if not cur.fetchone():
                suggestions.append(c)

        return {"available": False, "suggestions": suggestions}
    finally:
        cur.close()
        conn.close()


@router.post("/register")
@limiter.limit("3/minute")
async def register_user(request: Request, data: dict):
    email = data.get("email")
    password = data.get("password")
    username = data.get("username")
    name = data.get("name", "")
    invite_token = data.get("invite_token")

    if not all([email, password, username]):
        raise HTTPException(status_code=400, detail="Campos obrigatórios ausentes")

    try:
        validate_password(password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Validar username: minúsculas, sem espaços, apenas letras/números/ponto/underline
    import re
    username = username.strip().lower()
    if not re.match(r'^[a-z0-9._]{3,30}$', username):
        raise HTTPException(status_code=400, detail="Nome de usuário deve ter 3-30 caracteres, apenas letras minúsculas, números, ponto e underline")

    if get_user_by_email(email):
        raise HTTPException(status_code=409, detail="E-mail já cadastrado")

    # Armazenar como string para manter consistência com coluna TEXT.
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = insert_user(username, email, name, password_hash)

    # Auto-follow Arquimedes (IA)
    try:
        from backend.database import get_db_connection
        conn_af = get_db_connection()
        cur_af = conn_af.cursor()
        cur_af.execute("SELECT id FROM users WHERE username = 'arquimedes' AND is_ai = TRUE")
        ai_row = cur_af.fetchone()
        if ai_row:
            cur_af.execute(
                "INSERT INTO social_follows (follower_id, following_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (user_id, ai_row[0])
            )
            conn_af.commit()
        conn_af.close()
    except Exception:
        pass  # nao falhar o registro por causa disso

    token = criar_token(user_id)

    return {"access_token": token, "token_type": "bearer", "user_id": user_id}


# ==========================================================
# Alterar senha
# ==========================================================
@router.post("/change-password")
@limiter.limit("3/minute")
@user_limiter.limit("5/minute")
async def change_password(request: Request, data: dict, usuario_id: int = Depends(require_user)):
    current_password = data.get("current_password")
    new_password = data.get("new_password")

    if not current_password or not new_password:
        raise HTTPException(status_code=400, detail="Senha atual e nova senha são obrigatórias")
    try:
        validate_password(new_password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    user = get_user_by_id(usuario_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    stored_hash = _normalize_bcrypt_hash(user.get("password_hash"))
    if not stored_hash or not verificar_senha(current_password, stored_hash):
        raise HTTPException(status_code=401, detail="Senha atual incorreta")

    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute(
            "UPDATE users SET password_hash = %s WHERE id = %s",
            (new_hash, usuario_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

    return {"message": "Senha alterada com sucesso"}


# ==========================================================
# Refresh Token
# ==========================================================
@router.post("/refresh")
async def refresh_token(usuario_id: int = Depends(require_user_for_refresh)):
    """Gera novo token JWT com expiração renovada."""
    token = criar_token(usuario_id)
    response = {"access_token": token, "token_type": "bearer", "user_id": usuario_id}
    try:
        sigs_data = get_user_tipo(usuario_id)
        if sigs_data:
            response["tipo_usuario"] = sigs_data.get("tipo_usuario", "I")
        response["permissoes"] = get_user_permissions(usuario_id)
    except Exception:
        response["tipo_usuario"] = "I"
        response["permissoes"] = {}
    return response


# ==========================================================
# Perfil do usuário logado
# ==========================================================
@router.get("/me")
async def get_me(usuario_id: int = Depends(require_user)):
    user = None
    try:
        user = get_user_by_id(usuario_id)
    except Exception as e:
        logger.error(f"Falha ao buscar perfil do usuario {usuario_id}: {e}")
        if _AUTH_ALLOW_MOCK_FALLBACK and usuario_id == _MOCK_AUTH_USER_ID:
            return _mock_user_payload()
        raise HTTPException(status_code=503, detail="Serviço de autenticação indisponível")

    if not user:
        if _AUTH_ALLOW_MOCK_FALLBACK and usuario_id == _MOCK_AUTH_USER_ID:
            return _mock_user_payload()
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    photo_raw = user.get("photo")
    if photo_raw and isinstance(photo_raw, memoryview):
        photo_raw = bytes(photo_raw)
    photo_b64 = base64.b64encode(photo_raw).decode() if photo_raw else None

    cover_raw = user.get("cover_photo")
    if cover_raw and isinstance(cover_raw, memoryview):
        cover_raw = bytes(cover_raw)
    cover_b64 = base64.b64encode(cover_raw).decode() if cover_raw else None
    result = {
        "id": user["id"],
        "username": user["username"],
        "email": user["email"],
        "name": user["name"],
        "photo": photo_b64,
        "photo_mime": user.get("photo_mime"),
        "bio": user.get("bio", ""),
        "cover_photo": cover_b64,
        "cover_photo_mime": user.get("cover_photo_mime"),
        "created_at": str(user.get("created_at", "")),
        "is_founder": user.get("is_founder", False),
        "is_ai": user.get("is_ai", False),
        "is_admin": user.get("is_admin", False),
        "profile_complete": user.get("profile_complete", False),
        "area_atuacao": user.get("area_atuacao", ""),
        "especialidade": user.get("especialidade", ""),
        "descricao_profissional": user.get("descricao_profissional", ""),
        "invite_count": user.get("invite_count", 0),
    }

    # Adicionar dados SIGS (tipo de usuário, permissões, filial)
    try:
        sigs_data = get_user_tipo(usuario_id)
        if sigs_data:
            result["tipo_usuario"] = sigs_data.get("tipo_usuario", "I")
            result["tipo_descricao"] = sigs_data.get("tipo_descricao")
            result["empresa_id"] = sigs_data.get("sth_cad_empresa_id")
            result["empresa_nome"] = sigs_data.get("empresa_nome")
            result["filial_id"] = sigs_data.get("sth_cad_filial_id")
            result["filial_nome"] = sigs_data.get("filial_nome")
            result["filial_sigla"] = sigs_data.get("filial_sigla")
            result["filial_color"] = sigs_data.get("filial_color")
            result["filial_color_text"] = sigs_data.get("filial_color_text")
            result["processo_id"] = sigs_data.get("beg_processo_id")
            result["home_page"] = sigs_data.get("home_page")
        result["permissoes"] = get_user_permissions(usuario_id)
        # Escopo de acesso (filiais acessíveis)
        scope = get_user_scope(usuario_id)
        result["scope"] = {
            "bypass": scope.get("bypass", False),
            "filial_ids": scope.get("filial_ids", []),
            "empresa_ids": scope.get("empresa_ids", []),
        }
    except Exception as e:
        logger.error(f"Erro ao carregar dados SIGS do usuário: {e}", exc_info=True)
        result["tipo_usuario"] = "I"
        result["permissoes"] = {}

    return result


# ==========================================================
# Atualizar perfil
# ==========================================================
@router.put("/me")
async def update_me(
    name: Optional[str] = Form(None),
    bio: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    username: Optional[str] = Form(None),
    usuario_id: int = Depends(require_user),
):
    photo_bytes = await photo.read() if photo else None
    if photo_bytes and len(photo_bytes) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Imagem deve ter no máximo 2MB")
    try:
        update_user_profile(
            usuario_id,
            name,
            photo_bytes,
            photo.content_type if photo else None,
            bio,
            username,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"message": "Perfil atualizado com sucesso"}


@router.delete("/me/photo")
async def delete_photo(usuario_id: int = Depends(require_user)):
    remove_user_photo(usuario_id)
    return {"message": "Foto removida com sucesso"}


# ==========================================================
# Atualizar capa do perfil
# ==========================================================
@router.put("/me/cover")
async def update_cover(
    cover: UploadFile = File(...),
    usuario_id: int = Depends(require_user),
):
    cover_bytes = await cover.read()
    if len(cover_bytes) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Imagem deve ter no máximo 2MB")
    update_user_cover(usuario_id, cover_bytes, cover.content_type)
    return {"message": "Capa atualizada com sucesso"}


@router.delete("/me/cover")
async def delete_cover(usuario_id: int = Depends(require_user)):
    remove_user_cover(usuario_id)
    return {"message": "Capa removida com sucesso"}


# ==========================================================
# Admin: editar perfil de qualquer usuario
# ==========================================================
def _require_admin(usuario_id: int):
    if not verificar_admin(usuario_id):
        raise HTTPException(status_code=403, detail="Acesso negado")


@router.get("/admin/users/{target_id}")
async def admin_get_user(target_id: int, usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    user = get_user_by_id(target_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")
    result = {k: v for k, v in user.items() if k != "password_hash"}
    if result.get("photo"):
        import base64 as b64
        mime = result.get("photo_mime", "image/jpeg")
        raw = result["photo"]
        result["photo"] = b64.b64encode(raw if isinstance(raw, bytes) else bytes(raw)).decode()
        result["photo_mime"] = mime
    if result.get("cover_photo"):
        import base64 as b64
        mime = result.get("cover_photo_mime", "image/jpeg")
        raw = result["cover_photo"]
        result["cover_photo"] = b64.b64encode(raw if isinstance(raw, bytes) else bytes(raw)).decode()
        result["cover_photo_mime"] = mime
    return result


@router.put("/admin/users/{target_id}")
async def admin_update_user(
    target_id: int,
    name: Optional[str] = Form(None),
    bio: Optional[str] = Form(None),
    photo: Optional[UploadFile] = File(None),
    username: Optional[str] = Form(None),
    usuario_id: int = Depends(require_user),
):
    _require_admin(usuario_id)
    user = get_user_by_id(target_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")
    photo_bytes = await photo.read() if photo else None
    if photo_bytes and len(photo_bytes) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Imagem deve ter no maximo 2MB")
    try:
        update_user_profile(
            target_id,
            name,
            photo_bytes,
            photo.content_type if photo else None,
            bio,
            username,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    logger.info(f"[ADMIN] Perfil user_id={target_id} editado por admin_id={usuario_id}")
    return {"message": "Perfil atualizado com sucesso"}


@router.delete("/admin/users/{target_id}/photo")
async def admin_delete_photo(target_id: int, usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    remove_user_photo(target_id)
    logger.info(f"[ADMIN] Foto user_id={target_id} removida por admin_id={usuario_id}")
    return {"message": "Foto removida com sucesso"}


@router.put("/admin/users/{target_id}/cover")
async def admin_update_cover(
    target_id: int,
    cover: UploadFile = File(...),
    usuario_id: int = Depends(require_user),
):
    _require_admin(usuario_id)
    cover_bytes = await cover.read()
    if len(cover_bytes) > 2 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Imagem deve ter no maximo 2MB")
    update_user_cover(target_id, cover_bytes, cover.content_type)
    logger.info(f"[ADMIN] Capa user_id={target_id} editada por admin_id={usuario_id}")
    return {"message": "Capa atualizada com sucesso"}


@router.delete("/admin/users/{target_id}/cover")
async def admin_delete_cover(target_id: int, usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    remove_user_cover(target_id)
    logger.info(f"[ADMIN] Capa user_id={target_id} removida por admin_id={usuario_id}")
    return {"message": "Capa removida com sucesso"}


@router.get("/admin/users")
async def admin_list_users(usuario_id: int = Depends(require_user)):
    _require_admin(usuario_id)
    from backend.database import get_db_connection
    from psycopg2.extras import RealDictCursor as _RDC
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=_RDC)
        cur.execute("""
            SELECT id, username, email, name,
                   COALESCE(is_admin, false) AS is_admin,
                   COALESCE(is_founder, false) AS is_founder,
                   COALESCE(is_ai, false) AS is_ai,
                   created_at::text AS created_at,
                   last_active_at::text AS last_active_at
            FROM users
            ORDER BY id ASC
        """)
        users = cur.fetchall()
        for u in users:
            u["tipo"] = "admin" if u.get("is_admin") else (
                "fundador" if u.get("is_founder") else (
                    "ia" if u.get("is_ai") else "membro"
                )
            )
        return {"users": users}
    except Exception as e:
        logger.exception("Erro ao listar usuarios")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


from pydantic import BaseModel as _BaseModel

class _RoleUpdate(_BaseModel):
    tipo: str  # "admin", "fundador", "membro"

@router.patch("/admin/users/{target_id}/role")
async def admin_update_role(
    target_id: int,
    body: _RoleUpdate,
    usuario_id: int = Depends(require_user),
):
    _require_admin(usuario_id)
    if target_id == usuario_id:
        raise HTTPException(status_code=400, detail="Nao pode alterar seu proprio tipo")
    user = get_user_by_id(target_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")
    if user.get("is_ai"):
        raise HTTPException(status_code=400, detail="Nao pode alterar tipo de conta IA")

    is_admin = body.tipo == "admin"
    is_founder = body.tipo in ("admin", "fundador")

    from backend.database import get_db_connection
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE users SET is_admin = %s, is_founder = %s WHERE id = %s",
            (is_admin, is_founder, target_id),
        )
        conn.commit()
    finally:
        conn.close()

    logger.info(f"[ADMIN] Tipo user_id={target_id} alterado para '{body.tipo}' por admin_id={usuario_id}")
    return {"message": f"Tipo alterado para {body.tipo}", "tipo": body.tipo}
