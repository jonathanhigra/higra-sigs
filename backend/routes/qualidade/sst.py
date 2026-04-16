# -*- coding: utf-8 -*-
"""SST — Segurança e Saúde no Trabalho: cadastros auxiliares e CAT."""
import io, datetime
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger

router = APIRouter()

def create_sst_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_sst_cad_agt_csdr (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                grupo VARCHAR(100), ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_sst_cad_tp_acidente (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
                tipo VARCHAR(30) DEFAULT 'TIPICO',
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """ALTER TABLE public.beg_rq03_reg_sst ADD COLUMN IF NOT EXISTS hgr_sst_cad_prt_crp_id BIGINT""",
            """ALTER TABLE public.beg_rq03_reg_sst ADD COLUMN IF NOT EXISTS hgr_sst_cad_tp_lesao_id BIGINT""",
            """ALTER TABLE public.beg_rq03_reg_sst ADD COLUMN IF NOT EXISTS hgr_sst_cad_tp_acidente_id BIGINT""",
            """ALTER TABLE public.beg_rq03_reg_sst ADD COLUMN IF NOT EXISTS hgr_sst_cad_agt_csdr_id BIGINT""",
            """CREATE TABLE IF NOT EXISTS public.hgr_rq03_reg_custo (
                id BIGSERIAL PRIMARY KEY, beg_rq03_id BIGINT NOT NULL,
                descricao VARCHAR(300) NOT NULL,
                valor NUMERIC(12,2) NOT NULL DEFAULT 0,
                tipo VARCHAR(50),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by INTEGER)""",
        ]:
            cur.execute(sql)
        conn.commit()
        logger.info("Tabelas SST verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas SST: {e}")
    finally:
        cur.close(); conn.close()

# --- Partes do Corpo ---
@router.get("/partes-corpo", dependencies=[Depends(require_permission('RNCO'))])
async def listar_partes_corpo(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_sst_cad_prt_crp WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("/partes-corpo", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_parte_corpo(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_sst_cad_prt_crp (descricao) VALUES (%s) RETURNING *", (data["descricao"],))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

@router.put("/partes-corpo/{id}", dependencies=[Depends(require_permission('RNCO', 'M'))])
async def atualizar_parte_corpo(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE public.hgr_sst_cad_prt_crp SET descricao=COALESCE(%s,descricao), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
                    (data.get("descricao"), data.get("ativo"), id))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# --- Tipos de Lesão ---
@router.get("/tipos-lesao", dependencies=[Depends(require_permission('RNCO'))])
async def listar_tipos_lesao(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_sst_cad_tp_lesao WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("/tipos-lesao", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_tipo_lesao(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_sst_cad_tp_lesao (descricao) VALUES (%s) RETURNING *", (data["descricao"],))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# --- Tipos de Acidente ---
@router.get("/tipos-acidente", dependencies=[Depends(require_permission('RNCO'))])
async def listar_tipos_acidente(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_sst_cad_tp_acidente WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("/tipos-acidente", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_tipo_acidente(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_sst_cad_tp_acidente (descricao, tipo)
                    VALUES (%s,%s) RETURNING *""", (data["descricao"], data.get("tipo","TIPICO")))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# --- Agentes Causadores ---
@router.get("/agentes-causadores", dependencies=[Depends(require_permission('RNCO'))])
async def listar_agentes_causadores(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_sst_cad_agt_csdr WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally:
        cur.close(); conn.close()

@router.post("/agentes-causadores", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def criar_agente_causador(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_sst_cad_agt_csdr (descricao, grupo) VALUES (%s,%s) RETURNING *",
                    (data["descricao"], data.get("grupo")))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# --- Custos RQ03 ---
@router.get("/rq03/{rq03_id}/custos", dependencies=[Depends(require_permission('RNCO'))])
async def listar_custos(rq03_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_rq03_reg_custo WHERE beg_rq03_id=%s ORDER BY created_at", (rq03_id,))
        items = cur.fetchall()
        total = sum(float(i["valor"] or 0) for i in items)
        return {"items": items, "total": total}
    finally:
        cur.close(); conn.close()

@router.post("/rq03/{rq03_id}/custos", status_code=201, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def add_custo(rq03_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_rq03_reg_custo (beg_rq03_id, descricao, valor, tipo, created_by)
                    VALUES (%s,%s,%s,%s,%s) RETURNING *""",
                    (rq03_id, data["descricao"], data.get("valor",0), data.get("tipo"), usuario_id))
        conn.commit(); return cur.fetchone()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

@router.delete("/rq03/{rq03_id}/custos/{custo_id}", status_code=204, dependencies=[Depends(require_permission('RNCO', 'M'))])
async def delete_custo(rq03_id: int, custo_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_rq03_reg_custo WHERE id=%s AND beg_rq03_id=%s", (custo_id, rq03_id))
        conn.commit()
    except Exception:
        conn.rollback(); raise
    finally:
        cur.close(); conn.close()

# --- CAT — Comunicação de Acidente de Trabalho ---
@router.get("/rq03/{rq03_id}/cat", dependencies=[Depends(require_permission('RNCO'))])
async def gerar_cat(rq03_id: int, usuario_id: int = Depends(require_user)):
    """Gera texto estruturado da CAT para exportação."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.*, u.name AS responsavel_nome, u.cpf,
                   s.dt_ocorrencia, s.descricao AS sst_descricao,
                   s.local_ocorrencia, s.turno, s.atividade,
                   s.cat_profissional, s.tempo_empresa,
                   s.afastamento, s.dias_afastamento,
                   prt.descricao AS parte_corpo,
                   les.descricao AS tipo_lesao,
                   agt.descricao AS agente_causador,
                   tp.descricao AS tipo_acidente
            FROM public.beg_rq03 r
            LEFT JOIN public.users u ON u.id = r.responsavel_id
            LEFT JOIN public.beg_rq03_reg_sst s ON s.beg_rq03_id = r.id
            LEFT JOIN public.hgr_sst_cad_prt_crp prt ON prt.id = s.hgr_sst_cad_prt_crp_id
            LEFT JOIN public.hgr_sst_cad_tp_lesao les ON les.id = s.hgr_sst_cad_tp_lesao_id
            LEFT JOIN public.hgr_sst_cad_agt_csdr agt ON agt.id = s.hgr_sst_cad_agt_csdr_id
            LEFT JOIN public.hgr_sst_cad_tp_acidente tp ON tp.id = s.hgr_sst_cad_tp_acidente_id
            WHERE r.id = %s
        """, (rq03_id,))
        row = cur.fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(404, "RQ03 não encontrado")
        lines = [
            "=" * 60,
            "COMUNICAÇÃO DE ACIDENTE DE TRABALHO (CAT)",
            "=" * 60,
            f"Nº da NC: {row.get('codigo') or row['id']}",
            f"Data de geração: {datetime.date.today().strftime('%d/%m/%Y')}",
            "",
            "DADOS DO ACIDENTE",
            f"Data da ocorrência: {row.get('dt_ocorrencia') or '—'}",
            f"Local: {row.get('local_ocorrencia') or '—'}",
            f"Turno: {row.get('turno') or '—'}",
            f"Descrição: {row.get('sst_descricao') or row.get('descricao_ocorrencia') or '—'}",
            "",
            "LESÃO",
            f"Parte do corpo afetada: {row.get('parte_corpo') or '—'}",
            f"Tipo de lesão: {row.get('tipo_lesao') or '—'}",
            f"Tipo de acidente: {row.get('tipo_acidente') or '—'}",
            f"Agente causador: {row.get('agente_causador') or '—'}",
            "",
            "AFASTAMENTO",
            f"Houve afastamento: {'Sim' if row.get('afastamento') == 'S' else 'Não'}",
            f"Dias de afastamento: {row.get('dias_afastamento') or 0}",
            "",
            "PROFISSIONAL",
            f"Atividade: {row.get('atividade') or '—'}",
            f"CBO/Função: {row.get('cat_profissional') or '—'}",
            f"Tempo de empresa: {row.get('tempo_empresa') or '—'}",
        ]
        content = "\n".join(lines)
        return StreamingResponse(
            io.BytesIO(content.encode("utf-8")),
            media_type="text/plain; charset=utf-8",
            headers={"Content-Disposition": f"attachment; filename=CAT_{rq03_id}.txt"}
        )
    finally:
        cur.close(); conn.close()
