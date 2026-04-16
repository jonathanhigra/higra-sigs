# -*- coding: utf-8 -*-
"""Export CSV para listagens SIGS."""

import csv
import io
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import get_user_scope, build_scope_filter

router = APIRouter()


@router.get("/csv/{modulo}")
async def export_csv(modulo: str, usuario_id: int = Depends(require_user)):
    """Exporta dados de um módulo em CSV."""
    scope = get_user_scope(usuario_id)
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        queries = {
            'tarefas': {
                'sql': """SELECT t.id, t.titulo, COALESCE(t.status, t.hgr_tar_status) as status,
                    t.prioridade, COALESCE(t.dt_previsao, t.dt_hr_fim_previsto::date) as dt_previsao,
                    u.name as responsavel
                    FROM public.hgr_tar_cad_tarefa t
                    LEFT JOIN public.users u ON u.id = COALESCE(t.responsavel_id, t.hgr_usuario_id)
                    WHERE 1=1""",
                'scope_alias': 't', 'filial_col': 'COALESCE(t.sth_cad_filial_id, t.hgr_cad_filial_id)',
            },
            'projetos': {
                'sql': """SELECT p.id, p.titulo, p.codigo, p.status, p.prioridade,
                    p.dt_prev_termino, u.name as responsavel
                    FROM public.hgr_prj_cad_projeto p
                    LEFT JOIN public.users u ON u.id = COALESCE(p.responsavel_id, p.hgr_usuario_id)
                    WHERE 1=1""",
                'scope_alias': 'p', 'filial_col': 'COALESCE(p.sth_cad_filial_id, p.hgr_cad_filial_id)',
            },
            'rq03': {
                'sql': """SELECT r.id, r.num_rnc as codigo, r.reclamante, r.status,
                    COALESCE(r.dt_abertura, r.dt_rnc)::date as dt_abertura,
                    u.name as responsavel
                    FROM public.beg_rq03 r
                    LEFT JOIN public.users u ON u.id = COALESCE(r.responsavel_id, r.beg_usuario_id)
                    WHERE 1=1""",
                'scope_alias': 'r',
            },
            'rq49': {
                'sql': """SELECT r.id, r.num_rq as codigo, r.descricao, r.res_matriz,
                    COALESCE(r.dt_abertura, r.data)::date as dt_abertura,
                    u.name as responsavel
                    FROM public.beg_rq49 r
                    LEFT JOIN public.users u ON u.id = COALESCE(r.responsavel_id, r.beg_usuario_id)
                    WHERE 1=1""",
                'scope_alias': 'r',
            },
            'documentos': {
                'sql': """SELECT d.id, COALESCE(d.titulo, d.descricao) as titulo,
                    COALESCE(d.codigo, d.cod_documento) as codigo, d.ativo,
                    t.descricao as tipo, u.name as responsavel
                    FROM public.beg_cad_documento d
                    LEFT JOIN public.sth_doc_cad_tipo t ON t.id = d.sth_doc_cad_tipo_id
                    LEFT JOIN public.users u ON u.id = COALESCE(d.responsavel_id, d.hgr_usuario_id)
                    WHERE 1=1""",
                'scope_alias': 'd',
            },
            'planos': {
                'sql': """SELECT r.id, r.acao as titulo, r.beg_usuario_id,
                    r.previsao::date as dt_prazo, r.ind_implementacao as status,
                    u.name as responsavel
                    FROM public.beg_rq80 r
                    LEFT JOIN public.users u ON u.id = r.beg_usuario_id
                    WHERE 1=1""",
                'scope_alias': 'r',
            },
        }

        if modulo not in queries:
            return StreamingResponse(io.StringIO("Módulo não encontrado"), media_type="text/plain")

        q = queries[modulo]
        sql = q['sql']
        params = []
        scope_sql, scope_params = build_scope_filter(scope, q['scope_alias'],
            filial_col=q.get('filial_col', 'sth_cad_filial_id'))
        sql += scope_sql
        params.extend(scope_params)
        sql += " ORDER BY 1 DESC LIMIT 10000"

        cur.execute(sql, params)
        rows = cur.fetchall()

        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys(), delimiter=';')
            writer.writeheader()
            for row in rows:
                writer.writerow({k: (str(v) if v is not None else '') for k, v in row.items()})

        output.seek(0)
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={modulo}.csv"}
        )
    finally:
        cur.close()
        conn.close()
