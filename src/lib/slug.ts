import { customAlphabet } from "nanoid";
import { db } from "./db";

// Alfabeto Base62 sem caracteres confusos (0, O, I, l removidos para facilitar leitura humana)
const ALPHABET = "123456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const generateBaseSlug = customAlphabet(ALPHABET, 6);

/**
 * Gera um slug alfanumérico único para o Smart Link,
 * garantindo que não colida com nenhum slug existente no banco.
 */
export async function generateUniqueSlug(maxAttempts = 5): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const slug = generateBaseSlug();
    const existing = await db.smartLink.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }
  }

  // Fallback caso raríssimo de colisões sucessivas: aumentar comprimento para 8
  const longerSlug = customAlphabet(ALPHABET, 8)();
  return longerSlug;
}

/**
 * Gera um ID de clique criptograficamente único para rastreamento e atribuição.
 * Formato legível: CLK_XXXXX
 */
export function generateClickId(): string {
  const nano = customAlphabet(ALPHABET, 12);
  return `CLK_${nano()}`;
}
