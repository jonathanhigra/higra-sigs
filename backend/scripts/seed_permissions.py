# -*- coding: utf-8 -*-
"""
Seed idempotente das permissões SIGS (hgr_stm_perm_menu).

Garante que cada tipo de usuário tenha acesso aos módulos que o PORTAL APEX
original permite. NUNCA sobrescreve permissões existentes — apenas INSERE
permissões faltantes (ON CONFLICT DO NOTHING).

Matriz derivada do menu APEX (f108.sql) + contexto HIGRA SIGS:
    A (Admin)       -> bypass via is_admin; ainda assim populamos tudo
    D (Diretor)     -> visão completa de gestão + qualidade + operacional
    G (Gerente)     -> gestão + qualidade + produção
    F (Filial)      -> tudo exceto admin de CRM (já correto)
    I (Interno)     -> módulos transversais (tarefas, docs, reuniões, etc.)
    R (Representante) -> só CRM
    L (Laboratório) -> LABS + suporte (tarefas, docs)
    P (Parceiro)    -> acesso externo limitado (docs, biblioteca)
    GER_COM         -> CRM com privilégios
    ASS             -> assistência (por enquanto conta como interno para tarefas)
    AUX             -> auxiliar: biblioteca + docs + tarefas

Uso:
    python -m backend.scripts.seed_permissions           # seed idempotente
    python -m backend.scripts.seed_permissions --dry     # mostra o que faria
    python -m backend.scripts.seed_permissions --audit   # só imprime matriz atual
    python -m backend.scripts.seed_permissions --reset=TIPO   # APAGA e repopula só aquele tipo
"""

import sys
import argparse
from typing import Dict, List, Tuple

from backend.database import get_db_connection
from backend.core.config import logger


# ============================================================
# MATRIZ CANÔNICA
# Cada tipo -> módulos que deveria ter acesso com nível 'M' (manutenção).
# Nível 'M' engloba 'C' (consulta), então é o default conservador.
# ============================================================
MATRIZ_PERMISSOES: Dict[str, List[str]] = {
    # Admin — redundante (is_admin já bypassa), mas mantém coerência
    'A': ['GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO', 'EVT',
          'LABS', 'CHKL', 'QLDD', 'BIBL', 'CRM'],

    # Diretor — visão ampla, sem acesso de config
    'D': ['GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO', 'EVT',
          'LABS', 'CHKL', 'QLDD', 'BIBL', 'CRM'],

    # Gerente — gestão + qualidade + produção
    'G': ['GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO', 'EVT',
          'CHKL', 'QLDD', 'BIBL'],

    # Filial — similar ao Gerente mas sem CRM
    'F': ['GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO', 'EVT',
          'LABS', 'CHKL', 'QLDD', 'BIBL'],

    # Interno — transversais (tarefas/projetos/docs/reuniões/qualidade)
    'I': ['GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO', 'EVT',
          'QLDD', 'BIBL'],

    # Representante — só CRM (vendas)
    'R': ['CRM'],

    # Laboratório — LABS + suporte transversal
    'L': ['LABS', 'GES', 'DCMT', 'BIBL'],

    # Parceiro — acesso externo mínimo
    'P': ['DCMT', 'BIBL'],

    # Gerente Comercial — CRM com gestão
    'GER_COM': ['CRM', 'GES'],

    # Assistência — suporte interno + docs
    'ASS': ['GES', 'DCMT', 'CMNA', 'RNCO', 'BIBL'],

    # Auxiliar — bem restrito
    'AUX': ['GES', 'DCMT', 'BIBL'],
}

# Módulos válidos (qualquer outro é ignorado silenciosamente)
MODULOS_VALIDOS = {
    'GES', 'PRJT', 'GACO', 'RNOE', 'DCMT', 'CMNA', 'RNCO',
    'EVT', 'LABS', 'CHKL', 'QLDD', 'BIBL', 'CRM',
}


# ============================================================
# Operações
# ============================================================
def ensure_unique_index(conn) -> None:
    """
    Garante que a combinação (tipo, modulo) seja única, para que
    ON CONFLICT DO NOTHING funcione no INSERT.
    Idempotente.
    """
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS hgr_stm_perm_menu_tipo_modulo_uk
            ON public.hgr_stm_perm_menu (hgr_stm_cad_tipo_usu_id, modulo_key)
            WHERE rota_key IS NULL OR rota_key = '-'
        """)
        conn.commit()
    finally:
        cur.close()


def get_tipo_ids(conn) -> Dict[str, int]:
    """Mapeia código do tipo (A, D, G, ...) para o id numérico."""
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT hgr_vlr_retorno, id
            FROM public.hgr_stm_cad_tipo_usu
            WHERE hgr_vlr_retorno IS NOT NULL
        """)
        return {row[0]: row[1] for row in cur.fetchall()}
    finally:
        cur.close()


def current_permissions(conn, tipo_id: int) -> set:
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT modulo_key FROM public.hgr_stm_perm_menu
            WHERE hgr_stm_cad_tipo_usu_id = %s
              AND (rota_key IS NULL OR rota_key = '-')
              AND acesso != 'R'
        """, (tipo_id,))
        return {row[0] for row in cur.fetchall()}
    finally:
        cur.close()


def plan_diff(conn) -> List[Tuple[str, int, List[str]]]:
    """
    Retorna [(codigo_tipo, tipo_id, [modulos_a_inserir]), ...]
    """
    tipo_ids = get_tipo_ids(conn)
    plan = []
    for codigo, modulos_desejados in MATRIZ_PERMISSOES.items():
        if codigo not in tipo_ids:
            logger.warning("Tipo %r não cadastrado em hgr_stm_cad_tipo_usu — pulando", codigo)
            continue
        tipo_id = tipo_ids[codigo]
        atuais = current_permissions(conn, tipo_id)
        desejados = {m for m in modulos_desejados if m in MODULOS_VALIDOS}
        faltando = sorted(desejados - atuais)
        if faltando:
            plan.append((codigo, tipo_id, faltando))
    return plan


def apply_plan(conn, plan: List[Tuple[str, int, List[str]]]) -> int:
    """Insere os módulos faltantes. Retorna total de linhas inseridas."""
    cur = conn.cursor()
    total = 0
    try:
        for codigo, tipo_id, modulos in plan:
            for modulo in modulos:
                cur.execute("""
                    INSERT INTO public.hgr_stm_perm_menu
                        (hgr_stm_cad_tipo_usu_id, modulo_key, rota_key, acesso)
                    VALUES (%s, %s, NULL, 'M')
                    ON CONFLICT DO NOTHING
                """, (tipo_id, modulo))
                total += cur.rowcount
        conn.commit()
        return total
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()


def audit(conn) -> None:
    """Imprime a matriz atual de permissões por tipo."""
    tipo_ids = get_tipo_ids(conn)
    print()
    print('=== MATRIZ ATUAL de permissões por tipo ===')
    print(f"{'Tipo':8}  {'#':4}  Módulos")
    print('-' * 72)
    todos_modulos = sorted(MODULOS_VALIDOS)
    for codigo, tipo_id in sorted(tipo_ids.items(), key=lambda x: x[0]):
        atuais = current_permissions(conn, tipo_id)
        marcadores = ' '.join('X' if m in atuais else '.' for m in todos_modulos)
        print(f"  {codigo:6}  {len(atuais):3}  {marcadores}")
    print('-' * 72)
    print('  legenda:', ' '.join(todos_modulos))
    print()


def reset_tipo(conn, codigo: str) -> None:
    """APAGA todas as permissões de um tipo e repopula via MATRIZ. Destrutivo."""
    if codigo not in MATRIZ_PERMISSOES:
        print(f"[ERRO] Tipo {codigo!r} não está na MATRIZ_PERMISSOES")
        sys.exit(1)
    tipo_ids = get_tipo_ids(conn)
    if codigo not in tipo_ids:
        print(f"[ERRO] Tipo {codigo!r} não existe em hgr_stm_cad_tipo_usu")
        sys.exit(1)
    tipo_id = tipo_ids[codigo]
    cur = conn.cursor()
    try:
        cur.execute(
            "DELETE FROM public.hgr_stm_perm_menu WHERE hgr_stm_cad_tipo_usu_id = %s",
            (tipo_id,),
        )
        deleted = cur.rowcount
        for modulo in MATRIZ_PERMISSOES[codigo]:
            cur.execute("""
                INSERT INTO public.hgr_stm_perm_menu
                    (hgr_stm_cad_tipo_usu_id, modulo_key, rota_key, acesso)
                VALUES (%s, %s, NULL, 'M')
            """, (tipo_id, modulo))
        conn.commit()
        print(f"[OK] Tipo {codigo}: removidas {deleted} permissões, inseridas {len(MATRIZ_PERMISSOES[codigo])}.")
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()


# ============================================================
# CLI
# ============================================================
def main() -> int:
    parser = argparse.ArgumentParser(description='Seed idempotente de permissões SIGS')
    parser.add_argument('--dry', action='store_true', help='Mostra o que faria sem executar')
    parser.add_argument('--audit', action='store_true', help='Só imprime a matriz atual')
    parser.add_argument('--reset', metavar='TIPO', help='APAGA e repopula apenas o tipo informado (destrutivo)')
    args = parser.parse_args()

    conn = get_db_connection()
    try:
        if args.audit:
            audit(conn)
            return 0

        if args.reset:
            reset_tipo(conn, args.reset)
            audit(conn)
            return 0

        ensure_unique_index(conn)
        plan = plan_diff(conn)

        if not plan:
            print('[OK] Nada a fazer — todas as permissões já estão de acordo com a matriz.')
            audit(conn)
            return 0

        print()
        print('=== PLANO de inserções ===')
        for codigo, tipo_id, modulos in plan:
            print(f"  {codigo:8} (id={tipo_id}):  +{len(modulos):2}  -> {', '.join(modulos)}")
        total_rows = sum(len(m) for _, _, m in plan)
        print(f"  TOTAL: {total_rows} novas permissões")

        if args.dry:
            print()
            print('[DRY RUN] Nada foi aplicado. Rode sem --dry para executar.')
            return 0

        inserted = apply_plan(conn, plan)
        print()
        print(f'[OK] {inserted} permissões inseridas.')
        audit(conn)
        return 0
    finally:
        conn.close()


if __name__ == '__main__':
    sys.exit(main())
