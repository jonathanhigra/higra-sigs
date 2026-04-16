# -*- coding: utf-8 -*-
"""Endpoints read-only para integração com ERP Focco — Pedidos de Venda."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger
from backend.routes.projetos.schemas import FoccoPVVincular

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /focco/pvs — Listar PVs do cache local (paginado)
# ---------------------------------------------------------------------------
@router.get("/pvs", dependencies=[Depends(require_permission('PRJT'))])
async def listar_pvs(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    q: Optional[str] = None,
    status: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    """Lista PVs do cache Focco. Busca por número, cliente ou vendedor."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        where_parts = []
        params = []

        if q:
            where_parts.append("""
                (numero_pv ILIKE %s OR cliente_razao ILIKE %s
                 OR cliente_cnpj ILIKE %s OR vendedor_nome ILIKE %s)
            """)
            like = f"%{q}%"
            params.extend([like, like, like, like])

        if status:
            where_parts.append("status_focco = %s")
            params.append(status)

        where_sql = (" WHERE " + " AND ".join(where_parts)) if where_parts else ""

        cur.execute(
            f"SELECT COUNT(*) as total FROM public.hgr_focco_pv{where_sql}",
            params,
        )
        total = cur.fetchone()["total"]

        cur.execute(
            f"""SELECT * FROM public.hgr_focco_pv{where_sql}
                ORDER BY dt_pedido DESC NULLS LAST
                LIMIT %s OFFSET %s""",
            params + [per_page, offset],
        )
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# GET /focco/pvs/{numero_pv} — Detalhe de um PV (cache + itens)
# ---------------------------------------------------------------------------
@router.get("/pvs/{numero_pv}", dependencies=[Depends(require_permission('PRJT'))])
async def obter_pv(numero_pv: str, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_focco_pv WHERE numero_pv = %s",
            (numero_pv,),
        )
        pv = cur.fetchone()
        if not pv:
            raise HTTPException(404, "PV não encontrado no cache")

        # Itens do PV
        cur.execute(
            """SELECT * FROM public.hgr_focco_pv_item
               WHERE numero_pv = %s ORDER BY item_seq""",
            (numero_pv,),
        )
        pv["itens"] = cur.fetchall()

        # Projetos vinculados a este PV
        cur.execute(
            """SELECT id, titulo, status, codigo
               FROM public.hgr_prj_cad_projeto
               WHERE focco_pv = %s""",
            (numero_pv,),
        )
        pv["projetos_vinculados"] = cur.fetchall()

        return pv
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# GET /focco/status — Status da integração (última sync, total cache)
# ---------------------------------------------------------------------------
@router.get("/status", dependencies=[Depends(require_permission('PRJT'))])
async def focco_status(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT COUNT(*) as total, MAX(sync_at) as ultima_sync FROM public.hgr_focco_pv")
        row = cur.fetchone()
        import os
        return {
            "configurado": bool(os.getenv("FOCCO_DB_HOST", "").strip()),
            "total_pvs_cache": row["total"],
            "ultima_sync": row["ultima_sync"],
        }
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# POST /focco/sync — Disparar sync manual (admin)
# ---------------------------------------------------------------------------
@router.post("/sync", dependencies=[Depends(require_permission('PRJT', 'A'))])
async def disparar_sync(
    days: int = Query(90, ge=1, le=365),
    usuario_id: int = Depends(require_user),
):
    """Dispara sincronização manual com Focco. Apenas admin."""
    import os
    if not os.getenv("FOCCO_DB_HOST", "").strip():
        raise HTTPException(
            503,
            "Integração Focco não configurada. Defina FOCCO_DB_HOST no .env.",
        )
    try:
        from backend.services.focco_service import sync_pvs_to_cache
        result = sync_pvs_to_cache(days=days)
        logger.info("Sync Focco manual disparado por user %s: %s", usuario_id, result)
        return {"message": "Sincronização concluída", **result}
    except Exception as e:
        logger.error("Erro sync manual Focco: %s", e)
        raise HTTPException(500, f"Erro na sincronização: {e}")


# ---------------------------------------------------------------------------
# POST /focco/sync-items/{numero_pv} — Sync itens de um PV específico
# ---------------------------------------------------------------------------
@router.post(
    "/sync-items/{numero_pv}",
    dependencies=[Depends(require_permission('PRJT', 'M'))],
)
async def sync_pv_items(numero_pv: str, usuario_id: int = Depends(require_user)):
    """Puxa itens de um PV específico do Focco e atualiza cache."""
    import os
    if not os.getenv("FOCCO_DB_HOST", "").strip():
        raise HTTPException(503, "Integração Focco não configurada.")
    try:
        from backend.services.focco_service import sync_pv_items_to_cache
        count = sync_pv_items_to_cache(numero_pv)
        return {"message": f"{count} itens sincronizados para PV {numero_pv}", "count": count}
    except Exception as e:
        logger.error("Erro sync itens PV %s: %s", numero_pv, e)
        raise HTTPException(500, f"Erro na sincronização de itens: {e}")


# ---------------------------------------------------------------------------
# PUT /{projeto_id}/vincular-pv — Vincula PV a um projeto
# ---------------------------------------------------------------------------
@router.put(
    "/{projeto_id}/vincular-pv",
    dependencies=[Depends(require_permission('PRJT', 'M'))],
)
async def vincular_pv(
    projeto_id: int,
    payload: FoccoPVVincular,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id FROM public.hgr_prj_cad_projeto WHERE id = %s",
            (projeto_id,),
        )
        if not cur.fetchone():
            raise HTTPException(404, "Projeto não encontrado")

        cur.execute(
            """UPDATE public.hgr_prj_cad_projeto
               SET focco_pv = %s, updated_at = NOW(), updated_by = %s
               WHERE id = %s RETURNING id, focco_pv""",
            (payload.focco_pv, usuario_id, projeto_id),
        )
        conn.commit()
        return cur.fetchone()
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---------------------------------------------------------------------------
# DELETE /{projeto_id}/vincular-pv — Desvincular PV de um projeto
# ---------------------------------------------------------------------------
@router.delete(
    "/{projeto_id}/vincular-pv",
    dependencies=[Depends(require_permission('PRJT', 'M'))],
)
async def desvincular_pv(projeto_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            """UPDATE public.hgr_prj_cad_projeto
               SET focco_pv = NULL, updated_at = NOW(), updated_by = %s
               WHERE id = %s RETURNING id, focco_pv""",
            (usuario_id, projeto_id),
        )
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Projeto não encontrado")
        return row
    except HTTPException:
        conn.rollback()
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
