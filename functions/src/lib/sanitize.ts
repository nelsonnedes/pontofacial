/**
 * P2-1 — sanitize helpers DRY
 * Extraído de functions/src/index.ts:395-429,654 e 404,416
 * Menos é Mais: evita 4 variações de trim+slice espalhadas.
 * TODO P3: index.ts deve importar daqui (hoje ainda duplicado para evitar regressão em callables autoritativos)
 */

import { createHash } from "crypto";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeText(value: unknown, maxLength = 200): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

export function sanitizeScalarText(value: unknown, maxLength = 200): string | undefined {
  if (typeof value === "string") return sanitizeText(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().slice(0, maxLength) || undefined;
  }
  return undefined;
}

export function readTextField(
  data: Record<string, unknown>,
  fields: string[],
  maxLength = 200
): string | undefined {
  for (const field of fields) {
    const value = sanitizeScalarText(data[field], maxLength);
    if (value) return value;
  }
  return undefined;
}

export function sanitizeDocId(value: unknown): string {
  const text = sanitizeText(value, 120);
  if (!text) {
    return createHash("sha256").update(`${Date.now()}-${Math.random()}`).digest("hex");
  }
  return text.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}
