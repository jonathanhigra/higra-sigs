#!/usr/bin/env python3
"""Falha se houver anotacoes `|` sem `from __future__ import annotations`.

O deploy roda em Python 3.9 no EC2. Sem o future import, unioes PEP 604
(`str | None`, `list[int] | None`, etc.) podem quebrar no import.
"""

from __future__ import annotations

import ast
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
IGNORED_PARTS = {"venv", "__pycache__", ".pytest_cache", ".mypy_cache"}


def has_future_annotations(tree: ast.Module) -> bool:
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "__future__":
            if any(alias.name == "annotations" for alias in node.names):
                return True
    return False


def annotation_nodes(tree: ast.Module):
    for node in ast.walk(tree):
        if isinstance(node, ast.arg) and node.annotation is not None:
            yield node.annotation
        elif isinstance(node, ast.AnnAssign) and node.annotation is not None:
            yield node.annotation
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.returns is not None:
            yield node.returns


def union_lines_in_annotation(annotation: ast.AST) -> set[int]:
    lines: set[int] = set()
    for node in ast.walk(annotation):
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.BitOr):
            lines.add(node.lineno)
    return lines


def iter_backend_files():
    for path in BACKEND_DIR.rglob("*.py"):
        if any(part in IGNORED_PARTS for part in path.parts):
            continue
        yield path


def main() -> int:
    violations: list[tuple[Path, list[int]]] = []

    for path in iter_backend_files():
        source = path.read_text(encoding="utf-8-sig")
        try:
            tree = ast.parse(source, filename=str(path))
        except SyntaxError as exc:
            rel = path.relative_to(REPO_ROOT)
            print(f"Python 3.9 annotation compatibility check: FAILED")
            print(f"Nao foi possivel analisar {rel}:{exc.lineno} ({exc.msg})")
            return 1
        if has_future_annotations(tree):
            continue

        union_lines: set[int] = set()
        for annotation in annotation_nodes(tree):
            union_lines.update(union_lines_in_annotation(annotation))

        if union_lines:
            violations.append((path, sorted(union_lines)))

    if not violations:
        print("Python 3.9 annotation compatibility check: OK")
        return 0

    print("Python 3.9 annotation compatibility check: FAILED")
    print("Arquivos com anotacao usando `|` sem `from __future__ import annotations`:")
    for path, lines in violations:
        rel = path.relative_to(REPO_ROOT)
        line_str = ", ".join(str(n) for n in lines)
        print(f" - {rel}:{line_str}")
    print("Corrija adicionando `from __future__ import annotations` ou trocando `|` por Optional/Union.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
