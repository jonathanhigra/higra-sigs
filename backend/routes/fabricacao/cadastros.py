# -*- coding: utf-8 -*-
"""Fabricação — Cadastros auxiliares (bitola, fabricante de fio, carcaça, cor de tinta, acionamento, empacotamento)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg2.extras import RealDictCursor
from backend.database import get_db_connection
from backend.auth.utils import require_user
from backend.auth.permissions import require_permission
from backend.core.config import logger

router = APIRouter()


def create_fab_cadastros_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        for sql in [
            # Bitola de Fio (tarefa 315)
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_bit_fio (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(100) NOT NULL,
                awg VARCHAR(20),
                mm2 NUMERIC(8,3),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Fabricante de Fio (tarefa 316)
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_fab_fio (
                id BIGSERIAL PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                cnpj VARCHAR(20),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Carcaça (tarefa 318)
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_carc (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                tipo VARCHAR(100),
                material VARCHAR(100),
                acabamento VARCHAR(100),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Tipo de Acionamento (tarefa 321)
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_tp_acion (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                sigla VARCHAR(20),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Cor de Tinta (tarefa 323)
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_cor_tnt (
                id BIGSERIAL PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                codigo_ral VARCHAR(20),
                nome_comercial VARCHAR(200),
                fornecedor VARCHAR(200),
                hex_color VARCHAR(10),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
            # Tipo de Empacotamento (tarefa 328)
            """CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_tp_emb (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                tipo VARCHAR(50) DEFAULT 'CAIXA',
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW())""",
        ]:
            cur.execute(sql)
        # Forma Construtiva (tarefa 333)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_forma_const (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
            sigla VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        # Tipo de Cabo (tarefa 334)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_tp_cab (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
            secao_mm2 NUMERIC(6,2), cor VARCHAR(50), comprimento_m NUMERIC(8,2),
            ativo VARCHAR(1) DEFAULT 'S', created_at TIMESTAMPTZ DEFAULT NOW())""")
        # Tipo de Sensor (tarefa 338)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_tp_sns (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(200) NOT NULL,
            sigla VARCHAR(20), ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        # Tensão (tarefa 340)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_tensao (
            id BIGSERIAL PRIMARY KEY, descricao VARCHAR(100) NOT NULL,
            valor_v NUMERIC(8,2), ativo VARCHAR(1) DEFAULT 'S',
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        # Fornecedor de componentes (tarefa 342)
        cur.execute("""CREATE TABLE IF NOT EXISTS public.hgr_fab_ckl_cad_forn (
            id BIGSERIAL PRIMARY KEY, nome VARCHAR(200) NOT NULL,
            cnpj VARCHAR(20), tipo VARCHAR(50),
            ativo VARCHAR(1) DEFAULT 'S', created_at TIMESTAMPTZ DEFAULT NOW())""")
        conn.commit()
        logger.info("Tabelas cadastros fabricação verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro tabelas cadastros fab: {e}")
    finally:
        cur.close()
        conn.close()


# ---- Bitola de Fio ----
@router.get("/bitola-fio", dependencies=[Depends(require_permission('CHKL'))])
async def listar_bitolas(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_fab_ckl_cad_bit_fio WHERE ativo=%s ORDER BY descricao",
            (ativo,),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/bitola-fio", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_bitola(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_fab_ckl_cad_bit_fio (descricao, awg, mm2) VALUES (%s,%s,%s) RETURNING *",
            (data["descricao"], data.get("awg"), data.get("mm2")),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/bitola-fio/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_bitola(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_fab_ckl_cad_bit_fio SET descricao=COALESCE(%s,descricao), awg=COALESCE(%s,awg), mm2=COALESCE(%s,mm2), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
            (data.get("descricao"), data.get("awg"), data.get("mm2"), data.get("ativo"), id),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Fabricante de Fio ----
@router.get("/fabricante-fio", dependencies=[Depends(require_permission('CHKL'))])
async def listar_fabricantes(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_fab_ckl_cad_fab_fio WHERE ativo=%s ORDER BY nome",
            (ativo,),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/fabricante-fio", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_fabricante(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_fab_ckl_cad_fab_fio (nome, cnpj) VALUES (%s,%s) RETURNING *",
            (data["nome"], data.get("cnpj")),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/fabricante-fio/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_fabricante(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_fab_ckl_cad_fab_fio SET nome=COALESCE(%s,nome), cnpj=COALESCE(%s,cnpj), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
            (data.get("nome"), data.get("cnpj"), data.get("ativo"), id),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Carcaça ----
@router.get("/carcaca", dependencies=[Depends(require_permission('CHKL'))])
async def listar_carcacas(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_fab_ckl_cad_carc WHERE ativo=%s ORDER BY descricao",
            (ativo,),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/carcaca", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_carcaca(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_fab_ckl_cad_carc (descricao, tipo, material, acabamento) VALUES (%s,%s,%s,%s) RETURNING *",
            (data["descricao"], data.get("tipo"), data.get("material"), data.get("acabamento")),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/carcaca/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_carcaca(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_fab_ckl_cad_carc SET descricao=COALESCE(%s,descricao), tipo=COALESCE(%s,tipo), material=COALESCE(%s,material), acabamento=COALESCE(%s,acabamento), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
            (data.get("descricao"), data.get("tipo"), data.get("material"), data.get("acabamento"), data.get("ativo"), id),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Tipo de Acionamento ----
@router.get("/tipo-acionamento", dependencies=[Depends(require_permission('CHKL'))])
async def listar_acionamentos(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_fab_ckl_cad_tp_acion WHERE ativo=%s ORDER BY descricao",
            (ativo,),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/tipo-acionamento", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_acionamento(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_fab_ckl_cad_tp_acion (descricao, sigla) VALUES (%s,%s) RETURNING *",
            (data["descricao"], data.get("sigla")),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/tipo-acionamento/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_acionamento(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_fab_ckl_cad_tp_acion SET descricao=COALESCE(%s,descricao), sigla=COALESCE(%s,sigla), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
            (data.get("descricao"), data.get("sigla"), data.get("ativo"), id),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Cor de Tinta ----
@router.get("/cor-tinta", dependencies=[Depends(require_permission('CHKL'))])
async def listar_cores(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_fab_ckl_cad_cor_tnt WHERE ativo=%s ORDER BY nome",
            (ativo,),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/cor-tinta", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_cor(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_fab_ckl_cad_cor_tnt (nome, codigo_ral, nome_comercial, fornecedor, hex_color) VALUES (%s,%s,%s,%s,%s) RETURNING *",
            (data["nome"], data.get("codigo_ral"), data.get("nome_comercial"), data.get("fornecedor"), data.get("hex_color")),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/cor-tinta/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_cor(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_fab_ckl_cad_cor_tnt SET nome=COALESCE(%s,nome), codigo_ral=COALESCE(%s,codigo_ral), nome_comercial=COALESCE(%s,nome_comercial), fornecedor=COALESCE(%s,fornecedor), hex_color=COALESCE(%s,hex_color), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
            (data.get("nome"), data.get("codigo_ral"), data.get("nome_comercial"), data.get("fornecedor"), data.get("hex_color"), data.get("ativo"), id),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Tipo de Empacotamento ----
@router.get("/tipo-empacotamento", dependencies=[Depends(require_permission('CHKL'))])
async def listar_empacotamentos(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "SELECT * FROM public.hgr_fab_ckl_cad_tp_emb WHERE ativo=%s ORDER BY descricao",
            (ativo,),
        )
        return cur.fetchall()
    finally:
        cur.close()
        conn.close()


@router.post("/tipo-empacotamento", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_empacotamento(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "INSERT INTO public.hgr_fab_ckl_cad_tp_emb (descricao, tipo) VALUES (%s,%s) RETURNING *",
            (data["descricao"], data.get("tipo", "CAIXA")),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


@router.put("/tipo-empacotamento/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_empacotamento(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute(
            "UPDATE public.hgr_fab_ckl_cad_tp_emb SET descricao=COALESCE(%s,descricao), tipo=COALESCE(%s,tipo), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
            (data.get("descricao"), data.get("tipo"), data.get("ativo"), id),
        )
        conn.commit()
        return cur.fetchone()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


# ---- Form-options (retorna todos os cadastros para uso nos formulários) ----
@router.get("/form-options", dependencies=[Depends(require_permission('CHKL'))])
async def fab_form_options(usuario_id: int = Depends(require_user)):
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT id, descricao, awg, mm2 FROM public.hgr_fab_ckl_cad_bit_fio WHERE ativo='S' ORDER BY descricao")
        bitolas = cur.fetchall()
        cur.execute("SELECT id, nome as descricao FROM public.hgr_fab_ckl_cad_fab_fio WHERE ativo='S' ORDER BY nome")
        fabricantes = cur.fetchall()
        cur.execute("SELECT id, descricao, tipo, material, acabamento FROM public.hgr_fab_ckl_cad_carc WHERE ativo='S' ORDER BY descricao")
        carcacas = cur.fetchall()
        cur.execute("SELECT id, descricao, sigla FROM public.hgr_fab_ckl_cad_tp_acion WHERE ativo='S' ORDER BY descricao")
        acionamentos = cur.fetchall()
        cur.execute("SELECT id, nome as descricao, codigo_ral, hex_color FROM public.hgr_fab_ckl_cad_cor_tnt WHERE ativo='S' ORDER BY nome")
        cores = cur.fetchall()
        cur.execute("SELECT id, descricao, tipo FROM public.hgr_fab_ckl_cad_tp_emb WHERE ativo='S' ORDER BY descricao")
        empacotamentos = cur.fetchall()
        cur.execute("SELECT id, descricao, sigla FROM public.hgr_fab_ckl_cad_forma_const WHERE ativo='S' ORDER BY descricao")
        formas = cur.fetchall()
        cur.execute("SELECT id, descricao, secao_mm2, cor FROM public.hgr_fab_ckl_cad_tp_cab WHERE ativo='S' ORDER BY descricao")
        cabos = cur.fetchall()
        cur.execute("SELECT id, descricao, sigla FROM public.hgr_fab_ckl_cad_tp_sns WHERE ativo='S' ORDER BY descricao")
        sensores = cur.fetchall()
        cur.execute("SELECT id, descricao, valor_v FROM public.hgr_fab_ckl_cad_tensao WHERE ativo='S' ORDER BY valor_v")
        tensoes = cur.fetchall()
        cur.execute("SELECT id, nome as descricao, cnpj FROM public.hgr_fab_ckl_cad_forn WHERE ativo='S' ORDER BY nome")
        fornecedores = cur.fetchall()
        return {
            "bitolas": bitolas,
            "fabricantes_fio": fabricantes,
            "carcacas": carcacas,
            "acionamentos": acionamentos,
            "cores_tinta": cores,
            "empacotamentos": empacotamentos,
            "formas_construtivas": formas,
            "tipos_cabo": cabos,
            "tipos_sensor": sensores,
            "tensoes": tensoes,
            "fornecedores": fornecedores,
        }
    finally:
        cur.close()
        conn.close()


# ---- Forma Construtiva (tarefa 333) ----
@router.get("/forma-construtiva", dependencies=[Depends(require_permission('CHKL'))])
async def listar_formas(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_fab_ckl_cad_forma_const WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally: cur.close(); conn.close()

@router.post("/forma-construtiva", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_forma(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_fab_ckl_cad_forma_const (descricao, sigla) VALUES (%s,%s) RETURNING *",
                    (data["descricao"], data.get("sigla")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()

@router.put("/forma-construtiva/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_forma(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE public.hgr_fab_ckl_cad_forma_const SET descricao=COALESCE(%s,descricao), sigla=COALESCE(%s,sigla), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
                    (data.get("descricao"), data.get("sigla"), data.get("ativo"), id))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# ---- Tipo de Cabo (tarefa 334) ----
@router.get("/tipo-cabo", dependencies=[Depends(require_permission('CHKL'))])
async def listar_cabos(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_fab_ckl_cad_tp_cab WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally: cur.close(); conn.close()

@router.post("/tipo-cabo", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_cabo(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_fab_ckl_cad_tp_cab (descricao, secao_mm2, cor, comprimento_m) VALUES (%s,%s,%s,%s) RETURNING *",
                    (data["descricao"], data.get("secao_mm2"), data.get("cor"), data.get("comprimento_m")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()

@router.put("/tipo-cabo/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_cabo(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE public.hgr_fab_ckl_cad_tp_cab SET descricao=COALESCE(%s,descricao), secao_mm2=COALESCE(%s,secao_mm2), cor=COALESCE(%s,cor), comprimento_m=COALESCE(%s,comprimento_m), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
                    (data.get("descricao"), data.get("secao_mm2"), data.get("cor"), data.get("comprimento_m"), data.get("ativo"), id))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# ---- Tipo de Sensor (tarefa 338) ----
@router.get("/tipo-sensor", dependencies=[Depends(require_permission('CHKL'))])
async def listar_sensores(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_fab_ckl_cad_tp_sns WHERE ativo=%s ORDER BY descricao", (ativo,))
        return cur.fetchall()
    finally: cur.close(); conn.close()

@router.post("/tipo-sensor", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_sensor(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_fab_ckl_cad_tp_sns (descricao, sigla) VALUES (%s,%s) RETURNING *",
                    (data["descricao"], data.get("sigla")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()

@router.put("/tipo-sensor/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_sensor(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE public.hgr_fab_ckl_cad_tp_sns SET descricao=COALESCE(%s,descricao), sigla=COALESCE(%s,sigla), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
                    (data.get("descricao"), data.get("sigla"), data.get("ativo"), id))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# ---- Tensão (tarefa 340) ----
@router.get("/tensao", dependencies=[Depends(require_permission('CHKL'))])
async def listar_tensoes(ativo: str = 'S', usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM public.hgr_fab_ckl_cad_tensao WHERE ativo=%s ORDER BY valor_v", (ativo,))
        return cur.fetchall()
    finally: cur.close(); conn.close()

@router.post("/tensao", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_tensao(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_fab_ckl_cad_tensao (descricao, valor_v) VALUES (%s,%s) RETURNING *",
                    (data["descricao"], data.get("valor_v")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()

@router.put("/tensao/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_tensao(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE public.hgr_fab_ckl_cad_tensao SET descricao=COALESCE(%s,descricao), valor_v=COALESCE(%s,valor_v), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
                    (data.get("descricao"), data.get("valor_v"), data.get("ativo"), id))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()


# ---- Fornecedor de componentes (tarefa 342/343) ----
@router.get("/fornecedor", dependencies=[Depends(require_permission('CHKL'))])
async def listar_fornecedores(
    ativo: str = 'S', q: str = '',
    page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=100),
    usuario_id: int = Depends(require_user)
):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page-1)*per_page
        q_sql = f"%{q}%" if q else "%"
        cur.execute("SELECT COUNT(*) as total FROM public.hgr_fab_ckl_cad_forn WHERE ativo=%s AND nome ILIKE %s", (ativo, q_sql))
        total = cur.fetchone()["total"]
        cur.execute("SELECT * FROM public.hgr_fab_ckl_cad_forn WHERE ativo=%s AND nome ILIKE %s ORDER BY nome LIMIT %s OFFSET %s",
                    (ativo, q_sql, per_page, offset))
        return {"items": cur.fetchall(), "total": total, "page": page, "per_page": per_page}
    finally: cur.close(); conn.close()

@router.post("/fornecedor", status_code=201, dependencies=[Depends(require_permission('CHKL', 'M'))])
async def criar_fornecedor(data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("INSERT INTO public.hgr_fab_ckl_cad_forn (nome, cnpj, tipo) VALUES (%s,%s,%s) RETURNING *",
                    (data["nome"], data.get("cnpj"), data.get("tipo")))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()

@router.put("/fornecedor/{id}", dependencies=[Depends(require_permission('CHKL', 'M'))])
async def atualizar_fornecedor(id: int, data: dict, usuario_id: int = Depends(require_user)):
    conn = get_db_connection(); cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("UPDATE public.hgr_fab_ckl_cad_forn SET nome=COALESCE(%s,nome), cnpj=COALESCE(%s,cnpj), tipo=COALESCE(%s,tipo), ativo=COALESCE(%s,ativo) WHERE id=%s RETURNING *",
                    (data.get("nome"), data.get("cnpj"), data.get("tipo"), data.get("ativo"), id))
        conn.commit(); return cur.fetchone()
    except Exception: conn.rollback(); raise
    finally: cur.close(); conn.close()
