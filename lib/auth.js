// Autenticação sem Supabase: usuários em admins.xml (Blob), senha cifrada (scrypt),
// sessão via token assinado (HMAC). Segredo do HMAC = SESSION_SECRET ou, na falta,
// o próprio BLOB_READ_WRITE_TOKEN (secreto e já presente no servidor).
import crypto from "node:crypto";
import { readXml, parseXml, buildXml, writeXml, asArray } from "./blobxml.js";

const ADMINS_BASENAME = "admins.xml";
const ADMINS_PREFIX = "admins";
const TOKEN_TTL_S = 60 * 60 * 12; // 12h

// Identidades autorizadas a criar conta (allowlist inicial). Login por e-mail ou usuário:
// usuário sem "@" vira <usuario>@golaundry.local (mesmo critério do front).
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
function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}
function hmac(body) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

export function assinarToken(sub) {
  const payload = { sub, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S };
  const body = b64url(JSON.stringify(payload));
  return body + "." + hmac(body);
}

export function verificarToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const esperado = hmac(body);
  if (sig.length !== esperado.length) return null;
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

// ---- Armazenamento de admins ----
export async function lerAdmins() {
  const xml = await readXml(ADMINS_PREFIX);
  if (!xml) return [];
  const doc = parseXml(xml);
  return asArray(doc?.admins?.admin).map((a) => ({
    identidade: String(a.identidade || "").toLowerCase(),
    salt: a.salt || "",
    hash: a.hash || "",
    criadoEm: a.criadoEm || "",
  }));
}

export async function salvarAdmins(admins) {
  const xml = buildXml("admins", { admin: admins });
  await writeXml(ADMINS_BASENAME, ADMINS_PREFIX, xml);
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
