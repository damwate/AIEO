# -*- coding: utf-8 -*-
"""S2 补采 v3：视口拉高状态下 reload + 深滚动（使最新轮进入渲染树）。"""
src = open("phase0/tools/recoll_gpt03_s2r1b.mjs", encoding="utf-8").read()
old = """  await page.waitForTimeout(15000);
  await page.mouse.wheel(0, 50000);
  await page.waitForTimeout(IDLE_WAIT_MS);

  // 归属校验型定位：列出全部物化 unit，按简报标记找本轮 user"""
new = """  await page.waitForTimeout(8000);
  // v3：拉高状态下 reload 使最新轮进入渲染树，再强滚动到底+长静置
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(15000);
  await page.keyboard.press("End");
  await page.waitForTimeout(5000);
  await page.mouse.wheel(0, 200000);
  await page.waitForTimeout(8000);
  await page.mouse.wheel(0, 200000);
  await page.waitForTimeout(IDLE_WAIT_MS);

  // 归属校验型定位：列出全部物化 unit，按简报标记找本轮 user"""
assert old in src, "v3 anchor not found"
src = src.replace(old, new, 1)
src = src.replace('driver: "recoll_gpt03_s2r1b.mjs (viewport-raise variant)",',
                  'driver: "recoll_gpt03_s2r1c.mjs (viewport-raise + reload + deep-scroll variant)",')
open("phase0/tools/recoll_gpt03_s2r1c.mjs", "w", encoding="utf-8", newline="\n").write(src)
print("v3 derived")
