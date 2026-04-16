# -*- coding: utf-8 -*-
"""
Fabricação Step-by-Step — Checklists de produção (o maior módulo do SIGS).
8 etapas sequenciais: BOB → MNT → CNJ_MOT → ENS_HID → PIN → EMB → QLD_MNT → QLD → EXP

Cada etapa tem:
- Tabela própria (hgr_fab_reg_*)
- Sub-steps com status codes
- FK chain para a próxima etapa
- Prerequisite da etapa anterior

APEX: Pages 138, 142, 144, 146, 148, 150, 152, 154, 211
Step list: step_by_step_checklist (line 1789)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger

router = APIRouter()

# Status chain do checklist master (HGR_FAB_CAD_CCK_LIS.STATUS_GER)
# AM → ATM → AEH/AP → AEM → AIM → ACF/AQ → AXP → C
STATUS_LABELS = {
    'AM': 'Aguardando Montagem', 'ATM': 'Aguardando Teste Motor',
    'AEH': 'Aguardando Ensaio Hidro', 'AP': 'Aguardando Pintura',
    'AEM': 'Aguardando Embalagem', 'AIM': 'Aguardando Inspeção Montagem',
    'ACF': 'Aguardando Confecção', 'AQ': 'Aguardando Qualidade',
    'AXP': 'Aguardando Expedição', 'C': 'Concluído',
}

# Steps definition
STEPS = [
    {'key': 'BOB', 'label': 'Bobinagem', 'table': 'hgr_fab_reg_bob', 'status_col': 'bob_status', 'page': 138, 'seq': 10},
    {'key': 'MNT', 'label': 'Montagem', 'table': 'hgr_fab_reg_mnt', 'status_col': 'mnt_status', 'page': 142, 'seq': 20},
    {'key': 'CNJ_MOT', 'label': 'Teste Conjunto Motor', 'table': 'hgr_fab_reg_cnj_mot', 'status_col': 'bt_cnj_mot_status', 'page': 144, 'seq': 30},
    {'key': 'ENS_HID', 'label': 'Ensaio Hidroenergético', 'table': 'hgr_fab_reg_ens_hid', 'status_col': 'bt_ens_hid_status', 'page': 146, 'seq': 40},
    {'key': 'PIN', 'label': 'Pintura', 'table': 'hgr_fab_reg_pin', 'status_col': 'pint_status', 'page': 148, 'seq': 50},
    {'key': 'EMB', 'label': 'Embalagem', 'table': 'hgr_fab_reg_emb', 'status_col': 'emb_status', 'page': 150, 'seq': 60},
    {'key': 'QLD_MNT', 'label': 'Qualidade de Montagem', 'table': 'hgr_fab_reg_qld_mnt', 'status_col': 'qld_mnt_status', 'page': 211, 'seq': 65},
    {'key': 'QLD', 'label': 'Inspeção de Qualidade', 'table': 'hgr_fab_reg_qld', 'status_col': 'qld_status', 'page': 152, 'seq': 70},
    {'key': 'EXP', 'label': 'Expedição', 'table': 'hgr_fab_reg_exp', 'status_col': 'exp_status', 'page': 154, 'seq': 80},
]


def create_step_tables():
    """Cria tabelas de registro por etapa + adiciona colunas de status no checklist master."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Colunas de status no checklist master
        for step in STEPS:
            try:
                cur.execute(f"ALTER TABLE public.hgr_fab_cad_cck_lis ADD COLUMN IF NOT EXISTS {step['status_col']} VARCHAR(20)")
            except Exception:
                conn.rollback()

        cur.execute("ALTER TABLE public.hgr_fab_cad_cck_lis ADD COLUMN IF NOT EXISTS status_ger VARCHAR(20)")

        # Tabelas de registro por etapa (campos chave)
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_bob (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                cliente VARCHAR(300), n_serie VARCHAR(100), modelo VARCHAR(200),
                pv VARCHAR(50), n_motor VARCHAR(50), potencia VARCHAR(50),
                tensao VARCHAR(50), frequencia VARCHAR(20), carcaca VARCHAR(100),
                sensoriado INTEGER DEFAULT 0, qtd_cab INTEGER, sec_cab VARCHAR(50),
                bob_status VARCHAR(20) DEFAULT 'TRI',
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_mnt (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_bob_status INTEGER DEFAULT 0,
                ad_status VARCHAR(20), sm_status VARCHAR(20), insp_cab_status VARCHAR(20),
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_cnj_mot (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_mnt_status INTEGER DEFAULT 0,
                pre_status VARCHAR(20), tcv_status VARCHAR(20), trv_status VARCHAR(20),
                thc_status VARCHAR(20), pos_status VARCHAR(20), ms_status VARCHAR(20),
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_ens_hid (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_cnj_mot_status INTEGER DEFAULT 0,
                td_status VARCHAR(20), sens_status VARCHAR(20),
                th_status VARCHAR(20), tst_res_status VARCHAR(20),
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_pin (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_ens_hid_status INTEGER DEFAULT 0,
                adr_status VARCHAR(20), tec_status VARCHAR(20), acb_status VARCHAR(20),
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_emb (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_pin_status INTEGER DEFAULT 0,
                tst_res_status VARCHAR(20), va_status VARCHAR(20), pe_status VARCHAR(20),
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_qld_mnt (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_emb_status INTEGER DEFAULT 0,
                status VARCHAR(20), aprov VARCHAR(1),
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_qld (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_qld_mnt_status INTEGER DEFAULT 0,
                iv_status VARCHAR(20), aprov VARCHAR(1),
                responsavel_id BIGINT, dt_inicio DATE, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_reg_exp (
                id BIGSERIAL PRIMARY KEY, hgr_fab_cad_cck_lis_id BIGINT NOT NULL,
                fab_reg_qld_status INTEGER DEFAULT 0,
                exp_status VARCHAR(20), exp_dt_lib DATE,
                exp_n_nf VARCHAR(50), exp_peso NUMERIC(10,2),
                responsavel_id BIGINT, dt_conclusao DATE,
                observacoes TEXT, dados JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
        ]:
            cur.execute(sql)
        conn.commit()
        logger.info("Tabelas de steps de fabricação verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas steps fabricação: {e}")
    finally:
        cur.close()
        conn.close()


# ============================================================
# Dashboard de produtividade por etapa
# ============================================================
@router.get("/dashboard/produtividade", dependencies=[Depends(require_permission('CHKL'))])
async def dashboard_produtividade(
    modelo: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    """Média de dias por etapa, com filtro opcional por modelo."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        resultado = []
        for step in STEPS:
            tbl = step["table"]
            label = step["label"]
            key = step["key"]

            # Filtro por modelo via JOIN na master
            modelo_filter = ""
            params_base = []
            if modelo:
                modelo_filter = """
                    AND EXISTS (
                        SELECT 1 FROM public.hgr_fab_cad_cck_lis ckl
                        LEFT JOIN public.hgr_fab_ckl_cad_eqp eqp ON eqp.id = ckl.equip_mod_id
                        WHERE ckl.id = s.hgr_fab_cad_cck_lis_id AND eqp.descricao = %s
                    )
                """
                params_base = [modelo]

            try:
                cur.execute(f"""
                    SELECT
                        COUNT(*) FILTER (WHERE s.dt_conclusao IS NOT NULL) as concluidos,
                        COUNT(*) FILTER (WHERE s.dt_inicio IS NOT NULL) as iniciados,
                        ROUND(AVG(
                            CASE WHEN s.dt_inicio IS NOT NULL AND s.dt_conclusao IS NOT NULL
                            THEN (s.dt_conclusao - s.dt_inicio) END
                        ), 1) as media_dias
                    FROM public.{tbl} s
                    WHERE 1=1 {modelo_filter}
                """, params_base)
                row = cur.fetchone()
                resultado.append({
                    "key": key,
                    "label": label,
                    "concluidos": row["concluidos"] or 0,
                    "iniciados": row["iniciados"] or 0,
                    "media_dias": float(row["media_dias"]) if row["media_dias"] else None,
                })
            except Exception:
                conn.rollback()
                resultado.append({"key": key, "label": label, "concluidos": 0, "iniciados": 0, "media_dias": None})

        # Modelos disponíveis para o filtro
        cur.execute("""
            SELECT DISTINCT eqp.descricao as modelo
            FROM public.hgr_fab_cad_cck_lis ckl
            LEFT JOIN public.hgr_fab_ckl_cad_eqp eqp ON eqp.id = ckl.equip_mod_id
            WHERE eqp.descricao IS NOT NULL
            ORDER BY eqp.descricao
        """)
        modelos = [r["modelo"] for r in cur.fetchall()]

        return {"etapas": resultado, "modelos": modelos}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Stats de fabricação (tarefas 347, 359)
# ============================================================
@router.get("/stats", dependencies=[Depends(require_permission('CHKL'))])
async def fabricacao_stats(usuario_id: int = Depends(require_user)):
    """Dashboard de fabricação: motores em cada etapa, SLA, vencimentos."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Contagem por status
        cur.execute("""
            SELECT
                status,
                COUNT(*) AS total
            FROM public.hgr_fab_cad_cck_lis
            GROUP BY status
            ORDER BY status
        """)
        por_status = cur.fetchall()

        # Distribuição por etapa (usando a tabela de etapas de fabricação)
        cur.execute("""
            SELECT
                COALESCE(r.step_key, 'AGUARDANDO') AS etapa,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE c.status = 'ABERTA') AS abertas,
                COUNT(*) FILTER (WHERE c.status = 'CONCLUIDA') AS concluidas
            FROM public.hgr_fab_cad_cck_lis c
            LEFT JOIN (
                SELECT DISTINCT ON (ckl_id) ckl_id, step_key
                FROM public.hgr_fab_ckl_reg_etp
                WHERE dt_conclusao IS NULL AND dt_inicio IS NOT NULL
                ORDER BY ckl_id, created_at DESC
            ) r ON r.ckl_id = c.id
            GROUP BY 1 ORDER BY 1
        """)
        por_etapa = cur.fetchall()

        # Totais gerais
        cur.execute("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='CONCLUIDA') as concluidas, COUNT(*) FILTER (WHERE status='ABERTA') as abertas FROM public.hgr_fab_cad_cck_lis")
        totais = cur.fetchone()

        # Criados nos últimos 30 dias
        cur.execute("""
            SELECT COUNT(*) as novos_30d
            FROM public.hgr_fab_cad_cck_lis
            WHERE COALESCE(created_at::date, created::date) >= CURRENT_DATE - INTERVAL '30 days'
        """)
        novos = cur.fetchone()

        return {
            "totais": totais,
            "por_status": por_status,
            "por_etapa": por_etapa,
            "novos_30d": novos.get("novos_30d", 0) if novos else 0,
        }
    except Exception as e:
        logger.error(f"Erro stats fabricação: {e}")
        return {"totais": {}, "por_status": [], "por_etapa": [], "novos_30d": 0}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Visão geral do checklist com status de cada etapa
# ============================================================
@router.get("/{ckl_id}/steps", dependencies=[Depends(require_permission('CHKL'))])
async def get_checklist_steps(ckl_id: int, usuario_id: int = Depends(require_user)):
    """Retorna o checklist com status de cada etapa — equivalente ao APEX pg 291."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Checklist master
        cur.execute("""
            SELECT c.*, u.name as responsavel_nome
            FROM public.hgr_fab_cad_cck_lis c
            LEFT JOIN public.users u ON u.id = c.responsavel_id
            WHERE c.id = %s
        """, (ckl_id,))
        ckl = cur.fetchone()
        if not ckl:
            raise HTTPException(404, "Checklist não encontrado")

        # Status de cada etapa
        steps_status = []
        for step in STEPS:
            step_info = {**step}
            status_val = ckl.get(step['status_col'])
            step_info['status'] = status_val or 'PENDENTE'
            step_info['concluido'] = status_val == 'C'
            step_info['status_label'] = STATUS_LABELS.get(status_val, status_val or 'Pendente')

            # Buscar registro da etapa
            try:
                cur.execute(f"SELECT id, responsavel_id, dt_inicio, dt_conclusao, observacoes FROM public.{step['table']} WHERE hgr_fab_cad_cck_lis_id = %s LIMIT 1", (ckl_id,))
                reg = cur.fetchone()
                step_info['registro_id'] = reg['id'] if reg else None
                step_info['dt_inicio'] = str(reg['dt_inicio']) if reg and reg.get('dt_inicio') else None
                step_info['dt_conclusao'] = str(reg['dt_conclusao']) if reg and reg.get('dt_conclusao') else None
                step_info['observacoes'] = reg['observacoes'] if reg and reg.get('observacoes') else None
            except Exception:
                step_info['registro_id'] = None
                conn.rollback()

            steps_status.append(step_info)

        ckl['steps'] = steps_status
        ckl['status_ger_label'] = STATUS_LABELS.get(ckl.get('status_ger'), ckl.get('status_ger') or 'Inicial')
        return ckl
    finally:
        cur.close()
        conn.close()


# ============================================================
# Iniciar uma etapa (cria registro na tabela da etapa)
# ============================================================
@router.post("/{ckl_id}/steps/{step_key}/iniciar", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def iniciar_step(ckl_id: int, step_key: str, usuario_id: int = Depends(require_user)):
    """Inicia uma etapa do checklist — cria registro na tabela correspondente."""
    step = next((s for s in STEPS if s['key'] == step_key), None)
    if not step:
        raise HTTPException(400, f"Etapa inválida: {step_key}")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Verificar se já existe registro
        cur.execute(f"SELECT id FROM public.{step['table']} WHERE hgr_fab_cad_cck_lis_id = %s", (ckl_id,))
        if cur.fetchone():
            raise HTTPException(400, "Etapa já iniciada")

        # Criar registro
        cur.execute(f"""
            INSERT INTO public.{step['table']} (hgr_fab_cad_cck_lis_id, responsavel_id, dt_inicio, created_by)
            VALUES (%s, %s, CURRENT_DATE, %s) RETURNING *
        """, (ckl_id, usuario_id, usuario_id))

        # Atualizar status no checklist master
        cur.execute(f"""
            UPDATE public.hgr_fab_cad_cck_lis SET {step['status_col']} = 'AND', updated_at = NOW()
            WHERE id = %s
        """, (ckl_id,))

        conn.commit()
        return cur.fetchone()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Concluir uma etapa
# ============================================================
@router.post("/{ckl_id}/steps/{step_key}/concluir", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def concluir_step(ckl_id: int, step_key: str, data: dict = {}, usuario_id: int = Depends(require_user)):
    """Conclui uma etapa — muda status para 'C' e avança o status_ger."""
    step = next((s for s in STEPS if s['key'] == step_key), None)
    if not step:
        raise HTTPException(400, f"Etapa inválida: {step_key}")

    # Próximo status_ger baseado na etapa concluída
    NEXT_STATUS_GER = {
        'BOB': 'AM', 'MNT': 'ATM', 'CNJ_MOT': 'AEH', 'ENS_HID': 'AP',
        'PIN': 'AEM', 'EMB': 'AIM', 'QLD_MNT': 'AQ', 'QLD': 'AXP', 'EXP': 'C',
    }

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Atualizar registro da etapa
        cur.execute(f"""
            UPDATE public.{step['table']}
            SET dt_conclusao = CURRENT_DATE, observacoes = COALESCE(%s, observacoes)
            WHERE hgr_fab_cad_cck_lis_id = %s RETURNING *
        """, (data.get('observacoes'), ckl_id))

        # Atualizar status no checklist master
        next_ger = NEXT_STATUS_GER.get(step_key, 'C')
        cur.execute(f"""
            UPDATE public.hgr_fab_cad_cck_lis
            SET {step['status_col']} = 'C', status_ger = %s,
                dt_conclusao = CASE WHEN %s = 'C' THEN CURRENT_DATE ELSE dt_conclusao END,
                status = CASE WHEN %s = 'C' THEN 'CONCLUIDO' ELSE status END,
                updated_at = NOW()
            WHERE id = %s
        """, (next_ger, next_ger, next_ger, ckl_id))

        conn.commit()
        return {"message": f"Etapa {step['label']} concluída", "status_ger": next_ger}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Salvar dados de uma etapa (campos do formulário)
# ============================================================
@router.put("/{ckl_id}/steps/{step_key}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def salvar_step(ckl_id: int, step_key: str, data: dict, usuario_id: int = Depends(require_user)):
    """Salva dados do formulário de uma etapa (campos armazenados em JSONB)."""
    step = next((s for s in STEPS if s['key'] == step_key), None)
    if not step:
        raise HTTPException(400, f"Etapa inválida: {step_key}")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        import json
        cur.execute(f"""
            UPDATE public.{step['table']}
            SET dados = %s::jsonb, observacoes = COALESCE(%s, observacoes)
            WHERE hgr_fab_cad_cck_lis_id = %s RETURNING id
        """, (json.dumps(data.get('dados', {})), data.get('observacoes'), ckl_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Registro não encontrado. Inicie a etapa primeiro.")
        return {"message": "Dados salvos", "id": row["id"]}
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Obter dados de uma etapa específica
# ============================================================
@router.get("/{ckl_id}/steps/{step_key}/dados", dependencies=[Depends(require_permission('CHKL'))])
async def obter_step_dados(ckl_id: int, step_key: str, usuario_id: int = Depends(require_user)):
    """Retorna dados completos de uma etapa específica."""
    step = next((s for s in STEPS if s['key'] == step_key), None)
    if not step:
        raise HTTPException(400, f"Etapa inválida: {step_key}")

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(f"""
            SELECT r.*, u.name as responsavel_nome
            FROM public.{step['table']} r
            LEFT JOIN public.users u ON u.id = r.responsavel_id
            WHERE r.hgr_fab_cad_cck_lis_id = %s
        """, (ckl_id,))
        row = cur.fetchone()
        if not row:
            return {"iniciado": False, "step": step}
        return {"iniciado": True, "step": step, "registro": row}
    finally:
        cur.close()
        conn.close()


# ============================================================
# Etiqueta QR Code
# ============================================================
@router.get("/{ckl_id}/etiqueta", dependencies=[Depends(require_permission('CHKL'))])
async def gerar_etiqueta(ckl_id: int, usuario_id: int = Depends(require_user)):
    """Retorna dados para geração de etiqueta com QR code."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT c.id, c.pv, c.nr_serie, c.status,
                   COALESCE(c.equipamento, c.modelo) AS modelo,
                   COALESCE(c.cliente_nome, cli.nome) AS cliente
            FROM public.hgr_fab_cad_cck_lis c
            LEFT JOIN public.hgr_fab_ckl_cad_cli cli ON cli.id = c.hgr_fab_ckl_cad_cli_id
            WHERE c.id = %s
        """, (ckl_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404)
        return {
            **row,
            "qr_data": f"HIGRA|PV:{row.get('pv') or ''}|SN:{row.get('nr_serie') or ''}|ID:{ckl_id}",
            "url": f"/fabricacao/{ckl_id}",
        }
    finally:
        cur.close()
        conn.close()
