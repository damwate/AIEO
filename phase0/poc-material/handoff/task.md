# GitPointer 真实 POC 任务材料

任务：验证 M2 长材料通过 GitPointer 传输，网页只携带短指针。

本材料用于验证：
- manifest 与实际文件 SHA-256/size 一致；
- 以完整 commit SHA 读取，不依赖分支 HEAD；
- 多文件全部读取成功后才算完成。

不包含秘密、Cookie、Token 或登录信息。
