"""
Entry point for the offline AI worker.
Run with PYTHONPATH including the repo root (parent of `shared/`).
"""

from scheduler import run_forever

if __name__ == "__main__":
    run_forever()
