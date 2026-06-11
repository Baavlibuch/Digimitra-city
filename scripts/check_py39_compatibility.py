#!/usr/bin/env python3
"""Fail if live-detection-agent uses Python 3.10+ typing syntax."""

import re
import sys
from pathlib import Path
from typing import List, Pattern, Tuple

ROOT = Path(__file__).resolve().parents[1]
TARGET_DIR = ROOT / "live-detection-agent"

PATTERNS: List[Tuple[Pattern[str], str]] = [
    (re.compile(r"\| None"), "| None"),
    (re.compile(r" \| "), " | "),
    (re.compile(r"\blist\["), "list["),
    (re.compile(r"\bdict\["), "dict["),
    (re.compile(r"\bset\["), "set["),
    (re.compile(r"\btuple\["), "tuple["),
]


def _strip_comments(line: str) -> str:
    in_single = in_double = in_triple = False
    i = 0
    while i < len(line):
        if in_triple:
            if line[i : i + 3] == '"""' or line[i : i + 3] == "'''":
                in_triple = False
                i += 3
                continue
            i += 1
            continue
        if in_single:
            if line[i] == "'":
                in_single = False
            i += 1
            continue
        if in_double:
            if line[i] == '"':
                in_double = False
            i += 1
            continue
        if line[i : i + 3] in ('"""', "'''"):
            in_triple = True
            i += 3
            continue
        if line[i] == "'":
            in_single = True
            i += 1
            continue
        if line[i] == '"':
            in_double = True
            i += 1
            continue
        if line[i] == "#":
            return line[:i]
        i += 1
    return line


def scan_file(path: Path) -> List[str]:
    violations: List[str] = []
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = _strip_comments(raw)
        for regex, label in PATTERNS:
            if regex.search(line):
                violations.append(f"{path.relative_to(ROOT)}:{lineno}: {label!r} in: {raw.strip()}")
                break
    return violations


def main() -> int:
    if not TARGET_DIR.is_dir():
        print(f"ERROR: directory not found: {TARGET_DIR}", file=sys.stderr)
        return 1

    all_violations: List[str] = []
    for py_file in sorted(TARGET_DIR.rglob("*.py")):
        all_violations.extend(scan_file(py_file))

    if all_violations:
        print("Python 3.10+ typing syntax found in live-detection-agent:", file=sys.stderr)
        for v in all_violations:
            print(f"  {v}", file=sys.stderr)
        print(
            "\nUse typing.Optional, typing.Union, typing.List, typing.Dict, etc. for Python 3.9.",
            file=sys.stderr,
        )
        return 1

    print(f"OK: {TARGET_DIR.relative_to(ROOT)} is Python 3.9 typing compatible")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
