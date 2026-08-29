// NOTE: Este rate limit em memória armazena as requisições por IP em um Map.
// Ele reseta a cada cold start/deploy do container. Se o volume de tráfego
// e escala horizontal aumentarem significativamente no futuro, o ideal é
// migrar para um storage distribuído compartilhado (como Redis/Upstash/KV).
// Para o estágio e arquitetura atual da aplicação, essa proteção em memória é
// suficiente e protege contra loops e abuso de bots.

interface RateLimitRecord {
  timestamps: number[];
}

const ipRequestMap = new Map<string, RateLimitRecord>();

// Limpa IPs inativos a cada 5 minutos para evitar vazamento de memória
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipRequestMap.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < 60_000);
      if (record.timestamps.length === 0) {
        ipRequestMap.delete(ip);
      }
    }
  }, 300_000);
}

export function checkRateLimit(
  request: Request,
  limit: number = 10,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number } {
  // Extrai o IP real do cliente através do header x-forwarded-for ou fallbacks
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : realIp) || "127.0.0.1";

  const now = Date.now();
  let record = ipRequestMap.get(ip);

  if (!record) {
    record = { timestamps: [] };
    ipRequestMap.set(ip, record);
  }

  // Remove requisições fora da janela de 60 segundos
  record.timestamps = record.timestamps.filter((t) => now - t < windowMs);

  if (record.timestamps.length >= limit) {
    return { allowed: false, remaining: 0 };
  }

  record.timestamps.push(now);
  return { allowed: true, remaining: limit - record.timestamps.length };
}

export function validatePromptLength(text: unknown, maxLength: number = 500): { valid: boolean; error?: string } {
  if (typeof text === "string" && text.length > maxLength) {
    return {
      valid: false,
      error: `O texto fornecido excede o limite máximo permitido de ${maxLength} caracteres.`
    };
  }
  return { valid: true };
}
