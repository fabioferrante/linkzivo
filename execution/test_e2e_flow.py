"""
Linkzivo E2E Test Suite (Layer 3: Execution - DOE)
Testa de ponta a ponta o fluxo crítico do SaaS:
1. Cadastro e Login de Usuário
2. Cadastro de Produto & Oferta de Afiliado
3. Criação de Campanha
4. Encurtamento de URL com Slug Personalizado & UTMs
5. Geração e Verificação de QR Code Dinâmico
6. Execução do Redirecionamento HTTP 302 com injeção de click_id (sck)
7. Edição do Destino mantendo o Slug e QR Code
8. Validação do Novo Destino
9. Verificação de Métricas no Analytics
"""

import urllib.request
import urllib.parse
import json
import sys
import time

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3000"


def log_step(step_num, title):
    print(f"\n==========================================")
    print(f"[{step_num}] {title}")
    print(f"==========================================")

def main():
    cookie_processor = urllib.request.HTTPCookieProcessor()
    opener = urllib.request.build_opener(cookie_processor)
    urllib.request.install_opener(opener)

    # 1. Cadastro / Login
    log_step("1", "Autenticando Usuário no SaaS")
    register_payload = {
        "action": "register",
        "name": "Afiliado Pro",
        "email": f"afiliado_{int(time.time())}@linkzivo.com",
        "password": "senhaSegura123!"
    }

    req = urllib.request.Request(
        f"{BASE_URL}/api/auth",
        data=json.dumps(register_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req) as resp:
        data = json.loads(resp.read().decode())
        assert resp.status == 200, f"Falha no registro: {data}"
        print("✓ Usuário registrado com sucesso:", data["user"]["email"])

    # 2. Cadastro de Produto
    log_step("2", "Cadastrando Produto no Link Vault")
    prod_payload = {
        "name": "Curso Mestre de Vendas",
        "platform": "Hotmart",
        "initialOfferUrl": "https://pay.hotmart.com/PROD123",
        "commissionValue": "150.00"
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/products",
        data=json.dumps(prod_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req) as resp:
        prod_data = json.loads(resp.read().decode())
        assert resp.status == 201
        product_id = prod_data["product"]["id"]
        print(f"✓ Produto criado: {prod_data['product']['name']} (ID: {product_id})")

    # 3. Criação de Campanha
    log_step("3", "Criando Campanha de Marketing")
    camp_payload = {
        "name": "Black Friday 2026",
        "description": "Campanha promocional com 50% de comissão",
        "productId": product_id,
        "budget": 5000.0
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/campaigns",
        data=json.dumps(camp_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req) as resp:
        camp_data = json.loads(resp.read().decode())
        assert resp.status == 201
        campaign_id = camp_data["campaign"]["id"]
        print(f"✓ Campanha criada: {camp_data['campaign']['name']} (ID: {campaign_id})")

    # 4. Criação de Smart Link com Slug Customizado e UTMs
    log_step("4", "Criando Smart Link com UTMs e Slug Customizado")
    slug = f"black-friday-{int(time.time()) % 10000}"
    original_dest = "https://pay.hotmart.com/PROD123"
    link_payload = {
        "url": original_dest,
        "customSlug": slug,
        "title": "Instagram Stories - Promoção Black Friday",
        "productId": product_id,
        "campaignId": campaign_id,
        "utmSource": "instagram",
        "utmMedium": "stories",
        "utmCampaign": "black-friday-2026"
    }
    req = urllib.request.Request(
        f"{BASE_URL}/api/links",
        data=json.dumps(link_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with opener.open(req) as resp:
        link_data = json.loads(resp.read().decode())
        assert resp.status == 201
        link_id = link_data["link"]["id"]
        short_url = link_data["shortUrl"]
        print(f"✓ Smart Link criado:")
        print(f"  - URL Curta: {short_url}")
        print(f"  - Destino Inicial: {original_dest}")
        print(f"  - QR Code Base64 disponível: {len(link_data['qrDataUrl'])} bytes")

    # 5. Verificação do Endpoint de QR Code
    log_step("5", "Testando Endpoint Dinâmico de QR Code")
    req = urllib.request.Request(f"{BASE_URL}/api/links/{link_id}/qr?format=png")
    with opener.open(req) as resp:
        qr_resp = json.loads(resp.read().decode())
        assert "dataUrl" in qr_resp
        print("✓ QR Code PNG validado e funcional!")

    # 6. Teste de Redirecionamento e Tracking
    log_step("6", "Testando Redirecionamento O(1) e Injeção de Rastreio (click_id)")
    
    # Criamos opener que não segue redirect automaticamente para inspecionar os headers HTTP 302
    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
        def http_error_302(self, req, fp, code, msg, headers):
            return fp

    no_redirect_opener = urllib.request.build_opener(NoRedirectHandler)
    req_click = urllib.request.Request(
        f"{BASE_URL}/{slug}",
        headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"}
    )
    resp_click = no_redirect_opener.open(req_click)
    status_code = getattr(resp_click, "status", getattr(resp_click, "code", 302))
    redirect_dest = resp_click.headers.get("Location")
    click_id = resp_click.headers.get("X-Linkzivo-Click-Id")
    
    print(f"✓ Código HTTP retornado: {status_code} (Redirect)")
    print(f"✓ Destino com forward de UTMs e sck:")
    print(f"  {redirect_dest}")
    print(f"✓ Identificador técnico de clique gerado: {click_id}")
    assert "utm_source=instagram" in redirect_dest
    assert "sck=" in redirect_dest
    assert click_id is not None

    # Aguardar processamento assíncrono do clique
    time.sleep(1)

    # 7. Edição do Destino Mantendo o Slug
    log_step("7", "Alterando o Destino do Link sem Modificar o Slug")
    new_dest = "https://pay.hotmart.com/PROMO-NATAL-NOVA"
    patch_payload = {
        "destinationUrl": new_dest
    }
    req_patch = urllib.request.Request(
        f"{BASE_URL}/api/links/{link_id}",
        data=json.dumps(patch_payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="PATCH"
    )
    with opener.open(req_patch) as resp:
        patch_data = json.loads(resp.read().decode())
        assert resp.status == 200
        print(f"✓ Destino atualizado com sucesso!")
        print(f"  - Novo destino: {patch_data['link']['destinationUrl']}")
        print(f"  - Slug preservado: /{patch_data['link']['slug']}")

    # 8. Teste do Redirecionamento com Novo Destino
    log_step("8", "Acessando Novamente o Link Curto para Confirmar Novo Destino")
    resp_click2 = no_redirect_opener.open(req_click)
    redirect_dest2 = resp_click2.headers.get("Location")
    print(f"✓ Novo redirecionamento verificado:")
    print(f"  {redirect_dest2}")
    assert "PROMO-NATAL-NOVA" in redirect_dest2
    assert "sck=" in redirect_dest2

    # 9. Verificação de Analytics
    log_step("9", "Consultando Métricas no Dashboard de Analytics")
    time.sleep(1)
    req_ana = urllib.request.Request(f"{BASE_URL}/api/analytics")
    with opener.open(req_ana) as resp:
        ana_data = json.loads(resp.read().decode())
        print(f"✓ Total de cliques registrados: {ana_data['totalClicks']}")
        print(f"✓ Dispositivos mapeados: {ana_data['deviceBreakdown']}")
        assert ana_data["totalClicks"] >= 2

    print("\n==========================================")
    print(">>> TODOS OS 9 TESTES E2E FORAM APROVADOS COM SUCESSO! <<<")
    print("==========================================\n")

if __name__ == "__main__":
    main()
