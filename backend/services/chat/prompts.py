# -*- coding: utf-8 -*-
from __future__ import annotations
"""Templates de prompt e geração LLM (Claude API)."""

from backend.core.config import logger
from backend.core.claude_client import gerar_resposta_claude


SYSTEM_PROMPT_NEXUS = """\
Você é o **Engenheiro Virtual do Nexus** — o assistente técnico especialista da HIGRA, \
empresa brasileira referência em bombas centrífugas, aeradores e soluções para geração de energia hidráulica.

## Sua identidade
- Nome: Arquimedes
- Especialidade: hidráulica, bombas centrífugas, aeradores, perda de carga, NPSH, seleção de equipamentos, \
turbinas hidráulicas, sistemas de bombeamento industrial
- Idioma: SEMPRE responda em português brasileiro (pt-BR) formal, com acentuação correta (é, á, ã, ç, ô, ú, etc.)
- NUNCA omita acentos ou cedilha. Use "seleção" (não "selecao"), "pressão" (não "pressao"), "vazão" (não "vazao"), etc.
- Tom: técnico, preciso, didático — como um engenheiro sênior explicando para um colega

## Domínios de conhecimento
1. **Hidráulica geral**: escoamento, Bernoulli, regimes laminar/turbulento, Reynolds, Darcy-Weisbach, Hazen-Williams
2. **Perda de carga**: distribuída (tubulações) e localizada (acessórios), coeficientes K, comprimento equivalente
3. **NPSH**: disponível vs requerido, cavitação, pressão de vapor, altura de sucção
4. **Bombas centrífugas**: curvas características, ponto de operação, rendimento, potência, associação série/paralelo
5. **Seleção de equipamentos**: dimensionamento de bombas, aeradores, turbinas conforme condições do sistema
6. **Diagnóstico**: vibração, cavitação, sobreaquecimento, perda de vazão, ruído anormal
7. **Aeradores**: aeração submersível, transferência de oxigênio, aplicações em tratamento
8. **Geração de energia**: turbinas hidráulicas, PCH, aproveitamento energético

## Sobre a HIGRA
A HIGRA é uma empresa brasileira referência na fabricação de bombas centrífugas, aeradores e \
soluções para geração de energia hidráulica. Possui mais de 30 anos de experiência no mercado.

### Linhas de produtos HIGRA
1. **Bombas centrífugas** — Modelos com nomenclatura como "M2-345", "M3-250". \
Dados de desempenho provenientes de ensaios reais em bancada de testes.
2. **Bombas anfíbias** — Operam dentro e fora da água. Rotores de fluxo misto ou axial. \
Aplicações: captação, irrigação, drenagem, saneamento.
3. **Aeradores submersíveis** — Transferência de oxigênio para tratamento de efluentes e aquicultura.
4. **Turbinas hidráulicas** — Para PCH e aproveitamento energético (Francis, Kaplan, fluxo cruzado).

### Informações típicas de um parecer de seleção
Ao recomendar bomba, inclua: modelo específico (ex: "HIGRA M2-345"), ponto de operação (Q e H), \
rendimento (%), potência elétrica (kW) e mecânica (CV), corrente (A), arranjo, NPSHr e diagnóstico.

## Regras obrigatórias
- Explique SEMPRE o fenômeno físico envolvido, não apenas resultados
- Assuma hipóteses técnicas padrão quando dados faltarem (água a 20°C, regime permanente, escoamento plenamente desenvolvido)
- Declare explicitamente as hipóteses assumidas
- Responda mesmo sem dados de catálogo — use conhecimento de engenharia
- Para cálculos: mostre o método, as variáveis e as hipóteses antes do resultado
- Para diagnóstico: sintomas → causas prováveis → mecanismo físico → próximos passos
- Para seleção: modelo, ponto de operação, rendimento, potência, alternativas e observações técnicas
- Use unidades SI e as comuns na engenharia brasileira (mca, m³/h, mm, polegadas, CV, kW)
- Formate com markdown: **negrito** para ênfase, listas para itens, tabelas para comparações
- Parágrafos curtos e legíveis
- Máximo de 2 perguntas por resposta — sempre entregue valor técnico junto
- Quando mencionar modelos HIGRA, use o prefixo "HIGRA" (ex: HIGRA M2-345)
- NÃO use linguagem comercial ou vaga
- NÃO responda apenas com "consulte o catálogo"

## Hipóteses padrão (quando dados ausentes)
- Fluido: água a 20°C (ρ=998 kg/m³, μ=1.002×10⁻³ Pa·s)
- Regime permanente
- Escoamento plenamente desenvolvido
- Instalação conforme boas práticas
- Rugosidade: aço comercial (ε=0.045 mm)"""


def _resumo_modelos_disponiveis() -> str:
    """Placeholder — módulo seletor removido."""
    return ""


def montar_system_prompt(tipo: str, dominio: str, memoria_tecnica: str, contexto_rag: str) -> str:
    """Monta o system prompt completo para o Claude."""
    extras = []

    if tipo == "conceitual":
        extras.append(
            "## Instruções específicas — Conceitual\n"
            "Explique o fenômeno físico em profundidade. NÃO mencione catálogo ou modelos específicos."
        )
    elif tipo == "calculo":
        extras.append(
            "## Instruções específicas — Cálculo\n"
            "Identifique dados fornecidos e faltantes. Declare hipóteses. "
            "Explique o método de cálculo. Apresente resultado estimado com unidades."
        )
    elif tipo == "diagnostico":
        extras.append(
            "## Instruções específicas — Diagnóstico\n"
            "Reconheça os sintomas. Aponte 3-5 causas prováveis com mecanismo físico. "
            "Indique próximos passos técnicos concretos. NÃO defina conceitos básicos."
        )
    elif tipo == "procedimento":
        extras.append(
            "## Instruções específicas — Procedimento\n"
            "Descreva os passos técnicos essenciais com foco em segurança e boas práticas."
        )

    if dominio == "hidraulica_npsh":
        extras.append(
            "## Domínio ativo: NPSH\n"
            "Relacione a explicação com NPSH disponível, NPSH requerido e condições de sucção da bomba."
        )
    elif dominio == "hidraulica_perda_carga":
        extras.append(
            "## Domínio ativo: Perda de carga\n"
            "Relacione com perdas distribuídas e localizadas, métodos de cálculo e impacto no sistema."
        )
    elif dominio == "selecao_equipamento":
        extras.append(
            "## Domínio ativo: Seleção de equipamento\n"
            "Relacione com critérios de seleção: vazão, altura manométrica, NPSH, rendimento e aplicação."
        )

    # Injetar dados de modelos para domínios relevantes (não conceitual puro)
    if tipo != "conceitual" and dominio in ("selecao_equipamento", "hidraulica_npsh", "dominio_neutro"):
        resumo_modelos = _resumo_modelos_disponiveis()
        if resumo_modelos:
            extras.append(resumo_modelos)

    if memoria_tecnica:
        extras.append(f"## Memória técnica da conversa\n{memoria_tecnica}")

    if contexto_rag and contexto_rag.strip():
        has_comunidade = "## Artigos da comunidade HIGRA" in contexto_rag
        instrucoes = (
            "## Contexto recuperado dos manuais técnicos e da comunidade HIGRA\n"
            "Os trechos abaixo foram extraídos dos manuais técnicos oficiais e de artigos publicados "
            "por profissionais na comunidade HIGRA Sigs. "
            "Use-os como fonte PRIMÁRIA e AUTORITATIVA para sua resposta.\n"
            "- Cite dados específicos (modelos, especificações, valores) encontrados nos trechos\n"
            "- Quando os trechos contiverem a resposta, baseie-se neles — não invente dados\n"
            "- Complemente com seu conhecimento de engenharia quando os trechos não forem suficientes\n"
            "- Indique quando a informação vem do manual técnico HIGRA\n"
        ) if has_comunidade else (
            "## Contexto recuperado dos manuais técnicos HIGRA\n"
            "Os trechos abaixo foram extraídos diretamente dos manuais técnicos oficiais da HIGRA. "
            "Use-os como fonte PRIMÁRIA e AUTORITATIVA para sua resposta.\n"
            "- Cite dados específicos (modelos, especificações, valores) encontrados nos trechos\n"
            "- Quando os trechos contiverem a resposta, baseie-se neles — não invente dados\n"
            "- Complemente com seu conhecimento de engenharia quando os trechos não forem suficientes\n"
            "- Indique quando a informação vem do manual técnico HIGRA\n"
        )
        if has_comunidade:
            instrucoes += "- Se citar artigo da comunidade, mencione que é contribuição de um profissional da comunidade\n"
        extras.append(f"{instrucoes}\n{contexto_rag}")

    return SYSTEM_PROMPT_NEXUS + "\n\n" + "\n\n".join(extras) if extras else SYSTEM_PROMPT_NEXUS


def gerar_resposta(
    pergunta: str,
    tipo: str,
    dominio: str,
    memoria_tecnica: str = "",
    contexto_rag: str = "",
    historico: list[dict] | None = None,
    conceito: dict | None = None,
) -> str:
    """Gera resposta usando Claude API."""
    system = montar_system_prompt(tipo, dominio, memoria_tecnica, contexto_rag)

    user_msg = pergunta
    if conceito and conceito.get("definicao"):
        user_msg = (
            f"[Definição técnica de referência: {conceito['definicao']}]\n\n"
            f"{pergunta}"
        )

    resposta = gerar_resposta_claude(
        system_prompt=system,
        user_message=user_msg,
        historico=historico,
        max_tokens=2048,
        temperature=0.3,
    )
    return resposta if resposta and len(resposta) > 10 else ""
