"""Spawn the relay as a long-lived background process, keeping stdin open.

Usage:
    python scripts/run-relay-bg.py [duration_seconds]

Default duration: 3600 (1 hour). The relay exits cleanly when this script
exits (which closes stdin, triggering the relay's shutdown handler).
"""
import subprocess
import sys
import time
import os
from pathlib import Path

root = Path(__file__).resolve().parent.parent
os.chdir(root)

duration = int(sys.argv[1]) if len(sys.argv) > 1 else 3600

log_out = open("relay.out.log", "ab")
log_err = open("relay.err.log", "ab")

print(f"[harness] starting relay (duration={duration}s) ...", flush=True)
proc = subprocess.Popen(
    [process_exec := "node", "bin/mcp-relay.mjs"],
    stdin=subprocess.PIPE,
    stdout=log_out,
    stderr=log_err,
    cwd=str(root),
)
print(f"[harness] relay started pid={proc.pid}", flush=True)

try:
    # Keep stdin open by sitting on this script. The relay sees stdin as
    # still connected; it stays up serving whatever MCP client connects.
    deadline = time.time() + duration
    while time.time() < deadline:
        if proc.poll() is not None:
            print(f"[harness] relay exited early rc={proc.returncode}", flush=True)
            break
        time.sleep(5)
    else:
        print(f"[harness] duration reached, stopping relay ...", flush=True)
        proc.stdin.close()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
except KeyboardInterrupt:
    print("[harness] keyboard interrupt, stopping relay ...", flush=True)
    try:
        proc.stdin.close()
    except Exception:
        pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()

log_out.close()
log_err.close()
print("[harness] done", flush=True)
