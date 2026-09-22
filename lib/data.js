// Helpers das coleções de dados (JSON no Blob privado).
import { readJson, writeJson, uid } from "./store.js";

export { uid };

export async function getFiliais() {
  return (await readJson("filiais", { filiais: [] }))?.filiais || [];
}
export async function setFiliais(arr) {
  await writeJson("filiais.json", "filiais", { filiais: arr });
}

export async function getMaquinas() {
  return (await readJson("maquinas", { maquinas: [] }))?.maquinas || [];
}
export async function setMaquinas(arr) {
  await writeJson("maquinas.json", "maquinas", { maquinas: arr });
}

export async function getSessoes() {
  return (await readJson("sessoes", { sessoes: [] }))?.sessoes || [];
}
export async function setSessoes(arr) {
  await writeJson("sessoes.json", "sessoes", { sessoes: arr });
}
