"""Build the .eext package (zip of the extension assets)."""
import os
import pathlib
import re
import zipfile

root = pathlib.Path(__file__).resolve().parent.parent
os.chdir(root)

ext_text = pathlib.Path("extension.json").read_text(encoding="utf-8")
m = re.search(r'"version"\s*:\s*"([^"]+)"', ext_text)
version = m.group(1) if m else "0.0.0"

out = pathlib.Path("dist") / f"lceda-ai-mcp-{version}.eext"
out.parent.mkdir(parents=True, exist_ok=True)

includes = [
    "extension.json",
    "dist/index.js",
    "dist/index.js.map",
    "images",
    "locales",
    "iframe",
]

count = 0
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for item in includes:
        p = pathlib.Path(item)
        if not p.exists():
            print(f"skip (not found): {item}")
            continue
        if p.is_file():
            zf.write(p, item)
            print(f"  + {item}")
            count += 1
        else:
            for f in p.rglob("*"):
                if f.is_file():
                    arc = f.as_posix()
                    zf.write(f, arc)
                    print(f"  + {arc}")
                    count += 1

size_kb = out.stat().st_size / 1024
print(f"OK: {out} ({size_kb:.1f} KB, {count} files)")
