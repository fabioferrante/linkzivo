import os

devlog_path = r"d:\dev\projetos\devlog.md"
with open(devlog_path, "r", encoding="utf-8", errors="surrogateescape") as f:
    text = f.read()

target = "commit `fdfd831` enviado com sucesso para `main`."
addition = """
    7.  **Deploy em Produção e Verificação no Railway:**
        *   Diagnóstico de Esteira: Constatado que o botão 'Redeploy' do Railway re-executa a imagem do build anterior e que o repositório não possuía o GitHub App do Railway instalado para auto-deploy em push.
        *   Disparo e Rollout: Deployment `bbf6f374-ade2-49cc-bde2-c1efd7fc6391` acionado e compilado com sucesso para o commit `fdfd831`.
        *   Execução da Esteira: Build compilado pelo Railpack (Next.js 16 App Router + Turbopack), migrações verificadas via `npx prisma db push` em 0ms (schema idêntico) e container iniciado com sucesso.
        *   Validação E2E em Produção: Executada a bateria completa de 15 testes de integração e ciclo de vida (`execution/verify_lifecycle_and_integrations.py`) e os 3 testes de UI e deep linking (`execution/verify_ui_enhancements.py`) contra `https://linkzivo-production.up.railway.app`, ambos aprovados com 100% de sucesso."""

if target in text:
    text = text.replace(target, target + addition, 1)
    with open(devlog_path, "w", encoding="utf-8", errors="surrogateescape") as f:
        f.write(text)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
