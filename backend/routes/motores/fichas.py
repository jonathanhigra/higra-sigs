# -*- coding: utf-8 -*-
"""Motores / Engenharia — fichas técnicas, modelos, bombas."""

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from typing import Optional
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.core.config import logger

router = APIRouter()


def create_motores_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_cad_mod (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(300) NOT NULL, codigo VARCHAR(50),
                tipo VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_cad_mtr (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(300) NOT NULL, codigo VARCHAR(50),
                hgr_mot_cad_mod_id BIGINT, potencia VARCHAR(50), tensao VARCHAR(50),
                corrente VARCHAR(50), rotacao VARCHAR(50), frequencia VARCHAR(20),
                classe_isolamento VARCHAR(20), ip VARCHAR(10), carcaca VARCHAR(100),
                peso NUMERIC(10,2), ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_cad_bmb (
                id BIGSERIAL PRIMARY KEY, descricao VARCHAR(300) NOT NULL, codigo VARCHAR(50),
                hgr_mot_cad_mod_id BIGINT, tipo VARCHAR(50), vazao_nominal VARCHAR(50),
                altura_nominal VARCHAR(50), rendimento VARCHAR(50), material VARCHAR(100),
                ativo VARCHAR(1) DEFAULT 'S', created_at TIMESTAMPTZ DEFAULT NOW())""",
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_reg_fct (
                id BIGSERIAL PRIMARY KEY, hgr_mot_cad_mtr_id BIGINT,
                hgr_mot_cad_bmb_id BIGINT, descricao TEXT,
                dados_tecnicos JSONB, created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by INTEGER)""",
            # Normas
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_cad_nrm (
                id BIGSERIAL PRIMARY KEY,
                codigo VARCHAR(100) NOT NULL,
                descricao VARCHAR(300),
                orgao VARCHAR(100),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Fornecedores motores
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_cad_frn (
                id BIGSERIAL PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                cnpj VARCHAR(20),
                tipo VARCHAR(50),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Sensores
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_cad_sns (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                tipo VARCHAR(100),
                compatibilidade TEXT,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Classe de Proteção
            """CREATE TABLE IF NOT EXISTS public.hgr_mot_cad_cls_prot (
                id BIGSERIAL PRIMARY KEY,
                codigo VARCHAR(20) NOT NULL,
                descricao VARCHAR(200),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        conn.commit()
        logger.info("Tabelas de motores verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas motores: {e}")
    finally:
        cur.close()
        conn.close()


@router.get("/motores", dependencies=[Depends(require_user)])
async def listar_motores(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                         usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_mot_cad_mtr")
        total = cur.fetchone()["total"]
        cur.execute("""SELECT m.*, mo.descricao as modelo_nome FROM public.hgr_mot_cad_mtr m
            LEFT JOIN public.hgr_mot_cad_mod mo ON mo.id = m.hgr_mot_cad_mod_id
            WHERE m.ativo = 'S' ORDER BY m.descricao LIMIT %s OFFSET %s""", (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/bombas", dependencies=[Depends(require_user)])
async def listar_bombas(page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
                        usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_mot_cad_bmb")
        total = cur.fetchone()["total"]
        cur.execute("""SELECT b.*, mo.descricao as modelo_nome FROM public.hgr_mot_cad_bmb b
            LEFT JOIN public.hgr_mot_cad_mod mo ON mo.id = b.hgr_mot_cad_mod_id
            WHERE b.ativo = 'S' ORDER BY b.descricao LIMIT %s OFFSET %s""", (per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.get("/modelos", dependencies=[Depends(require_user)])
async def listar_modelos(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_mot_cad_mod WHERE ativo = 'S' ORDER BY descricao")
        return {"items": cur.fetchall()}
    finally:
        cur.close()
        conn.close()


@router.post("/motores", status_code=201, dependencies=[Depends(require_user)])
async def criar_motor(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_mot_cad_mtr
            (descricao, codigo, hgr_mot_cad_mod_id, potencia, tensao, corrente, rotacao, frequencia, carcaca, peso)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("descricao"), data.get("codigo"), data.get("hgr_mot_cad_mod_id"),
             data.get("potencia"), data.get("tensao"), data.get("corrente"),
             data.get("rotacao"), data.get("frequencia"), data.get("carcaca"), data.get("peso")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.post("/bombas", status_code=201, dependencies=[Depends(require_user)])
async def criar_bomba(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""INSERT INTO public.hgr_mot_cad_bmb
            (descricao, codigo, hgr_mot_cad_mod_id, tipo, vazao_nominal, altura_nominal, rendimento, material)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (data.get("descricao"), data.get("codigo"), data.get("hgr_mot_cad_mod_id"),
             data.get("tipo"), data.get("vazao_nominal"), data.get("altura_nominal"),
             data.get("rendimento"), data.get("material")))
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# --- Motores GET/PUT individual ---
@router.get("/motores/{id}", dependencies=[Depends(require_user)])
async def obter_motor(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_mot_cad_mtr WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404, "Motor não encontrado")
        return row
    finally: cur.close(); conn.close()


@router.put("/motores/{id}", dependencies=[Depends(require_user)])
async def atualizar_motor(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_mot_cad_mtr
            SET descricao=COALESCE(%s,descricao), codigo=COALESCE(%s,codigo),
                hgr_mot_cad_mod_id=COALESCE(%s,hgr_mot_cad_mod_id),
                potencia=COALESCE(%s,potencia), tensao=COALESCE(%s,tensao),
                corrente=COALESCE(%s,corrente), rotacao=COALESCE(%s,rotacao),
                frequencia=COALESCE(%s,frequencia), carcaca=COALESCE(%s,carcaca),
                peso=COALESCE(%s,peso), ativo=COALESCE(%s,ativo)
            WHERE id=%s RETURNING *""",
            (data.get("descricao"), data.get("codigo"), data.get("hgr_mot_cad_mod_id"),
             data.get("potencia"), data.get("tensao"), data.get("corrente"),
             data.get("rotacao"), data.get("frequencia"), data.get("carcaca"),
             data.get("peso"), data.get("ativo"), id))
        conn.commit()
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    except HTTPException: raise
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# --- Bombas GET/PUT individual ---
@router.get("/bombas/{id}", dependencies=[Depends(require_user)])
async def obter_bomba(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_mot_cad_bmb WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    finally: cur.close(); conn.close()


@router.put("/bombas/{id}", dependencies=[Depends(require_user)])
async def atualizar_bomba(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""UPDATE public.hgr_mot_cad_bmb
            SET descricao=COALESCE(%s,descricao), codigo=COALESCE(%s,codigo),
                hgr_mot_cad_mod_id=COALESCE(%s,hgr_mot_cad_mod_id),
                tipo=COALESCE(%s,tipo), vazao_nominal=COALESCE(%s,vazao_nominal),
                altura_nominal=COALESCE(%s,altura_nominal), rendimento=COALESCE(%s,rendimento),
                material=COALESCE(%s,material), ativo=COALESCE(%s,ativo)
            WHERE id=%s RETURNING *""",
            (data.get("descricao"), data.get("codigo"), data.get("hgr_mot_cad_mod_id"),
             data.get("tipo"), data.get("vazao_nominal"), data.get("altura_nominal"),
             data.get("rendimento"), data.get("material"), data.get("ativo"), id))
        conn.commit()
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    except HTTPException: raise
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# --- Fichas Técnicas ---
@router.get("/fichas", dependencies=[Depends(require_user)])
async def listar_fichas(
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    q: str = Query(''),
    usuario_id: int = Depends(require_user)
):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        q_sql = f"%{q}%"
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_mot_reg_fct WHERE COALESCE(descricao,'') ILIKE %s", (q_sql,))
        total = cur.fetchone()["total"]
        cur.execute("""SELECT f.*, m.descricao as motor_descricao, b.descricao as bomba_descricao
            FROM public.hgr_mot_reg_fct f
            LEFT JOIN public.hgr_mot_cad_mtr m ON m.id = f.hgr_mot_cad_mtr_id
            LEFT JOIN public.hgr_mot_cad_bmb b ON b.id = f.hgr_mot_cad_bmb_id
            WHERE COALESCE(f.descricao,'') ILIKE %s
            ORDER BY f.created_at DESC LIMIT %s OFFSET %s""", (q_sql, per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally: cur.close(); conn.close()


@router.get("/fichas/{id}", dependencies=[Depends(require_user)])
async def obter_ficha(id: int, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT f.*, m.descricao as motor_descricao, b.descricao as bomba_descricao
            FROM public.hgr_mot_reg_fct f
            LEFT JOIN public.hgr_mot_cad_mtr m ON m.id = f.hgr_mot_cad_mtr_id
            LEFT JOIN public.hgr_mot_cad_bmb b ON b.id = f.hgr_mot_cad_bmb_id
            WHERE f.id=%s""", (id,))
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    finally: cur.close(); conn.close()


@router.post("/fichas", status_code=201, dependencies=[Depends(require_user)])
async def criar_ficha(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        import json
        dados = data.get("dados_tecnicos", {})
        cur.execute("""INSERT INTO public.hgr_mot_reg_fct
            (descricao, hgr_mot_cad_mtr_id, hgr_mot_cad_bmb_id, dados_tecnicos, created_by)
            VALUES (%s,%s,%s,%s::jsonb,%s) RETURNING *""",
            (data.get("descricao"), data.get("hgr_mot_cad_mtr_id"), data.get("hgr_mot_cad_bmb_id"),
             json.dumps(dados), usuario_id))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


@router.put("/fichas/{id}", dependencies=[Depends(require_user)])
async def atualizar_ficha(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        import json
        fields = []
        params = []
        if "descricao" in data:
            fields.append("descricao=%s"); params.append(data["descricao"])
        if "hgr_mot_cad_mtr_id" in data:
            fields.append("hgr_mot_cad_mtr_id=%s"); params.append(data["hgr_mot_cad_mtr_id"])
        if "hgr_mot_cad_bmb_id" in data:
            fields.append("hgr_mot_cad_bmb_id=%s"); params.append(data["hgr_mot_cad_bmb_id"])
        if "dados_tecnicos" in data:
            fields.append("dados_tecnicos=%s::jsonb"); params.append(json.dumps(data["dados_tecnicos"]))
        if not fields:
            raise HTTPException(400, "Nenhum campo para atualizar")
        params.append(id)
        cur.execute(f"UPDATE public.hgr_mot_reg_fct SET {', '.join(fields)} WHERE id=%s RETURNING *", params)
        conn.commit()
        row = cur.fetchone()
        if not row: raise HTTPException(404)
        return row
    except HTTPException: raise
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# --- Normas ---
@router.get("/normas", dependencies=[Depends(require_user)])
async def listar_normas(ativo: str = Query('S'), usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_mot_cad_nrm WHERE ativo=%s ORDER BY codigo", (ativo,))
        return cur.fetchall()
    finally: cur.close(); conn.close()


@router.post("/normas", status_code=201, dependencies=[Depends(require_user)])
async def criar_norma(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_mot_cad_nrm (codigo, descricao, orgao) VALUES (%s,%s,%s) RETURNING *",
                    (data["codigo"], data.get("descricao"), data.get("orgao")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# --- Sensores ---
@router.get("/sensores", dependencies=[Depends(require_user)])
async def listar_sensores(ativo: str = Query('S'), usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_mot_cad_sns WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally: cur.close(); conn.close()


@router.post("/sensores", status_code=201, dependencies=[Depends(require_user)])
async def criar_sensor_motor(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_mot_cad_sns (descricao, tipo, compatibilidade) VALUES (%s,%s,%s) RETURNING *",
                    (data["descricao"], data.get("tipo"), data.get("compatibilidade")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# --- Fornecedores ---
@router.get("/fornecedores", dependencies=[Depends(require_user)])
async def listar_fornecedores_mot(
    ativo: str = Query('S'), page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    usuario_id: int = Depends(require_user)
):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_mot_cad_frn WHERE ativo=%s", (ativo,))
        total = cur.fetchone()["total"]
        cur.execute("SELECT * FROM public.hgr_mot_cad_frn WHERE ativo=%s ORDER BY nome LIMIT %s OFFSET %s",
                    (ativo, per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally: cur.close(); conn.close()


@router.post("/fornecedores", status_code=201, dependencies=[Depends(require_user)])
async def criar_fornecedor_mot(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_mot_cad_frn (nome, cnpj, tipo) VALUES (%s,%s,%s) RETURNING *",
                    (data["nome"], data.get("cnpj"), data.get("tipo")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# --- Folha de Dados PDF ---
@router.get("/folha-dados/{ficha_id}/pdf", dependencies=[Depends(require_user)])
async def gerar_folha_dados_pdf_endpoint(ficha_id: int, usuario_id: int = Depends(require_user)):
    """Gera PDF da Folha de Dados (layout corporativo HIGRA) para uma ficha técnica."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Ficha técnica
        cur.execute("""SELECT f.*, m.descricao as motor_descricao, b.descricao as bomba_descricao
            FROM public.hgr_mot_reg_fct f
            LEFT JOIN public.hgr_mot_cad_mtr m ON m.id = f.hgr_mot_cad_mtr_id
            LEFT JOIN public.hgr_mot_cad_bmb b ON b.id = f.hgr_mot_cad_bmb_id
            WHERE f.id = %s""", (ficha_id,))
        ficha = cur.fetchone()
        if not ficha:
            raise HTTPException(404, "Ficha técnica não encontrada")

        # Motor completo
        motor = None
        if ficha.get("hgr_mot_cad_mtr_id"):
            cur.execute("""SELECT m.*, mo.descricao as modelo_nome
                FROM public.hgr_mot_cad_mtr m
                LEFT JOIN public.hgr_mot_cad_mod mo ON mo.id = m.hgr_mot_cad_mod_id
                WHERE m.id = %s""", (ficha["hgr_mot_cad_mtr_id"],))
            motor = cur.fetchone()

        # Bomba completa
        bomba = None
        if ficha.get("hgr_mot_cad_bmb_id"):
            cur.execute("""SELECT b.*, mo.descricao as modelo_nome
                FROM public.hgr_mot_cad_bmb b
                LEFT JOIN public.hgr_mot_cad_mod mo ON mo.id = b.hgr_mot_cad_mod_id
                WHERE b.id = %s""", (ficha["hgr_mot_cad_bmb_id"],))
            bomba = cur.fetchone()

        from backend.services.folha_dados_pdf import gerar_folha_dados_pdf
        pdf_bytes = gerar_folha_dados_pdf(ficha, motor=motor, bomba=bomba)

        descricao = (ficha.get("descricao") or f"ficha-{ficha_id}").replace(" ", "_")[:50]
        filename = f"FolhaDados_{descricao}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    finally:
        cur.close()
        conn.close()


@router.get("/folha-dados/{motor_id}/motor-pdf", dependencies=[Depends(require_user)])
async def gerar_folha_dados_motor_pdf(motor_id: int, usuario_id: int = Depends(require_user)):
    """Gera PDF de Folha de Dados direto a partir do motor (sem ficha pré-cadastrada)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""SELECT m.*, mo.descricao as modelo_nome
            FROM public.hgr_mot_cad_mtr m
            LEFT JOIN public.hgr_mot_cad_mod mo ON mo.id = m.hgr_mot_cad_mod_id
            WHERE m.id = %s""", (motor_id,))
        motor = cur.fetchone()
        if not motor:
            raise HTTPException(404, "Motor não encontrado")

        ficha = {
            "id": motor["id"],
            "descricao": motor.get("descricao", "Motor"),
            "dados_tecnicos": {},
        }

        from backend.services.folha_dados_pdf import gerar_folha_dados_pdf
        pdf_bytes = gerar_folha_dados_pdf(ficha, motor=motor)

        descricao = (motor.get("descricao") or f"motor-{motor_id}").replace(" ", "_")[:50]
        filename = f"FolhaDados_{descricao}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    finally:
        cur.close()
        conn.close()
