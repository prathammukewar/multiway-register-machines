"""Render the social preview card and the touch icon with headless Chrome.

Writes web/static/social-card.png (1200 x 630, used by the Open Graph and
Twitter tags) and web/static/apple-touch-icon.png (180 x 180). The card is a
small HTML page with the grid-paths figure inlined, so it stays in step with
the committed figures. Chrome is only needed to run this script; the outputs
are committed.

    python scripts/make_social_card.py [--chrome PATH]
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIGURE = ROOT / "docs" / "figures" / "grid-paths.svg"
FAVICON = ROOT / "web" / "static" / "favicon.svg"
OUT_DIR = ROOT / "web" / "static"

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "google-chrome",
    "chromium",
    "chromium-browser",
]

CARD_CSS = """
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body {
    font-family: "Inter", -apple-system, "SF Pro Text", "Segoe UI", system-ui, sans-serif;
    background:
      radial-gradient(900px 500px at 8% -10%, #dbe9fa, transparent 60%),
      linear-gradient(160deg, #f7f6f2, #ebeae5);
    color: #16181c;
    display: flex;
  }
  .rule {
    position: absolute; left: 0; right: 0; top: 0; height: 10px;
    background: linear-gradient(90deg, #2a78d6, #eb6834 55%, #c98500);
  }
  .text { flex: 1; padding: 78px 0 0 72px; display: flex; flex-direction: column; }
  .mark { display: flex; align-items: center; gap: 16px; margin-bottom: 30px; }
  .mark svg { width: 52px; height: 52px; }
  .mark span { font-size: 20px; font-weight: 600; letter-spacing: 0.02em; color: #4d4c48; }
  h1 {
    margin: 0 0 22px; font-size: 62px; line-height: 1.02;
    letter-spacing: -0.03em; font-weight: 800;
  }
  p { margin: 0; font-size: 25px; line-height: 1.35; color: #4d4c48; max-width: 560px; }
  .url {
    margin-top: auto; padding-bottom: 60px;
    font-size: 21px; font-weight: 600; color: #1c5cab;
  }
  .figure {
    width: 520px; display: flex; align-items: center; justify-content: center;
    padding: 36px 40px 36px 0;
  }
  .figure svg {
    max-height: 558px; width: auto;
    filter: drop-shadow(0 12px 28px rgba(20, 20, 18, 0.14));
  }
"""

CARD_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>{css}</style></head>
<body>
<div class="rule"></div>
<div class="text">
  <div class="mark">{favicon}<span>prathammukewar / multiway-register-machines</span></div>
  <h1>Multiway Register Machine Explorer</h1>
  <p>Every path a nondeterministic register machine can take, drawn and counted in your browser.</p>
  <div class="url">prathammukewar.github.io/multiway-register-machines</div>
</div>
<div class="figure">{figure}</div>
</body></html>
"""

ICON_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 180px; height: 180px; overflow: hidden; background: #ffffff; }
  svg { width: 180px; height: 180px; display: block; }
</style></head><body>{favicon}</body></html>
"""


def find_chrome(explicit: str | None) -> str:
    candidates = [explicit] if explicit else CHROME_CANDIDATES
    for candidate in candidates:
        if candidate and (Path(candidate).exists() or shutil.which(candidate)):
            return candidate
    raise SystemExit("error: Chrome not found; pass --chrome PATH")


def shoot(chrome: str, html: str, size: tuple[int, int], out: Path) -> None:
    """Screenshot one page. Chrome sometimes lingers after writing the file,
    so a slow exit is tolerated as long as the image landed."""
    out.unlink(missing_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(html, encoding="utf-8")
        command = [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-extensions",
            "--force-device-scale-factor=1",
            f"--window-size={size[0]},{size[1]}",
            f"--screenshot={out}",
            f"--user-data-dir={Path(tmp) / 'profile'}",
            page.as_uri(),
        ]
        process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            process.wait(timeout=45)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    if not out.exists():
        raise SystemExit(f"error: Chrome wrote nothing to {out}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chrome", help="path to the Chrome or Chromium binary")
    args = parser.parse_args()
    chrome = find_chrome(args.chrome)
    favicon = FAVICON.read_text(encoding="utf-8")
    figure = FIGURE.read_text(encoding="utf-8")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    card = CARD_HTML.format(css=CARD_CSS, favicon=favicon, figure=figure)
    shoot(chrome, card, (1200, 630), OUT_DIR / "social-card.png")
    icon = ICON_HTML.replace("{favicon}", favicon)
    shoot(chrome, icon, (180, 180), OUT_DIR / "apple-touch-icon.png")
    for name in ("social-card.png", "apple-touch-icon.png"):
        print(f"wrote {OUT_DIR / name} ({(OUT_DIR / name).stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
