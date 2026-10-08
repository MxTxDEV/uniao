// Assinatura/verificação do cookie de sessão. Compatível com Edge (usado pelo middleware).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ug_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export interface TokenPayload {
  uid: string;
  tid: string;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET ausente ou com menos de 32 caracteres.");
  return new TextEncoder().encode(s);
}

export async function signToken(p: TokenPayload): Promise<string> {
  return new SignJWT({ tid: p.tid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifyToken(token: string | undefined): Promise<TokenPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.tid !== "string") return null;
    return { uid: payload.sub, tid: payload.tid };
  } catch {
    return null;
  }
}
