"""
Script determinístico para aplicar os componentes do System UI (OverviewView, LinksView, CreateLinkView)
ao arquivo src/app/dashboard/page.tsx sem alterar nenhuma regra de negócio ou API.
"""

import sys
from pathlib import Path

dashboard_file = Path("d:/dev/projetos/antigravity/linkzivo/src/app/dashboard/page.tsx")

if not dashboard_file.exists():
    print(f"Erro: Arquivo não encontrado: {dashboard_file}")
    sys.exit(1)

content = dashboard_file.read_text(encoding="utf-8")

# Identificar o início da aba 1 antiga e o início da aba 3 (Campanhas)
start_marker = "{/* =========================================================================\n            ABA 1: VISÃO GERAL CONSOLIDADA"
if start_marker not in content:
    # Tentar com quebra CRLF
    start_marker = "{/* =========================================================================\r\n            ABA 1: VISÃO GERAL CONSOLIDADA"

end_marker = "{/* =========================================================================\n            ABA 3: CAMPANHAS"
if end_marker not in content:
    end_marker = "{/* =========================================================================\r\n            ABA 3: CAMPANHAS"

if start_marker not in content or end_marker not in content:
    print("Erro: Marcadores de início ou fim não encontrados no arquivo.")
    print(f"start_marker in content: {start_marker in content}")
    print(f"end_marker in content: {end_marker in content}")
    sys.exit(1)

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

replacement_views = """{/* =========================================================================
            ABA 1: VISÃO GERAL (Design Aprovado: screen (2).png)
            ========================================================================= */}
        {activeTab === "overview" && (
          <OverviewView
            user={user}
            analytics={analytics}
            links={links}
            period={period}
            onPeriodChange={handlePeriodChange}
            onNavigateToLinks={() => handleTabChange("links")}
            onQuickShorten={handleQuickShorten}
            loading={loading || analyticsLoading}
          />
        )}

        {/* =========================================================================
            ABA 2: MEUS LINKS (Design Aprovado: screen (3).png)
            ========================================================================= */}
        {activeTab === "links" && (
          <LinksView
            links={links}
            onOpenCreate={() => handleTabChange("create")}
            onEditLink={(link) => {
              setEditingLink(link);
              setEditDestinationUrl(link.destinationUrl);
              setEditTitle(link.title || "");
              setEditCampaignId(link.campaign?.id || "");
              setEditProductId(link.product?.id || "");
              setEditOfferId(link.offer?.id || "");
            }}
            onOpenQrModal={(link) => handleOpenQr(link)}
            onOpenHistoryModal={(link) => handleOpenHistory(link)}
            onToggleStatus={(id) => {
              const targetLink = links.find((l) => l.id === id);
              if (targetLink) handleToggleLinkStatus(targetLink);
            }}
            onDeleteLink={(id) => handleDeleteLink(id)}
            onOpenAnalytics={() => handleTabChange("analytics")}
            loading={loading}
          />
        )}

        {/* =========================================================================
            ABA: CRIAR LINK & EDITOR DE QR CODE (Design Aprovado: screen.png)
            ========================================================================= */}
        {activeTab === "create" && (
          <CreateLinkView
            products={products}
            campaigns={campaigns}
            onCreateLink={handleUnifiedCreateLink}
            onCancel={() => handleTabChange("links")}
            loading={createLoading}
          />
        )}

        """

new_content = content[:start_idx] + replacement_views + content[end_idx:]

# Fechar main e div da área central antes dos modais
close_marker_old = "                </div>\n              )}\n            </div>\n          </div>\n        )}\n      </div>\n\n      {/* ========================================================================="
if close_marker_old not in new_content:
    close_marker_old = "                </div>\r\n              )}\r\n            </div>\r\n          </div>\r\n        )}\r\n      </div>\r\n\r\n      {/* ========================================================================="

close_marker_new = "                </div>\n              )}\n            </div>\n          </div>\n        )}\n        </main>\n      </div>\n\n      {/* ========================================================================="

if close_marker_old in new_content:
    new_content = new_content.replace(close_marker_old, close_marker_new, 1)
else:
    # Busca alternativa para fechamento
    target = "\n      </div>\n\n      {/* =========================================================================\n          MODAL: CRIAR SMART LINK"
    target_crlf = "\r\n      </div>\r\n\r\n      {/* =========================================================================\r\n          MODAL: CRIAR SMART LINK"
    if target in new_content:
        new_content = new_content.replace(target, "\n        </main>\n      </div>\n\n      {/* =========================================================================\n          MODAL: CRIAR SMART LINK", 1)
    elif target_crlf in new_content:
        new_content = new_content.replace(target_crlf, "\r\n        </main>\r\n      </div>\r\n\r\n      {/* =========================================================================\r\n          MODAL: CRIAR SMART LINK", 1)

dashboard_file.write_text(new_content, encoding="utf-8")
print("Sucesso: System UI aplicado a dashboard/page.tsx com fidelidade total!")
