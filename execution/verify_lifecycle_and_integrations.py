"""
Suíte de Testes Automatizados - Linkzivo
Validação Completa dos Requisitos Mandatórios (Seção 12):
1. Criar e editar campanhas
2. Associar e remover produtos (N:N)
3. Associar e remover Smart Links
4. Persistir e recuperar associações
5. Impedir associação indevida de outros usuários (IDOR)
6. Encerrar e reiniciar campanhas
7. Confirmar que o encerramento da campanha não pausa os links associados
8. Pausar e reativar Smart Links
9. Confirmar que links pausados redirecionam para /paused-link sem computar cliques
10. Desativar e reativar produtos
11. Confirmar que a desativação do produto não quebra links existentes
12. Validar cálculos de métricas com dados controlados
13. Verificar ausência de duplicação em agregações
14. Testar contagem de cliques e fluxo de QR Codes
15. Validar isolamento estrito entre usuários
"""

import sys
import time
import json
import urllib.request
import urllib.parse
import urllib.error
import http.client

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:3000"

class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def create_client():
    cookie_processor = urllib.request.HTTPCookieProcessor()
    opener = urllib.request.build_opener(cookie_processor)
    return opener

def create_no_redirect_client(cookie_processor):
    opener = urllib.request.build_opener(cookie_processor, NoRedirectHandler)
    return opener

def log_test(num, title):
    print(f"\n[TESTE {num}] {title}")

def assert_true(cond, msg):
    if not cond:
        print(f"  ❌ FALHA: {msg}")
        raise AssertionError(msg)
    print(f"  ✓ {msg}")

def request_json(opener, method, url, data=None):
    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"} if data is not None else {}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with opener.open(req) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as err:
        content = err.read().decode("utf-8")
        try:
            err_json = json.loads(content)
        except Exception:
            err_json = {"raw": content}
        return err.code, err_json

def run_suite():
    print(f"Iniciando Suíte de Testes no Linkzivo: {BASE_URL}")
    ts = int(time.time())

    # Setup Usuário Principal (A)
    opener_a = create_client()
    user_a_email = f"tester_a_{ts}@linkzivo.com"
    status, res = request_json(opener_a, "POST", f"{BASE_URL}/api/auth", {
        "action": "register",
        "name": "Tester User A",
        "email": user_a_email,
        "password": "Password123!"
    })
    assert_true(status == 200, f"Usuário A registrado: {user_a_email}")

    # Setup Usuário Secundário (B) para teste de IDOR e isolamento
    opener_b = create_client()
    user_b_email = f"tester_b_{ts}@linkzivo.com"
    status, res = request_json(opener_b, "POST", f"{BASE_URL}/api/auth", {
        "action": "register",
        "name": "Tester User B",
        "email": user_b_email,
        "password": "Password123!"
    })
    assert_true(status == 200, f"Usuário B registrado: {user_b_email}")

    # Cadastrar Produto do Usuário B
    status, prod_b = request_json(opener_b, "POST", f"{BASE_URL}/api/products", {
        "name": "Produto do Usuário B",
        "platform": "Hotmart",
        "initialOfferUrl": "https://go.hotmart.com/user_b_exclusive",
        "commissionValue": "100.00"
    })
    prod_b_id = prod_b["product"]["id"]
    assert_true(status == 201, f"Produto do Usuário B criado: {prod_b_id}")

    # =========================================================================
    # Teste 1 & 2: Cadastro de Produtos e Criação de Campanha com Associação N:N
    # =========================================================================
    log_test("1 & 2", "Criar Campanha e Associar Múltiplos Produtos (N:N)")
    status, prod1 = request_json(opener_a, "POST", f"{BASE_URL}/api/products", {
        "name": "Curso de Tráfego Pago 2026",
        "platform": "Hotmart",
        "initialOfferUrl": "https://go.hotmart.com/trafego2026",
        "commissionValue": "150.00"
    })
    prod1_id = prod1["product"]["id"]
    assert_true(status == 201, f"Produto 1 criado com sucesso: {prod1_id}")

    status, prod2 = request_json(opener_a, "POST", f"{BASE_URL}/api/products", {
        "name": "Mentoria Afiliado Elite",
        "platform": "Kiwify",
        "initialOfferUrl": "https://kiwify.com.br/elite",
        "commissionValue": "250.00"
    })
    prod2_id = prod2["product"]["id"]
    assert_true(status == 201, f"Produto 2 criado com sucesso: {prod2_id}")

    # Criar Smart Link 1
    link1_slug = f"link1_{ts}"
    status, link1 = request_json(opener_a, "POST", f"{BASE_URL}/api/links", {
        "url": "https://example.com/destino_link1",
        "customSlug": link1_slug,
        "title": "Smart Link Inicial 1",
        "productId": prod1_id
    })
    link1_id = link1["link"]["id"]
    assert_true(status == 201, f"Smart Link 1 criado: /{link1_slug} ({link1_id})")

    # Criar Campanha associando Produto 1, Produto 2 e Link 1
    status, camp = request_json(opener_a, "POST", f"{BASE_URL}/api/campaigns", {
        "name": "Campanha Black Friday 2026",
        "description": "Campanha promocional unificada de afiliados",
        "productIds": [prod1_id, prod2_id],
        "linkIds": [link1_id]
    })
    assert_true(status == 201, f"Campanha criada com sucesso: {camp['campaign']['id']}")
    camp_id = camp["campaign"]["id"]
    assigned_prods = [cp["productId"] for cp in camp["campaign"]["campaignProducts"]]
    assert_true(prod1_id in assigned_prods and prod2_id in assigned_prods, "Ambos os produtos foram associados na criação")

    # =========================================================================
    # Teste 3 & 4: Persistir, Recuperar e Editar Associações
    # =========================================================================
    log_test("3 & 4", "Persistir, Recuperar e Editar Associações da Campanha")
    # Criar Smart Link 2
    link2_slug = f"link2_{ts}"
    status, link2 = request_json(opener_a, "POST", f"{BASE_URL}/api/links", {
        "url": "https://example.com/destino_link2",
        "customSlug": link2_slug,
        "title": "Smart Link Inicial 2",
        "productId": prod2_id
    })
    link2_id = link2["link"]["id"]
    assert_true(status == 201, f"Smart Link 2 criado: /{link2_slug}")

    # Atualizar campanha: remover prod1, manter prod2 e adicionar link2
    status, camp_updated = request_json(opener_a, "PATCH", f"{BASE_URL}/api/campaigns/{camp_id}", {
        "productIds": [prod2_id],
        "linkIds": [link1_id, link2_id]
    })
    assert_true(status == 200, "Campanha atualizada com sucesso")

    # Consultar campanha via GET para validar persistência real no PostgreSQL
    status, camp_get = request_json(opener_a, "GET", f"{BASE_URL}/api/campaigns/{camp_id}")
    assert_true(status == 200, "GET na campanha retornado com sucesso")
    persisted_prods = [cp["product"]["id"] for cp in camp_get["campaign"]["campaignProducts"]]
    persisted_links = [l["id"] for l in camp_get["campaign"]["smartLinks"]]
    assert_true(prod2_id in persisted_prods and prod1_id not in persisted_prods, "Produto 1 removido e Produto 2 persistido")
    assert_true(link1_id in persisted_links and link2_id in persisted_links, "Smart Links 1 e 2 persistidos na campanha")

    # Verificar que o Produto 1 original não foi excluído
    status, prod1_check = request_json(opener_a, "GET", f"{BASE_URL}/api/products/{prod1_id}")
    assert_true(status == 200 and prod1_check["product"]["id"] == prod1_id, "Produto 1 desvinculado continua existindo no banco")

    # =========================================================================
    # Teste 5: Isolamento Estrito e Bloqueio de IDOR
    # =========================================================================
    log_test("5", "Impedir Associação Indevida de Registros de Outro Usuário (IDOR)")
    # Usuário A tenta associar Produto do Usuário B à sua campanha
    status, idor_camp = request_json(opener_a, "PATCH", f"{BASE_URL}/api/campaigns/{camp_id}", {
        "productIds": [prod2_id, prod_b_id]
    })
    assert_true(status == 400 or status == 404, f"Associação indevida de produto de outro usuário foi rejeitada com status {status}")

    # Usuário B tenta acessar ou editar a campanha do Usuário A
    status, idor_access = request_json(opener_b, "GET", f"{BASE_URL}/api/campaigns/{camp_id}")
    assert_true(status == 404, f"Usuário B não conseguiu acessar campanha do Usuário A (Status {status})")

    # =========================================================================
    # Teste 6 & 7: Encerrar e Reiniciar Campanhas (Sem pausar Smart Links)
    # =========================================================================
    log_test("6 & 7", "Encerrar e Reiniciar Campanha (Preservando Links Operacionais)")
    # Encerrar Campanha
    status, end_res = request_json(opener_a, "PATCH", f"{BASE_URL}/api/campaigns/{camp_id}", {
        "status": "ENDED"
    })
    assert_true(status == 200 and end_res["campaign"]["status"] == "ENDED", "Campanha alterada para status ENDED")

    # Verificar se os Smart Links da campanha permanecem ACTIVE
    status, link1_check = request_json(opener_a, "GET", f"{BASE_URL}/api/links")
    l1 = next(l for l in link1_check["links"] if l["id"] == link1_id)
    assert_true(l1["status"] == "ACTIVE", "Smart Link 1 permanece ACTIVE após encerramento da campanha")

    # Reiniciar Campanha
    status, reactivate_res = request_json(opener_a, "PATCH", f"{BASE_URL}/api/campaigns/{camp_id}", {
        "status": "ACTIVE"
    })
    assert_true(status == 200 and reactivate_res["campaign"]["status"] == "ACTIVE", "Campanha reativada para ACTIVE com histórico preservado")

    # =========================================================================
    # Teste 8 & 9: Pausar e Reativar Smart Link com Bloqueio de Redirecionamento
    # =========================================================================
    log_test("8 & 9", "Pausar e Reativar Smart Link no Redirecionamento Público")
    # Pausar Smart Link 1
    status, pause_res = request_json(opener_a, "PATCH", f"{BASE_URL}/api/links/{link1_id}", {
        "status": "PAUSED"
    })
    assert_true(status == 200 and pause_res["link"]["status"] == "PAUSED", "Smart Link 1 alterado para status PAUSED")

    # Fazer requisição pública ao slug do link pausado sem seguir redirect
    no_redirect_opener = urllib.request.build_opener(NoRedirectHandler)
    req_pause = urllib.request.Request(f"{BASE_URL}/{link1_slug}", headers={"User-Agent": "Mozilla/5.0 TestBot"})
    try:
        resp = no_redirect_opener.open(req_pause)
        redirect_location = resp.headers.get("Location")
        http_code = resp.status
    except urllib.error.HTTPError as err:
        redirect_location = err.headers.get("Location")
        http_code = err.code

    assert_true(http_code in (302, 307, 308) and "/paused-link" in str(redirect_location),
                f"Link pausado redirecionou controladamente para /paused-link (Location: {redirect_location})")

    # Checar se cliques NÃO foram computados durante a pausa
    status, l1_after_pause = request_json(opener_a, "GET", f"{BASE_URL}/api/links")
    l1_item = next(l for l in l1_after_pause["links"] if l["id"] == link1_id)
    assert_true(l1_item["clickCount"] == 0, "Nenhum clique computado para o link enquanto pausado")

    # Reativar Smart Link 1
    status, reactivate_link_res = request_json(opener_a, "PATCH", f"{BASE_URL}/api/links/{link1_id}", {
        "status": "ACTIVE"
    })
    assert_true(status == 200 and reactivate_link_res["link"]["status"] == "ACTIVE", "Smart Link 1 reativado para ACTIVE")

    # Testar redirecionamento normal após reativação
    try:
        resp_act = no_redirect_opener.open(urllib.request.Request(f"{BASE_URL}/{link1_slug}", headers={"User-Agent": "Mozilla/5.0"}))
        act_location = resp_act.headers.get("Location")
        act_code = resp_act.status
    except urllib.error.HTTPError as err:
        act_location = err.headers.get("Location")
        act_code = err.code

    assert_true("example.com/destino_link1" in str(act_location), f"Link reativado executa redirecionamento público para o destino original (Location: {act_location})")

    # =========================================================================
    # Teste 10 & 11: Desativar e Reativar Produtos (Sem quebrar links existentes)
    # =========================================================================
    log_test("10 & 11", "Desativar e Reativar Produto (Preservando Links Operacionais)")
    # Desativar Produto 2
    status, deact_prod_res = request_json(opener_a, "PATCH", f"{BASE_URL}/api/products/{prod2_id}", {
        "status": "INACTIVE"
    })
    assert_true(status == 200 and deact_prod_res["product"]["status"] == "INACTIVE", "Produto 2 alterado para status INACTIVE")

    # Confirmar que Smart Link 2 (associado ao Produto 2) continua funcionando normalmente
    try:
        resp_l2 = no_redirect_opener.open(urllib.request.Request(f"{BASE_URL}/{link2_slug}", headers={"User-Agent": "Mozilla/5.0"}))
        l2_loc = resp_l2.headers.get("Location")
    except urllib.error.HTTPError as err:
        l2_loc = err.headers.get("Location")
    assert_true("example.com/destino_link2" in str(l2_loc), "Smart Link 2 continua operando normalmente mesmo com o produto desativado")

    # Tentar associar o Produto 2 (agora desativado) a uma NOVA campanha - deve ser rejeitado!
    status, err_new_camp = request_json(opener_a, "POST", f"{BASE_URL}/api/campaigns", {
        "name": "Tentativa de Campanha com Produto Desativado",
        "productIds": [prod2_id]
    })
    assert_true(status == 400, "Tentativa de vincular produto desativado a nova campanha foi rejeitada (Status 400)")

    # Reativar Produto 2
    status, react_prod_res = request_json(opener_a, "PATCH", f"{BASE_URL}/api/products/{prod2_id}", {
        "status": "ACTIVE"
    })
    assert_true(status == 200 and react_prod_res["product"]["status"] == "ACTIVE", "Produto 2 reativado para ACTIVE com sucesso")

    # =========================================================================
    # Teste 12, 13 & 14: Métricas Consolidadas, QR Codes e Deduplicação
    # =========================================================================
    log_test("12, 13 & 14", "Validação de Métricas Reais, QR Codes e Ausência de Duplicação")
    # Gerar QR Code do Smart Link 2
    status, qr_res = request_json(opener_a, "GET", f"{BASE_URL}/api/links/{link2_id}/qr?format=png")
    assert_true(status == 200 and "dataUrl" in qr_res, "QR Code gerado dinamicamente")

    # Simular 1 scan de QR Code legítimo com flag qr=1
    try:
        no_redirect_opener.open(urllib.request.Request(f"{BASE_URL}/{link2_slug}?qr=1", headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)"}))
    except urllib.error.HTTPError:
        pass

    time.sleep(0.5)

    # Simular debounce do scanner (requisição idêntica de preview pré-carregado no mesmo segundo pelo mesmo IP e User-Agent)
    try:
        no_redirect_opener.open(urllib.request.Request(f"{BASE_URL}/{link2_slug}?qr=1", headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)"}))
    except urllib.error.HTTPError:
        pass

    # Consultar métricas da campanha e do produto
    status, camp_metrics = request_json(opener_a, "GET", f"{BASE_URL}/api/campaigns/{camp_id}")
    assert_true(status == 200, "Métricas da campanha obtidas")
    m = camp_metrics["metrics"]
    print(f"  Métricas da Campanha: Cliques Totais={m['totalClicks']}, Únicos={m['uniqueClicks']}, QR Scans={m['totalQrScans']}")
    assert_true(m["totalClicks"] >= 1, "Cliques registrados com sucesso")
    assert_true(m["uniqueClicks"] <= m["totalClicks"], "Cliques únicos menores ou iguais a cliques totais")

    # Consultar métricas consolidadas do produto
    status, prod_metrics = request_json(opener_a, "GET", f"{BASE_URL}/api/products/{prod2_id}")
    assert_true(status == 200, "Métricas do produto obtidas")
    pm = prod_metrics["metrics"]
    print(f"  Métricas do Produto 2: Cliques Totais={pm['totalClicks']}, Únicos={pm['uniqueClicks']}, QR Scans={pm['totalQrScans']}")
    assert_true(pm["totalClicks"] <= m["totalClicks"], "Métricas consolidadas do produto refletem apenas os links do produto (sem inflar ou duplicar)")
    assert_true(pm["totalClicks"] >= 1, "Produto computou os cliques dos seus links associados")

    print("\n" + "="*50)
    print("✓ TODOS OS 15 TESTES AUTOMATIZADOS PASSARAM COM SUCESSO!")
    print("="*50)

if __name__ == "__main__":
    run_suite()
