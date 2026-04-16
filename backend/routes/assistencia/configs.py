# -*- coding: utf-8 -*-
"""
Assistência Técnica — Configurações (Tipos, Canais de Entrada).
APEX: P0384 (Tipos de Atendimento), P0385 (Canais de Entrada).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.services.sigs_functions import fnc_ass_permissions

router = APIRouter()


# ── Permissões do módulo ASS (PCK_HGR_ASS.FNC_ATN_ACE_CFG_*) ────────────────

@router.get("/permissoes", dependencies=[Depends(require_user)])
async def get_ass_permissoes(usuario_id: int = Depends(require_user)):
    return fnc_ass_permissions(usuario_id)


# ── Pydantic Models ────────────────────────────────────────────────────────────

class TipoAtnIn(BaseModel):
    descricao: str
    ativo: str = 'S'
    categoria: str | None = None
    canal_default_id: int | None = None
    sla_dias: int | None = None


class CanalEntradaIn(BaseModel):
    descricao: str
    ativo: str = 'S'


# ── Tipos de Atendimento (hgr_ass_cad_tp_atn) ─────────────────────────────────

@router.get("/tipos-atn", dependencies=[Depends(require_user)])
async def listar_tipos_atn(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT t.id, t.descricao, t.ativo, t.categoria, t.canal_default_id, t.sla_dias,
                   c.descricao as canal_default_nome
            FROM public.hgr_ass_cad_tp_atn t
            LEFT JOIN public.hgr_ass_cad_can_ent c ON c.id = t.canal_default_id
            ORDER BY t.descricao
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/tipos-atn", status_code=201, dependencies=[Depends(require_user)])
async def criar_tipo_atn(body: TipoAtnIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_cad_tp_atn
            (descricao, ativo, categoria, canal_default_id, sla_dias)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, descricao, ativo, categoria, canal_default_id, sla_dias""",
            (body.descricao, body.ativo, body.categoria, body.canal_default_id, body.sla_dias))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/tipos-atn/{tipo_id}", dependencies=[Depends(require_user)])
async def atualizar_tipo_atn(tipo_id: int, body: TipoAtnIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_ass_cad_tp_atn
            SET descricao=%s, ativo=%s, categoria=%s, canal_default_id=%s, sla_dias=%s
            WHERE id=%s
            RETURNING id, descricao, ativo, categoria, canal_default_id, sla_dias""",
            (body.descricao, body.ativo, body.categoria, body.canal_default_id, body.sla_dias, tipo_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tipo não encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/tipos-atn/{tipo_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_tipo_atn(tipo_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_cad_tp_atn WHERE id=%s", (tipo_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Tipo não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Canais de Entrada (hgr_ass_cad_can_ent) ───────────────────────────────────

@router.get("/canais-entrada", dependencies=[Depends(require_user)])
async def listar_canais(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, descricao, ativo FROM public.hgr_ass_cad_can_ent ORDER BY descricao")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/canais-entrada", status_code=201, dependencies=[Depends(require_user)])
async def criar_canal(body: CanalEntradaIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_cad_can_ent (descricao, ativo)
            VALUES (%s, %s) RETURNING id, descricao, ativo""",
            (body.descricao, body.ativo))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/canais-entrada/{canal_id}", dependencies=[Depends(require_user)])
async def atualizar_canal(canal_id: int, body: CanalEntradaIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_ass_cad_can_ent SET descricao=%s, ativo=%s
            WHERE id=%s RETURNING id, descricao, ativo""",
            (body.descricao, body.ativo, canal_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Canal não encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/canais-entrada/{canal_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_canal(canal_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_cad_can_ent WHERE id=%s", (canal_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Canal não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Status de Atendimento (hgr_ass_cad_stt) ───────────────────────────────────

class StatusAtnIn(BaseModel):
    descricao: str
    sigla: str | None = None
    cor: str | None = None
    icone: str | None = None
    ativo: str = 'S'


@router.get("/status-atn", dependencies=[Depends(require_user)])
async def listar_status(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, descricao, sigla, cor, icone, ativo FROM public.hgr_ass_cad_stt ORDER BY descricao")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/status-atn", status_code=201, dependencies=[Depends(require_user)])
async def criar_status(body: StatusAtnIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_cad_stt (descricao, sigla, cor, icone, ativo)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, descricao, sigla, cor, icone, ativo""",
            (body.descricao, body.sigla, body.cor, body.icone, body.ativo))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/status-atn/{stt_id}", dependencies=[Depends(require_user)])
async def atualizar_status(stt_id: int, body: StatusAtnIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_ass_cad_stt SET descricao=%s, sigla=%s, cor=%s, icone=%s, ativo=%s
            WHERE id=%s RETURNING id, descricao, sigla, cor, icone, ativo""",
            (body.descricao, body.sigla, body.cor, body.icone, body.ativo, stt_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Status não encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/status-atn/{stt_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_status(stt_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_cad_stt WHERE id=%s", (stt_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Status não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Configurações de Visualização (hgr_ass_cad_vw_cfg / hgr_ass_vw_reg_usu) ──

class VwCfgIn(BaseModel):
    descricao: str
    codigo: str | None = None
    ativo: str = 'S'


@router.get("/vw-cfg", dependencies=[Depends(require_user)])
async def listar_vw_cfg(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT v.id, v.descricao, v.codigo, v.ativo,
                   COUNT(u.id) as total_usuarios
            FROM public.hgr_ass_cad_vw_cfg v
            LEFT JOIN public.hgr_ass_vw_reg_usu u ON u.hgr_ass_cad_vw_cfg_id = v.id
            GROUP BY v.id, v.descricao, v.codigo, v.ativo
            ORDER BY v.descricao
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.get("/vw-cfg/{vw_id}/usuarios", dependencies=[Depends(require_user)])
async def listar_usuarios_vw(vw_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT r.id, r.beg_usuarios_id, u.nome as usuario_nome, u.usuario, r.created
            FROM public.hgr_ass_vw_reg_usu r
            LEFT JOIN public.beg_usuarios u ON u.id = r.beg_usuarios_id
            WHERE r.hgr_ass_cad_vw_cfg_id = %s ORDER BY u.nome""", (vw_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/vw-cfg", status_code=201, dependencies=[Depends(require_user)])
async def criar_vw_cfg(body: VwCfgIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_cad_vw_cfg (descricao, codigo, ativo, createdby)
            VALUES (%s, %s, %s, %s)
            RETURNING id, descricao, codigo, ativo""",
            (body.descricao, body.codigo, body.ativo, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/vw-cfg/{vw_id}", dependencies=[Depends(require_user)])
async def atualizar_vw_cfg(vw_id: int, body: VwCfgIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_ass_cad_vw_cfg SET descricao=%s, codigo=%s, ativo=%s, updatedby=%s
            WHERE id=%s RETURNING id, descricao, codigo, ativo""",
            (body.descricao, body.codigo, body.ativo, usuario_id, vw_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Configuração não encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/vw-cfg/{vw_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_vw_cfg(vw_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_vw_reg_usu WHERE hgr_ass_cad_vw_cfg_id=%s", (vw_id,))
        cur.execute("DELETE FROM public.hgr_ass_cad_vw_cfg WHERE id=%s", (vw_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Configuração não encontrada")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/vw-cfg/{vw_id}/usuarios", status_code=201, dependencies=[Depends(require_user)])
async def adicionar_usuario_vw(vw_id: int, data: dict, usuario_id: int = Depends(require_user)):
    beg_id = data.get("beg_usuarios_id")
    if not beg_id:
        raise HTTPException(400, "beg_usuarios_id obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_vw_reg_usu (hgr_ass_cad_vw_cfg_id, beg_usuarios_id, createdby)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING id""",
            (vw_id, beg_id, usuario_id))
        conn.commit()
        return cur.fetchone() or {"adicionado": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/vw-cfg/{vw_id}/usuarios/{reg_id}", status_code=204, dependencies=[Depends(require_user)])
async def remover_usuario_vw(vw_id: int, reg_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_vw_reg_usu WHERE id=%s AND hgr_ass_cad_vw_cfg_id=%s",
                    (reg_id, vw_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Registro não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Configurações de Acesso (hgr_ass_cad_ace_cfg / hgr_ass_ace_cfg_reg_usu) ──

class AceCfgIn(BaseModel):
    descricao: str
    codigo: str | None = None
    ativo: str = 'S'


@router.get("/ace-cfg", dependencies=[Depends(require_user)])
async def listar_ace_cfg(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT a.id, a.descricao, a.codigo, a.ativo,
                   COUNT(u.id) as total_usuarios
            FROM public.hgr_ass_cad_ace_cfg a
            LEFT JOIN public.hgr_ass_ace_cfg_reg_usu u ON u.hgr_ass_cad_ace_cfg_id = a.id
            GROUP BY a.id, a.descricao, a.codigo, a.ativo
            ORDER BY a.descricao
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.get("/ace-cfg/{ace_id}/usuarios", dependencies=[Depends(require_user)])
async def listar_usuarios_ace(ace_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT r.id, r.beg_usuarios_id, u.nome as usuario_nome, u.usuario, r.created
            FROM public.hgr_ass_ace_cfg_reg_usu r
            LEFT JOIN public.beg_usuarios u ON u.id = r.beg_usuarios_id
            WHERE r.hgr_ass_cad_ace_cfg_id = %s ORDER BY u.nome""", (ace_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/ace-cfg", status_code=201, dependencies=[Depends(require_user)])
async def criar_ace_cfg(body: AceCfgIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_cad_ace_cfg (descricao, codigo, ativo, createdby)
            VALUES (%s, %s, %s, %s) RETURNING id, descricao, codigo, ativo""",
            (body.descricao, body.codigo, body.ativo, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/ace-cfg/{ace_id}", dependencies=[Depends(require_user)])
async def atualizar_ace_cfg(ace_id: int, body: AceCfgIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_ass_cad_ace_cfg SET descricao=%s, codigo=%s, ativo=%s, updatedby=%s
            WHERE id=%s RETURNING id, descricao, codigo, ativo""",
            (body.descricao, body.codigo, body.ativo, usuario_id, ace_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Configuração de acesso não encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/ace-cfg/{ace_id}/usuarios/multi", status_code=201, dependencies=[Depends(require_user)])
async def vincular_usuarios_multi(ace_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Vincula múltiplos usuários à permissão (multi-select — APEX P0417)."""
    ids = data.get("beg_usuarios_ids", [])
    if not ids:
        raise HTTPException(400, "Lista de usuários vazia")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        inseridos = 0
        for beg_id in ids:
            cur.execute("""INSERT INTO public.hgr_ass_ace_cfg_reg_usu
                (hgr_ass_cad_ace_cfg_id, beg_usuarios_id, createdby)
                VALUES (%s, %s, %s) ON CONFLICT DO NOTHING""",
                (ace_id, beg_id, usuario_id))
            inseridos += cur.rowcount
        conn.commit()
        return {"inseridos": inseridos, "total": len(ids)}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/ace-cfg/{ace_id}/usuarios/{reg_id}", status_code=204, dependencies=[Depends(require_user)])
async def remover_usuario_ace(ace_id: int, reg_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_ace_cfg_reg_usu WHERE id=%s AND hgr_ass_cad_ace_cfg_id=%s",
                    (reg_id, ace_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Registro não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Registro de Unidades por Usuário (hgr_ass_usu_uni_reg) — APEX P0420 ────────

@router.get("/usu-uni", dependencies=[Depends(require_user)])
async def listar_usu_uni(usuario_id: int = Depends(require_user)):
    """Lista usuários SIGS com suas unidades (filiais) atribuídas."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT u.id as beg_usuarios_id, u.nome, u.usuario,
                   COUNT(r.id) as total_unidades
            FROM public.beg_usuarios u
            LEFT JOIN public.hgr_ass_usu_uni_reg r ON r.beg_usuarios_id = u.id
            WHERE u.ativo = 'S'
            GROUP BY u.id, u.nome, u.usuario
            ORDER BY u.nome
        """)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.get("/usu-uni/{beg_id}/unidades", dependencies=[Depends(require_user)])
async def listar_unidades_usuario(beg_id: int, usuario_id: int = Depends(require_user)):
    """Lista unidades (filiais) atribuídas a um usuário."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.id, r.sth_cad_filial_id, f.descricao as filial_nome,
                   e.descricao as empresa_nome, r.created
            FROM public.hgr_ass_usu_uni_reg r
            JOIN public.sth_cad_filial f ON f.id = r.sth_cad_filial_id
            JOIN public.sth_cad_empresa e ON e.id = f.sth_cad_empresa_id
            WHERE r.beg_usuarios_id = %s
            ORDER BY e.descricao, f.descricao
        """, (beg_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/usu-uni/{beg_id}/unidades", status_code=201, dependencies=[Depends(require_user)])
async def adicionar_unidade_usuario(beg_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Adiciona unidade ao usuário (com ON CONFLICT DO NOTHING para evitar duplicatas)."""
    filial_id = data.get("sth_cad_filial_id")
    if not filial_id:
        raise HTTPException(400, "sth_cad_filial_id obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.hgr_ass_usu_uni_reg (beg_usuarios_id, sth_cad_filial_id, createdby)
            VALUES (%s, %s, %s) ON CONFLICT DO NOTHING RETURNING id
        """, (beg_id, filial_id, usuario_id))
        conn.commit()
        return cur.fetchone() or {"adicionado": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/usu-uni/{beg_id}/unidades/{reg_id}", status_code=204, dependencies=[Depends(require_user)])
async def remover_unidade_usuario(beg_id: int, reg_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_usu_uni_reg WHERE id=%s AND beg_usuarios_id=%s",
                    (reg_id, beg_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Registro não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Cadastro de Empresa (sth_cad_empresa) — APEX P0424 ──────────────────────────

class EmpresaIn(BaseModel):
    descricao: str
    cnpj: str | None = None
    ativo: str = 'S'


@router.get("/empresas", dependencies=[Depends(require_user)])
async def listar_empresas(q: str | None = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if q:
            cur.execute("""SELECT e.id, e.descricao, e.cnpj, e.ativo,
                    COUNT(f.id) as total_filiais
                FROM public.sth_cad_empresa e
                LEFT JOIN public.sth_cad_filial f ON f.sth_cad_empresa_id = e.id
                WHERE LOWER(e.descricao) LIKE LOWER(%s) OR e.cnpj LIKE %s
                GROUP BY e.id, e.descricao, e.cnpj, e.ativo
                ORDER BY e.descricao LIMIT 100""", (f'%{q}%', f'%{q}%'))
        else:
            cur.execute("""SELECT e.id, e.descricao, e.cnpj, e.ativo,
                    COUNT(f.id) as total_filiais
                FROM public.sth_cad_empresa e
                LEFT JOIN public.sth_cad_filial f ON f.sth_cad_empresa_id = e.id
                GROUP BY e.id, e.descricao, e.cnpj, e.ativo
                ORDER BY e.descricao LIMIT 500""")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/empresas", status_code=201, dependencies=[Depends(require_user)])
async def criar_empresa(body: EmpresaIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.sth_cad_empresa (descricao, cnpj, ativo)
            VALUES (%s, %s, %s) RETURNING id, descricao, cnpj, ativo""",
            (body.descricao, body.cnpj, body.ativo))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/empresas/{emp_id}", dependencies=[Depends(require_user)])
async def atualizar_empresa(emp_id: int, body: EmpresaIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.sth_cad_empresa SET descricao=%s, cnpj=%s, ativo=%s
            WHERE id=%s RETURNING id, descricao, cnpj, ativo""",
            (body.descricao, body.cnpj, body.ativo, emp_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Empresa não encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Cadastro de Unidade/Filial (sth_cad_filial) — APEX P0425 ────────────────────

class FilialIn(BaseModel):
    descricao: str
    sth_cad_empresa_id: int
    cnpj: str | None = None
    ativo: str = 'S'


@router.get("/filiais", dependencies=[Depends(require_user)])
async def listar_filiais(empresa_id: int | None = None, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if empresa_id:
            cur.execute("""SELECT f.id, f.descricao, f.cnpj, f.ativo, f.sth_cad_empresa_id,
                    e.descricao as empresa_nome
                FROM public.sth_cad_filial f
                JOIN public.sth_cad_empresa e ON e.id = f.sth_cad_empresa_id
                WHERE f.sth_cad_empresa_id = %s ORDER BY f.descricao""", (empresa_id,))
        else:
            cur.execute("""SELECT f.id, f.descricao, f.cnpj, f.ativo, f.sth_cad_empresa_id,
                    e.descricao as empresa_nome
                FROM public.sth_cad_filial f
                JOIN public.sth_cad_empresa e ON e.id = f.sth_cad_empresa_id
                ORDER BY e.descricao, f.descricao LIMIT 500""")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/filiais", status_code=201, dependencies=[Depends(require_user)])
async def criar_filial(body: FilialIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.sth_cad_filial (descricao, sth_cad_empresa_id, cnpj, ativo)
            VALUES (%s, %s, %s, %s) RETURNING id, descricao, sth_cad_empresa_id, cnpj, ativo""",
            (body.descricao, body.sth_cad_empresa_id, body.cnpj, body.ativo))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/filiais/{fil_id}", dependencies=[Depends(require_user)])
async def atualizar_filial(fil_id: int, body: FilialIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.sth_cad_filial
            SET descricao=%s, sth_cad_empresa_id=%s, cnpj=%s, ativo=%s
            WHERE id=%s RETURNING id, descricao, sth_cad_empresa_id, cnpj, ativo""",
            (body.descricao, body.sth_cad_empresa_id, body.cnpj, body.ativo, fil_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Filial não encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Logo / Capa de Empresa (APEX P0428) ─────────────────────────────────────────

@router.post("/empresas/{emp_id}/logo", dependencies=[Depends(require_user)])
async def upload_logo_empresa(
    emp_id: int,
    arquivo: UploadFile = File(...),
    usuario_id: int = Depends(require_user),
):
    """Armazena o logo da empresa como bytea (ADD COLUMN IF NOT EXISTS)."""
    data = await arquivo.read()
    mimetype = arquivo.content_type or 'application/octet-stream'
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE public.sth_cad_empresa ADD COLUMN IF NOT EXISTS logo BYTEA")
        cur.execute("ALTER TABLE public.sth_cad_empresa ADD COLUMN IF NOT EXISTS logo_mimetype VARCHAR(100)")
        cur.execute("ALTER TABLE public.sth_cad_empresa ADD COLUMN IF NOT EXISTS capa BYTEA")
        cur.execute("ALTER TABLE public.sth_cad_empresa ADD COLUMN IF NOT EXISTS capa_mimetype VARCHAR(100)")
        cur.execute("""UPDATE public.sth_cad_empresa SET logo=%s, logo_mimetype=%s WHERE id=%s""",
                    (data, mimetype, emp_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Empresa não encontrada")
        conn.commit()
        return {"ok": True, "filename": arquivo.filename}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/empresas/{emp_id}/logo", dependencies=[Depends(require_user)])
async def get_logo_empresa(emp_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT logo, logo_mimetype FROM public.sth_cad_empresa WHERE id=%s", (emp_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            raise HTTPException(404, "Logo não encontrado")
        logo_bytes = bytes(row[0]) if isinstance(row[0], memoryview) else row[0]
        return Response(content=logo_bytes, media_type=row[1] or 'image/png')
    finally:
        cur.close()
        conn.close()


@router.post("/empresas/{emp_id}/capa", dependencies=[Depends(require_user)])
async def upload_capa_empresa(
    emp_id: int,
    arquivo: UploadFile = File(...),
    usuario_id: int = Depends(require_user),
):
    data = await arquivo.read()
    mimetype = arquivo.content_type or 'image/png'
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE public.sth_cad_empresa ADD COLUMN IF NOT EXISTS capa BYTEA")
        cur.execute("ALTER TABLE public.sth_cad_empresa ADD COLUMN IF NOT EXISTS capa_mimetype VARCHAR(100)")
        cur.execute("UPDATE public.sth_cad_empresa SET capa=%s, capa_mimetype=%s WHERE id=%s",
                    (data, mimetype, emp_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Empresa não encontrada")
        conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/empresas/{emp_id}/capa", dependencies=[Depends(require_user)])
async def get_capa_empresa(emp_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("SELECT capa, capa_mimetype FROM public.sth_cad_empresa WHERE id=%s", (emp_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            raise HTTPException(404, "Capa não encontrada")
        capa_bytes = bytes(row[0]) if isinstance(row[0], memoryview) else row[0]
        return Response(content=capa_bytes, media_type=row[1] or 'image/png')
    finally:
        cur.close()
        conn.close()


# ── Configuracao de Parametros (hgr_ass_cfg_params) — APEX P0444 ─────────────

PARAMS_DEFAULT = [
    {"chave": "sla_dias_default",    "tipo": "INT",  "descricao": "SLA padrao em dias para novos atendimentos"},
    {"chave": "sla_critico_dias",    "tipo": "INT",  "descricao": "Dias para alerta critico de SLA"},
    {"chave": "autoresponder_ativo", "tipo": "BOOL", "descricao": "Enviar resposta automatica ao abrir atendimento"},
    {"chave": "autoresponder_email", "tipo": "TEXT", "descricao": "Email para resposta automatica"},
    {"chave": "notif_responsavel",   "tipo": "BOOL", "descricao": "Notificar responsavel ao receber atendimento"},
    {"chave": "notif_cliente",       "tipo": "BOOL", "descricao": "Notificar cliente ao mudar status"},
    {"chave": "codigo_prefixo",      "tipo": "TEXT", "descricao": "Prefixo do codigo de atendimento (ex: ATN)"},
    {"chave": "severidade_default",  "tipo": "TEXT", "descricao": "Severidade padrao (BAIXA/MEDIA/ALTA/CRITICA)"},
]


@router.get("/params", dependencies=[Depends(require_user)])
async def listar_params(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        for p in PARAMS_DEFAULT:
            cur.execute(
                "INSERT INTO public.hgr_ass_cfg_params (chave, descricao, tipo) VALUES (%s, %s, %s) ON CONFLICT (chave) DO NOTHING",
                (p["chave"], p["descricao"], p["tipo"]))
        cur.execute("SELECT id, chave, valor, descricao, tipo, updated FROM public.hgr_ass_cfg_params ORDER BY chave")
        conn.commit()
        return cur.fetchall()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/params/{chave}", dependencies=[Depends(require_user)])
async def atualizar_param(chave: str, data: dict, usuario_id: int = Depends(require_user)):
    valor = data.get("valor")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_ass_cfg_params SET valor=%s, updatedby=%s, updated=NOW() WHERE chave=%s RETURNING id, chave, valor, descricao, tipo",
            (str(valor) if valor is not None else None, usuario_id, chave))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Parametro nao encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Tipos de Atividade (hgr_ass_cad_tp_ativ) — APEX P0447 ─────────────────────

class TpAtivIn(BaseModel):
    descricao: str
    ativo: str = 'S'
    ordem: int | None = None


@router.get("/tipos-ativ", dependencies=[Depends(require_user)])
async def listar_tipos_ativ(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, descricao, ativo, ordem FROM public.hgr_ass_cad_tp_ativ ORDER BY COALESCE(ordem, 9999), descricao")
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/tipos-ativ", status_code=201, dependencies=[Depends(require_user)])
async def criar_tipo_ativ(body: TpAtivIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_ass_cad_tp_ativ (descricao, ativo, ordem) VALUES (%s, %s, %s) RETURNING id, descricao, ativo, ordem",
            (body.descricao, body.ativo, body.ordem))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/tipos-ativ/{tp_id}", dependencies=[Depends(require_user)])
async def atualizar_tipo_ativ(tp_id: int, body: TpAtivIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_ass_cad_tp_ativ SET descricao=%s, ativo=%s, ordem=%s WHERE id=%s RETURNING id, descricao, ativo, ordem",
            (body.descricao, body.ativo, body.ordem, tp_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Tipo de atividade nao encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/tipos-ativ/{tp_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_tipo_ativ(tp_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_cad_tp_ativ WHERE id=%s", (tp_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Tipo de atividade nao encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Atividades de Atendimento (hgr_ass_atn_reg_ativ) — APEX P0448 ─────────────

class AtivIn(BaseModel):
    descricao: str | None = None
    hgr_ass_cad_tp_ativ_id: int | None = None
    status: str = 'PENDENTE'
    dt_prevista: str | None = None
    responsavel_id: int | None = None


@router.get("/{atn_id}/atividades", dependencies=[Depends(require_user)])
async def listar_atividades(atn_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT a.id, a.descricao, a.status, a.dt_prevista, a.dt_conclusao,
                a.hgr_ass_cad_tp_ativ_id, t.descricao as tipo_nome,
                a.responsavel_id, u.name as responsavel_nome, a.created
            FROM public.hgr_ass_atn_reg_ativ a
            LEFT JOIN public.hgr_ass_cad_tp_ativ t ON t.id = a.hgr_ass_cad_tp_ativ_id
            LEFT JOIN public.users u ON u.id = a.responsavel_id
            WHERE a.hgr_ass_cad_atn_id = %s ORDER BY a.created""", (atn_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/atividades", status_code=201, dependencies=[Depends(require_user)])
async def criar_atividade(atn_id: int, body: AtivIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_ativ
            (hgr_ass_cad_atn_id, descricao, hgr_ass_cad_tp_ativ_id, status, dt_prevista, responsavel_id, createdby)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING id, descricao, status, dt_prevista, hgr_ass_cad_tp_ativ_id""",
            (atn_id, body.descricao, body.hgr_ass_cad_tp_ativ_id, body.status,
             body.dt_prevista, body.responsavel_id, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.patch("/{atn_id}/atividades/{ativ_id}", dependencies=[Depends(require_user)])
async def atualizar_atividade(atn_id: int, ativ_id: int, data: dict, usuario_id: int = Depends(require_user)):
    allowed = {"status", "dt_conclusao", "descricao", "responsavel_id"}
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        raise HTTPException(400, "Nenhum campo valido para atualizar")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        set_clause = ", ".join(f"{k}=%s" for k in updates)
        values = list(updates.values()) + [ativ_id, atn_id]
        cur.execute(f"UPDATE public.hgr_ass_atn_reg_ativ SET {set_clause}, updated=NOW() WHERE id=%s AND hgr_ass_cad_atn_id=%s RETURNING id, status, dt_conclusao, descricao",
                    values)
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Atividade nao encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Categoria de Tipo de Atendimento (hgr_ass_cad_cat_tp_atn) — APEX P0543 ────

class CatTpAtnIn(BaseModel):
    descricao: str
    ativo: str = 'S'


@router.get("/cat-tp-atn", dependencies=[Depends(require_user)])
async def listar_cat_tp_atn(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_cat_tp_atn (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""")
        cur.execute("SELECT id, descricao, ativo FROM public.hgr_ass_cad_cat_tp_atn ORDER BY descricao")
        conn.commit()
        return cur.fetchall()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/cat-tp-atn", status_code=201, dependencies=[Depends(require_user)])
async def criar_cat_tp_atn(body: CatTpAtnIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_ass_cad_cat_tp_atn (descricao, ativo) VALUES (%s, %s) RETURNING id, descricao, ativo",
            (body.descricao, body.ativo))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/cat-tp-atn/{cat_id}", dependencies=[Depends(require_user)])
async def atualizar_cat_tp_atn(cat_id: int, body: CatTpAtnIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_ass_cad_cat_tp_atn SET descricao=%s, ativo=%s WHERE id=%s RETURNING id, descricao, ativo",
            (body.descricao, body.ativo, cat_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Categoria nao encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/cat-tp-atn/{cat_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_cat_tp_atn(cat_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_cad_cat_tp_atn WHERE id=%s", (cat_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Categoria nao encontrada")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Funis de Atendimento (hgr_ass_cad_funil) — APEX P0544/P0545 ─────────────

class FunilIn(BaseModel):
    nome: str
    descricao: str = ''
    ativo: str = 'S'


@router.get("/funis", dependencies=[Depends(require_user)])
async def listar_funis(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_funil (
            id BIGSERIAL PRIMARY KEY,
            nome VARCHAR(200) NOT NULL,
            descricao TEXT DEFAULT '',
            ativo VARCHAR(1) DEFAULT 'S',
            criado_em TIMESTAMP DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_funil_etapa (
            id BIGSERIAL PRIMARY KEY,
            funil_id BIGINT NOT NULL REFERENCES public.hgr_ass_cad_funil(id) ON DELETE CASCADE,
            nome VARCHAR(200) NOT NULL,
            ordem INT DEFAULT 0,
            cor VARCHAR(20) DEFAULT '#6c757d',
            tipo VARCHAR(30) DEFAULT 'normal',
            ativo VARCHAR(1) DEFAULT 'S')""")
        conn.commit()
        cur.execute("""
            SELECT f.id, f.nome, f.descricao, f.ativo,
                   COUNT(e.id) AS total_etapas
            FROM public.hgr_ass_cad_funil f
            LEFT JOIN public.hgr_ass_cad_funil_etapa e ON e.funil_id = f.id
            GROUP BY f.id, f.nome, f.descricao, f.ativo
            ORDER BY f.nome""")
        return cur.fetchall()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/funis", status_code=201, dependencies=[Depends(require_user)])
async def criar_funil(body: FunilIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_ass_cad_funil (nome, descricao, ativo) VALUES (%s, %s, %s) RETURNING id, nome, descricao, ativo",
            (body.nome, body.descricao, body.ativo))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/funis/{funil_id}", dependencies=[Depends(require_user)])
async def atualizar_funil(funil_id: int, body: FunilIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_ass_cad_funil SET nome=%s, descricao=%s, ativo=%s WHERE id=%s RETURNING id, nome, descricao, ativo",
            (body.nome, body.descricao, body.ativo, funil_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Funil nao encontrado")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/funis/{funil_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_funil(funil_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_cad_funil WHERE id=%s", (funil_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Funil nao encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Etapas do Funil (hgr_ass_cad_funil_etapa) — APEX P0546 ──────────────────

class EtapaIn(BaseModel):
    nome: str
    ordem: int = 0
    cor: str = '#6c757d'
    tipo: str = 'normal'
    ativo: str = 'S'


@router.get("/funis/{funil_id}/etapas", dependencies=[Depends(require_user)])
async def listar_etapas(funil_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id, funil_id, nome, ordem, cor, tipo, ativo FROM public.hgr_ass_cad_funil_etapa WHERE funil_id=%s ORDER BY ordem, nome",
            (funil_id,))
        return cur.fetchall()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/funis/{funil_id}/etapas", status_code=201, dependencies=[Depends(require_user)])
async def criar_etapa(funil_id: int, body: EtapaIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_ass_cad_funil_etapa (funil_id, nome, ordem, cor, tipo, ativo) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, funil_id, nome, ordem, cor, tipo, ativo",
            (funil_id, body.nome, body.ordem, body.cor, body.tipo, body.ativo))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/funis/{funil_id}/etapas/{etapa_id}", dependencies=[Depends(require_user)])
async def atualizar_etapa(funil_id: int, etapa_id: int, body: EtapaIn, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_ass_cad_funil_etapa SET nome=%s, ordem=%s, cor=%s, tipo=%s, ativo=%s WHERE id=%s AND funil_id=%s RETURNING id, funil_id, nome, ordem, cor, tipo, ativo",
            (body.nome, body.ordem, body.cor, body.tipo, body.ativo, etapa_id, funil_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Etapa nao encontrada")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/funis/{funil_id}/etapas/{etapa_id}", status_code=204, dependencies=[Depends(require_user)])
async def deletar_etapa(funil_id: int, etapa_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_cad_funil_etapa WHERE id=%s AND funil_id=%s", (etapa_id, funil_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Etapa nao encontrada")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
