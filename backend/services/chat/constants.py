# -*- coding: utf-8 -*-
"""Constantes e dados âncora do chat."""

MAX_CONTEXT_MESSAGES = 10

FALLBACK = (
    "Do ponto de vista da engenharia hidráulica, o comportamento esperado é este. "
    "Para limites exatos de modelos específicos, o catálogo define os valores finais."
)
FALLBACK_CONCEITUAL = (
    "Em termos de engenharia hidráulica, o conceito envolve a definição do fenômeno "
    "e os mecanismos físicos que o produzem no escoamento. "
    "Sem dados adicionais, a explicação geral deve focar nas variações de pressão, "
    "energia e condições de escoamento que levam ao efeito observado."
)
FALLBACK_DIAGNOSTICO = (
    "Com base nos sintomas informados, um diagnóstico inicial deve considerar causas "
    "prováveis como cavitação por NPSH insuficiente, entrada de ar na sucção, aumento de "
    "perda de carga na linha, operação fora do ponto de melhor eficiência e falhas "
    "mecânicas (desalinhamento, desgaste de rolamentos). "
    "Cada uma dessas causas pode reduzir vazão e aumentar vibração. "
    "Sugiro verificar sucção (nível, pressão e vazamentos), perda de carga, ponto de operação "
    "e condições mecânicas do conjunto. "
    "Se puder, informe vazão atual, pressão de sucção e ruído observado."
)

# ---------------------------------------------------------------------------
# ANCHOR_CONCEPTS — conceitos técnicos com definição fixa e termos essenciais
# Cada entrada pode ter variações (com/sem acento) como chaves separadas.
# ---------------------------------------------------------------------------
ANCHOR_CONCEPTS = {
    # --- Cavitação ---
    "cavitacao": {
        "definicao": (
            "Cavitação é o fenômeno em que a pressão local do líquido cai abaixo da "
            "pressão de vapor, formando bolhas que colapsam ao retornar a regiões "
            "de maior pressão, gerando ruído, vibração e erosão."
        ),
        "essenciais": [["pressão", "pressao"], "vapor", ["bolha", "bolhas"], ["colapso", "colapsam", "colapsar"]],
    },
    "cavitação": None,  # alias → resolvido em _detectar_conceito_ancora

    # --- NPSH ---
    "npsh": {
        "definicao": (
            "NPSH (Net Positive Suction Head) é a altura de energia disponível na sucção "
            "acima da pressão de vapor, necessária para evitar cavitação na bomba."
        ),
        "essenciais": ["npsh", ["sucção", "sucao", "succao"], ["pressão", "pressao"], "vapor"],
    },
    "npsh disponível": None,
    "npsh requerido": None,

    # --- Perda de carga ---
    "perda de carga": {
        "definicao": (
            "Perda de carga é a redução de energia do escoamento ao longo do percurso, "
            "causada por atrito com as paredes da tubulação (perda distribuída) e por "
            "singularidades como válvulas, curvas e conexões (perda localizada)."
        ),
        "essenciais": ["perda", "carga", "atrito", "energia"],
    },
    "perda distribuída": None,
    "perda localizada": None,

    # --- Reynolds ---
    "reynolds": {
        "definicao": (
            "Número de Reynolds é a razão entre forças de inércia e forças viscosas, "
            "usado para caracterizar o regime do escoamento: laminar (Re < 2000), "
            "transição (2000 < Re < 4000) ou turbulento (Re > 4000)."
        ),
        "essenciais": ["reynolds", ["inércia", "inercia"], "viscosidade"],
    },
    "número de reynolds": None,
    "numero de reynolds": None,

    # --- Escoamento turbulento ---
    "turbulento": {
        "definicao": (
            "Escoamento turbulento é o regime com flutuações aleatórias de velocidade e "
            "mistura intensa, tipicamente associado a número de Reynolds elevado (Re > 4000)."
        ),
        "essenciais": ["turbulento", "reynolds", ["flutuação", "flutuacao", "aleatório", "aleatorio"]],
    },
    "escoamento turbulento": None,
    "escoamento laminar": {
        "definicao": (
            "Escoamento laminar é o regime em que o fluido se move em camadas ordenadas "
            "e paralelas, sem mistura transversal, ocorrendo para Reynolds baixo (Re < 2000)."
        ),
        "essenciais": ["laminar", "reynolds", ["camadas", "ordenado", "paralelo"]],
    },

    # --- Pressão de vapor ---
    "pressão de vapor": {
        "definicao": (
            "Pressão de vapor é a pressão na qual o líquido entra em ebulição a uma "
            "determinada temperatura. É fundamental no cálculo de NPSH."
        ),
        "essenciais": [["pressão", "pressao"], "vapor", "temperatura"],
    },
    "pressao de vapor": None,

    # --- Golpe de aríete ---
    "golpe de aríete": {
        "definicao": (
            "Golpe de aríete é o fenômeno de onda de pressão que ocorre em tubulações "
            "quando há variação brusca de velocidade do escoamento, como no fechamento "
            "rápido de válvulas ou parada de bombas."
        ),
        "essenciais": [["golpe", "aríete", "ariete"], ["pressão", "pressao"], ["onda", "transitório", "transitorio"]],
    },
    "golpe de ariete": None,

    # --- Curva do sistema ---
    "curva do sistema": {
        "definicao": (
            "A curva do sistema representa a altura manométrica total requerida pela "
            "instalação em função da vazão, composta pela altura estática mais as "
            "perdas de carga (distribuídas e localizadas)."
        ),
        "essenciais": ["curva", "sistema", ["altura", "manométrica", "manometrica"], ["vazão", "vazao"]],
    },

    # --- Ponto de operação ---
    "ponto de operação": {
        "definicao": (
            "O ponto de operação é a interseção entre a curva da bomba e a curva do "
            "sistema, determinando a vazão e a altura manométrica reais de trabalho."
        ),
        "essenciais": [["ponto", "operação", "operacao"], "curva", ["vazão", "vazao"]],
    },
    "ponto de operacao": None,

    # --- Altura manométrica ---
    "altura manométrica": {
        "definicao": (
            "Altura manométrica total (HMT) é a energia por unidade de peso que a bomba "
            "fornece ao fluido, igual à soma da altura estática, perdas de carga e "
            "diferença de pressão entre recalque e sucção."
        ),
        "essenciais": [["altura", "manométrica", "manometrica", "hmt"], "energia", ["sucção", "sucao", "recalque"]],
    },
    "altura manometrica": None,
    "hmt": None,

    # --- Rendimento ---
    "rendimento": {
        "definicao": (
            "O rendimento de uma bomba é a razão entre a potência hidráulica útil "
            "(transferida ao fluido) e a potência consumida no eixo, expresso em percentual."
        ),
        "essenciais": ["rendimento", ["potência", "potencia"], ["útil", "util", "hidráulica", "hidraulica"]],
    },
    "eficiência": None,

    # --- Potência ---
    "potência": {
        "definicao": (
            "A potência de uma bomba divide-se em: potência hidráulica (útil, transferida "
            "ao fluido), potência no eixo (absorvida pelo motor) e potência elétrica "
            "(consumida da rede). A relação entre elas envolve os rendimentos."
        ),
        "essenciais": [["potência", "potencia"], ["hidráulica", "hidraulica", "eixo", "motor"], "rendimento"],
    },
    "potencia": None,

    # --- Darcy-Weisbach ---
    "darcy-weisbach": {
        "definicao": (
            "A equação de Darcy-Weisbach calcula a perda de carga distribuída em tubulações: "
            "hf = f × (L/D) × (V²/2g), onde f é o fator de atrito, L o comprimento, "
            "D o diâmetro e V a velocidade média."
        ),
        "essenciais": ["darcy", ["fator", "atrito"], ["comprimento", "diâmetro", "diametro"]],
    },
    "darcy": None,

    # --- Hazen-Williams ---
    "hazen-williams": {
        "definicao": (
            "Hazen-Williams é uma fórmula empírica para perda de carga em tubulações "
            "com água, que usa um coeficiente C dependente do material e estado da tubulação. "
            "É amplamente usada em engenharia de redes hidráulicas."
        ),
        "essenciais": ["hazen", "williams", ["coeficiente", "c"], ["tubulação", "tubulacao"]],
    },
    "hazen williams": None,

    # --- Colebrook ---
    "colebrook": {
        "definicao": (
            "A equação de Colebrook-White é uma fórmula implícita para o fator de atrito "
            "em escoamento turbulento, relacionando Reynolds, rugosidade relativa e fator f. "
            "É a base do diagrama de Moody."
        ),
        "essenciais": ["colebrook", ["fator", "atrito"], "reynolds", ["rugosidade", "moody"]],
    },
    "colebrook-white": None,

    # --- Bernoulli ---
    "bernoulli": {
        "definicao": (
            "A equação de Bernoulli expressa a conservação de energia em um escoamento "
            "ideal: a soma de pressão, energia cinética e energia potencial é constante "
            "ao longo de uma linha de corrente."
        ),
        "essenciais": ["bernoulli", ["pressão", "pressao"], "energia", ["cinética", "cinetica", "potencial"]],
    },
    "equação de bernoulli": None,

    # --- Rugosidade ---
    "rugosidade": {
        "definicao": (
            "Rugosidade absoluta (ε) é a altura média das irregularidades da parede "
            "interna da tubulação. A rugosidade relativa (ε/D) determina, junto com "
            "Reynolds, o fator de atrito no diagrama de Moody."
        ),
        "essenciais": ["rugosidade", ["parede", "tubulação", "tubulacao"], ["atrito", "moody"]],
    },

    # --- Associação série/paralelo ---
    "bombas em série": {
        "definicao": (
            "Bombas em série somam as alturas manométricas mantendo a mesma vazão. "
            "É usado quando se precisa de maior pressão do que uma única bomba fornece."
        ),
        "essenciais": [["série", "serie"], ["altura", "pressão", "pressao"], ["soma", "somam"]],
    },
    "bombas em paralelo": {
        "definicao": (
            "Bombas em paralelo somam as vazões mantendo a mesma altura manométrica. "
            "É usado quando se precisa de maior vazão do que uma única bomba fornece."
        ),
        "essenciais": ["paralelo", ["vazão", "vazao", "vazões", "vazoes"], ["soma", "somam"]],
    },

    # --- Aeração ---
    "aeração": {
        "definicao": (
            "Aeração é o processo de transferência de oxigênio do ar para a água, "
            "essencial em tratamento de efluentes e aquicultura. A eficiência depende "
            "do tipo de aerador, profundidade e condições do fluido."
        ),
        "essenciais": [["aeração", "aeracao", "aerador"], ["oxigênio", "oxigenio"], ["transferência", "transferencia"]],
    },
    "aeracao": None,
    "aerador": None,

    # --- Turbina hidráulica ---
    "turbina hidráulica": {
        "definicao": (
            "Turbina hidráulica é uma máquina que converte energia hidráulica (pressão "
            "e/ou velocidade do fluido) em energia mecânica de rotação, usada para "
            "geração de energia elétrica em PCHs e grandes usinas."
        ),
        "essenciais": [["turbina", "hidráulica", "hidraulica"], "energia", ["rotação", "rotacao", "mecânica", "mecanica"]],
    },
    "turbina hidraulica": None,

    # --- Vazão ---
    "vazão": {
        "definicao": (
            "Vazão é o volume de fluido que passa por uma seção transversal por "
            "unidade de tempo. Unidades comuns: m³/h, l/s, m³/s. "
            "Q = A × V (área × velocidade média)."
        ),
        "essenciais": [["vazão", "vazao"], "volume", ["tempo", "seção", "secao", "área", "area"]],
    },
    "vazao": None,

    # --- Velocidade de escoamento ---
    "velocidade de escoamento": {
        "definicao": (
            "A velocidade média de escoamento em uma tubulação é V = Q/A, onde Q é "
            "a vazão e A é a área da seção transversal. Velocidades típicas em "
            "instalações industriais ficam entre 0.5 e 3.0 m/s."
        ),
        "essenciais": ["velocidade", ["vazão", "vazao", "área", "area"], ["seção", "secao", "tubulação", "tubulacao"]],
    },

    # --- Diagrama de Moody ---
    "moody": {
        "definicao": (
            "O diagrama de Moody é um gráfico que relaciona o fator de atrito de Darcy "
            "com o número de Reynolds e a rugosidade relativa (ε/D), permitindo determinar "
            "o fator f para cálculo de perda de carga."
        ),
        "essenciais": ["moody", ["fator", "atrito"], "reynolds", "rugosidade"],
    },
    "diagrama de moody": None,
}

# Resolver aliases (chaves com valor None apontam para a definição com acento/sem acento)
_ALIAS_MAP = {
    "cavitação": "cavitacao",
    "npsh disponível": "npsh",
    "npsh requerido": "npsh",
    "perda distribuída": "perda de carga",
    "perda localizada": "perda de carga",
    "número de reynolds": "reynolds",
    "numero de reynolds": "reynolds",
    "escoamento turbulento": "turbulento",
    "pressao de vapor": "pressão de vapor",
    "golpe de ariete": "golpe de aríete",
    "ponto de operacao": "ponto de operação",
    "altura manometrica": "altura manométrica",
    "hmt": "altura manométrica",
    "eficiência": "rendimento",
    "potencia": "potência",
    "darcy": "darcy-weisbach",
    "hazen williams": "hazen-williams",
    "colebrook-white": "colebrook",
    "equação de bernoulli": "bernoulli",
    "aeracao": "aeração",
    "aerador": "aeração",
    "turbina hidraulica": "turbina hidráulica",
    "vazao": "vazão",
    "diagrama de moody": "moody",
}

for alias, target in _ALIAS_MAP.items():
    if alias in ANCHOR_CONCEPTS and ANCHOR_CONCEPTS[alias] is None:
        ANCHOR_CONCEPTS[alias] = ANCHOR_CONCEPTS.get(target)
