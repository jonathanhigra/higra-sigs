# Hierarquia de usuários, tipos e permissões — HIGRA SIGS

> **Regra-chave:** a hierarquia deve ser **idêntica** ao Oracle. Não altere códigos, letras ou lógica sem confirmar.

## Tabelas de controle de acesso

| Tabela Oracle          | Propósito                                       | Equivalente PostgreSQL            |
|------------------------|-------------------------------------------------|-----------------------------------|
| `BEG_USUARIOS`         | Usuários (login=email, empresa, filial, processo, home_page_id) | `public.beg_usuarios` |
| `HGR_STM_CAD_TIPO_USU` | Tipos de usuário (roles)                        | `public.hgr_stm_cad_tipo_usu`     |
| `HGR_STM_USU_REG_TP`   | Vínculo N:M usuário ↔ tipo                      | `public.hgr_stm_usu_reg_tp`       |
| `STH_CAD_EMPRESA`      | Empresas                                        | `public.sth_cad_empresa`          |
| `STH_CAD_FILIAL`       | Filiais (pertence a empresa)                    | `public.sth_cad_filial`           |
| `BEG_PROCESSO`         | Processos/setores                               | `public.beg_processo`             |
| `HGR_STM_PERM_MENU`    | Permissões por tipo × módulo × rota             | `public.hgr_stm_perm_menu`        |

## Tipos de usuário (campo `HGR_VLR_RETORNO`)

| Código  | Papel              | Nível de acesso                                  |
|---------|--------------------|--------------------------------------------------|
| `A`     | Administrador      | Total — vê tudo, configura permissões            |
| `D`     | Diretor            | Quase total — acesso amplo                       |
| `G`     | Gerente            | Gestão — módulos de gestão + produção            |
| `F`     | Filial             | Gestor de filial — acesso por filial             |
| `I`     | Interno            | Usuário interno padrão                           |
| `R`     | Representante      | Restrito — CRM e áreas específicas               |
| `L`     | Laboratório        | Restrito ao módulo de laboratório                |
| `P`     | Parceiro           | Acesso externo limitado                          |
| `GER_COM` | Gerente Comercial | CRM com privilégios de gestão                    |
| `ASS`   | Assistência        | Módulo de assistência técnica                    |

## Lógica de permissão (conversão de `PCK_STH_STM`)

Fluxo idêntico ao Oracle, reescrito em FastAPI:

```
1. Login:        PCK_STH_STM.FNC_AUTH(usuario, senha)
                 → POST /api/auth/login (email + senha → JWT)

2. Pós-login:    Sessão carrega F_TP_USUARIO, F_USER_ID, F_EMPRESA_ID,
                 F_FILIAL_ID, F_PROCESSO_ID
                 → GET /api/auth/me retorna dados + permissoes

3. Menu:         PCK_STH_STM.FNC_PERM_MENU(P_MOD_KEY, P_ROT_KEY)
                 → hasModule(mod_key) no authStore (Zustand)

4. Página:       PCK_STH_STM.FNC_STM_VLD_ACESSO (cache por sessão)
                 → require_permission(mod_key, acesso='C'|'M') no backend
                 → Route guards no React Router

5. Assistência:  PCK_HGR_ASS.FNC_* (permissões específicas)
                 → Depende do tipo_usuario + escopo ASS
```

## Chaves de módulo (usadas em `FNC_PERM_MENU` e `require_permission`)

| Chave   | Módulo                      |
|---------|-----------------------------|
| `GES`   | Indicadores / Metas         |
| `PRJT`  | Projetos                    |
| `GACO`  | Planos de Ação (GAC)        |
| `RNOE`  | Reuniões                    |
| `DCMT`  | Documentos                  |
| `CMNA`  | Notas de Oportunidade (RQ49) |
| `RNCO`  | Não Conformidades (RQ03)    |
| `EVT`   | Comunicação / Eventos       |
| `LABS`  | Laboratório                 |
| `CHKL`  | Produção / Checklists       |
| `QLDD`  | Qualidade                   |
| `BIBL`  | Biblioteca                  |
| `CRM`   | CRM / Comercial             |

## Menu lateral APEX (Navigation Menu)

Cada item é condicional via `FNC_PERM_MENU(MOD_KEY)` + verificação `F_MODULO_ATUAL != 'CRM'`:

```
Início, Indicadores(GES), Projetos(PRJT), Planos de Ação(GACO),
Reunião(RNOE), Documentos(DCMT), Notas de Oportunidade(CMNA),
Não Conformidades(RNCO), Comunicação(EVT), Laboratório(LABS),
Produção(CHKL), Qualidade(QLDD), Biblioteca(BIBL), Comercial(CRM)
```

Admin (tipo `A`) tem menu de **Preferências**:
- Permissões (pg112)
- Usuários (pg107)
- Configurações (pg43)
- Domínios (pg17)

## Guia especialista
Para implementar auth/permissões, ver `.claude/skills/00-seguranca.md`.
