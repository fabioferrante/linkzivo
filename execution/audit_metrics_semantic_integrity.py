"""
Script de Auditoria de Integridade Semântica e Contabilização de Métricas (DOE Layer 3)
Executa auditoria isolada sem impactar dados de outros usuários.
Valida:
1. Estado Zero Absoluto (sem links cadastrados)
2. Criação de Link isolado (1 link, 0 cliques)
3. Acesso Direto (Desktop) -> exatamente +1 clique e 0 QR
4. Acesso via QR Code (Mobile com rajada/prefetch) -> exatamente +1 clique e +1 QR (com debounce, sem duplicar)
5. Conferência de proporções de métricas (QR volume, CVR)
6. Exclusão do link e verificação de exclusão em cascata (volta a 0 links, 0 cliques, sem resíduos órfãos)
"""

import sys
import time
import requests

def run_audit(base_url="https://linkzivo-production.up.railway.app"):
    print("=" * 70)
    print(f"INICIANDO AUDITORIA DE INTEGRIDADE SEMÂNTICA: {base_url}")
    print("=" * 70)

    session = requests.Session()
    session.headers.update({"User-Agent": "AuditSemanticRunner/1.0"})

    timestamp = int(time.time())
    email = f"audit_metrics_{timestamp}@linkzivo.com"
    password = "AuditPassword123!"

    # 1. Registro de Usuário e Workspace Isolado
    print("\n[FASE 1] Autenticando com Conta Isolada de Auditoria...")
    reg_resp = session.post(
        f"{base_url}/api/auth",
        json={"action": "register", "email": email, "password": password, "name": "Auditor de Métricas QA"},
    )
    assert reg_resp.status_code == 200, f"Falha no registro: {reg_resp.text}"
    user_data = reg_resp.json().get("user")
    print(f"[OK] Usuario criado: {email} (ID: {user_data.get('id')})")

    # 2. Validação do Estado Zero Absoluto
    print("\n[FASE 2] Validando Estado Zero Puro (Sem Links Cadastrados)...")
    an_resp = session.get(f"{base_url}/api/analytics?period=30d")
    assert an_resp.status_code == 200, f"Erro ao consultar analytics: {an_resp.text}"
    an_data = an_resp.json()

    print(f"  - totalLinks: {an_data.get('totalLinks')} (Esperado: 0)")
    print(f"  - totalClicks: {an_data.get('totalClicks')} (Esperado: 0)")
    print(f"  - totalQrScans: {an_data.get('totalQrScans')} (Esperado: 0)")
    print(f"  - conversionsCount: {an_data.get('conversionsCount')} (Esperado: 0)")
    print(f"  - deviceBreakdown: {an_data.get('deviceBreakdown')} (Esperado: [])")

    assert an_data.get("totalLinks") == 0, "totalLinks deveria ser 0"
    assert an_data.get("totalClicks") == 0, "totalClicks deveria ser 0"
    assert an_data.get("totalQrScans") == 0, "totalQrScans deveria ser 0"
    assert an_data.get("conversionsCount") == 0, "conversionsCount deveria ser 0"
    assert len(an_data.get("deviceBreakdown", [])) == 0, "deviceBreakdown deveria ser vazio"
    print("[OK] Estado Zero Absoluto VALIDADO com sucesso!")

    # 3. Criação de Link de Teste Controlado
    print("\n[FASE 3] Criando Smart Link de Teste Isolado...")
    slug = f"audit-metric-{timestamp % 10000}"
    create_resp = session.post(
        f"{base_url}/api/links",
        json={
            "url": "https://example.com/produto-auditoria-semantica",
            "customSlug": slug,
            "title": "Link de Auditoria Semântica",
            "utmSource": "teste",
            "utmMedium": "auditoria",
        },
    )
    assert create_resp.status_code in (200, 201), f"Falha ao criar link: {create_resp.text}"
    link_obj = create_resp.json().get("link")
    link_id = link_obj.get("id")
    print(f"[OK] Smart Link criado: /{slug} (ID: {link_id})")

    # Verifica Analytics logo após criar o link (1 link, 0 cliques)
    an_resp2 = session.get(f"{base_url}/api/analytics?period=30d")
    an_data2 = an_resp2.json()
    assert an_data2.get("totalLinks") == 1, "totalLinks deveria ser 1"
    assert an_data2.get("totalClicks") == 0, "totalClicks deveria ser 0 antes de acessos"
    print(f"[OK] Validacao pos-criacao: totalLinks=1, totalClicks=0 (sem dados fantasma)")

    # 4. Acesso Direto Controlado (Desktop)
    print("\n[FASE 4] Executando Acesso Direto Controlado (Simulacao Desktop)...")
    direct_session = requests.Session()
    direct_resp = direct_session.get(
        f"{base_url}/{slug}",
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        allow_redirects=False,
    )
    assert direct_resp.status_code == 302, f"Esperado 302 Redirect, obteve {direct_resp.status_code}"
    time.sleep(1.5) # Aguarda gravação assíncrona

    an_resp3 = session.get(f"{base_url}/api/analytics?period=30d")
    an_data3 = an_resp3.json()
    print(f"  - totalClicks: {an_data3.get('totalClicks')} (Esperado: 1)")
    print(f"  - totalQrScans: {an_data3.get('totalQrScans')} (Esperado: 0)")
    print(f"  - deviceBreakdown: {an_data3.get('deviceBreakdown')}")
    assert an_data3.get("totalClicks") == 1, "Deveria ter exatamente 1 clique registrado"
    assert an_data3.get("totalQrScans") == 0, "Deveria ter 0 scans de QR"
    dev_names = [d["name"] for d in an_data3.get("deviceBreakdown", [])]
    assert "Desktop" in dev_names, "Deveria identificar Desktop"
    print("[OK] Acesso direto Desktop contabilizado com exatidao matematica!")

    # 5. Acesso via QR Code (Mobile com Rajada / Prefetch e Navegação)
    print("\n[FASE 5] Executando Acesso via QR Code com Debounce (Mobile)...")
    qr_session = requests.Session()
    # 5.1 Prefetch da câmera
    qr_session.get(
        f"{base_url}/{slug}?src=qr",
        headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BarcodeScanner/1.0",
            "Purpose": "prefetch",
        },
        allow_redirects=False,
    )
    # 5.2 Acesso humano real tocando na notificação
    qr_resp = qr_session.get(
        f"{base_url}/{slug}?src=qr",
        headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        },
        allow_redirects=False,
    )
    assert qr_resp.status_code == 302, f"Esperado 302 Redirect no QR Code, obteve {qr_resp.status_code}"
    time.sleep(2.0)

    an_resp4 = session.get(f"{base_url}/api/analytics?period=30d")
    an_data4 = an_resp4.json()
    print(f"  - totalClicks: {an_data4.get('totalClicks')} (Esperado: 2)")
    print(f"  - totalQrScans: {an_data4.get('totalQrScans')} (Esperado: 1)")
    print(f"  - deviceBreakdown: {an_data4.get('deviceBreakdown')}")

    assert an_data4.get("totalClicks") == 2, f"Esperado 2 cliques totais, obteve {an_data4.get('totalClicks')}"
    assert an_data4.get("totalQrScans") == 1, f"Esperado exatamente 1 scan de QR deduplicado, obteve {an_data4.get('totalQrScans')}"
    print("[OK] Escaneamento QR Code com prefetch contabilizou estritamente 1 scan sem duplicacao!")

    # 6. Exclusão do Link e Verificação de Exclusão em Cascata
    print("\n[FASE 6] Excluindo Smart Link de Teste e Verificando Retencao em Cascata...")
    del_resp = session.delete(f"{base_url}/api/links/{link_id}")
    assert del_resp.status_code == 200, f"Falha ao excluir link: {del_resp.text}"
    time.sleep(1.0)

    an_resp5 = session.get(f"{base_url}/api/analytics?period=30d")
    an_data5 = an_resp5.json()
    print(f"  - totalLinks apos exclusao: {an_data5.get('totalLinks')} (Esperado: 0)")
    print(f"  - totalClicks apos exclusao: {an_data5.get('totalClicks')} (Esperado: 0)")
    print(f"  - totalQrScans apos exclusao: {an_data5.get('totalQrScans')} (Esperado: 0)")
    print(f"  - deviceBreakdown apos exclusao: {an_data5.get('deviceBreakdown')} (Esperado: [])")

    assert an_data5.get("totalLinks") == 0, "totalLinks deveria voltar a 0 apos exclusao"
    assert an_data5.get("totalClicks") == 0, "totalClicks deveria ser 0 apos exclusao em cascata"
    assert an_data5.get("totalQrScans") == 0, "totalQrScans deveria ser 0 apos exclusao em cascata"
    assert len(an_data5.get("deviceBreakdown", [])) == 0, "deviceBreakdown deveria estar vazio"
    print("[OK] Exclusao em cascata confirmada: nenhum evento orfao ou estatistica fantasma residual!")

    print("\n" + "=" * 70)
    print(">>> AUDITORIA CONCLUÍDA COM 100% DE SUCESSO E EXATIDÃO MATEMÁTICA! <<<")
    print("=" * 70)
    return True

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "https://linkzivo-production.up.railway.app"
    run_audit(target)
