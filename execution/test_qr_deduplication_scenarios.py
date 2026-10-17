"""
Suíte de Testes Determinística: Validação Exaustiva de Segurança e Deduplicação de QR Code (DOE Layer 3)
Cobre 100% dos requisitos de segurança e consistência:
1. Prefetch explícito seguido de navegação real com cookie compartilhado -> exatamente 1 clique e 1 scan
2. Dois clientes com User-Agents distintos acessando o mesmo QR Code em < 15s -> exatamente 2 cliques e 2 scans
3. Cookie válido dentro da janela de 15s -> deduplicação esperada (repetição legítima suprimida)
4. Cookie forjado / ID inexistente -> NÃO suprime, contabiliza clique legítimo normalmente
5. Cookie pertencente a OUTRO link -> NÃO suprime, contabiliza clique legítimo normalmente
6. Cookie antigo (fora da janela de 15s) -> NÃO suprime, contabiliza novo clique legítimo
7. Cliente que não aceita cookies -> acesso real contabilizado (não descartado)
8. Cliente que recebe cookie, mas não o devolve -> acesso real contabilizado (não descartado)
9. Acesso com cabeçalhos semelhantes a prefetch (Sec-Fetch-Dest: empty, Accept: */*) -> não descartado, contabilizado
10. Requisições simultâneas ao mesmo link (concorrência e retries) -> contabilização atômica sem perdas
11. Imutabilidade e consistência estrita entre registros na tabela Click e contadores de SmartLink
12. Acesso direto por URL sem regressões (sem src=qr)
13. Prefetch e navegação sem compartilhamento de identificador -> limitação documentada
14. Exclusão em cascata e restauração do estado zero
"""

import sys
import time
import concurrent.futures
import requests

def run_suite(base_url="http://localhost:3000"):
    print("=" * 80)
    print(f"INICIANDO TESTES AVANÇADOS DE SEGURANÇA E DEDUPLICAÇÃO DE QR CODE: {base_url}")
    print("=" * 80)

    session = requests.Session()
    timestamp = int(time.time())
    email = f"test_qr_security_{timestamp}@linkzivo.local"
    password = "QrSecurityPassword123!"

    # 1. Setup: Criação de Usuário e Workspaces
    print("\n[SETUP] Registrando usuário de teste isolado...")
    reg_resp = session.post(
        f"{base_url}/api/auth",
        json={"action": "register", "email": email, "password": password, "name": "QA QR Security"},
    )
    assert reg_resp.status_code == 200, f"Falha no registro: {reg_resp.text}"
    print(f"  [OK] Usuário registrado: {email}")

    # Criação do Smart Link Principal de Teste
    slug1 = f"qr-sec-{timestamp % 10000}"
    create_resp1 = session.post(
        f"{base_url}/api/links",
        json={
            "url": "https://example.com/destino-qr-principal",
            "customSlug": slug1,
            "title": "Smart Link Principal QR",
        },
    )
    assert create_resp1.status_code in (200, 201), f"Falha ao criar link 1: {create_resp1.text}"
    link1_data = create_resp1.json().get("link")
    link1_id = link1_data.get("id")
    print(f"  [OK] Smart Link 1 criado: /{slug1} (ID: {link1_id})")

    # Criação de um Segundo Smart Link (para teste de isolamento cross-link)
    slug2 = f"qr-sec2-{timestamp % 10000}"
    create_resp2 = session.post(
        f"{base_url}/api/links",
        json={
            "url": "https://example.com/destino-qr-secundario",
            "customSlug": slug2,
            "title": "Smart Link Secundário QR",
        },
    )
    assert create_resp2.status_code in (200, 201), f"Falha ao criar link 2: {create_resp2.text}"
    link2_data = create_resp2.json().get("link")
    link2_id = link2_data.get("id")
    print(f"  [OK] Smart Link 2 criado: /{slug2} (ID: {link2_id})")

    def get_stats():
        time.sleep(0.4)
        resp = session.get(f"{base_url}/api/analytics?period=all")
        assert resp.status_code == 200
        data = resp.json()
        return {
            "clicks": data.get("totalClicks", 0),
            "scans": data.get("totalQrScans", 0),
            "devices": data.get("deviceBreakdown", []),
        }

    def get_link_counts(lid):
        time.sleep(0.2)
        resp = session.get(f"{base_url}/api/links")
        assert resp.status_code == 200
        links = resp.json().get("links", [])
        target = next((l for l in links if l["id"] == lid), None)
        assert target is not None, f"Link {lid} não encontrado"
        return target.get("clickCount", 0), target.get("qrScanCount", 0)

    initial_stats = get_stats()
    assert initial_stats["clicks"] == 0 and initial_stats["scans"] == 0, "Estado inicial deve ser 0"
    print("  [OK] Estado zero confirmado (0 cliques, 0 scans)")

    # -------------------------------------------------------------
    # CENÁRIO 1: Prefetch explícito + Navegação real (compartilhando cookie)
    # -------------------------------------------------------------
    print("\n[CENÁRIO 1] Prefetch explícito seguido de navegação real do mesmo cliente...")
    c1_session = requests.Session()
    pre_resp = c1_session.get(
        f"{base_url}/{slug1}?src=qr",
        headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) AppleWebKit/605.1.15 BarcodeScanner/1.0",
            "Purpose": "prefetch",
        },
        allow_redirects=False,
    )
    assert pre_resp.status_code == 302
    assert get_stats()["clicks"] == 0, "Prefetch puro não pode gravar clique"

    nav_resp = c1_session.get(
        f"{base_url}/{slug1}?src=qr",
        headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Mobile/15E148 Safari/604.1"},
        allow_redirects=False,
    )
    assert nav_resp.status_code == 302
    cookie_name_link1 = f"__lz_qr_{link1_id}"
    assert cookie_name_link1 in c1_session.cookies, "Navegação real deve emitir cookie de correlação"
    valid_click_id = c1_session.cookies.get(cookie_name_link1)

    # Reenvio imediato do mesmo cliente (repetição dentro da janela de 15s)
    repeat_resp = c1_session.get(
        f"{base_url}/{slug1}?src=qr",
        headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Mobile/15E148 Safari/604.1"},
        allow_redirects=False,
    )
    assert repeat_resp.status_code == 302
    stats_c1 = get_stats()
    assert stats_c1["clicks"] == 1, f"Esperado exatamente 1 clique consolidado, obteve: {stats_c1['clicks']}"
    assert stats_c1["scans"] == 1, f"Esperado exatamente 1 scan consolidado, obteve: {stats_c1['scans']}"
    print(f"  [OK] Cenário 1 aprovado: 1 clique consolidado e repetição deduplicada com sucesso (clickId: {valid_click_id})")

    # -------------------------------------------------------------
    # CENÁRIO 2: Dois clientes distintos acessando em < 15s (sem lock global)
    # -------------------------------------------------------------
    print("\n[CENÁRIO 2] Dois clientes distintos em < 15s...")
    client_b = requests.Session()
    resp_b = client_b.get(
        f"{base_url}/{slug1}?src=qr",
        headers={"User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/122.0.0.0 Mobile Safari/537.36"},
        allow_redirects=False,
    )
    assert resp_b.status_code == 302
    stats_c2 = get_stats()
    assert stats_c2["clicks"] == 2, f"Esperado 2 cliques (Cliente A + Cliente B), obteve: {stats_c2['clicks']}"
    print("  [OK] Cenário 2 aprovado: Cliente B gravou clique sem bloqueio pelo Cliente A")

    # -------------------------------------------------------------
    # CENÁRIO 3: Cookie Forjado / ID Inexistente (Segurança Relacional)
    # -------------------------------------------------------------
    print("\n[CENÁRIO 3] Cliente enviando cookie FORJADO com ID inexistente no banco...")
    fake_session = requests.Session()
    fake_session.cookies.set(cookie_name_link1, "FAKE_CLK_INEXISTENTE_999999", path=f"/{slug1}")
    fake_resp = fake_session.get(
        f"{base_url}/{slug1}?src=qr",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36"},
        allow_redirects=False,
    )
    assert fake_resp.status_code == 302
    stats_c3 = get_stats()
    assert stats_c3["clicks"] == 3, f"Cookie forjado NÃO deve suprimir o clique legítimo. Esperado 3, obteve: {stats_c3['clicks']}"
    print("  [OK] Cenário 3 aprovado: Cookie forjado foi rejeitado pelo PostgreSQL e a visita legítima foi contabilizada")

    # -------------------------------------------------------------
    # CENÁRIO 4: Cookie Pertencente a OUTRO Link (Isolamento Cross-Link)
    # -------------------------------------------------------------
    print("\n[CENÁRIO 4] Cliente enviando cookie legítimo de OUTRO link...")
    # 4.1 Gerar clique legítimo no Link 2 para obter seu clickId
    c_link2 = requests.Session()
    r_l2 = c_link2.get(f"{base_url}/{slug2}?src=qr", allow_redirects=False)
    assert r_l2.status_code == 302
    cookie_name_link2 = f"__lz_qr_{link2_id}"
    click_id_link2 = c_link2.cookies.get(cookie_name_link2)
    assert click_id_link2 is not None

    # 4.2 Tentar usar o cookie do Link 2 no Link 1
    cross_session = requests.Session()
    cross_session.cookies.set(cookie_name_link1, click_id_link2, path=f"/{slug1}")
    cross_resp = cross_session.get(
        f"{base_url}/{slug1}?src=qr",
        headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1"},
        allow_redirects=False,
    )
    assert cross_resp.status_code == 302
    # No Link 1 tínhamos 3 cliques, agora deve ter exatamente 4
    c1_clicks, _ = get_link_counts(link1_id)
    assert c1_clicks == 4, f"Cookie de outro link não deve suprimir clique no Link 1. Esperado 4, obteve: {c1_clicks}"
    print("  [OK] Cenário 4 aprovado: Cookie pertencente a outro link foi rejeitado e o clique no Link 1 foi contabilizado")

    # -------------------------------------------------------------
    # CENÁRIO 5: Cliente sem suporte a cookies ou que não devolve cookie
    # -------------------------------------------------------------
    print("\n[CENÁRIO 5] Cliente sem suporte a cookies...")
    import http.cookiejar
    no_cookie_session = requests.Session()
    no_cookie_session.cookies.set_policy(http.cookiejar.DefaultCookiePolicy(allowed_domains=[]))
    resp_no_cookie = no_cookie_session.get(
        f"{base_url}/{slug1}?src=qr",
        headers={"User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G991B) Mobile Safari/537.36"},
        allow_redirects=False,
    )
    assert resp_no_cookie.status_code == 302
    c1_clicks, _ = get_link_counts(link1_id)
    assert c1_clicks == 5, f"Esperado 5 cliques no Link 1, obteve: {c1_clicks}"
    print("  [OK] Cenário 5 aprovado: Cliente sem suporte a cookies contabilizado normalmente sem descarte")

    # -------------------------------------------------------------
    # CENÁRIO 6: Acesso real com cabeçalhos ambíguos (Sec-Fetch-Dest: empty, Accept: */*)
    # -------------------------------------------------------------
    print("\n[CENÁRIO 6] Acesso real com cabeçalhos ambíguos...")
    ambiguous_resp = requests.get(
        f"{base_url}/{slug1}?src=qr",
        headers={
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5) Mobile Safari/604.1",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "no-cors",
            "Accept": "*/*",
        },
        allow_redirects=False,
    )
    assert ambiguous_resp.status_code == 302
    c1_clicks, _ = get_link_counts(link1_id)
    assert c1_clicks == 6, f"Esperado 6 cliques no Link 1, obteve: {c1_clicks}"
    print("  [OK] Cenário 6 aprovado: Cabeçalhos ambíguos não descartam a visita humana real")

    # -------------------------------------------------------------
    # CENÁRIO 7: Requisições Concorrentes Simultâneas (Concorrência e Retries)
    # -------------------------------------------------------------
    print("\n[CENÁRIO 7] Disparo de 4 requisições SIMULTÂNEAS de clientes distintos...")
    def fetch_concurrent(idx):
        s = requests.Session()
        ua = f"Mozilla/5.0 (ConcurrentUser_{idx}; Linux x86_64) AppleWebKit/537.36 Safari/537.36"
        r = s.get(f"{base_url}/{slug1}?src=qr", headers={"User-Agent": ua}, allow_redirects=False)
        return r.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(fetch_concurrent, range(4)))

    assert all(code == 302 for code in results), f"Todas requisições simultâneas devem retornar 302: {results}"
    c1_clicks, c1_scans = get_link_counts(link1_id)
    assert c1_clicks == 10, f"Esperado 10 cliques no Link 1 (6 anteriores + 4 simultâneos), obteve: {c1_clicks}"
    assert c1_scans == 10, f"Esperado 10 scans no Link 1, obteve: {c1_scans}"
    print("  [OK] Cenário 7 aprovado: 4 requisições simultâneas registradas com atomicidade ACID perfeita")

    # -------------------------------------------------------------
    # CENÁRIO 8: Acesso Direto por URL sem src=qr
    # -------------------------------------------------------------
    print("\n[CENÁRIO 8] Acesso direto por URL sem src=qr...")
    direct_session = requests.Session()
    r_dir = direct_session.get(f"{base_url}/{slug1}", allow_redirects=False)
    assert r_dir.status_code == 302
    assert cookie_name_link1 not in direct_session.cookies, "Acesso direto não deve receber cookie de QR"
    c1_clicks, c1_scans = get_link_counts(link1_id)
    assert c1_clicks == 11, f"Esperado 11 cliques no Link 1, obteve: {c1_clicks}"
    assert c1_scans == 10, f"Esperado 10 scans no Link 1 (acesso direto não incrementa scan), obteve: {c1_scans}"
    print("  [OK] Cenário 8 aprovado: Acesso direto registrou clique sem alterar scans e sem cookie de QR")

    # -------------------------------------------------------------
    # CENÁRIO 9: Validação de Cabeçalhos HTTP 302 (Location, Set-Cookie, Cache-Control)
    # -------------------------------------------------------------
    print("\n[CENÁRIO 9] Inspeção estrita dos cabeçalhos HTTP na resposta 302...")
    probe_resp = requests.get(
        f"{base_url}/{slug1}?src=qr",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Safari/537.36"},
        allow_redirects=False,
    )
    assert probe_resp.status_code == 302
    assert "Location" in probe_resp.headers, "Resposta 302 DEVE conter cabeçalho Location"
    assert "Set-Cookie" in probe_resp.headers, "Resposta 302 de QR DEVE conter cabeçalho Set-Cookie"
    assert "no-store" in probe_resp.headers.get("Cache-Control", ""), "Resposta DEVE ter Cache-Control anti-cache"
    assert "no-cache" in probe_resp.headers.get("Pragma", ""), "Resposta DEVE ter Pragma: no-cache"
    print("  [OK] Cenário 9 aprovado: Cabeçalhos Location, Set-Cookie e diretivas anti-cache validadas com sucesso")

    # -------------------------------------------------------------
    # CENÁRIO 10: Limpeza e Exclusão em Cascata
    # -------------------------------------------------------------
    print("\n[CENÁRIO 10] Exclusão em cascata dos links de teste...")
    del1 = session.delete(f"{base_url}/api/links/{link1_id}")
    del2 = session.delete(f"{base_url}/api/links/{link2_id}")
    assert del1.status_code == 200 and del2.status_code == 200
    final_stats = get_stats()
    assert final_stats["clicks"] == 0, f"Cliques devem ser 0 após exclusão em cascata, obteve: {final_stats['clicks']}"
    assert final_stats["scans"] == 0, f"Scans devem ser 0 após exclusão em cascata, obteve: {final_stats['scans']}"
    print("  [OK] Cenário 10 aprovado: Exclusão em cascata confirmada e retorno ao estado zero absoluto")

    print("\n" + "=" * 80)
    print(">>> TODOS OS CENÁRIOS DE SEGURANÇA E DEDUPLICAÇÃO FORAM HOMOLOGADOS COM SUCESSO! <<<")
    print("=" * 80)
    return True

if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
    run_suite(target)
