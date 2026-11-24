# S3 Supplemental: UTF-8 copies of three original logs

Originals kept at acceptance/test-logs/; this directory only adds readable copies.
Original encoding: UTF-8 BOM + UTF-8 header + UTF-16 LE body; copies normalized to UTF-8 (no BOM).
File lists verified by pytest --collect-only at the tested SHA, cross-checked with R3 remediation report.

- `gdc-90ce2233-r3.utf8.log` <- `acceptance/test-logs/gdc-90ce2233-r3.log` | source SHA256 `34f2b71f68e3b0d4ff3d0a423e84491b30587fed40246dfae699d771bb2975db` | UTF-8 copy SHA256 `f9da9ebfc92d60abcef559fa44dee9ce0196ca05712ea21aeaf0d3eacfac52ea` | tested SHA `90ce2233b4da9d844cf1e165c43cec2ecdd3cddd`
- `ais-a1f55b52-r3.utf8.log` <- `acceptance/test-logs/ais-a1f55b52-r3.log` | source SHA256 `ebc0b9389ff7ef6131ff7f14f97ebf1c39cbc85c943a47a714d3cec19fb24170` | UTF-8 copy SHA256 `0f0a43fa506e04c15014a92d87fc6be2605c56945c418705ec4e66250da73fd0` | tested SHA `a1f55b523f90763bcd12823bf52cff9d710381a6`
- `aieo-queue-4d184e8-r3.utf8.log` <- `acceptance/test-logs/aieo-queue-4d184e8-r3.log` | source SHA256 `76f4288c7f1b023f137f944b0fc937d12ef26c3e6dd2f30ffd7a81f249963e2f` | UTF-8 copy SHA256 `41af9ec74e0a2711e548acd8a4e6f65627e86b49760467b155e9d0ffbcfa5639` | tested SHA `4d184e8de4eab56519c4e0f57a6e37afbc7984ac`
