# R3 独立验收摘要

- 被测：`YotinGarden/bms-service` task branch `task/bms-change-recv-erf-refund`
- commit：`3ac3ded3b5c5b252424c799f0496546a7589219f`
- parent：`a0789c1126b4df0258522b757a7ba842c4e7bc26`
- 范围：9 个 Java 文件；ST-01 PASS；未 push、未合并 master、未发布生产。

## 动态证据

同一变更单 2168，E=-1120、F=-500、r=.9756，T=-1592.67：

1. 退款 100 完成：totalAmount=-100、skuAmount=0，首笔 F-only 现金可被下一笔累计。
2. 退款 600 完成：skuAmount=-200。
3. 退款 292.67 完成：skuAmount=-292.67。
4. 退款 600 完成：skuAmount=-600；`flow.amount=0` 且 `payAmount=-600`，PM 未再清零并进入财务审核。
5. 再退 0.01：拒绝，无新增 cost record。

产品退款累计依次=0、200、492.67、1092.67；最后达到上限后拒绝下一位 0.01。regular=0，ecommerce 与各笔 skuAmount 一致。

## 明确的历史测试数据（不得误判为新实现正确性）

- 第二笔 flow（5195）在 `flowBusinessAmount` 分离前创建，保留完整 T，因此合同 otherPrice 含旧数据的一次额外 T。
- 第三笔 flow（5196）在 PM 实收保持修复前曾被直接完成，payAmount=0；该条只用于 flow.amount=0 验证，不用于现金/合同完美链路断言。
- 最后 600（5197）是在最终实现上创建并完成，证明后续 flow.amount=0 与真实 payAmount 可共存。

项目 1652 最终 otherPrice=8496.49（开工前 11681.83），包含首笔应应用的 -1592.67 和第二笔旧流程额外 -1592.67；后续两笔 flow.amount=0 未再增加 T。最终 paymented=23720（开工前 25020），含首笔 -100、第二笔 -600、最后 -600；第三笔为上述旧 PM 数据。

## 尚未覆盖

AsOrder、后续进度款、企微凭证查重、浏览器实测、F=0/E=0/r>1 补充边界及新基线全量 §7 不在本次 PASS 范围内。
