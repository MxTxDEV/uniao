// Cookie de sessão: JWT HS256 assinado com Web Crypto (funciona no Edge/middleware e no Node).
export const SESSION_COOKIE = "ug_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export interface TokenPayload {
  uid: string;
  tid: string;
}

const enc = new TextEncoder();

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou com menos de 32 caracteres.");
  return s;
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = "";
  for (const b of u) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export async function signToken(p: TokenPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(enc.encode(JSON.stringify({ sub: p.uid, tid: p.tid, iat: now, exp: now + SESSION_MAX_AGE })));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey("sign"), enc.encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyToken(token: string | undefined): Promise<TokenPayload | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [header, body, sig] = parts;
    const h = JSON.parse(new TextDecoder().decode(fromB64url(header)));
    if (h.alg !== "HS256") return null;
    // subtle.verify compara em tempo constante
    const ok = await crypto.subtle.verify("HMAC", await hmacKey("verify"), fromB64url(sig), enc.encode(`${header}.${body}`));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (typeof p.sub !== "string" || typeof p.tid !== "string" || typeof p.exp !== "number") return null;
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: p.sub, tid: p.tid };
  } catch {
    return null;
  }
}
