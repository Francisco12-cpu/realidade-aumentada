#!/usr/bin/env python3
"""Gera dist/index.html: o jogo inteiro em UM arquivo (CSS e JS embutidos).

Útil para publicar enviando só um arquivo pelo site do GitHub.
Uso: python3 tools/build-single.py
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ORDER = ['config', 'filters', 'scene', 'orientation', 'hands', 'gestures',
         'teleport', 'locomotion', 'interaction', 'vr', 'calibration', 'debug', 'main']

parts = ["import * as THREE from 'three';"]
for name in ORDER:
    src = (ROOT / 'js' / f'{name}.js').read_text(encoding='utf-8')
    src = re.sub(r"^import \* as THREE from 'three';\n", '', src, flags=re.M)
    src = re.sub(r"^import \{[^}]*\} from '\./[a-z-]+\.js';\n", '', src, flags=re.M)
    src = re.sub(r'^export (const|let|function|class|async function) ', r'\1 ', src, flags=re.M)
    assert "from './" not in src, name
    assert not re.search(r'^export ', src, flags=re.M), name
    parts.append(f'// ===== js/{name}.js =====\n{src}')

html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'css' / 'style.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="css/style.css">', f'<style>\n{css}</style>')
js = '\n'.join(parts).replace('</script', '<\\/script')
html = html.replace('<script type="module" src="js/main.js"></script>',
                    f'<script type="module">\n{js}\n</script>')
out = ROOT / 'dist' / 'index.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html, encoding='utf-8')
# service worker junto (faz o link sempre abrir a versão mais nova)
(out.parent / 'sw.js').write_text((ROOT / 'sw.js').read_text(encoding='utf-8'), encoding='utf-8')
print(f'{out} ({len(html) // 1024} KB)')
