// 方案体量排名（API 轻量）：场景 JSON 大小 + GLB/KTX2 引用数 + 产品数，输出 Top15。
import { writeFileSync } from "node:fs";
const H = { Cookie: process.env.CJ };
const B = "http://share.yotin.com.cn:8870";
const PIDS = {
  "84de7412-dfdb-4056-afc2-07057e20bc61": "10w",
  "f63f189d-48fd-4ddc-974e-b1052fbff34e": "2w",
  "fb3cee01-bd29-483a-843c-67c8f113d2d0": "1.2w",
  "2648b383-09b6-4127-a4fd-1c2ad956c97b": "PO1103",
  "f7ce76e6-ae98-410c-a0ad-deaedfbe6b4f": "调试",
  "b60402ed-fc4a-45f5-b47a-b95831b8d565": "东海岸",
};
const j = async (u) => { const r = await fetch(B + u, { headers: H }); return r.json(); };
const all = [];
for (const pid of Object.keys(PIDS)) {
  const list = await j("/api/projects/" + pid + "/schemes");
  (Array.isArray(list) ? list : (list.items || [])).forEach((s) => all.push({ pid, pname: PIDS[pid], sid: s.scheme_id, name: s.name }));
}
console.log("schemes:", all.length);
const ranked = [];
for (const s of all) {
  try {
    const det = await j("/api/schemes/" + s.sid);
    const rid = det.current_revision_id;
    if (!rid) continue;
    const rev = await j("/api/revisions/" + rid);
    const scene = rev.scene ? JSON.stringify(rev.scene) : "";
    if (!scene) continue;
    const glb = (scene.match(/\.glb/g) || []).length;
    const ktx = (scene.match(/\.ktx2/g) || []).length;
    const products = (scene.match(/"product_id"/g) || []).length;
    ranked.push({ pname: s.pname, name: s.name, sid: s.sid, sceneKB: +(scene.length / 1024).toFixed(0), glb, ktx, products });
  } catch (e) { /* 单条失败跳过 */ }
}
ranked.sort((a, b) => b.sceneKB - a.sceneKB);
console.log("ranked by scene size (top 15):");
ranked.slice(0, 15).forEach((r, i) =>
  console.log(` ${i + 1}. [${r.pname}] ${r.name} scene=${r.sceneKB}KB glb_ref=${r.glb} ktx_ref=${r.ktx} products=${r.products} sid=${r.sid}`));
writeFileSync("D:/AIEO/phase0/logs/share-cache-verify-20261120/scheme-richness.json", JSON.stringify(ranked, null, 1), "utf8");
