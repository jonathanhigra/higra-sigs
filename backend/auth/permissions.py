# -*- coding: utf-8 -*-
"""
Sistema de permissões SIGS — equivalente ao PCK_STH_STM do Oracle.
Controla acesso por tipo de usuário e módulo.
"""

from functools import lru_cache
from fastapi import Depends, HTTPException, status
from psycopg2.extras import RealDictCursor
from backend.auth.utils import require_user
from backend.database import get_db_connection, ensure_table_columns
from backend.core.config import logger


# ============================================================
#  Criação das tabelas de segurança SIGS
# ============================================================
def create_sigs_security_tables():
    """Cria as tabelas de segurança do SIGS (equivalente ao PCK_STH_STM do Oracle)."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Empresas
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.sth_cad_empresa (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                cnpj VARCHAR(20),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # Filiais
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.sth_cad_filial (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200) NOT NULL,
                sth_cad_empresa_id BIGINT REFERENCES public.sth_cad_empresa(id),
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # Processos / setores
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.beg_processo (
                id BIGSERIAL PRIMARY KEY,
                nome VARCHAR(200) NOT NULL,
                descricao TEXT,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # Tipos de usuário (A, D, G, F, I, R, L, P, GER_COM, ASS)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_stm_cad_tipo_usu (
                id BIGSERIAL PRIMARY KEY,
                descricao VARCHAR(200),
                hgr_descricao VARCHAR(200),
                hgr_vlr_retorno VARCHAR(20) UNIQUE,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        ensure_table_columns(
            conn,
            "hgr_stm_cad_tipo_usu",
            [
                ("hgr_descricao", "hgr_descricao VARCHAR(200)"),
                ("hgr_vlr_retorno", "hgr_vlr_retorno VARCHAR(20) UNIQUE"),
            ],
        )

        # Permissões de menu por tipo de usuário
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.hgr_stm_perm_menu (
                id BIGSERIAL PRIMARY KEY,
                hgr_stm_cad_tipo_usu_id BIGINT NOT NULL REFERENCES public.hgr_stm_cad_tipo_usu(id),
                modulo_key VARCHAR(20) NOT NULL,
                rota_key VARCHAR(20),
                acesso VARCHAR(1) NOT NULL DEFAULT 'C',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        # Unique index funcional para permitir NULL em rota_key
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS uix_perm_menu_tipo_mod_rota
            ON public.hgr_stm_perm_menu (hgr_stm_cad_tipo_usu_id, modulo_key, COALESCE(rota_key, ''));
        """)

        # Domínios e valores (base de todas as LOVs APEX: BEG_VALOR_DOMINIO pattern)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.beg_dominio (
                id BIGSERIAL PRIMARY KEY,
                nome VARCHAR(200) NOT NULL UNIQUE,
                descricao TEXT,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS public.beg_valor_dominio (
                id BIGSERIAL PRIMARY KEY,
                beg_dominio_id BIGINT NOT NULL REFERENCES public.beg_dominio(id),
                vlr_exibicao VARCHAR(500) NOT NULL,
                vlr_retorno VARCHAR(200),
                ordem INTEGER,
                ativo VARCHAR(1) DEFAULT 'S',
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        """)

        # Adicionar colunas SIGS na tabela users existente
        ensure_table_columns(
            conn,
            "users",
            [
                ("sth_cad_empresa_id", "sth_cad_empresa_id BIGINT REFERENCES public.sth_cad_empresa(id)"),
                ("sth_cad_filial_id", "sth_cad_filial_id BIGINT REFERENCES public.sth_cad_filial(id)"),
                ("beg_processo_id", "beg_processo_id BIGINT REFERENCES public.beg_processo(id)"),
                ("hgr_stm_cad_tipo_usu_id", "hgr_stm_cad_tipo_usu_id BIGINT REFERENCES public.hgr_stm_cad_tipo_usu(id)"),
                ("home_page", "home_page VARCHAR(100)"),
                ("ativo", "ativo VARCHAR(1) DEFAULT 'S'"),
            ],
        )

        conn.commit()
        logger.info("Tabelas de segurança SIGS verificadas/criadas.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro ao criar tabelas de segurança SIGS: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def seed_user_types():
    """Popula os tipos de usuário padrão do SIGS (idênticos ao Oracle)."""
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        types = [
            ('A', 'Administrador'),
            ('D', 'Diretor'),
            ('G', 'Gerente'),
            ('F', 'Filial'),
            ('I', 'Interno'),
            ('R', 'Representante'),
            ('L', 'Laboratório'),
            ('P', 'Parceiro'),
            ('GER_COM', 'Gerente Comercial'),
            ('ASS', 'Assistência'),
        ]
        for code, desc in types:
            cur.execute("""
                INSERT INTO public.hgr_stm_cad_tipo_usu (hgr_vlr_retorno, hgr_descricao)
                VALUES (%s, %s)
                ON CONFLICT (hgr_vlr_retorno) DO NOTHING
            """, (code, desc))
        conn.commit()
        logger.info("Tipos de usuário SIGS populados.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro ao popular tipos de usuário: {e}")
    finally:
        cur.close()
        conn.close()


def seed_default_permissions():
    """
    Popula permissões por tipo de usuário baseado nas tabelas Oracle migradas
    (sth_stm_usu_acesso + sth_stm_rotina). Se já populado, não sobrescreve.
    """
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Se já tem permissões, não sobrescrever (foram sincronizadas do Oracle)
        cur.execute("SELECT COUNT(*) as cnt FROM public.hgr_stm_perm_menu")
        if cur.fetchone()['cnt'] > 0:
            return

        # Mapeamento rotina key prefix → módulos do sistema
        PREFIX_MAP = {
            'G': ['GES', 'GACO'], 'GS': ['GES'],
            'PJ': ['PRJT'], 'SR': ['PRJT'],
            'E': ['RNOE', 'EVT'],
            'D': ['DCMT'],
            'O': ['CMNA'], 'NO': ['CMNA'], 'TA': ['CMNA'],
            'N': ['RNCO'],
            'CK': ['CHKL'],
            'CM': ['CRM'],
            'L': ['LABS'],
            'QD': ['QLDD'],
            'BI': ['BIBL'],
        }

        def key_to_modules(key):
            for prefix in sorted(PREFIX_MAP.keys(), key=len, reverse=True):
                if key.startswith(prefix):
                    return PREFIX_MAP[prefix]
            return []

        # Ler permissões Oracle
        cur.execute("""
            SELECT a.hgr_cad_tipo_usu_id, r.key, a.tp_acesso
            FROM public.sth_stm_usu_acesso a
            JOIN public.sth_stm_rotina r ON r.id = a.sth_stm_rotina_id
            WHERE r.key IS NOT NULL
        """)

        tipo_perms = {}
        for row in cur.fetchall():
            tipo_id = row['hgr_cad_tipo_usu_id']
            for mod in key_to_modules(row['key']):
                if tipo_id not in tipo_perms:
                    tipo_perms[tipo_id] = {}
                cur_acesso = tipo_perms[tipo_id].get(mod)
                if row['tp_acesso'] == 'M' or cur_acesso is None:
                    tipo_perms[tipo_id][mod] = 'M' if row['tp_acesso'] == 'M' else (cur_acesso or row['tp_acesso'])

        # Admin (tipo 1) = acesso total
        all_modules = ['GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO', 'EVT', 'LABS', 'CHKL', 'QLDD', 'BIBL']
        tipo_perms[1] = {m: 'M' for m in all_modules}

        for tipo_id, modules in tipo_perms.items():
            for mod_key, acesso in modules.items():
                cur.execute("""
                    INSERT INTO public.hgr_stm_perm_menu
                        (hgr_stm_cad_tipo_usu_id, modulo_key, acesso)
                    VALUES (%s, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (tipo_id, mod_key, acesso))

        conn.commit()
        logger.info("Permissões SIGS populadas a partir das tabelas Oracle.")
    except Exception as e:
        conn.rollback()
        logger.error(f"Erro ao popular permissões: {e}")
    finally:
        cur.close()
        conn.close()


# ============================================================
#  Funções de verificação de permissão (equivalente FNC_PERM_MENU)
# ============================================================
def get_user_tipo(user_id: int) -> dict:
    """Retorna dados SIGS do usuário (tipo, empresa, filial, processo, cores da filial)."""
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT u.id, u.name, u.email, u.is_admin,
                   u.sth_cad_empresa_id, u.sth_cad_filial_id, u.beg_processo_id,
                   u.hgr_stm_cad_tipo_usu_id, u.home_page,
                   COALESCE(t.hgr_vlr_retorno, 'I') as tipo_usuario,
                   t.hgr_descricao as tipo_descricao,
                   f.descricao as filial_nome,
                   f.sigla as filial_sigla,
                   f.color as filial_color,
                   f.color_text as filial_color_text,
                   e.descricao as empresa_nome
            FROM public.users u
            LEFT JOIN public.hgr_stm_cad_tipo_usu t ON t.id = u.hgr_stm_cad_tipo_usu_id
            LEFT JOIN public.sth_cad_filial f ON f.id = u.sth_cad_filial_id
            LEFT JOIN public.sth_cad_empresa e ON e.id = u.sth_cad_empresa_id
            WHERE u.id = %s
        """, (user_id,))
        return cur.fetchone()
    finally:
        cur.close()
        conn.close()


def check_permission(user_id: int, mod_key: str, acesso_minimo: str = 'C') -> bool:
    """
    Verifica se o usuário tem permissão no módulo.
    Equivalente a PCK_STH_STM.FNC_PERM_MENU(P_MOD_KEY, P_ROT_KEY).
    acesso_minimo: 'C' = consulta (GET), 'M' = manutenção (POST/PUT/DELETE)
    """
    user_data = get_user_tipo(user_id)
    if not user_data:
        return False

    # Admin (is_admin ou tipo 'A') tem acesso total
    if user_data.get('is_admin') or user_data.get('tipo_usuario') == 'A':
        return True

    tipo_usu_id = user_data.get('hgr_stm_cad_tipo_usu_id')
    if not tipo_usu_id:
        return False

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT acesso FROM public.hgr_stm_perm_menu
            WHERE hgr_stm_cad_tipo_usu_id = %s
              AND modulo_key = %s
              AND acesso != 'R'
        """, (tipo_usu_id, mod_key))
        row = cur.fetchone()
        if not row:
            return False

        # 'M' (manutenção) inclui 'C' (consulta)
        if acesso_minimo == 'C':
            return row['acesso'] in ('C', 'M')
        return row['acesso'] == 'M'
    finally:
        cur.close()
        conn.close()


def get_user_permissions(user_id: int) -> dict:
    """Retorna mapa de permissões {modulo_key: acesso} para o usuário."""
    user_data = get_user_tipo(user_id)
    if not user_data:
        return {}

    # Admin tem acesso total
    all_modules = ['GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO', 'EVT', 'LABS', 'CHKL', 'QLDD', 'BIBL', 'CRM']
    if user_data.get('is_admin') or user_data.get('tipo_usuario') == 'A':
        return {m: 'M' for m in all_modules}

    tipo_usu_id = user_data.get('hgr_stm_cad_tipo_usu_id')
    if not tipo_usu_id:
        return {}

    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT modulo_key, acesso FROM public.hgr_stm_perm_menu
            WHERE hgr_stm_cad_tipo_usu_id = %s AND acesso != 'R'
        """, (tipo_usu_id,))
        return {row['modulo_key']: row['acesso'] for row in cur.fetchall()}
    finally:
        cur.close()
        conn.close()


# ============================================================
#  Escopo de dados — hierarquia empresa/filial/processo
#  Equivalente a PCK_STH_STM.FNC_STM_VLD_ACESSO do Oracle
# ============================================================
def get_user_scope(user_id: int) -> dict:
    """
    Retorna o escopo de dados que o usuário pode acessar.
    Regras (idênticas ao Oracle):
      - Tipo A/D (Admin/Diretor) ou is_admin: vê TUDO (sem filtro)
      - Tipo G (Gerente): filial própria + dependentes (ind_acessa_dependentes)
      - Tipo F (Filial): filial própria + multi-filial (usu_sth_filiais)
      - Outros: apenas sua filial/processo
    Retorna: {
      'bypass': True/False,  # se True, não filtrar
      'empresa_ids': [int],
      'filial_ids': [int],
      'processo_ids': [int],
    }
    """
    user_data = get_user_tipo(user_id)
    if not user_data:
        return {'bypass': False, 'empresa_ids': [], 'filial_ids': [], 'processo_ids': []}

    tipo = user_data.get('tipo_usuario', 'I')

    # Admin/Diretor = bypass total
    if user_data.get('is_admin') or tipo in ('A', 'D'):
        return {'bypass': True, 'empresa_ids': [], 'filial_ids': [], 'processo_ids': []}

    empresa_id = user_data.get('sth_cad_empresa_id')
    filial_id = user_data.get('sth_cad_filial_id')
    processo_id = user_data.get('beg_processo_id')

    empresa_ids = [empresa_id] if empresa_id else []
    filial_ids = [filial_id] if filial_id else []
    processo_ids = [processo_id] if processo_id else []

    # Multi-filial: usu_sth_filiais (formato "7:8:9:11")
    conn = get_db_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT b.usu_sth_filiais, b.ind_acessa_dependentes
            FROM public.beg_usuarios b
            JOIN public.users u ON u.beg_usuarios_id = b.id
            WHERE u.id = %s
        """, (user_id,))
        beg = cur.fetchone()
        if beg:
            # Parse usu_sth_filiais (ex: "7:8:9:11")
            multi = beg.get('usu_sth_filiais')
            if multi:
                for fid in str(multi).split(':'):
                    try:
                        fid_int = int(fid.strip())
                        if fid_int not in filial_ids:
                            filial_ids.append(fid_int)
                    except ValueError:
                        pass

            # ind_acessa_dependentes = 'S': ver filiais da mesma empresa
            if beg.get('ind_acessa_dependentes') == 'S' and empresa_id:
                exclude = tuple(filial_ids) if filial_ids else (0,)
                cur.execute(f"""
                    SELECT id FROM public.sth_cad_filial
                    WHERE sth_cad_empresa_id = %s AND id NOT IN ({','.join(['%s']*len(exclude))})
                """, (empresa_id, *exclude))
                for row in cur.fetchall():
                    filial_ids.append(row['id'])
    finally:
        cur.close()
        conn.close()

    return {
        'bypass': False,
        'empresa_ids': empresa_ids,
        'filial_ids': filial_ids,
        'processo_ids': processo_ids,
    }


def build_scope_filter(scope: dict, table_alias: str = '',
                       empresa_col: str = 'sth_cad_empresa_id',
                       filial_col: str = 'sth_cad_filial_id',
                       processo_col: str = None) -> tuple:
    """
    Gera cláusula WHERE SQL para filtrar por escopo do usuário.
    Retorna (sql_fragment, params_list).
    Se bypass=True, retorna ('', []) — sem filtro.
    """
    if scope.get('bypass'):
        return ('', [])

    prefix = f'{table_alias}.' if table_alias else ''
    # If column is already a full expression (COALESCE etc.), don't add prefix
    def col_expr(col):
        if '(' in col or '.' in col:
            return col
        return f'{prefix}{col}'

    conditions = []
    params = []

    if scope['filial_ids']:
        placeholders = ','.join(['%s'] * len(scope['filial_ids']))
        conditions.append(f'{col_expr(filial_col)} IN ({placeholders})')
        params.extend(scope['filial_ids'])
    elif scope['empresa_ids']:
        placeholders = ','.join(['%s'] * len(scope['empresa_ids']))
        conditions.append(f'{col_expr(empresa_col)} IN ({placeholders})')
        params.extend(scope['empresa_ids'])

    if not conditions:
        return ('', [])

    return (' AND ' + ' AND '.join(conditions), params)


def validate_record_scope(user_id: int, record_filial_id, record_empresa_id=None) -> bool:
    """Verifica se o usuário pode acessar um registro baseado na filial."""
    if not record_filial_id and not record_empresa_id:
        return True  # sem filial = acessível a todos
    scope = get_user_scope(user_id)
    if scope.get('bypass'):
        return True
    if record_filial_id and scope['filial_ids']:
        return int(record_filial_id) in scope['filial_ids']
    if record_empresa_id and scope['empresa_ids']:
        return int(record_empresa_id) in scope['empresa_ids']
    return True  # fallback permissivo


# ============================================================
#  FastAPI Dependencies
# ============================================================
def require_permission(mod_key: str, acesso_minimo: str = 'C'):
    """
    Dependency factory para verificar permissão no módulo.
    Uso: @router.get("/", dependencies=[Depends(require_permission('GES'))])
         @router.post("/", dependencies=[Depends(require_permission('GES', 'M'))])
    """
    async def _check(usuario_id: int = Depends(require_user)):
        if not check_permission(usuario_id, mod_key, acesso_minimo):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Sem permissão para o módulo {mod_key}"
            )
        return usuario_id
    return _check


def require_tipo(*tipos_permitidos):
    """
    Dependency factory para verificar tipo de usuário.
    Uso: Depends(require_tipo('A', 'D', 'G'))
    """
    async def _check(usuario_id: int = Depends(require_user)):
        user_data = get_user_tipo(usuario_id)
        if not user_data:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        tipo = user_data.get('tipo_usuario', '')
        if user_data.get('is_admin') or tipo == 'A':
            return usuario_id
        if tipo not in tipos_permitidos:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Tipo de usuário '{tipo}' não tem acesso"
            )
        return usuario_id
    return _check
