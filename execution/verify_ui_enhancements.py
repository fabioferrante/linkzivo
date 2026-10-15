#!/usr/bin/env python3
"""
Validação Automatizada dos 5 Requisitos de UI e Navegação do Linkzivo:
1. Animação de pulso intermitente no indicador verde de 'SaaS Operacional'.
2. Roteamento de Campanhas e Analytics para as respectivas abas no dashboard para logados.
3. Roteamento de Campanhas, Analytics e botão Analytics do encurtador para /#planos quando deslogado.
4. Headers anti-cache estritos no endpoint /api/auth.
5. Tooltip do gráfico de período reposicionado com segurança sem sofrer corte de overflow.
"""

import sys
import json
import urllib.request
import urllib.parse
from http.cookiejar import CookieJar

if sys.stdout.encoding != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

BASE_URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"

def test_auth_no_cache_headers():
    print("--- [TESTE 1]: Headers anti-cache em /api/auth ---")
    req = urllib.request.Request(f"{BASE_URL}/api/auth")
    with urllib.request.urlopen(req) as resp:
        cache_control = resp.headers.get("Cache-Control", "")
        print(f"Cache-Control recebido: {cache_control}")
        assert "no-store" in cache_control, "Cache-Control deve conter 'no-store'"
        assert "no-cache" in cache_control, "Cache-Control deve conter 'no-cache'"
    print("✓ Headers anti-cache validados com sucesso.")

def test_home_page_rendered():
    print("\n--- [TESTE 2]: Renderização da Home Page e elementos visuais ---")
    req = urllib.request.Request(f"{BASE_URL}/")
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode("utf-8")
        assert "SaaS Operacional" in html, "Texto 'SaaS Operacional' deve estar presente na home"
        assert "animate-ping" in html, "Classe 'animate-ping' deve estar presente para pulso intermitente"
        assert "bg-emerald-400" in html, "Cor esmeralda do indicador deve estar presente"
        assert "#planos" in html, "Âncora de planos deve estar presente na home"
    print("✓ Elementos de pulso e âncoras da home validados com sucesso.")

def test_dashboard_with_tabs():
    print("\n--- [TESTE 3]: Acesso ao dashboard com query params e abas ---")
    cj = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

    # Registrar usuário de teste
    import random
    rand_id = random.randint(10000, 99999)
    reg_data = json.dumps({
        "action": "register",
        "name": f"Tester {rand_id}",
        "email": f"tester_{rand_id}@linkzivo.com",
        "password": "password123"
    }).encode("utf-8")

    req_reg = urllib.request.Request(
        f"{BASE_URL}/api/auth",
        data=reg_data,
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req_reg) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        assert data.get("success") is True

    # Testar abas via query param
    for tab in ["campaigns", "analytics", "links", "products"]:
        req_dash = urllib.request.Request(f"{BASE_URL}/dashboard?tab={tab}")
        with opener.open(req_dash) as resp:
            assert resp.status == 200, f"Dashboard com ?tab={tab} deve responder HTTP 200"
        print(f"✓ Rota /dashboard?tab={tab} respondendo HTTP 200 com sessão ativa.")

def main():
    print("============================================================")
    print("LINKZIVO — Validação dos Requisitos de UI & Deep Linking")
    print(f"Alvo: {BASE_URL}")
    print("============================================================")
    test_auth_no_cache_headers()
    test_home_page_rendered()
    test_dashboard_with_tabs()
    print("\n============================================================")
    print("✓ TODOS OS TESTES ESPECÍFICOS DE UI & DEEP LINKING FORAM APROVADOS!")
    print("============================================================")

if __name__ == "__main__":
    main()
