#!/usr/bin/env python3
"""Servidor local do Caçador de Sinal (sem precisar do GitHub).

- HTTP  em http://localhost:8000  -> para jogar/testar no próprio PC
- HTTPS em https://<ip-do-pc>:8443 -> para o CELULAR (câmera e sensores só
  funcionam em HTTPS). Certificado próprio: na 1ª vez o celular avisa
  "conexão não particular" -> Avançado -> Continuar.
- Bibliotecas da internet (Three.js, MediaPipe, modelo das mãos) são baixadas
  uma vez e guardadas em servidor/cache/ -> depois funciona SEM internet.

Só usa a biblioteca padrão do Python 3.
"""
import http.server
import os
import socket
import ssl
import sys
import threading
import urllib.request
import webbrowser
from urllib.parse import urlparse, quote

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)              # pasta do jogo
CACHE = os.path.join(HERE, 'cache')
CERT = os.path.join(HERE, 'cert.pem')
KEY = os.path.join(HERE, 'key.pem')

# endereços da internet -> rota local (o servidor troca nos arquivos do jogo)
CDNS = {
    'https://cdn.jsdelivr.net/': '/cdn/jsdelivr/',
    'https://storage.googleapis.com/': '/cdn/googleapis/',
}
REMOTE = {v.strip('/').split('/', 1)[1]: k for k, v in CDNS.items()}  # 'jsdelivr' -> url

# tipos explícitos (no Windows o registro às vezes diz que .js é text/plain,
# o que quebra os módulos do navegador)
TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.cjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm',
    '.task': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
}
TEXT_REWRITE = ('.html', '.js')

# arquivos que o jogo usa (para baixar tudo de uma vez com --baixar)
PRELOAD = [
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.cjs',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.js',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_internal.wasm',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.js',
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm/vision_wasm_nosimd_internal.wasm',
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
]


def cache_path(cdn, rest):
    safe = os.path.normpath(rest).lstrip(os.sep)
    if safe.startswith('..'):
        raise ValueError('caminho inválido')
    return os.path.join(CACHE, cdn, safe)


def fetch_to_cache(url):
    for prefix, local in CDNS.items():
        if url.startswith(prefix):
            cdn = local.strip('/').split('/', 1)[1]
            dest = cache_path(cdn, url[len(prefix):])
            break
    else:
        raise ValueError(url)
    if os.path.exists(dest):
        return dest
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + '.baixando'
    with urllib.request.urlopen(url, timeout=60) as r, open(tmp, 'wb') as f:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            f.write(chunk)
    os.replace(tmp, dest)
    return dest


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if '/cdn/' in self.path and ' 200 ' not in (fmt % args):
            sys.stderr.write('  ' + (fmt % args) + '\n')

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def guess_type(self, path):
        return TYPES.get(os.path.splitext(path)[1].lower(), super().guess_type(path))

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith('/cdn/'):
            return self.serve_cdn(path)
        local = self.translate_path(path)
        if os.path.isdir(local):
            local = os.path.join(local, 'index.html')
        if os.path.isfile(local) and local.endswith(TEXT_REWRITE):
            return self.serve_rewritten(local)
        return super().do_GET()

    def send_bytes(self, data, ctype):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def serve_rewritten(self, local):
        with open(local, 'r', encoding='utf-8') as f:
            text = f.read()
        for remote, mine in CDNS.items():
            text = text.replace(remote, mine)
        self.send_bytes(text.encode('utf-8'), self.guess_type(local))

    def serve_cdn(self, path):
        try:
            cdn, rest = path[len('/cdn/'):].split('/', 1)
            if cdn not in REMOTE:
                raise ValueError(cdn)
            dest = cache_path(cdn, rest)
            if not os.path.exists(dest):
                print(f'  baixando {REMOTE[cdn]}{rest} ...', flush=True)
                fetch_to_cache(REMOTE[cdn] + quote(rest, safe='/@'))
            with open(dest, 'rb') as f:
                data = f.read()
            self.send_bytes(data, self.guess_type(dest))
        except Exception as e:  # sem internet e sem cache, por exemplo
            msg = f'Nao foi possivel obter {path}: {e}'.encode('utf-8')
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)


def lan_ips():
    ips = []
    try:  # IP da rede principal (não envia nada pela rede)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return [ip for ip in ips if not ip.startswith('127.')] or ['127.0.0.1']


def start(port, use_ssl):
    for p in range(port, port + 20):
        try:
            srv = http.server.ThreadingHTTPServer(('0.0.0.0', p), Handler)
        except OSError:
            continue
        if use_ssl:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(CERT, KEY)
            srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return p
    raise SystemExit(f'Nenhuma porta livre a partir de {port}')


def main():
    if '--baixar' in sys.argv:
        print('Baixando as bibliotecas para usar sem internet...')
        falhas = 0
        for url in PRELOAD:
            print('  ', url.rsplit('/', 1)[-1])
            try:
                fetch_to_cache(url)
            except Exception as e:
                falhas += 1
                print('     falhou:', e)
        print('Pronto!' if not falhas else f'{falhas} arquivo(s) falharam (sem internet?). O resto já está guardado.')
        return
    http_port = start(8000, False)
    https_port = start(8443, True)
    ips = lan_ips()
    phone = f'https://{ips[0]}:{https_port}/'
    print()
    print('=' * 62)
    print('  CACADOR DE SINAL - servidor local rodando')
    print('=' * 62)
    print(f'  No PC:      http://localhost:{http_port}/')
    print('  No CELULAR (mesmo Wi-Fi do PC):')
    for ip in ips:
        print(f'              https://{ip}:{https_port}/')
    print()
    print('  No celular aparece "conexao nao particular":')
    print('  toque em Avancado -> Continuar (o certificado e deste PC).')
    print('  Se o Windows perguntar sobre o firewall, clique em PERMITIR.')
    print()
    print('  Para desligar: feche esta janela (ou Ctrl+C).')
    print('=' * 62)
    if '--sem-navegador' not in sys.argv:
        webbrowser.open(f'http://localhost:{http_port}/servidor/conectar.html?url={quote(phone, safe="")}')
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print('Servidor desligado.')


if __name__ == '__main__':
    main()
