/**
 * LINKZIVO — SUÍTE DETERMINÍSTICA DE VALIDAÇÃO DE URLs
 * Testa a robustez de validateAndSanitizeUrl em src/lib/security.ts
 */

const { validateAndSanitizeUrl } = require("../src/lib/security");

const testCases = [
  // 1. Domínios válidos incluindo subdomínios
  { name: "Domínio padrão HTTPS", url: "https://example.com", expected: true },
  { name: "Subdomínio com path, query e fragment", url: "https://sub.dominio.com.br/path?q=1#hash", expected: true },
  { name: "Domínio HTTP padrão", url: "http://app.link.co/xyz", expected: true },
  { name: "Domínio sem protocolo explícito (normalização para HTTPS)", url: "loja.parceiro.com.br/promo", expected: true },
  { name: "Múltiplos níveis de subdomínio", url: "https://a.b.c.example.com", expected: true },

  // 2. Domínios com caracteres inválidos ou labels malformados
  { name: "Espaço no meio do hostname", url: "https://in valid.com", expected: false },
  { name: "Label iniciando com hífen", url: "https://-startdash.com", expected: false },
  { name: "Label terminando com hífen", url: "https://enddash-.com", expected: false },
  { name: "Dois pontos consecutivos no hostname", url: "https://bad..domain.com", expected: false },
  { name: "Caracteres especiais inválidos no domínio", url: "https://bad!domain.com", expected: false },

  // 3. Hostnames terminados em ponto ou iniciados em ponto
  { name: "Hostname terminado em ponto", url: "https://example.com.", expected: false },
  { name: "Hostname iniciado em ponto", url: "https://.example.com", expected: false },

  // 4. Endereços IP IPv4 e IPv6
  { name: "IPv4 público legítimo", url: "http://93.184.216.34/pagina", expected: true },
  { name: "IPv4 Loopback (127.0.0.1) bloqueado por SSRF", url: "http://127.0.0.1", expected: false },
  { name: "IPv4 RFC1918 Class C (192.168.x.x) bloqueado por SSRF", url: "http://192.168.1.10", expected: false },
  { name: "IPv4 RFC1918 Class A (10.x.x.x) bloqueado por SSRF", url: "http://10.0.0.1", expected: false },
  { name: "IPv4 RFC1918 Class B (172.16-31.x.x) bloqueado por SSRF", url: "http://172.20.0.1", expected: false },
  { name: "IPv4 Cloud metadata (169.254.169.254) bloqueado por SSRF", url: "http://169.254.169.254", expected: false },
  { name: "IPv4 Octeto inválido (> 255)", url: "http://999.184.216.34", expected: false },
  { name: "IPv6 Loopback ([::1]) bloqueado por SSRF", url: "http://[::1]", expected: false },
  { name: "IPv6 Público legítimo", url: "http://[2606:4700:4700::1111]", expected: true },

  // 5. URLs com usuário e senha embutidos (Phishing / Spoofing)
  { name: "URL com user e password embutidos", url: "http://user:pass@example.com/checkout", expected: false },
  { name: "URL com username embutido", url: "https://admin@example.com", expected: false },

  // 6. Protocolos diferentes de HTTP e HTTPS
  { name: "Protocolo FTP rejeitado", url: "ftp://example.com/file", expected: false },
  { name: "Protocolo SSH rejeitado", url: "ssh://server.com", expected: false },
  { name: "Protocolo Mailto rejeitado", url: "mailto:contato@example.com", expected: false },
  { name: "Protocolo Javascript rejeitado", url: "javascript:alert(1)", expected: false },
  { name: "Protocolo Data URI rejeitado", url: "data:text/html,<b>xss</b>", expected: false },
  { name: "Protocolo File rejeitado", url: "file:///etc/passwd", expected: false },

  // 7. URLs vazias, malformadas e com espaços
  { name: "URL vazia", url: "", expected: false },
  { name: "URL apenas com espaços", url: "     ", expected: false },
  { name: "Palavra simples sem domínio ou TLD", url: "not-a-valid-url", expected: false },
  { name: "Apenas protocolo sem host", url: "https://", expected: false },

  // 8. Domínios internacionalizados (IDN / Punycode)
  { name: "Domínio com trema (IDN)", url: "https://münchen.de", expected: true },
  { name: "Domínio Punycode nativo", url: "https://xn--mnchen-3ya.de", expected: true },
  { name: "Domínio com acento em português (IDN)", url: "café.com.br", expected: true },
];

console.log("================================================================================");
console.log("   LINKZIVO — SUÍTE DETERMINÍSTICA DE VALIDAÇÃO DE URLs (33 CENÁRIOS)");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = validateAndSanitizeUrl(tc.url);
  const ok = result.isValid === tc.expected;
  if (ok) {
    passed++;
    console.log(`  [PASS] ${tc.name} (${tc.url}) -> isValid=${result.isValid}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${tc.name} (${tc.url}) -> Esperado: ${tc.expected}, Obtido: ${result.isValid}, Erro: ${result.error}`);
  }
}

console.log("\n================================================================================");
console.log(`   TOTAL DE TESTES: ${testCases.length}`);
console.log(`   APROVADOS:       ${passed}`);
console.log(`   FALHAS:          ${failed}`);
console.log("================================================================================\n");

if (failed > 0) {
  process.exit(1);
} else {
  console.log("SUCESSO TOTAL! Todas as regras de robustez de URL foram validadas.");
  process.exit(0);
}
