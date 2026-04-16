"""Fix all missing columns across all SIGS tables (run once after migration from old schema)."""
from backend.database import get_db_connection, ensure_table_columns

conn = get_db_connection()

fixes = {
    'hgr_ges_cad_meta': [('formula','formula TEXT'),('unidade','unidade VARCHAR(50)')],
    'hgr_ges_cad_unidade': [('sigla','sigla VARCHAR(20)')],
    'sth_reu_agenda': [('titulo','titulo VARCHAR(500)'),('dt_agenda','dt_agenda DATE'),('hr_inicio','hr_inicio TIME'),('hr_fim','hr_fim TIME'),('local','local VARCHAR(300)'),('sth_reu_tipo_id','sth_reu_tipo_id BIGINT'),('responsavel_id','responsavel_id BIGINT'),('status',"status VARCHAR(20) DEFAULT 'AGENDADA'")],
    'beg_cad_documento': [('titulo','titulo VARCHAR(500)'),('codigo','codigo VARCHAR(50)'),('revisao_atual','revisao_atual INTEGER DEFAULT 1'),('sth_doc_cad_tipo_id','sth_doc_cad_tipo_id BIGINT'),('beg_processo_id','beg_processo_id BIGINT'),('responsavel_id','responsavel_id BIGINT'),('status',"status VARCHAR(20) DEFAULT 'VIGENTE'"),('arquivo','arquivo BYTEA'),('filename','filename VARCHAR(500)'),('mimetype','mimetype VARCHAR(200)')],
    'beg_rq49': [('codigo','codigo VARCHAR(50)'),('titulo','titulo VARCHAR(500)'),('analise','analise TEXT'),('status',"status VARCHAR(20) DEFAULT 'ABERTA'"),('result_analise','result_analise VARCHAR(20)'),('dt_abertura','dt_abertura DATE'),('dt_fechamento','dt_fechamento DATE'),('beg_processo_id','beg_processo_id BIGINT'),('responsavel_id','responsavel_id BIGINT'),('hgr_rq49_cad_orig_id','hgr_rq49_cad_orig_id BIGINT'),('hgr_rq49_cad_cla_pri_id','hgr_rq49_cad_cla_pri_id BIGINT'),('created_by','created_by INTEGER')],
    'beg_rq80': [('titulo','titulo VARCHAR(500)'),('dt_auditoria','dt_auditoria DATE'),('auditor_id','auditor_id BIGINT'),('status',"status VARCHAR(20) DEFAULT 'PLANEJADA'"),('tipo','tipo VARCHAR(20)'),('beg_processo_id','beg_processo_id BIGINT'),('created_by','created_by INTEGER')],
    'beg_rq94': [('titulo','titulo VARCHAR(500)'),('justificativa','justificativa TEXT'),('impacto','impacto TEXT'),('status',"status VARCHAR(20) DEFAULT 'ABERTA'"),('dt_abertura','dt_abertura DATE'),('responsavel_id','responsavel_id BIGINT'),('beg_processo_id','beg_processo_id BIGINT'),('created_by','created_by INTEGER')],
    'hgr_mot_cad_mtr': [('codigo','codigo VARCHAR(50)'),('hgr_mot_cad_mod_id','hgr_mot_cad_mod_id BIGINT'),('potencia','potencia VARCHAR(50)'),('tensao','tensao VARCHAR(50)'),('corrente','corrente VARCHAR(50)'),('rotacao','rotacao VARCHAR(50)'),('frequencia','frequencia VARCHAR(20)'),('classe_isolamento','classe_isolamento VARCHAR(20)'),('ip','ip VARCHAR(10)'),('carcaca','carcaca VARCHAR(100)'),('peso','peso NUMERIC(10,2)')],
    'hgr_mot_cad_bmb': [('codigo','codigo VARCHAR(50)'),('hgr_mot_cad_mod_id','hgr_mot_cad_mod_id BIGINT'),('tipo','tipo VARCHAR(50)'),('vazao_nominal','vazao_nominal VARCHAR(50)'),('altura_nominal','altura_nominal VARCHAR(50)'),('rendimento','rendimento VARCHAR(50)'),('material','material VARCHAR(100)')],
    'hgr_mot_cad_mod': [('codigo','codigo VARCHAR(50)'),('tipo','tipo VARCHAR(20)')],
    'hgr_ass_cad_stt': [('sigla','sigla VARCHAR(20)'),('cor','cor VARCHAR(20)'),('icone','icone VARCHAR(50)')],
    'hgr_ass_cfg_fnl_reg_etp': [('hgr_ass_cfg_cad_fnl_id','hgr_ass_cfg_cad_fnl_id BIGINT'),('ordem','ordem INTEGER'),('cor','cor VARCHAR(20)'),('hgr_ass_cad_stt_id','hgr_ass_cad_stt_id BIGINT')],
    'beg_rq03_reg_sst': [('beg_rq03_id','beg_rq03_id BIGINT'),('dt_ocorrencia','dt_ocorrencia DATE'),('dt_notificacao','dt_notificacao DATE'),('local_ocorrencia','local_ocorrencia VARCHAR(300)'),('turno','turno VARCHAR(20)'),('atividade','atividade VARCHAR(200)'),('cat_profissional','cat_profissional VARCHAR(200)'),('tempo_empresa','tempo_empresa VARCHAR(50)'),('afastamento','afastamento VARCHAR(1)'),('dias_afastamento','dias_afastamento INTEGER')],
    'hgr_rq49_reg_aval': [('beg_rq49_id','beg_rq49_id BIGINT'),('avaliacao','avaliacao TEXT'),('nota','nota INTEGER'),('dt_avaliacao','dt_avaliacao DATE'),('usuario_id','usuario_id BIGINT'),('acao_tomada','acao_tomada TEXT'),('eficaz','eficaz VARCHAR(1)')],
    'beg_rq49_reg_usu': [('beg_rq49_id','beg_rq49_id BIGINT'),('usuario_id','usuario_id BIGINT')],
    'beg_rq80_reg_usu': [('beg_rq80_id','beg_rq80_id BIGINT'),('usuario_id','usuario_id BIGINT')],
    'hgr_rq49_reg_ant': [('beg_rq49_id','beg_rq49_id BIGINT'),('created_by','created_by INTEGER')],
    'beg_rev_documento': [('beg_cad_documento_id','beg_cad_documento_id BIGINT'),('numero_revisao','numero_revisao INTEGER'),('descricao_alteracao','descricao_alteracao TEXT'),('arquivo','arquivo BYTEA'),('filename','filename VARCHAR(500)'),('mimetype','mimetype VARCHAR(200)'),('created_by','created_by INTEGER')],
    'hgr_doc_reg_usu': [('beg_cad_documento_id','beg_cad_documento_id BIGINT'),('usuario_id','usuario_id BIGINT')],
    'sth_reu_participante': [('sth_reu_agenda_id','sth_reu_agenda_id BIGINT'),('usuario_id','usuario_id BIGINT'),('presente','presente VARCHAR(1)')],
    'sth_reu_pauta': [('sth_reu_agenda_id','sth_reu_agenda_id BIGINT'),('ordem','ordem INTEGER')],
    'sth_reu_decisao': [('sth_reu_agenda_id','sth_reu_agenda_id BIGINT')],
    'sth_reu_acao': [('sth_reu_agenda_id','sth_reu_agenda_id BIGINT'),('responsavel_id','responsavel_id BIGINT'),('dt_prazo','dt_prazo DATE'),('status',"status VARCHAR(20) DEFAULT 'PENDENTE'")],
    'hgr_fab_inst_med_cal_log': [('hgr_fab_inst_med_id','hgr_fab_inst_med_id BIGINT'),('dt_calibracao','dt_calibracao DATE'),('resultado','resultado VARCHAR(20)'),('certificado','certificado VARCHAR(200)'),('laboratorio','laboratorio VARCHAR(300)'),('observacao','observacao TEXT'),('created_by','created_by INTEGER')],
    'hgr_mot_reg_fct': [('hgr_mot_cad_mtr_id','hgr_mot_cad_mtr_id BIGINT'),('hgr_mot_cad_bmb_id','hgr_mot_cad_bmb_id BIGINT'),('dados_tecnicos','dados_tecnicos JSONB'),('created_by','created_by INTEGER')],
}

for tbl, cols in fixes.items():
    try:
        ensure_table_columns(conn, tbl, cols)
        print(f"  OK {tbl}")
    except Exception as e:
        print(f"  SKIP {tbl}: {e}")

conn.commit()
conn.close()
print("Done")
