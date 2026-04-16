# -*- coding: utf-8 -*-
"""
Geração de Folha de Dados em PDF — layout corporativo HIGRA.

Usa fpdf2 para gerar PDF com cabeçalho/rodapé corporativo, dados técnicos
de motor e bomba, e campos da ficha técnica (hgr_mot_reg_fct).
"""

from __future__ import annotations

import io
import os
from datetime import datetime
from typing import Any

from fpdf import FPDF

LOGO_PATH = os.path.join(os.path.dirname(__file__), "..", "static", "logo_higra.jpg")

# Cores corporativas HIGRA
COR_PRIMARIA = (0, 70, 140)       # azul escuro
COR_SECUNDARIA = (0, 160, 223)    # azul claro
COR_HEADER_BG = (0, 70, 140)
COR_HEADER_TEXT = (255, 255, 255)
COR_ZEBRA_1 = (245, 247, 250)
COR_ZEBRA_2 = (255, 255, 255)
COR_BORDER = (200, 210, 220)


class FolhaDadosPDF(FPDF):
    """PDF customizado com header/footer HIGRA."""

    def __init__(self, titulo: str = "Folha de Dados"):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.titulo = titulo
        self.set_auto_page_break(auto=True, margin=25)

    def header(self):
        # Logo
        if os.path.exists(LOGO_PATH):
            self.image(LOGO_PATH, 10, 8, 40)
        # Título central
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(*COR_PRIMARIA)
        self.cell(0, 10, self.titulo, align="C", new_x="LMARGIN", new_y="NEXT")
        # Subtítulo
        self.set_font("Helvetica", "", 8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 4, "HIGRA Industrial Ltda — Bombas e Motores Submersíveis", align="C", new_x="LMARGIN", new_y="NEXT")
        # Linha separadora
        self.set_draw_color(*COR_SECUNDARIA)
        self.set_line_width(0.5)
        self.line(10, self.get_y() + 2, 200, self.get_y() + 2)
        self.ln(6)

    def footer(self):
        self.set_y(-20)
        self.set_draw_color(*COR_BORDER)
        self.set_line_width(0.3)
        self.line(10, self.get_y(), 200, self.get_y())
        self.ln(2)
        self.set_font("Helvetica", "", 7)
        self.set_text_color(130, 130, 130)
        self.cell(0, 4, f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}", align="L")
        self.cell(0, 4, f"Página {self.page_no()}/{{nb}}", align="R", new_x="LMARGIN", new_y="NEXT")
        self.cell(0, 4, "HIGRA Industrial Ltda — Documento Confidencial", align="C")

    # ----------------------------------------------------------------
    # Helpers de layout
    # ----------------------------------------------------------------
    def section_title(self, text: str):
        self.ln(3)
        self.set_fill_color(*COR_HEADER_BG)
        self.set_text_color(*COR_HEADER_TEXT)
        self.set_font("Helvetica", "B", 10)
        self.cell(0, 7, f"  {text}", fill=True, new_x="LMARGIN", new_y="NEXT")
        self.set_text_color(0, 0, 0)
        self.ln(1)

    def info_row(self, label: str, value: str, idx: int = 0):
        bg = COR_ZEBRA_1 if idx % 2 == 0 else COR_ZEBRA_2
        self.set_fill_color(*bg)
        self.set_font("Helvetica", "B", 9)
        self.cell(55, 6, f"  {label}", fill=True)
        self.set_font("Helvetica", "", 9)
        self.cell(0, 6, str(value or "—"), fill=True, new_x="LMARGIN", new_y="NEXT")

    def key_value_grid(self, data: list[tuple[str, str]], cols: int = 2):
        """Renderiza grid de pares label/valor em colunas."""
        col_w = (190 / cols) / 2
        for i, (label, value) in enumerate(data):
            col_idx = i % cols
            if col_idx == 0 and i > 0:
                self.ln()
            bg = COR_ZEBRA_1 if (i // cols) % 2 == 0 else COR_ZEBRA_2
            self.set_fill_color(*bg)
            x = 10 + col_idx * (col_w * 2)
            self.set_xy(x, self.get_y())
            self.set_font("Helvetica", "B", 8)
            self.cell(col_w, 6, f"  {label}", fill=True)
            self.set_font("Helvetica", "", 8)
            self.cell(col_w, 6, str(value or "—"), fill=True)
        self.ln(7)


def gerar_folha_dados_pdf(
    ficha: dict[str, Any],
    motor: dict[str, Any] | None = None,
    bomba: dict[str, Any] | None = None,
) -> bytes:
    """Gera PDF da Folha de Dados e retorna os bytes do arquivo."""

    titulo = ficha.get("descricao") or "Folha de Dados"
    pdf = FolhaDadosPDF(titulo=f"Folha de Dados — {titulo}")
    pdf.alias_nb_pages()
    pdf.add_page()

    # --- Identificação ---
    pdf.section_title("Identificação")
    id_data = [
        ("Ficha ID", str(ficha.get("id", ""))),
        ("Descrição", ficha.get("descricao", "")),
    ]
    if motor:
        id_data.append(("Motor", motor.get("descricao", "")))
        id_data.append(("Código Motor", motor.get("codigo", "")))
    if bomba:
        id_data.append(("Bomba", bomba.get("descricao", "")))
        id_data.append(("Código Bomba", bomba.get("codigo", "")))
    for i, (label, val) in enumerate(id_data):
        pdf.info_row(label, val, i)

    # --- Dados do Motor ---
    if motor:
        pdf.section_title("Dados do Motor")
        motor_fields = [
            ("Modelo", motor.get("modelo_nome", "")),
            ("Potência", motor.get("potencia", "")),
            ("Tensão", motor.get("tensao", "")),
            ("Corrente", motor.get("corrente", "")),
            ("Rotação", motor.get("rotacao", "")),
            ("Frequência", motor.get("frequencia", "")),
            ("Classe Isolamento", motor.get("classe_isolamento", "")),
            ("Grau de Proteção (IP)", motor.get("ip", "")),
            ("Carcaça", motor.get("carcaca", "")),
            ("Peso (kg)", str(motor.get("peso", "")) if motor.get("peso") else ""),
        ]
        pdf.key_value_grid(motor_fields, cols=2)

    # --- Dados da Bomba ---
    if bomba:
        pdf.section_title("Dados da Bomba")
        bomba_fields = [
            ("Modelo", bomba.get("modelo_nome", "")),
            ("Tipo", bomba.get("tipo", "")),
            ("Vazão Nominal", bomba.get("vazao_nominal", "")),
            ("Altura Nominal", bomba.get("altura_nominal", "")),
            ("Rendimento", bomba.get("rendimento", "")),
            ("Material", bomba.get("material", "")),
        ]
        pdf.key_value_grid(bomba_fields, cols=2)

    # --- Dados Técnicos (JSONB) ---
    dados_tecnicos = ficha.get("dados_tecnicos") or {}
    if isinstance(dados_tecnicos, dict) and dados_tecnicos:
        pdf.section_title("Especificações Técnicas")

        # Agrupar por categorias se houver sub-dicts
        flat_items = []
        grouped = {}
        for key, val in dados_tecnicos.items():
            if isinstance(val, dict):
                grouped[key] = val
            else:
                flat_items.append((key.replace("_", " ").title(), str(val)))

        if flat_items:
            pdf.key_value_grid(flat_items, cols=2)

        for group_name, group_data in grouped.items():
            pdf.section_title(group_name.replace("_", " ").title())
            items = [(k.replace("_", " ").title(), str(v)) for k, v in group_data.items()]
            pdf.key_value_grid(items, cols=2)

    # --- Observações ---
    obs = ficha.get("observacoes") or ficha.get("obs") or ""
    if obs:
        pdf.section_title("Observações")
        pdf.set_font("Helvetica", "", 9)
        pdf.multi_cell(0, 5, str(obs))

    # Retornar bytes
    return pdf.output()
