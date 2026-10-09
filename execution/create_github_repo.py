#!/usr/bin/env python3
import subprocess
import json
import urllib.request
import urllib.error
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def get_git_credentials():
    proc = subprocess.Popen(
        ['git', 'credential', 'fill'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    stdout, stderr = proc.communicate(input="protocol=https\nhost=github.com\n")
    creds = {}
    for line in stdout.splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            creds[k.strip()] = v.strip()
    return creds

def create_or_check_repo(token, repo_name="linkzivo"):
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "User-Agent": "Antigravity-Linkzivo",
        "X-GitHub-Api-Version": "2022-11-28"
    }

    # Verificar se o repositório já existe
    req = urllib.request.Request(f"https://api.github.com/user/repos", headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            repos = json.loads(resp.read().decode())
            existing = next((r for r in repos if r['name'].lower() == repo_name.lower()), None)
            if existing:
                print(f"[OK] Repositório '{existing['full_name']}' já existe.")
                return existing
    except urllib.error.HTTPError as e:
        print(f"[WARN] Erro ao listar repos: {e.code} - {e.reason}")

    # Criar repositório público
    payload = {
        "name": repo_name,
        "description": "Plataforma SaaS profissional de Smart Links, QR Codes dinâmicos, tracking e atribuição para afiliados e criadores",
        "private": False,
        "has_issues": True,
        "has_projects": True,
        "has_wiki": True
    }
    data = json.dumps(payload).encode('utf-8')
    create_req = urllib.request.Request(
        "https://api.github.com/user/repos",
        data=data,
        headers=headers,
        method="POST"
    )
    try:
        with urllib.request.urlopen(create_req) as resp:
            created = json.loads(resp.read().decode())
            print(f"[OK] Repositório '{created['full_name']}' criado com sucesso!")
            return created
    except urllib.error.HTTPError as e:
        err_msg = e.read().decode()
        print(f"[ERR] Falha ao criar repositório: {e.code} - {err_msg}")
        return None

if __name__ == "__main__":
    creds = get_git_credentials()
    token = creds.get('password')
    username = creds.get('username', 'fabioferrante')
    if not token:
        print("[ERR] Não foi possível obter o token do GitHub pelo Git Credential Manager.")
        sys.exit(1)
        
    print(f"Autenticado como: {username}")
    repo = create_or_check_repo(token, "linkzivo")
    if repo:
        print(f"Clone URL: {repo['clone_url']}")
        print(f"HTML URL: {repo['html_url']}")
    else:
        sys.exit(1)
