# -*- coding: utf-8 -*-
"""
Assistência Técnica — atendimentos com funil de etapas.
APEX: Kanban drag-and-drop (pg 375) + detail Cards+Tabs.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import Response
from typing import Optional, List
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.core.config import logger
from backend.services.sigs_notifications import notify_atn_etapa_mudada

router = APIRouter()


def create_assistencia_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_stt (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, sigla VARCHAR(20),
                cor VARCHAR(20), icone VARCHAR(50), ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_tp_atn (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_can_ent (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_cfg_cad_fnl (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_cfg_fnl_reg_etp (
                id BIGSERIAL PRIMARY KEY, hgr_ass_cfg_cad_fnl_id BIGINT NOT NULL,
                descricao VARCHAR(200), ordem INTEGER, cor VARCHAR(20),
                hgr_ass_cad_stt_id BIGINT, ativo VARCHAR(1) DEFAULT 'S')""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_atn (
                id BIGSERIAL PRIMARY KEY, codigo VARCHAR(50), titulo VARCHAR(500),
                descricao TEXT, status VARCHAR(30) DEFAULT 'ABERTO',
                hgr_ass_cad_tp_atn_id BIGINT, hgr_ass_cad_can_ent_id BIGINT,
                hgr_ass_cfg_fnl_reg_etp_id BIGINT,
                responsavel_id BIGINT, cliente VARCHAR(300),
                dt_abertura DATE DEFAULT CURRENT_DATE, dt_fechamento DATE,
                sth_cad_empresa_id BIGINT, sth_cad_filial_id BIGINT,
                created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER,
                updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_reg_etp (
                id BIGSERIAL PRIMARY KEY, hgr_ass_cad_atn_id BIGINT NOT NULL,
                etp_anterior_id BIGINT, etp_nova_id BIGINT,
                dt_transicao TIMESTAMPTZ DEFAULT NOW(), usuario_id BIGINT)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_reg_ant (
                id BIGSERIAL PRIMARY KEY, hgr_ass_cad_atn_id BIGINT NOT NULL,
                descricao TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), created_by INTEGER)""",
            """CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_reg_eqp (
                id BIGSERIAL PRIMARY KEY, hgr_ass_cad_atn_id BIGINT NOT NULL,
                equipamento VARCHAR(300), nr_serie VARCHAR(100), modelo VARCHAR(200),
                dados_tecnicos TEXT, created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS severidade VARCHAR(20)")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS garantia CHAR(1) DEFAULT 'N'")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS garantia_obs TEXT")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS autorizacao_status VARCHAR(20)")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS autorizacao_obs TEXT")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS autorizacao_dt TIMESTAMPTZ")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS autorizacao_by INTEGER")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS deslocamento_km NUMERIC(10,2)")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS deslocamento_valor_km NUMERIC(10,4)")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS geo_lat NUMERIC(12,8)")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS geo_lng NUMERIC(12,8)")
        cur.execute("ALTER TABLE public.hgr_ass_cad_atn ADD COLUMN IF NOT EXISTS geo_endereco TEXT")
        # Colunas de edição em hgr_ass_atn_reg_ant (P0401)
        cur.execute("ALTER TABLE public.hgr_ass_atn_reg_ant ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ")
        cur.execute("ALTER TABLE public.hgr_ass_atn_reg_ant ADD COLUMN IF NOT EXISTS updated_by INTEGER")
        cur.execute("ALTER TABLE public.hgr_ass_atn_reg_ant ADD COLUMN IF NOT EXISTS descricao_original TEXT")
        # Coluna motivo em hgr_ass_atn_reg_eqp (P0393)
        cur.execute("ALTER TABLE public.hgr_ass_atn_reg_eqp ADD COLUMN IF NOT EXISTS motivo TEXT")
        # Colunas extras em hgr_ass_cad_tp_atn (P0385)
        cur.execute("ALTER TABLE public.hgr_ass_cad_tp_atn ADD COLUMN IF NOT EXISTS categoria VARCHAR(100)")
        cur.execute("ALTER TABLE public.hgr_ass_cad_tp_atn ADD COLUMN IF NOT EXISTS canal_default_id BIGINT REFERENCES public.hgr_ass_cad_can_ent(id) ON DELETE SET NULL")
        cur.execute("ALTER TABLE public.hgr_ass_cad_tp_atn ADD COLUMN IF NOT EXISTS sla_dias INTEGER")
        # Tabelas de configurações adicionais (P0416, P0417, P0420)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_vw_cfg (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
            codigo VARCHAR(100), ativo VARCHAR(1) DEFAULT 'S',
            createdby INTEGER, updatedby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(), updated TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_vw_reg_usu (
            id BIGSERIAL PRIMARY KEY, hgr_ass_cad_vw_cfg_id BIGINT NOT NULL,
            beg_usuarios_id BIGINT NOT NULL, createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(hgr_ass_cad_vw_cfg_id, beg_usuarios_id))""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_ace_cfg (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
            codigo VARCHAR(100), ativo VARCHAR(1) DEFAULT 'S',
            createdby INTEGER, updatedby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(), updated TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_ace_cfg_reg_usu (
            id BIGSERIAL PRIMARY KEY, hgr_ass_cad_ace_cfg_id BIGINT NOT NULL,
            beg_usuarios_id BIGINT NOT NULL, createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(hgr_ass_cad_ace_cfg_id, beg_usuarios_id))""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_usu_uni_reg (
            id BIGSERIAL PRIMARY KEY, beg_usuarios_id BIGINT NOT NULL,
            sth_cad_filial_id BIGINT NOT NULL, createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(beg_usuarios_id, sth_cad_filial_id))""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_reg_ram (
            id BIGSERIAL PRIMARY KEY,
            hgr_ass_cad_atn_id BIGINT NOT NULL,
            ram_id BIGINT NOT NULL,
            ram_descricao VARCHAR(500),
            createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_rel_atn (
            id BIGSERIAL PRIMARY KEY,
            hgr_ass_cad_atn_id_1 BIGINT NOT NULL,
            hgr_ass_cad_atn_id_2 BIGINT NOT NULL,
            tipo_rel VARCHAR(50),
            createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(hgr_ass_cad_atn_id_1, hgr_ass_cad_atn_id_2))""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_cfg_params (
            id BIGSERIAL PRIMARY KEY,
            chave VARCHAR(100) NOT NULL UNIQUE,
            valor TEXT,
            descricao VARCHAR(500),
            tipo VARCHAR(20) DEFAULT 'TEXT',
            updatedby INTEGER,
            updated TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_cad_tp_ativ (
            id BIGSERIAL PRIMARY KEY,
            descricao VARCHAR(200) NOT NULL,
            ativo VARCHAR(1) DEFAULT 'S',
            ordem INTEGER)""")
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_reg_ativ (
            id BIGSERIAL PRIMARY KEY,
            hgr_ass_cad_atn_id BIGINT NOT NULL,
            hgr_ass_cad_tp_ativ_id BIGINT,
            descricao TEXT,
            status VARCHAR(30) DEFAULT 'PENDENTE',
            dt_prevista DATE,
            dt_conclusao DATE,
            responsavel_id BIGINT,
            createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(),
            updated TIMESTAMPTZ DEFAULT NOW())""")
        # Vínculos externos ATN↔CHM / ATN↔RQ03 (tarefa 250)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_rel_ext (
            id BIGSERIAL PRIMARY KEY,
            hgr_ass_cad_atn_id BIGINT NOT NULL,
            ref_tipo VARCHAR(20) NOT NULL,
            ref_id BIGINT NOT NULL,
            ref_codigo VARCHAR(100),
            ref_titulo VARCHAR(500),
            createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(hgr_ass_cad_atn_id, ref_tipo, ref_id))""")
        # Peças Utilizadas (tarefa 248)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_ass_atn_reg_peca (
            id BIGSERIAL PRIMARY KEY,
            hgr_ass_cad_atn_id BIGINT NOT NULL,
            codigo VARCHAR(100),
            descricao VARCHAR(500) NOT NULL,
            quantidade NUMERIC(12,3) DEFAULT 1,
            unidade VARCHAR(30) DEFAULT 'UN',
            valor_unit NUMERIC(15,4),
            observacao TEXT,
            createdby INTEGER,
            created TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_atn_status ON public.hgr_ass_cad_atn(status);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_atn_etp ON public.hgr_ass_cad_atn(hgr_ass_cfg_fnl_reg_etp_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_atn_sev ON public.hgr_ass_cad_atn(severidade);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_atn_cliente ON public.hgr_ass_cad_atn(LOWER(cliente)) WHERE cliente IS NOT NULL;")
        conn.commit()
        logger.info("Tabelas de assistência verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas assistência: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/form-options", dependencies=[Depends(require_user)])
async def form_options(usuario_id: int = Depends(require_user)):
    """Retorna LOVs para o formulário de cadastro de atendimento (APEX P0382)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, descricao FROM public.hgr_ass_cad_tp_atn WHERE ativo='S' ORDER BY descricao")
        tipos = cur.fetchall()

        cur.execute("SELECT id, descricao FROM public.hgr_ass_cad_can_ent WHERE ativo='S' ORDER BY descricao")
        canais = cur.fetchall()

        cur.execute("SELECT id, name as nome FROM public.users WHERE is_active = true ORDER BY name LIMIT 100")
        try:
            responsaveis = cur.fetchall()
        except Exception:
            conn.rollback()
            cur.execute("SELECT id, name as nome FROM public.users ORDER BY name LIMIT 100")
            responsaveis = cur.fetchall()

        cur.execute("SELECT id, descricao FROM public.sth_cad_empresa WHERE ativo='S' ORDER BY descricao")
        empresas = cur.fetchall()

        cur.execute("""SELECT id, descricao, sth_cad_empresa_id
            FROM public.sth_cad_filial WHERE ativo='S' ORDER BY descricao""")
        unidades = cur.fetchall()

        return {
            "tipos": tipos,
            "canais": canais,
            "responsaveis": responsaveis,
            "empresas": empresas,
            "unidades": unidades,
        }
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/anexos", status_code=201, dependencies=[Depends(require_user)])
async def upload_anexo(
    atn_id: int,
    arquivo: UploadFile = File(...),
    tipo: str = Form(default=""),
    usuario_id: int = Depends(require_user),
):
    """Faz upload de um arquivo e registra em hgr_ass_atn_reg_anx (APEX P0392)."""
    conteudo = await arquivo.read()
    if len(conteudo) > 20 * 1024 * 1024:  # 20 MB
        raise HTTPException(413, "Arquivo muito grande (máx. 20 MB)")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        from psycopg2 import Binary
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_anx
            (hgr_ass_cad_atn_id, anexo, mimetype, filename, tipo, createdby)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, filename, mimetype, tipo, created""",
            (atn_id, Binary(conteudo), arquivo.content_type,
             arquivo.filename, tipo or None, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/equipamentos", status_code=201, dependencies=[Depends(require_user)])
async def adicionar_equipamento(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Registra equipamento no atendimento (APEX P0383/P0393)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_eqp
            (hgr_ass_cad_atn_id, equipamento, nr_serie, modelo, dados_tecnicos, motivo)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
            (atn_id, data.get("equipamento"), data.get("nr_serie"),
             data.get("modelo"), data.get("dados_tecnicos"), data.get("motivo")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_user)])
async def listar_atendimentos(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    severidade: Optional[str] = None,
    cliente: Optional[str] = None,
    exclude_id: Optional[int] = None,
    my_only: bool = Query(False),
    canal_id: Optional[int] = None,
    responsavel_id: Optional[int] = None,
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    sla_vencido: bool = Query(False),
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        query = """
            SELECT a.*, u.name as responsavel_nome, tp.descricao as tipo_atn,
                   ce.descricao as canal_entrada, etp.descricao as etapa_atual, etp.cor as etapa_cor
            FROM public.hgr_ass_cad_atn a
            LEFT JOIN public.users u ON u.id = a.responsavel_id
            LEFT JOIN public.hgr_ass_cad_tp_atn tp ON tp.id = a.hgr_ass_cad_tp_atn_id
            LEFT JOIN public.hgr_ass_cad_can_ent ce ON ce.id = a.hgr_ass_cad_can_ent_id
            LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp etp ON etp.id = a.hgr_ass_cfg_fnl_reg_etp_id
            WHERE 1=1
        """
        params = []
        if my_only:
            query += " AND a.responsavel_id = %s"
            params.append(usuario_id)
        if status:
            query += " AND a.status = %s"
            params.append(status)
        if severidade:
            query += " AND a.severidade = %s"
            params.append(severidade)
        if cliente:
            query += " AND LOWER(a.cliente) LIKE %s"
            params.append(f"%{cliente.lower()}%")
        if exclude_id:
            query += " AND a.id != %s"
            params.append(exclude_id)
        if canal_id:
            query += " AND a.hgr_ass_cad_can_ent_id = %s"
            params.append(canal_id)
        if responsavel_id:
            query += " AND a.responsavel_id = %s"
            params.append(responsavel_id)
        if dt_inicio:
            query += " AND a.dt_abertura >= %s"
            params.append(dt_inicio)
        if dt_fim:
            query += " AND a.dt_abertura <= %s"
            params.append(dt_fim + " 23:59:59")
        if sla_vencido:
            query += " AND a.status NOT IN ('FECHADO','CANCELADO') AND a.dt_abertura IS NOT NULL AND NOW() - a.dt_abertura > INTERVAL '7 days'"
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY a.dt_abertura DESC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/kanban", dependencies=[Depends(require_user)])
async def kanban_atendimentos(
    fnl_id: Optional[int] = None,
    my_only: bool = Query(False),
    usuario_id: int = Depends(require_user),
):
    """Kanban drag-and-drop de atendimentos por etapa do funil (APEX pg 375)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        etp_query = """SELECT e.id, e.descricao as title, e.cor as color, e.ordem
            FROM public.hgr_ass_cfg_fnl_reg_etp e WHERE e.ativo = 'S'"""
        etp_params = []
        if fnl_id:
            etp_query += " AND e.hgr_ass_cfg_cad_fnl_id = %s"
            etp_params.append(fnl_id)
        etp_query += " ORDER BY e.ordem"
        cur.execute(etp_query, etp_params)
        colunas = []
        my_filter = "AND a.responsavel_id = %s" if my_only else ""
        for etp in cur.fetchall():
            item_params = [etp["id"]]
            if my_only:
                item_params.append(usuario_id)
            cur.execute(f"""
                SELECT a.id, a.codigo, a.titulo, a.status, a.cliente,
                       a.severidade, a.dt_fechamento,
                       u.name as responsavel_nome, a.dt_abertura
                FROM public.hgr_ass_cad_atn a
                LEFT JOIN public.users u ON u.id = a.responsavel_id
                WHERE a.hgr_ass_cfg_fnl_reg_etp_id = %s {my_filter}
                ORDER BY
                    CASE a.severidade WHEN 'CRITICA' THEN 1 WHEN 'ALTA' THEN 2 WHEN 'MEDIA' THEN 3 ELSE 4 END,
                    a.dt_abertura ASC
            """, item_params)
            colunas.append({**etp, "items": cur.fetchall()})
        return {"colunas": colunas}
    finally:
        cur.close()
        conn.close()


@router.put("/kanban/mover/{atn_id}", dependencies=[Depends(require_user)])
async def kanban_mover_atendimento(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Move atendimento entre etapas do funil (APEX Kanban drop callback pg 375)."""
    nova_etp_id = data.get("hgr_ass_cfg_fnl_reg_etp_id")
    if not nova_etp_id:
        raise HTTPException(400, "Etapa destino obrigatória")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar etapa anterior
        cur.execute("SELECT hgr_ass_cfg_fnl_reg_etp_id FROM public.hgr_ass_cad_atn WHERE id = %s", (atn_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Atendimento não encontrado")
        etp_anterior = row["hgr_ass_cfg_fnl_reg_etp_id"]

        # Buscar status da nova etapa
        cur.execute("""SELECT s.sigla FROM public.hgr_ass_cfg_fnl_reg_etp e
            LEFT JOIN public.hgr_ass_cad_stt s ON s.id = e.hgr_ass_cad_stt_id
            WHERE e.id = %s""", (nova_etp_id,))
        stt_row = cur.fetchone()
        novo_status = stt_row["sigla"] if stt_row and stt_row["sigla"] else None

        # Atualizar atendimento
        update_sql = "UPDATE public.hgr_ass_cad_atn SET hgr_ass_cfg_fnl_reg_etp_id = %s, updated_at = NOW()"
        update_params = [nova_etp_id]
        if novo_status:
            update_sql += ", status = %s"
            update_params.append(novo_status)
        update_sql += " WHERE id = %s RETURNING id, titulo, status"
        update_params.append(atn_id)
        cur.execute(update_sql, update_params)

        # Log de transição (APEX: HGR_ASS_ATN_REG_ETP)
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_etp
            (hgr_ass_cad_atn_id, etp_anterior_id, etp_nova_id, usuario_id)
            VALUES (%s,%s,%s,%s)""", (atn_id, etp_anterior, nova_etp_id, usuario_id))

        conn.commit()
        resultado = cur.fetchone()

        # Notificar responsável sobre mudança de etapa
        try:
            cur.execute("""
                SELECT a.responsavel_id, a.codigo, e.descricao as etapa_nome
                FROM public.hgr_ass_cad_atn a
                LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp e ON e.id = %s
                WHERE a.id = %s
            """, (nova_etp_id, atn_id))
            info = cur.fetchone()
            if info and info["responsavel_id"] and info["responsavel_id"] != usuario_id:
                notify_atn_etapa_mudada(
                    atn_id=atn_id,
                    codigo=info["codigo"] or f"ATN-{atn_id}",
                    etapa_nova=info["etapa_nome"] or "nova etapa",
                    responsavel_id=info["responsavel_id"],
                    actor_id=usuario_id,
                )
        except Exception as e:
            logger.warning(f"Falha ao notificar mudança de etapa ATN {atn_id}: {e}")

        return resultado
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


class BulkUpdatePayload(BaseModel):
    ids: List[int]
    action: str   # 'atribuir_tecnico' | 'mudar_status'
    valor: Optional[str] = None  # responsavel_id (str→int) ou novo status

@router.post("/bulk-update", dependencies=[Depends(require_user)])
async def bulk_update_atendimentos(
    payload: BulkUpdatePayload,
    usuario_id: int = Depends(require_user),
):
    """Ações em lote sobre atendimentos (tarefa 255): atribuir técnico ou mudar status."""
    if not payload.ids:
        raise HTTPException(status_code=400, detail="Nenhum atendimento selecionado")
    if len(payload.ids) > 200:
        raise HTTPException(status_code=400, detail="Máximo 200 registros por lote")
    if payload.action not in ("atribuir_tecnico", "mudar_status"):
        raise HTTPException(status_code=400, detail="Ação inválida")

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        placeholders = ",".join(["%s"] * len(payload.ids))
        if payload.action == "atribuir_tecnico":
            responsavel_id = int(payload.valor) if payload.valor else None
            cur.execute(
                f"UPDATE public.hgr_ass_cad_atn SET responsavel_id = %s WHERE id IN ({placeholders})",
                [responsavel_id] + payload.ids,
            )
        elif payload.action == "mudar_status":
            cur.execute(
                f"UPDATE public.hgr_ass_cad_atn SET status = %s WHERE id IN ({placeholders})",
                [payload.valor] + payload.ids,
            )
        conn.commit()
        return {"updated": cur.rowcount}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/{id}/timeline-cliente", dependencies=[Depends(require_user)])
async def timeline_cliente(id: int, usuario_id: int = Depends(require_user)):
    """Timeline unificada do cliente: assistências + RQ03."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT cliente FROM public.hgr_ass_cad_atn WHERE id = %s", (id,))
        row = cur.fetchone()
        if not row or not row["cliente"]:
            return {"timeline": [], "cliente": None}
        cliente = row["cliente"]

        events = []

        # Outras assistências do mesmo cliente
        cur.execute("""
            SELECT a.id, a.codigo, a.titulo, a.status, a.dt_abertura as dt, a.dt_fechamento
            FROM public.hgr_ass_cad_atn a
            WHERE LOWER(a.cliente) = LOWER(%s)
            ORDER BY a.dt_abertura DESC NULLS LAST
            LIMIT 30
        """, (cliente,))
        for r in cur.fetchall():
            events.append({
                "tipo": "ATN", "id": r["id"], "codigo": r["codigo"],
                "titulo": r["titulo"], "status": r["status"],
                "dt": str(r["dt"]) if r["dt"] else None,
                "dt_fechamento": str(r["dt_fechamento"]) if r["dt_fechamento"] else None,
                "atual": r["id"] == id,
            })

        # RQ03 pelo reclamante
        try:
            cur.execute("""
                SELECT r.id, r.codigo, r.descricao as titulo, r.status, r.dt_abertura as dt
                FROM public.beg_rq03 r
                WHERE LOWER(r.reclamante) LIKE %s
                ORDER BY r.dt_abertura DESC NULLS LAST
                LIMIT 20
            """, (f"%{cliente.lower()[:40]}%",))
            for r in cur.fetchall():
                events.append({
                    "tipo": "RQ03", "id": r["id"], "codigo": r["codigo"],
                    "titulo": (r["titulo"] or "")[:120], "status": r["status"],
                    "dt": str(r["dt"]) if r["dt"] else None,
                    "atual": False,
                })
        except Exception:
            conn.rollback()

        # Sort by date descending
        events.sort(key=lambda e: e["dt"] or "0000-00-00", reverse=True)
        return {"timeline": events, "cliente": cliente}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_user)])
async def obter_atendimento(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT a.*, u.name as responsavel_nome, tp.descricao as tipo_atn,
                   ce.descricao as canal_entrada, etp.descricao as etapa_atual
            FROM public.hgr_ass_cad_atn a
            LEFT JOIN public.users u ON u.id = a.responsavel_id
            LEFT JOIN public.hgr_ass_cad_tp_atn tp ON tp.id = a.hgr_ass_cad_tp_atn_id
            LEFT JOIN public.hgr_ass_cad_can_ent ce ON ce.id = a.hgr_ass_cad_can_ent_id
            LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp etp ON etp.id = a.hgr_ass_cfg_fnl_reg_etp_id
            WHERE a.id = %s
        """, (id,))
        atn = cur.fetchone()
        if not atn:
            raise HTTPException(404, "Atendimento não encontrado")
        cur.execute("""SELECT * FROM public.hgr_ass_atn_reg_ant
            WHERE hgr_ass_cad_atn_id = %s ORDER BY created_at DESC""", (id,))
        atn["anotacoes"] = cur.fetchall()
        cur.execute("""SELECT * FROM public.hgr_ass_atn_reg_eqp
            WHERE hgr_ass_cad_atn_id = %s""", (id,))
        atn["equipamentos"] = cur.fetchall()
        cur.execute("""SELECT e.*, u.name as usuario_nome,
            ea.descricao as etapa_anterior, en.descricao as etapa_nova
            FROM public.hgr_ass_atn_reg_etp e
            LEFT JOIN public.users u ON u.id = e.usuario_id
            LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp ea ON ea.id = e.etp_anterior_id
            LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp en ON en.id = e.etp_nova_id
            WHERE e.hgr_ass_cad_atn_id = %s ORDER BY e.dt_transicao DESC""", (id,))
        atn["historico_etapas"] = cur.fetchall()

        # Anexos (metadados apenas — sem binário)
        cur.execute("""SELECT id, filename, mimetype, tipo, created
            FROM public.hgr_ass_atn_reg_anx
            WHERE hgr_ass_cad_atn_id = %s ORDER BY created DESC""", (id,))
        atn["anexos"] = cur.fetchall()

        # Equipe/Participantes
        cur.execute("""SELECT p.id, p.beg_usuarios_id, u.nome as usuario_nome,
            p.sth_cad_filial_id, p.created
            FROM public.hgr_ass_atn_reg_part p
            LEFT JOIN public.beg_usuarios u ON u.id = p.beg_usuarios_id
            WHERE p.hgr_ass_cad_atn_id = %s ORDER BY p.created""", (id,))
        atn["equipe"] = cur.fetchall()

        # Laudos vinculados
        cur.execute("""SELECT rl.id, rl.hgr_srv_reg_lau_id, rl.hgr_ass_atn_reg_eqp_id,
            l.codigo as laudo_codigo, l.num_lau, l.n_serie, l.modelo,
            l.equipamento, l.created_at as laudo_dt,
            e.equipamento as eqp_nome
            FROM public.hgr_ass_atn_reg_lau rl
            LEFT JOIN public.hgr_srv_reg_lau l ON l.id = rl.hgr_srv_reg_lau_id
            LEFT JOIN public.hgr_ass_atn_reg_eqp e ON e.id = rl.hgr_ass_atn_reg_eqp_id
            WHERE rl.hgr_ass_cad_atn_id = %s ORDER BY l.created_at DESC""", (id,))
        atn["laudos"] = cur.fetchall()

        # Checklists vinculados
        cur.execute("""SELECT rc.id, rc.hgr_fab_ckl_cad_cck_lis_id, rc.hgr_ass_atn_reg_eqp_id,
            ck.n_motor, ck.n_serie, ck.status as ck_status,
            ck.pv, ck.tipo, ck.descricao as ck_descricao,
            e.equipamento as eqp_nome
            FROM public.hgr_ass_atn_reg_ckl rc
            LEFT JOIN public.hgr_fab_ckl_cad_cck_lis ck ON ck.id = rc.hgr_fab_ckl_cad_cck_lis_id
            LEFT JOIN public.hgr_ass_atn_reg_eqp e ON e.id = rc.hgr_ass_atn_reg_eqp_id
            WHERE rc.hgr_ass_cad_atn_id = %s ORDER BY rc.created DESC""", (id,))
        atn["checklists"] = cur.fetchall()

        # Negócios vinculados (referência por ID — tabela CRM pode estar em schema separado)
        cur.execute("""SELECT id, hgr_crm_cad_neg_id, created
            FROM public.hgr_ass_atn_reg_neg
            WHERE hgr_ass_cad_atn_id = %s ORDER BY created DESC""", (id,))
        atn["negocios"] = cur.fetchall()

        return atn
    finally:
        cur.close()
        conn.close()


@router.get("/{id}/timeline", dependencies=[Depends(require_user)])
async def timeline_atendimento(id: int, usuario_id: int = Depends(require_user)):
    """
    Timeline unificada do atendimento: abertura, transições de etapa,
    anotações e uploads de anexos (tarefas 244/245).
    Retorna lista de eventos ordenados por data DESC.
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        events = []

        # Evento de abertura (criação do atendimento)
        cur.execute("""
            SELECT a.id, a.codigo, a.titulo, a.status, a.dt_abertura, a.created_by,
                   u.name as usuario_nome
            FROM public.hgr_ass_cad_atn a
            LEFT JOIN public.users u ON u.id = a.created_by
            WHERE a.id = %s
        """, (id,))
        atn_row = cur.fetchone()
        if not atn_row:
            raise HTTPException(404, "Atendimento não encontrado")
        events.append({
            "tipo": "abertura",
            "dt": str(atn_row["dt_abertura"]) if atn_row["dt_abertura"] else None,
            "descricao": f"Atendimento {atn_row['codigo'] or ''} aberto",
            "usuario": atn_row["usuario_nome"] or "Sistema",
            "icon": "🆕",
            "cor": "#22c55e",
        })

        # Transições de etapa
        cur.execute("""
            SELECT r.dt_transicao, r.usuario_id,
                   ea.descricao as etapa_anterior, en.descricao as etapa_nova,
                   ea.cor as cor_anterior, en.cor as cor_nova,
                   u.name as usuario_nome
            FROM public.hgr_ass_atn_reg_etp r
            LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp ea ON ea.id = r.etp_anterior_id
            LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp en ON en.id = r.etp_nova_id
            LEFT JOIN public.users u ON u.id = r.usuario_id
            WHERE r.hgr_ass_cad_atn_id = %s
            ORDER BY r.dt_transicao DESC
        """, (id,))
        for r in cur.fetchall():
            etapa_ant = r["etapa_anterior"] or "—"
            etapa_nov = r["etapa_nova"] or "—"
            events.append({
                "tipo": "etapa",
                "dt": str(r["dt_transicao"]) if r["dt_transicao"] else None,
                "descricao": f"Etapa: {etapa_ant} → {etapa_nov}",
                "usuario": r["usuario_nome"] or "Sistema",
                "icon": "🔄",
                "cor": r["cor_nova"] or "#6c757d",
            })

        # Anotações
        cur.execute("""
            SELECT r.descricao, r.created_at, r.created_by, u.name as usuario_nome
            FROM public.hgr_ass_atn_reg_ant r
            LEFT JOIN public.users u ON u.id = r.created_by
            WHERE r.hgr_ass_cad_atn_id = %s
            ORDER BY r.created_at DESC
        """, (id,))
        for r in cur.fetchall():
            events.append({
                "tipo": "anotacao",
                "dt": str(r["created_at"]) if r["created_at"] else None,
                "descricao": (r["descricao"] or "")[:200],
                "usuario": r["usuario_nome"] or "Sistema",
                "icon": "📝",
                "cor": "#8b5cf6",
            })

        # Uploads de anexos
        cur.execute("""
            SELECT r.filename, r.tipo, r.created_at, r.created_by, u.name as usuario_nome
            FROM public.hgr_ass_atn_reg_anx r
            LEFT JOIN public.users u ON u.id = r.created_by
            WHERE r.hgr_ass_cad_atn_id = %s
            ORDER BY r.created_at DESC
        """, (id,))
        for r in cur.fetchall():
            events.append({
                "tipo": "anexo",
                "dt": str(r["created_at"]) if r["created_at"] else None,
                "descricao": f"Anexo enviado: {r['filename'] or ''}" + (f" ({r['tipo']})" if r["tipo"] else ""),
                "usuario": r["usuario_nome"] or "Sistema",
                "icon": "📎",
                "cor": "#f59e0b",
            })

        # Ordenar por data DESC
        events.sort(key=lambda e: e["dt"] or "", reverse=True)
        return {"timeline": events}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}/anexos/{anx_id}/imagem", dependencies=[Depends(require_user)])
async def servir_imagem_anexo(id: int, anx_id: int, usuario_id: int = Depends(require_user)):
    """Serve o binário de um anexo de imagem (APEX pg 427)."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT anexo, mimetype, filename
            FROM public.hgr_ass_atn_reg_anx
            WHERE id = %s AND hgr_ass_cad_atn_id = %s
        """, (anx_id, id))
        row = cur.fetchone()
        if not row or row[0] is None:
            raise HTTPException(404, "Imagem não encontrada")
        dados, mimetype, filename = row
        if isinstance(dados, memoryview):
            dados = bytes(dados)
        headers = {}
        if filename:
            headers["Content-Disposition"] = f'inline; filename="{filename}"'
        return Response(content=dados, media_type=mimetype or "application/octet-stream", headers=headers)
    finally:
        cur.close()
        conn.close()


@router.get("/buscar-usuarios-sigs", dependencies=[Depends(require_user)])
async def buscar_usuarios_sigs(q: str = "", limit: int = 30, usuario_id: int = Depends(require_user)):
    """Busca usuários em beg_usuarios para equipe de atendimento (APEX P0411)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT id, nome, usuario, ativo
            FROM public.beg_usuarios
            WHERE ativo = 'S' AND LOWER(nome) LIKE %s
            ORDER BY nome LIMIT %s""",
            (f"%{q.lower()}%", limit))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/participantes", status_code=201, dependencies=[Depends(require_user)])
async def adicionar_participante(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Adiciona técnico/participante ao atendimento (APEX P0411)."""
    beg_usr_id = data.get("beg_usuarios_id")
    if not beg_usr_id:
        raise HTTPException(400, "ID do usuário obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_part
            (hgr_ass_cad_atn_id, beg_usuarios_id, sth_cad_filial_id, createdby)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING id, beg_usuarios_id, sth_cad_filial_id, created""",
            (atn_id, beg_usr_id, data.get("sth_cad_filial_id"), usuario_id))
        conn.commit()
        return cur.fetchone() or {"beg_usuarios_id": beg_usr_id, "adicionado": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{atn_id}/participantes/{part_id}", status_code=204, dependencies=[Depends(require_user)])
async def remover_participante(atn_id: int, part_id: int, usuario_id: int = Depends(require_user)):
    """Remove participante do atendimento."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_atn_reg_part WHERE id=%s AND hgr_ass_cad_atn_id=%s",
                    (part_id, atn_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Participante não encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/buscar-empresas", dependencies=[Depends(require_user)])
async def buscar_empresas(q: str = "", limit: int = 30, usuario_id: int = Depends(require_user)):
    """Busca empresas cadastradas para associação (APEX P0410)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT e.id, e.descricao, e.ativo,
                   json_agg(json_build_object('id', f.id, 'descricao', f.descricao) ORDER BY f.descricao) as filiais
            FROM public.sth_cad_empresa e
            LEFT JOIN public.sth_cad_filial f ON f.sth_cad_empresa_id = e.id AND f.ativo = 'S'
            WHERE e.ativo = 'S' AND LOWER(e.descricao) LIKE %s
            GROUP BY e.id, e.descricao, e.ativo
            ORDER BY e.descricao LIMIT %s
        """, (f"%{q.lower()}%", limit))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.patch("/{id}", dependencies=[Depends(require_user)])
async def atualizar_atendimento_parcial(id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Atualização parcial de campos do atendimento (empresa, unidade, responsável, etc.)."""
    CAMPOS_PERMITIDOS = {
        'sth_cad_empresa_id', 'sth_cad_filial_id', 'responsavel_id',
        'cliente', 'titulo', 'severidade', 'status', 'dt_fechamento',
        'garantia', 'garantia_obs',
        'autorizacao_status', 'autorizacao_obs',
        'deslocamento_km', 'deslocamento_valor_km',
        'geo_lat', 'geo_lng', 'geo_endereco',
    }
    campos = {k: v for k, v in data.items() if k in CAMPOS_PERMITIDOS}
    if not campos:
        raise HTTPException(400, "Nenhum campo permitido fornecido")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        set_clause = ", ".join(f"{k} = %s" for k in campos)
        values = list(campos.values()) + [id]
        cur.execute(f"UPDATE public.hgr_ass_cad_atn SET {set_clause}, updated_at=NOW() WHERE id=%s RETURNING id, titulo, status, cliente, sth_cad_empresa_id, sth_cad_filial_id", values)
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Atendimento não encontrado")
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


@router.get("/buscar-checklists", dependencies=[Depends(require_user)])
async def buscar_checklists(q: str = "", limit: int = 20, usuario_id: int = Depends(require_user)):
    """Busca checklists de fabricação para vinculação (APEX P0405)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        params = [f"%{q.lower()}%", f"%{q.lower()}%", f"%{q.lower()}%", limit]
        cur.execute("""SELECT id, n_motor, n_serie, descricao, tipo, status, pv, created
            FROM public.hgr_fab_ckl_cad_cck_lis
            WHERE LOWER(COALESCE(n_motor,'')) LIKE %s
               OR LOWER(COALESCE(n_serie,'')) LIKE %s
               OR LOWER(COALESCE(descricao,'')) LIKE %s
            ORDER BY created DESC LIMIT %s""", params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/checklists/vincular", status_code=201, dependencies=[Depends(require_user)])
async def vincular_checklist(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Vincula checklist de fabricação ao atendimento (APEX P0405)."""
    ckl_id = data.get("hgr_fab_ckl_cad_cck_lis_id")
    if not ckl_id:
        raise HTTPException(400, "ID do checklist obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_ckl
            (hgr_ass_cad_atn_id, hgr_fab_ckl_cad_cck_lis_id, createdby)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING id""",
            (atn_id, ckl_id, usuario_id))
        conn.commit()
        return {"vinculado": True, "hgr_fab_ckl_cad_cck_lis_id": ckl_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.get("/buscar-laudos", dependencies=[Depends(require_user)])
async def buscar_laudos(q: str = "", limit: int = 20, usuario_id: int = Depends(require_user)):
    """Busca laudos existentes para vinculação (APEX P0404)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        params = [f"%{q.lower()}%", f"%{q.lower()}%", f"%{q.lower()}%", limit]
        cur.execute("""SELECT id, codigo, num_lau, n_serie, n_motor, modelo_old as modelo, equipamento, created_at
            FROM public.hgr_srv_reg_lau
            WHERE LOWER(COALESCE(equipamento,'')) LIKE %s
               OR LOWER(COALESCE(n_serie,'')) LIKE %s
               OR LOWER(COALESCE(codigo,'')) LIKE %s
            ORDER BY created_at DESC LIMIT %s""", params)
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/laudos/vincular", status_code=201, dependencies=[Depends(require_user)])
async def vincular_laudo_existente(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Vincula laudo existente ao atendimento (APEX P0404)."""
    lau_id = data.get("hgr_srv_reg_lau_id")
    if not lau_id:
        raise HTTPException(400, "ID do laudo obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_lau
            (hgr_ass_cad_atn_id, hgr_srv_reg_lau_id, createdby)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING id""",
            (atn_id, lau_id, usuario_id))
        conn.commit()
        return {"vinculado": True, "hgr_srv_reg_lau_id": lau_id}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/negocios", status_code=201, dependencies=[Depends(require_user)])
async def vincular_negocio(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Vincula um negócio CRM ao atendimento (APEX P0402). Aceita ID existente ou placeholder."""
    neg_id = data.get("hgr_crm_cad_neg_id")
    if not neg_id:
        raise HTTPException(400, "ID do negócio CRM obrigatório")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_neg
            (hgr_ass_cad_atn_id, hgr_crm_cad_neg_id, createdby)
            VALUES (%s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING id, hgr_crm_cad_neg_id, created""",
            (atn_id, neg_id, usuario_id))
        row = cur.fetchone()
        conn.commit()
        return row or {"hgr_crm_cad_neg_id": neg_id, "vinculado": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{atn_id}/anotacoes/{ant_id}", dependencies=[Depends(require_user)])
async def editar_anotacao(atn_id: int, ant_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Edita anotação e preserva texto original (APEX P0401)."""
    nova_desc = data.get("descricao", "").strip()
    if not nova_desc:
        raise HTTPException(400, "Descrição não pode ser vazia")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Preserve original on first edit
        cur.execute("""UPDATE public.hgr_ass_atn_reg_ant
            SET descricao = %s,
                updated_at = NOW(),
                updated_by = %s,
                descricao_original = COALESCE(descricao_original, descricao)
            WHERE id = %s AND hgr_ass_cad_atn_id = %s
            RETURNING id, descricao, descricao_original, created_at, updated_at""",
            (nova_desc, usuario_id, ant_id, atn_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Anotação não encontrada")
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


@router.post("/{atn_id}/laudos", status_code=201, dependencies=[Depends(require_user)])
async def criar_laudo_atendimento(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Cria laudo técnico e vincula ao atendimento (APEX P0397)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Verificar se atendimento existe
        cur.execute("SELECT id FROM public.hgr_ass_cad_atn WHERE id=%s", (atn_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Atendimento não encontrado")

        # Criar laudo
        cur.execute("""INSERT INTO public.hgr_srv_reg_lau
            (n_serie, n_motor, equipamento, modelo_old, reclamacao, observacoes, solucao,
             of_os, dt_falha, dt_entrada, createdby)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id, n_serie, equipamento, created_at""",
            (data.get("n_serie"), data.get("n_motor"), data.get("equipamento"),
             data.get("modelo"), data.get("reclamacao"), data.get("observacoes"),
             data.get("solucao"), data.get("of_os"),
             data.get("dt_falha") or None, data.get("dt_entrada") or None,
             usuario_id))
        laudo = cur.fetchone()

        # Vincular ao atendimento
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_lau
            (hgr_ass_cad_atn_id, hgr_srv_reg_lau_id, createdby)
            VALUES (%s, %s, %s)""", (atn_id, laudo["id"], usuario_id))

        conn.commit()
        return laudo
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_user)])
async def criar_atendimento(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_cad_atn
            (titulo, descricao, cliente, hgr_ass_cad_tp_atn_id, hgr_ass_cad_can_ent_id,
             responsavel_id, created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("titulo"), data.get("descricao"), data.get("cliente"),
             data.get("hgr_ass_cad_tp_atn_id"), data.get("hgr_ass_cad_can_ent_id"),
             data.get("responsavel_id"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Start Atendimento (APEX pg 375 process startAtn) ---
@router.post("/{atn_id}/iniciar", dependencies=[Depends(require_user)])
async def iniciar_atendimento(atn_id: int, usuario_id: int = Depends(require_user)):
    """
    Inicia atendimento — APEX pg 375 ON_DEMAND startAtn.
    Muda status AGU→AND, atribui responsável, move para primeira etapa AND do funil.
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Buscar primeira etapa com status AND (em andamento) do funil
        cur.execute("""
            SELECT e.id as etp_id, s.sigla as status_sigla
            FROM public.hgr_ass_cfg_fnl_reg_etp e
            LEFT JOIN public.hgr_ass_cad_stt s ON s.id = e.hgr_ass_cad_stt_id
            WHERE e.ativo = 'S'
            ORDER BY e.ordem LIMIT 1
        """)
        etp = cur.fetchone()

        # Buscar etapa atual
        cur.execute("SELECT hgr_ass_cfg_fnl_reg_etp_id FROM public.hgr_ass_cad_atn WHERE id = %s", (atn_id,))
        atn = cur.fetchone()
        if not atn:
            raise HTTPException(404, "Atendimento não encontrado")
        etp_anterior = atn.get("hgr_ass_cfg_fnl_reg_etp_id")

        # Atualizar atendimento
        update_fields = ["status = 'EM_ANDAMENTO'", "responsavel_id = %s", "updated_at = NOW()"]
        update_params = [usuario_id]
        if etp:
            update_fields.append("hgr_ass_cfg_fnl_reg_etp_id = %s")
            update_params.append(etp["etp_id"])

        update_params.append(atn_id)
        cur.execute(f"UPDATE public.hgr_ass_cad_atn SET {', '.join(update_fields)} WHERE id = %s RETURNING *", update_params)

        # Log transição de etapa
        if etp:
            cur.execute("""INSERT INTO public.hgr_ass_atn_reg_etp
                (hgr_ass_cad_atn_id, etp_anterior_id, etp_nova_id, usuario_id)
                VALUES (%s, %s, %s, %s)""", (atn_id, etp_anterior, etp["etp_id"], usuario_id))

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


# ── Vincular Atendimento a Atendimento (APEX P0429) ───────────────────────────

@router.get("/{atn_id}/relacionados", dependencies=[Depends(require_user)])
async def listar_relacionados(atn_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT r.id, r.tipo_rel, r.created,
                   CASE WHEN r.hgr_ass_cad_atn_id_1 = %s THEN r.hgr_ass_cad_atn_id_2
                        ELSE r.hgr_ass_cad_atn_id_1 END as atn_rel_id,
                   a.codigo as rel_codigo, a.titulo as rel_titulo,
                   a.status as rel_status, a.cliente as rel_cliente
            FROM public.hgr_ass_atn_rel_atn r
            JOIN public.hgr_ass_cad_atn a ON a.id = CASE
                WHEN r.hgr_ass_cad_atn_id_1 = %s THEN r.hgr_ass_cad_atn_id_2
                ELSE r.hgr_ass_cad_atn_id_1 END
            WHERE r.hgr_ass_cad_atn_id_1 = %s OR r.hgr_ass_cad_atn_id_2 = %s
            ORDER BY r.created DESC
        """, (atn_id, atn_id, atn_id, atn_id))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/relacionados", status_code=201, dependencies=[Depends(require_user)])
async def vincular_atendimento(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    rel_id = data.get("atn_rel_id")
    tipo_rel = data.get("tipo_rel", "RELACIONADO")
    if not rel_id:
        raise HTTPException(400, "atn_rel_id obrigatorio")
    if rel_id == atn_id:
        raise HTTPException(400, "Nao e possivel vincular um atendimento a si mesmo")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_rel_atn
            (hgr_ass_cad_atn_id_1, hgr_ass_cad_atn_id_2, tipo_rel, createdby)
            VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING id""",
            (min(atn_id, rel_id), max(atn_id, rel_id), tipo_rel, usuario_id))
        conn.commit()
        return cur.fetchone() or {"vinculado": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{atn_id}/relacionados/{rel_reg_id}", status_code=204, dependencies=[Depends(require_user)])
async def desvincular_atendimento(atn_id: int, rel_reg_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""DELETE FROM public.hgr_ass_atn_rel_atn
            WHERE id=%s AND (hgr_ass_cad_atn_id_1=%s OR hgr_ass_cad_atn_id_2=%s)""",
            (rel_reg_id, atn_id, atn_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Vinculo nao encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Associar RAM ao Atendimento (APEX P0445) ──────────────────────────────────

@router.get("/{atn_id}/rams", dependencies=[Depends(require_user)])
async def listar_rams(atn_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT id, ram_id, ram_descricao, created FROM public.hgr_ass_atn_reg_ram WHERE hgr_ass_cad_atn_id=%s ORDER BY created DESC",
            (atn_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/rams", status_code=201, dependencies=[Depends(require_user)])
async def associar_ram(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    ram_id = data.get("ram_id")
    ram_desc = data.get("ram_descricao")
    if not ram_id:
        raise HTTPException(400, "ram_id obrigatorio")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_ass_atn_reg_ram (hgr_ass_cad_atn_id, ram_id, ram_descricao, createdby) VALUES (%s, %s, %s, %s) RETURNING id, ram_id, ram_descricao",
            (atn_id, ram_id, ram_desc, usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{atn_id}/rams/{ram_reg_id}", status_code=204, dependencies=[Depends(require_user)])
async def desassociar_ram(atn_id: int, ram_reg_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_atn_reg_ram WHERE id=%s AND hgr_ass_cad_atn_id=%s", (ram_reg_id, atn_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Registro nao encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Vínculos externos ATN↔CHM / ATN↔RQ03 (tarefa 250) ───────────────────────
@router.get("/{atn_id}/vinculos-ext", dependencies=[Depends(require_user)])
async def listar_vinculos_ext(atn_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT * FROM public.hgr_ass_atn_rel_ext
            WHERE hgr_ass_cad_atn_id=%s ORDER BY created DESC""", (atn_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/vinculos-ext", status_code=201, dependencies=[Depends(require_user)])
async def criar_vinculo_ext(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    ref_tipo = data.get("ref_tipo", "").upper()
    if ref_tipo not in ("CHM", "RQ03"):
        raise HTTPException(400, "ref_tipo deve ser CHM ou RQ03")
    ref_id = data.get("ref_id")
    if not ref_id:
        raise HTTPException(400, "ref_id obrigatorio")
    # Buscar código/título do referenciado para cache
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        ref_codigo, ref_titulo = None, None
        try:
            if ref_tipo == "CHM":
                cur.execute("SELECT codigo, assunto as titulo FROM public.hgr_chm_cad_chm WHERE id=%s", (ref_id,))
            else:
                cur.execute("SELECT codigo, descricao as titulo FROM public.beg_rq03 WHERE id=%s", (ref_id,))
            row = cur.fetchone()
            if row:
                ref_codigo = row.get("codigo")
                ref_titulo = row.get("titulo") or ""
        except Exception:
            pass
        cur.execute("""INSERT INTO public.hgr_ass_atn_rel_ext
            (hgr_ass_cad_atn_id, ref_tipo, ref_id, ref_codigo, ref_titulo, createdby)
            VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING RETURNING *""",
            (atn_id, ref_tipo, ref_id, ref_codigo, ref_titulo, usuario_id))
        conn.commit()
        return cur.fetchone() or {"vinculado": True}
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{atn_id}/vinculos-ext/{vinc_id}", status_code=204, dependencies=[Depends(require_user)])
async def remover_vinculo_ext(atn_id: int, vinc_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_atn_rel_ext WHERE id=%s AND hgr_ass_cad_atn_id=%s", (vinc_id, atn_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Vinculo nao encontrado")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Autorização de Custo (tarefa 249) ────────────────────────────────────────
@router.get("/{atn_id}/custo-resumo", dependencies=[Depends(require_user)])
async def custo_resumo(atn_id: int, usuario_id: int = Depends(require_user)):
    """Retorna custo total das peças e o limite configurado."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT COALESCE(SUM(quantidade * valor_unit), 0) AS custo_total
            FROM public.hgr_ass_atn_reg_peca WHERE hgr_ass_cad_atn_id=%s AND valor_unit IS NOT NULL""", (atn_id,))
        custo_total = float(cur.fetchone()["custo_total"])
        cur.execute("SELECT valor FROM public.hgr_ass_cfg_params WHERE chave='LIMITE_CUSTO_AUTORIZACAO'")
        row = cur.fetchone()
        limite = float(row["valor"]) if row and row["valor"] else None
        return {
            "custo_total": custo_total,
            "limite": limite,
            "excede": (limite is not None and custo_total > limite),
        }
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/solicitar-autorizacao", dependencies=[Depends(require_user)])
async def solicitar_autorizacao(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Registra solicitação de autorização de custo (tarefa 249)."""
    obs = data.get("obs", "")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_ass_cad_atn
            SET autorizacao_status='PENDENTE', autorizacao_obs=%s,
                autorizacao_dt=NOW(), autorizacao_by=%s, updated_at=NOW()
            WHERE id=%s RETURNING id, autorizacao_status, autorizacao_obs""",
            (obs, usuario_id, atn_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Atendimento não encontrado")
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


# ── Peças Utilizadas (tarefa 248) ────────────────────────────────────────────
@router.get("/{atn_id}/pecas", dependencies=[Depends(require_user)])
async def listar_pecas(atn_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_ass_atn_reg_peca WHERE hgr_ass_cad_atn_id=%s ORDER BY created", (atn_id,))
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/{atn_id}/pecas", status_code=201, dependencies=[Depends(require_user)])
async def adicionar_peca(atn_id: int, data: dict, usuario_id: int = Depends(require_user)):
    if not data.get("descricao", "").strip():
        raise HTTPException(400, "Descrição obrigatória")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_ass_atn_reg_peca
            (hgr_ass_cad_atn_id, codigo, descricao, quantidade, unidade, valor_unit, observacao, createdby)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (atn_id, data.get("codigo"), data["descricao"], data.get("quantidade", 1),
             data.get("unidade", "UN"), data.get("valor_unit"), data.get("observacao"), usuario_id))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.delete("/{atn_id}/pecas/{peca_id}", status_code=204, dependencies=[Depends(require_user)])
async def remover_peca(atn_id: int, peca_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM public.hgr_ass_atn_reg_peca WHERE id=%s AND hgr_ass_cad_atn_id=%s", (peca_id, atn_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Peça não encontrada")
        conn.commit()
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ── Dashboard de Assistência Técnica (tarefa 239) ─────────────────────────────
@router.get("/dashboard", dependencies=[Depends(require_user)])
async def dashboard_at(usuario_id: int = Depends(require_user)):
    """
    Retorna métricas agregadas para o dashboard de AT:
    - por_etapa: contagem por etapa do funil
    - por_tecnico: contagem por responsável
    - por_tipo: contagem por tipo de atendimento
    - sla_vencidos: atendimentos abertos há mais de 7 dias
    - totais: abertos, fechados, sem_responsavel
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # por etapa
        cur.execute("""
            SELECT COALESCE(etp.descricao, 'Sem etapa') AS etapa,
                   COALESCE(etp.cor, '#6c757d') AS cor,
                   COUNT(*) AS total
            FROM public.hgr_ass_cad_atn a
            LEFT JOIN public.hgr_ass_cfg_fnl_reg_etp etp ON etp.id = a.hgr_ass_cfg_fnl_reg_etp_id
            WHERE a.status NOT IN ('FECHADO', 'CANCELADO')
            GROUP BY etapa, cor
            ORDER BY total DESC
        """)
        por_etapa = cur.fetchall()

        # por tecnico (top 10)
        cur.execute("""
            SELECT COALESCE(u.name, 'Sem responsável') AS tecnico, COUNT(*) AS total
            FROM public.hgr_ass_cad_atn a
            LEFT JOIN public.users u ON u.id = a.responsavel_id
            WHERE a.status NOT IN ('FECHADO', 'CANCELADO')
            GROUP BY tecnico
            ORDER BY total DESC
            LIMIT 10
        """)
        por_tecnico = cur.fetchall()

        # por tipo
        cur.execute("""
            SELECT COALESCE(tp.descricao, 'Sem tipo') AS tipo, COUNT(*) AS total
            FROM public.hgr_ass_cad_atn a
            LEFT JOIN public.hgr_ass_cad_tp_atn tp ON tp.id = a.hgr_ass_cad_tp_atn_id
            WHERE a.status NOT IN ('FECHADO', 'CANCELADO')
            GROUP BY tipo
            ORDER BY total DESC
        """)
        por_tipo = cur.fetchall()

        # sla vencidos (abertos > 7 dias sem fechamento)
        cur.execute("""
            SELECT a.id, a.codigo, a.titulo, a.cliente,
                   a.dt_abertura, u.name AS responsavel_nome,
                   EXTRACT(DAY FROM NOW() - a.dt_abertura)::int AS dias_aberto
            FROM public.hgr_ass_cad_atn a
            LEFT JOIN public.users u ON u.id = a.responsavel_id
            WHERE a.status NOT IN ('FECHADO', 'CANCELADO')
              AND a.dt_abertura IS NOT NULL
              AND NOW() - a.dt_abertura > INTERVAL '7 days'
            ORDER BY a.dt_abertura ASC
            LIMIT 50
        """)
        sla_vencidos = cur.fetchall()

        # totais gerais
        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE status NOT IN ('FECHADO','CANCELADO')) AS abertos,
              COUNT(*) FILTER (WHERE status IN ('FECHADO','CANCELADO')) AS fechados,
              COUNT(*) FILTER (WHERE status NOT IN ('FECHADO','CANCELADO') AND responsavel_id IS NULL) AS sem_responsavel,
              COUNT(*) AS total_geral
            FROM public.hgr_ass_cad_atn
        """)
        totais = cur.fetchone()

        return {
            "por_etapa": list(por_etapa),
            "por_tecnico": list(por_tecnico),
            "por_tipo": list(por_tipo),
            "sla_vencidos": list(sla_vencidos),
            "totais": dict(totais) if totais else {},
        }
    finally:
        cur.close()
        conn.close()
