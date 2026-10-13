/**
 * Utilitários de formatação de data para o padrão brasileiro (pt-BR / Fuso Brasília - America/Sao_Paulo).
 */

/**
 * Formata data no padrão oficial solicitado: "DD/MM/AAAA HH:mm"
 */
export function formatBrDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "--/--/---- --:--";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;

  if (isNaN(date.getTime())) return "--/--/---- --:--";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

/**
 * Formata data completa com segundos para auditoria e histórico: "DD/MM/AAAA HH:mm:ss"
 */
export function formatBrDateTimeFull(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "--/--/---- --:--:--";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;

  if (isNaN(date.getTime())) return "--/--/---- --:--:--";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
