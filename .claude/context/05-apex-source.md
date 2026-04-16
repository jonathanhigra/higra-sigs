# Referência ao Portal SIGS Oracle APEX

## Arquivo canônico (fonte da verdade)

```
C:\Users\user\Downloads\f108_extract\f108.sql
```

Export completo do Oracle APEX. **Sempre que houver dúvida sobre regra de negócio, este é o árbitro final.**

## Metadados

| Campo           | Valor    |
|-----------------|----------|
| Application ID  | 108      |
| Owner / Schema  | `HGRHML` |
| Versão APEX     | 24.1     |
| Páginas         | 552      |
| Tamanho         | 867.000 linhas |

## Pacotes PL/SQL chave

| Pacote           | Responsabilidade                                       |
|------------------|--------------------------------------------------------|
| `PCK_STH_STM`    | Auth, sessão, permissões (FNC_AUTH, FNC_PERM_MENU, FNC_STM_VLD_ACESSO) |
| `PCK_HGR_ASS`    | Assistência técnica — permissões específicas do módulo |

## Como consultar o `f108.sql`

O arquivo é grande demais para abrir inteiro. Use sempre `grep` com padrões específicos.

### Estruturas típicas no export

```
wwv_flow_imp_page.create_page              -- definição de página APEX
wwv_flow_imp_page.create_page_item         -- campos do formulário
wwv_flow_imp_page.create_page_process      -- processos PL/SQL da página
wwv_flow_imp_page.create_page_da_action    -- dynamic actions
wwv_flow_imp_page.create_page_button       -- botões
wwv_flow_imp_shared.create_list            -- listas (navigation menu)
wwv_flow_imp_shared.create_lov             -- LOVs (lists of values)
```

### Exemplos de busca

```bash
# Encontrar definição de uma página específica (ex.: pg 75)
grep -n "create_page" f108.sql | grep "p_id=>75"

# Encontrar todos os items (campos) de uma página
grep -n "create_page_item" f108.sql | grep "p_page_id=>75"

# Encontrar a query de uma região (quando é clássica)
grep -B2 -A50 "p_region_id=>NNNNNNN" f108.sql

# Encontrar LOV (dropdown)
grep -n "create_lov" f108.sql

# Encontrar dynamic action
grep -n "p_name=>'NOME_DA_ACAO'" f108.sql

# Encontrar todas as páginas de um grupo
grep -n "p_page_group=>'NOME_GRUPO'" f108.sql
```

### Mapeamento de chaves APEX → módulo SIGS

Ver `context/03-modules.md` para a tabela completa. Exemplos:
- `GES` → Indicadores/Metas
- `PRJT` → Projetos
- `GACO` → Planos de Ação

## Quando converter um módulo

1. Identifique as **páginas APEX** do módulo (via `p_page_group` ou numeração).
2. Para cada página, extraia: items do formulário, botões, processos, validações.
3. Identifique as **tabelas** usadas nas queries da região.
4. Valide com o skill do módulo correspondente em `.claude/skills/`.
5. Reescreva:
   - Backend: router FastAPI + Pydantic + SQL em psycopg2.
   - Frontend: página React + service + formulário.
6. Garanta que as **regras de permissão** (`FNC_PERM_MENU`) foram preservadas.

## Guia especialista para migração de dados
Ver `.claude/skills/11-migracao-dados.md` (Oracle HGRHML → PostgreSQL higra_sigs).
