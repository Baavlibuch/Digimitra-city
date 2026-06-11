"""Guard: live-detection-agent must not use Python 3.10+ typing syntax."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


def test_live_detection_agent_py39_typing_compat():
    root = Path(__file__).resolve().parents[1]
    script = root / "scripts" / "check_py39_compatibility.py"
    result = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(root),
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, (
        "Python 3.10+ typing syntax detected in live-detection-agent:\n"
        f"{result.stdout}\n{result.stderr}"
    )
