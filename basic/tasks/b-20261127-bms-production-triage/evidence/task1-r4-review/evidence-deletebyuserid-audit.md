# UserTokenServiceImpl.deleteByUserId 全仓调用审计（R4 要求，只读证据）

对象仓：`D:/YotinGarden/.worktrees/bms-multi-device-login-acl`（分支`task/bms-multi-device-login`，基线`07fa35463d478716c51fd5a291c82a39aaaa96fd`）。

审计方法：`grep -rn "deleteByUserId" --exclude-dir=target .`（全文件类型，含java/xml/yml/测试）。

## 结果

| 位置 | 性质 |
|---|---|
| `acl-server/src/main/java/com/ecog/acl/service/UserTokenService.java:23` | 接口方法**声明** |
| `acl-server/src/main/java/com/ecog/acl/service/impl/UserTokenServiceImpl.java:38` | 接口方法**实现**（内部`this.delete(wrapper)`按user_id逻辑删除） |

**全仓调用者：0 个。** 除声明与实现外无任何命中（controller、service、mvc、测试、mapper xml均无）。

## 用户令牌服务全部使用点（证明生命周期闭环）

| 调用位置 | 方法 | 用途 |
|---|---|---|
| `UserController.java:251/316/346` | `getById` | getByToken/menu/config 只读校验 |
| `UserController.java:670` | `deleteByToken(accessToken)` | 单token logout（按主键逻辑删除） |
| `AuthInterceptor.java:70` | `getById` | 认证拦截只读校验 |
| `UserServiceImpl`（userLogin/qywxLogin） | **无任何token删除调用** | P1已移除两处批删；现仅`deleteRelationByIdTo`（组织-用户关系，非token） |

## 结论

账密登录、企微OAuth登录、单token logout **均不调用`deleteByUserId`批量删除路径**；该方法是零调用者的历史遗留API，按R3审查要求**原样保留、不扩大改造**。多会话token生命周期仅由`deleteByToken`（单token主键删除）与30天有效期共同约束，不存在其他批量吊销路径。
