// Autenticação sem Supabase: usuários em admins.json (Blob privado), senha cifrada
// (scrypt), sessão via token assinado (HMAC). Segredo = SESSION_SECRET ou, na falta,
// o BLOB_READ_WRITE_TOKEN (secreto e já presente no servidor).
import crypto from "node:crypto";
import { readJson, writeJson } from "./store.js";

const ADMINS_BASENAME = "admins.json";
const ADMINS_PREFIX = "admins";
const TOKEN_TTL_S = 60 * 60 * 12; // 12h

// Identidades autorizadas a criar conta. Login por e-mail ou usuário: usuário sem "@"
// vira <usuario>@golaundry.local (mesmo critério do front).
export const PERMITIDOS = [
  "paulotestario@gmail.com",
  "alisson@golaundrysmart.com.br",
];

export function resolveIdentidade(v) {
  v = String(v || "").trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : v.replace(/\s+/g, "") + "@golaundry.local";
}

function secret() {
  return process.env.SESSION_SECRET || process.env.BLOB_READ_WRITE_TOKEN || "dev-inseguro";
}
function hmac(body) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function assinarToken(sub) {
  const payload = { sub, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + hmac(body);
}

export function verificarToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const esperado = hmac(body);
  if (!sig || sig.length !== esperado.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(senha), salt, 32);
  return { salt: salt.toString("hex"), hash: dk.toString("hex") };
}
export function verificaSenha(senha, saltHex, hashHex) {
  try {
    const dk = crypto.scryptSync(String(senha), Buffer.from(saltHex, "hex"), 32);
    const h = Buffer.from(hashHex, "hex");
    return dk.length === h.length && crypto.timingSafeEqual(dk, h);
  } catch {
    return false;
  }
}

export async function lerAdmins() {
  const data = await readJson(ADMINS_PREFIX, { admins: [] });
  return Array.isArray(data?.admins) ? data.admins : [];
}
export async function salvarAdmins(admins) {
  await writeJson(ADMINS_BASENAME, ADMINS_PREFIX, { admins });
}

export function bearer(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

// Verifica o token e devolve a identidade, ou null.
export function requerAdmin(req) {
  const p = verificarToken(bearer(req));
  return p ? p.sub : null;
}
