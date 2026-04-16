# -*- coding: utf-8 -*-
"""CRUD de Reuniões/Agendas + Pautas + Participantes + Decisões + Ações."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission, get_user_scope, build_scope_filter, get_user_tipo
from backend.core.config import logger
from backend.services.sigs_notifications import notify_reuniao_agendada

router = APIRouter()


def create_reunioes_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.sth_reu_tipo (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL, ativo VARCHAR(1) DEFAULT 'S',
                sigla VARCHAR(20), created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.sth_reu_agenda (
                id BIGSERIAL PRIMARY KEY, titulo VARCHAR(500) NOT NULL, descricao TEXT,
                dt_agenda DATE, hr_inicio TIME, hr_fim TIME, local VARCHAR(300),
                sth_reu_tipo_id BIGINT, responsavel_id BIGINT,
                status VARCHAR(20) DEFAULT 'AGENDADA',
                created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.sth_reu_participante (
                id BIGSERIAL PRIMARY KEY, sth_reu_agenda_id BIGINT NOT NULL,
                usuario_id BIGINT NOT NULL, presente VARCHAR(1),
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.sth_reu_pauta (
                id BIGSERIAL PRIMARY KEY, sth_reu_agenda_id BIGINT NOT NULL,
                descricao TEXT NOT NULL, ordem INTEGER,
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.sth_reu_decisao (
                id BIGSERIAL PRIMARY KEY, sth_reu_agenda_id BIGINT NOT NULL,
                descricao TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.sth_reu_acao (
                id BIGSERIAL PRIMARY KEY, sth_reu_agenda_id BIGINT NOT NULL,
                descricao TEXT NOT NULL, responsavel_id BIGINT,
                dt_prazo DATE, status VARCHAR(20) DEFAULT 'PENDENTE',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        # Migrations inline
        cur.execute("ALTER TABLE public.sth_reu_tipo ADD COLUMN IF NOT EXISTS sigla VARCHAR(20)")
        cur.execute("ALTER TABLE public.sth_reu_tipo ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()")
        cur.execute("ALTER TABLE public.sth_reu_participante ADD COLUMN IF NOT EXISTS usuario_id BIGINT")
        cur.execute("ALTER TABLE public.sth_reu_pauta ADD COLUMN IF NOT EXISTS em_discussao VARCHAR(1) DEFAULT 'N'")
        cur.execute("ALTER TABLE public.sth_reu_agenda ADD COLUMN IF NOT EXISTS duracao_real INTEGER")
        conn.commit()
        logger.info("Tabelas de reuniões verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas reuniões: {e}")
    finally:
        cur.close()
        conn.close()


# --- Tipos de reunião (MUST be before /{id} to avoid conflict) ---
@router.get("/tipos", dependencies=[Depends(require_permission('RNOE'))])
async def listar_tipos(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.sth_reu_tipo WHERE ativo = 'S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.get("/pendentes-count", dependencies=[Depends(require_permission('RNOE'))])
async def pendentes_count(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'a')
        cur.execute(f"""
            SELECT
                COUNT(*) FILTER (WHERE COALESCE(a.dt_agenda, a.dt_hr_inicio::date) < CURRENT_DATE
                    AND COALESCE(a.status, 'AGENDADA') = 'AGENDADA') as vencidas,
                COUNT(*) FILTER (WHERE COALESCE(a.dt_agenda, a.dt_hr_inicio::date)
                    BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
                    AND COALESCE(a.status, 'AGENDADA') = 'AGENDADA') as proximas
            FROM public.sth_reu_agenda a WHERE 1=1 {scope_sql}
        """, scope_params)
        return cur.fetchone()
    finally:
        cur.close()
        conn.close()


@router.get("/exportar", dependencies=[Depends(require_permission('RNOE'))])
async def exportar_csv(
    status: Optional[str] = None,
    tipo_id: Optional[int] = None,
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    from fastapi.responses import StreamingResponse
    import csv, io
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        STATUS_EXPR = """COALESCE(a.status,
            CASE WHEN a.ind_cancelada='S' THEN 'CANCELADA'
                 WHEN a.ind_encerramento='S' THEN 'ENCERRADA'
                 ELSE 'AGENDADA' END)"""
        query = f"""
            SELECT COALESCE(a.titulo, a.descricao) as titulo,
                   t.descricao as tipo,
                   COALESCE(a.dt_agenda, a.dt_hr_inicio::date) as data,
                   COALESCE(a.hr_inicio, a.dt_hr_inicio::time) as inicio,
                   COALESCE(a.hr_fim, a.dt_hr_termino::time) as fim,
                   a.local, {STATUS_EXPR} as status,
                   u.name as responsavel,
                   (SELECT COUNT(*) FROM public.sth_reu_participante
                    WHERE sth_reu_agenda_id = a.id) as participantes
            FROM public.sth_reu_agenda a
            LEFT JOIN public.users u ON u.id = COALESCE(a.responsavel_id, a.sth_stm_usuario_id)
            LEFT JOIN public.sth_reu_tipo t ON t.id = a.sth_reu_tipo_id
            WHERE 1=1
        """
        params = []
        if status:
            query += f" AND {STATUS_EXPR} = %s"; params.append(status)
        if tipo_id:
            query += " AND a.sth_reu_tipo_id = %s"; params.append(tipo_id)
        if dt_inicio:
            query += " AND COALESCE(a.dt_agenda, a.dt_hr_inicio::date) >= %s"; params.append(dt_inicio)
        if dt_fim:
            query += " AND COALESCE(a.dt_agenda, a.dt_hr_inicio::date) <= %s"; params.append(dt_fim)
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'a')
        query += scope_sql; params.extend(scope_params)
        query += " ORDER BY COALESCE(a.dt_agenda, a.dt_hr_inicio::date) DESC NULLS LAST"
        cur.execute(query, params)
        rows = cur.fetchall()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Titulo', 'Tipo', 'Data', 'Inicio', 'Fim', 'Local', 'Status', 'Responsavel', 'Participantes'])
        for r in rows:
            writer.writerow([r['titulo'], r['tipo'], r['data'], r['inicio'],
                             r['fim'], r['local'], r['status'], r['responsavel'], r['participantes']])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]), media_type='text/csv',
            headers={'Content-Disposition': 'attachment; filename="reunioes.csv"'}
        )
    finally:
        cur.close()
        conn.close()


@router.get("/", dependencies=[Depends(require_permission('RNOE'))])
async def listar_agendas(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    tipo_id: Optional[int] = None,
    dt_inicio: Optional[str] = None,
    dt_fim: Optional[str] = None,
    busca: Optional[str] = None,
    usuario_id: int = Depends(require_user),
):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        STATUS_EXPR = """COALESCE(a.status,
            CASE WHEN a.ind_cancelada = 'S' THEN 'CANCELADA'
                 WHEN a.ind_encerramento = 'S' THEN 'ENCERRADA'
                 ELSE 'AGENDADA' END)"""
        query = f"""
            SELECT a.*,
                   COALESCE(a.titulo, a.descricao, a.descricao_old) as _titulo,
                   COALESCE(a.dt_agenda, a.dt_hr_inicio::date) as _dt_agenda,
                   COALESCE(a.hr_inicio, a.dt_hr_inicio::time) as _hr_inicio,
                   COALESCE(a.hr_fim, a.dt_hr_termino::time) as _hr_fim,
                   {STATUS_EXPR} as _status,
                   COALESCE(a.responsavel_id, a.sth_stm_usuario_id) as _responsavel_id,
                   u.name as responsavel_nome, t.descricao as tipo_descricao,
                   (SELECT COUNT(*) FROM public.sth_reu_participante
                    WHERE sth_reu_agenda_id = a.id) as qtd_participantes,
                   (SELECT COUNT(*) FROM public.sth_reu_acao
                    WHERE sth_reu_agenda_id = a.id) as qtd_acoes
            FROM public.sth_reu_agenda a
            LEFT JOIN public.users u ON u.id = COALESCE(a.responsavel_id, a.sth_stm_usuario_id)
            LEFT JOIN public.sth_reu_tipo t ON t.id = a.sth_reu_tipo_id
            WHERE 1=1
        """
        params = []
        if status:
            query += f" AND {STATUS_EXPR} = %s"; params.append(status)
        if tipo_id:
            query += " AND a.sth_reu_tipo_id = %s"; params.append(tipo_id)
        if dt_inicio:
            query += " AND COALESCE(a.dt_agenda, a.dt_hr_inicio::date) >= %s"; params.append(dt_inicio)
        if dt_fim:
            query += " AND COALESCE(a.dt_agenda, a.dt_hr_inicio::date) <= %s"; params.append(dt_fim)
        if busca:
            query += """ AND (LOWER(COALESCE(a.titulo, a.descricao)) LIKE %s
                          OR LOWER(a.local) LIKE %s)"""
            params.extend([f'%{busca.lower()}%', f'%{busca.lower()}%'])
        scope = get_user_scope(usuario_id)
        scope_sql, scope_params = build_scope_filter(scope, 'a')
        query += scope_sql
        params.extend(scope_params)
        cur.execute(f"SELECT COUNT(*) as total FROM ({query}) sub", params)
        total = cur.fetchone()["total"]
        query += " ORDER BY COALESCE(a.dt_agenda, a.dt_hr_inicio::date) DESC NULLS LAST LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cur.execute(query, params)
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/{id}", dependencies=[Depends(require_permission('RNOE'))])
async def obter_agenda(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT a.*,
                   COALESCE(a.titulo, a.descricao, a.descricao_old) as _titulo,
                   COALESCE(a.dt_agenda, a.dt_hr_inicio::date) as _dt_agenda,
                   COALESCE(a.hr_inicio, a.dt_hr_inicio::time) as _hr_inicio,
                   COALESCE(a.hr_fim, a.dt_hr_termino::time) as _hr_fim,
                   COALESCE(a.status,
                       CASE WHEN a.ind_cancelada = 'S' THEN 'CANCELADA'
                            WHEN a.ind_encerramento = 'S' THEN 'ENCERRADA'
                            ELSE 'AGENDADA' END) as _status,
                   COALESCE(a.responsavel_id, a.sth_stm_usuario_id) as _responsavel_id,
                   u.name as responsavel_nome, t.descricao as tipo_descricao
            FROM public.sth_reu_agenda a
            LEFT JOIN public.users u ON u.id = COALESCE(a.responsavel_id, a.sth_stm_usuario_id)
            LEFT JOIN public.sth_reu_tipo t ON t.id = a.sth_reu_tipo_id
            WHERE a.id = %s
        """, (id,))
        agenda = cur.fetchone()
        if not agenda:
            raise HTTPException(404, "Agenda não encontrada")

        # Scope validation
        scope = get_user_scope(usuario_id)
        if not scope.get('bypass'):
            record_filial = agenda.get('sth_cad_filial_id') or agenda.get('hgr_cad_filial_id')
            if record_filial and scope['filial_ids'] and int(record_filial) not in scope['filial_ids']:
                raise HTTPException(403, "Sem acesso a este registro")

        # Participantes
        cur.execute("""SELECT p.*, u.name as usuario_nome FROM public.sth_reu_participante p
            LEFT JOIN public.users u ON u.id = p.beg_usuario_id
            WHERE p.sth_reu_agenda_id = %s""", (id,))
        agenda["participantes"] = cur.fetchall()
        # Pautas (com decisão vinculada)
        cur.execute("""SELECT pa.*, d.descricao as decisao
            FROM public.sth_reu_pauta pa
            LEFT JOIN public.sth_reu_decisao d ON d.id = pa.sth_reu_decisao_id
            WHERE pa.sth_reu_agenda_id = %s ORDER BY pa.ordem""", (id,))
        agenda["pautas"] = cur.fetchall()
        # Decisões (via pautas)
        cur.execute("""SELECT DISTINCT d.* FROM public.sth_reu_decisao d
            JOIN public.sth_reu_pauta pa ON pa.sth_reu_decisao_id = d.id
            WHERE pa.sth_reu_agenda_id = %s
            ORDER BY d.id""", (id,))
        agenda["decisoes"] = cur.fetchall()
        # Comentários (ações ficam via comentários)
        cur.execute("""SELECT c.*, u.name as autor_nome
            FROM public.sth_reu_comentario c
            LEFT JOIN public.users u ON u.id = c.createdby
            WHERE c.sth_reu_agenda_id = %s
            ORDER BY c.created""", (id,))
        agenda["comentarios"] = cur.fetchall()
        # Ações (via comentários)
        cur.execute("""SELECT ac.*, c.comentario as descricao, u.name as autor_nome
            FROM public.sth_reu_acao ac
            LEFT JOIN public.sth_reu_comentario c ON c.id = ac.sth_reu_comentario_id
            LEFT JOIN public.users u ON u.id = ac.createdby
            WHERE c.sth_reu_agenda_id = %s
            ORDER BY ac.created""", (id,))
        agenda["acoes"] = cur.fetchall()
        return agenda
    finally:
        cur.close()
        conn.close()


@router.post("/", status_code=201, dependencies=[Depends(require_permission('RNOE', 'M'))])
async def criar_agenda(data: dict, usuario_id: int = Depends(require_user)):
    # Auto-fill empresa/filial from logged-in user
    user_data = get_user_tipo(usuario_id)
    if user_data:
        if not data.get('sth_cad_empresa_id'):
            data['sth_cad_empresa_id'] = user_data.get('sth_cad_empresa_id')
        if not data.get('sth_cad_filial_id'):
            data['sth_cad_filial_id'] = user_data.get('sth_cad_filial_id')
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.sth_reu_agenda
                (titulo, descricao, dt_agenda, hr_inicio, hr_fim, local,
                 sth_reu_tipo_id, responsavel_id, sth_cad_empresa_id, sth_cad_filial_id)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.get("titulo"), data.get("descricao"), data.get("dt_agenda"),
              data.get("hr_inicio"), data.get("hr_fim"), data.get("local"),
              data.get("sth_reu_tipo_id"), data.get("responsavel_id", usuario_id),
              data.get("sth_cad_empresa_id"), data.get("sth_cad_filial_id")))
        conn.commit()
        row = cur.fetchone()
        try:
            participantes = data.get("participante_ids", [])
            if participantes:
                notify_reuniao_agendada(row['id'], data.get('titulo', ''), participantes, usuario_id)
        except Exception:
            pass
        return row
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/{id}", dependencies=[Depends(require_permission('RNOE', 'M'))])
async def atualizar_agenda(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.sth_reu_agenda SET
                titulo=COALESCE(%s,titulo), descricao=COALESCE(%s,descricao),
                dt_agenda=COALESCE(%s,dt_agenda), hr_inicio=COALESCE(%s,hr_inicio),
                hr_fim=COALESCE(%s,hr_fim), local=COALESCE(%s,local),
                status=COALESCE(%s,status), updated_at=NOW()
            WHERE id=%s RETURNING *
        """, (data.get("titulo"), data.get("descricao"), data.get("dt_agenda"),
              data.get("hr_inicio"), data.get("hr_fim"), data.get("local"),
              data.get("status"), id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Agenda não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Participantes (modal) ---
@router.post("/{agenda_id}/participantes", status_code=201, dependencies=[Depends(require_permission('RNOE', 'M'))])
async def add_participante(agenda_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.sth_reu_participante (sth_reu_agenda_id, usuario_id)
            VALUES (%s, %s) RETURNING *
        """, (agenda_id, data.get("usuario_id")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Pautas (inline) ---
@router.post("/{agenda_id}/pautas", status_code=201, dependencies=[Depends(require_permission('RNOE', 'M'))])
async def add_pauta(agenda_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.sth_reu_pauta (sth_reu_agenda_id, descricao, ordem)
            VALUES (%s, %s, %s) RETURNING *
        """, (agenda_id, data.get("descricao"), data.get("ordem")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Decisões (inline) ---
@router.post("/{agenda_id}/decisoes", status_code=201, dependencies=[Depends(require_permission('RNOE', 'M'))])
async def add_decisao(agenda_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.sth_reu_decisao (sth_reu_agenda_id, descricao)
            VALUES (%s, %s) RETURNING *
        """, (agenda_id, data.get("descricao")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Ações (modal - gera tarefa) ---
@router.post("/{agenda_id}/acoes", status_code=201, dependencies=[Depends(require_permission('RNOE', 'M'))])
async def add_acao(agenda_id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            INSERT INTO public.sth_reu_acao (sth_reu_agenda_id, descricao, responsavel_id, dt_prazo)
            VALUES (%s, %s, %s, %s) RETURNING *
        """, (agenda_id, data.get("descricao"), data.get("responsavel_id"), data.get("dt_prazo")))
        acao = cur.fetchone()

        # Gerar tarefa automaticamente (APEX behavior: ações de reunião geram tarefas)
        if data.get("gerar_tarefa", True):
            try:
                cur.execute("""
                    INSERT INTO public.hgr_tar_cad_tarefa
                        (titulo, descricao, dt_previsao, responsavel_id, status, prioridade, created_by)
                    VALUES (%s, %s, %s, %s, 'ABERTA', 'MEDIA', %s)
                    RETURNING id
                """, (f"[Reunião] {data.get('descricao', '')[:200]}",
                      f"Ação gerada automaticamente da reunião #{agenda_id}",
                      data.get("dt_prazo"), data.get("responsavel_id"), usuario_id))
                tarefa = cur.fetchone()
                acao["tarefa_id"] = tarefa["id"] if tarefa else None
            except Exception:
                pass  # Não falhar a ação por erro na criação da tarefa
        conn.commit()
        return acao
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()




# ============================================================
# Tipos de Reunião — CRUD completo
# ============================================================
@router.post("/tipos", status_code=201, dependencies=[Depends(require_permission('RNOE', 'M'))])
async def criar_tipo(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        descricao = (data.get("descricao") or "").strip()
        if not descricao:
            raise HTTPException(400, "descricao obrigatória")
        cur.execute("""
            INSERT INTO public.sth_reu_tipo (descricao, sigla, ativo)
            VALUES (%s, %s, 'S') RETURNING *
        """, (descricao, (data.get("sigla") or "").strip() or None))
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


@router.delete("/tipos/{tipo_id}", status_code=204, dependencies=[Depends(require_permission('RNOE', 'M'))])
async def excluir_tipo(tipo_id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("UPDATE public.sth_reu_tipo SET ativo='N' WHERE id=%s", (tipo_id,))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Marcar Presença
# ============================================================
@router.patch("/{agenda_id}/participantes/{part_id}/presenca", dependencies=[Depends(require_permission('RNOE', 'M'))])
async def marcar_presenca(agenda_id: int, part_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Alterna presença do participante."""
    presente = 'S' if data.get("presente") else 'N'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.sth_reu_participante SET presente=%s
            WHERE id=%s AND sth_reu_agenda_id=%s RETURNING *
        """, (presente, part_id, agenda_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Participante não encontrado")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Seguir Pauta
# ============================================================
@router.patch("/{agenda_id}/pautas/{pauta_id}/discussao", dependencies=[Depends(require_permission('RNOE', 'M'))])
async def seguir_pauta(agenda_id: int, pauta_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Marca item de pauta como Em Discussão."""
    em_discussao = 'S' if data.get("em_discussao") else 'N'
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        if em_discussao == 'S':
            cur.execute(
                "UPDATE public.sth_reu_pauta SET em_discussao='N' WHERE sth_reu_agenda_id=%s",
                (agenda_id,)
            )
        cur.execute("""
            UPDATE public.sth_reu_pauta SET em_discussao=%s
            WHERE id=%s AND sth_reu_agenda_id=%s RETURNING *
        """, (em_discussao, pauta_id, agenda_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Pauta não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ============================================================
# Duração Real
# ============================================================
@router.patch("/{agenda_id}/duracao-real", dependencies=[Depends(require_permission('RNOE', 'M'))])
async def registrar_duracao_real(agenda_id: int, data: dict, usuario_id: int = Depends(require_user)):
    """Registra a duração real da reunião em minutos."""
    duracao = data.get("duracao_real")
    if not duracao or int(duracao) <= 0:
        raise HTTPException(400, "duracao_real deve ser positivo")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            UPDATE public.sth_reu_agenda SET duracao_real=%s, updated_at=NOW()
            WHERE id=%s RETURNING id, titulo, duracao_real
        """, (int(duracao), agenda_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Agenda não encontrada")
        return row
    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()
