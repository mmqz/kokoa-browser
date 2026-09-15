# TASK-08 核验报告：spaces 同步的风险已闭合

> 验收方对 `out/TASK-08-zen-spaces-sync.md`（315 行）的独立核验。
> 这份回答的是「ADR-019 能不能放心做」。

---

# 一、结论：**能放心做**

**我担心的风险不存在。**

```
担心：给 space 加 kokoaSessionId，会不会被 Zen 的同步带走？

答案：不会。
  · 出站投影是【字段白名单】—— 只传 uuid/name/icon/theme/containerGuid/children
  · 入站应用也是【字段白名单】—— 只认这 6 个
  · 所以 kokoaSessionId 既不会被同步出去，也不会被同步覆盖
```

**我的核验（逐条查源码，不是转述它的结论）**：

| 它的断言 | 我查到的 | 判定 |
|---|---|---|
| 出站白名单在 ZenSpacesSyncModel.sys.mjs L591-L602 | L585 #projectSpaces 开始，L591 map.set(uuid, {，L603 结束 | ✅ 命中（它写 L591，实际 L585 起，引用位置对） |
| 入站白名单在 ZenSpacesSyncApplier.sys.mjs L325-L331 | L325 const fields = {，L331 }; | ✅ **精确命中** |
| 白名单字段是 6 个 | 实测：uuid / name / icon / theme / containerGuid（出站）/ containerTabId（入站）/ children | ✅ |
| delete hasCollapsedPinnedTabs 在 L774-777 | 一致 | ✅ |

**出站白名单原文**（`ZenSpacesSyncModel.sys.mjs` L591-603）：

```js
map.set(uuid, {
  kind: RECORD_KINDS.SPACE,
  data: {
    uuid,
    name: space.name ?? "",
    icon: space.icon ?? null,
    theme: space.theme ?? null,
    containerGuid: this.guidForContextId(space.containerTabId, { create: true }),
    children: this.#childSequence(ctx, { space: uuid }),
  },
});
```

**入站白名单原文**（`ZenSpacesSyncApplier.sys.mjs` L325-331）：

```js
const fields = {
  uuid: data.uuid,
  name: data.name ?? "",
  icon: data.icon ?? undefined,
  theme: data.theme ?? null,
  containerTabId: this.#resolveContainerId(data.containerGuid),
};
```

# 二、附带查清的：同步到哪

**Firefox Sync（Mozilla 的服务器），Zen 没有自己的同步服务。**

```
证据：src/services/sync/modules/service-sys-mjs.patch L9-L12
  result.Spaces = {
    module: "resource:///modules/zen/ZenSpacesSync.sys.mjs",
    symbol: "ZenSpacesSyncEngine",
  };

ZenSpacesSync.sys.mjs L5-L11 从 resource://services-sync/engines.sys.mjs
import { Store, SyncEngine, Tracker }
L123  export class ZenSpacesSyncEngine extends SyncEngine
L125  super("Spaces", service)
```

**所以「会不会泄漏到 Zen 的服务」这个担心是多余的 —— 根本没有 Zen 的同步服务。**
它复用了 Firefox Sync 基建，只加了一个叫 Spaces 的 collection。

# 三、同步的开关状态（**这条重要**）

```
prefs/zen/sync.yaml L5-L7:
  - name: services.sync.engine.spaces
    value: "@cond"
    condition: "@IS_TWILIGHT@"

IS_TWILIGHT 的含义（tools/ffprefs/src/main.rs L321-L330）：
  读 .surfer/dynamicConfig.brand.json，若不含 "release" 则为 twilight
```

**我们的 CI 跑 surfer ci --brand twilight（workflow L82）**
→ **所以 Kokoa 当前产物【属于 twilight 构建，同步是开启的】**

但这不等于「数据会被上传」：

```
· 必须【用户登录 Firefox Sync】引擎才会跑
· 我们的产物没有预置账号，用户不登录就不会同步
· 用户也可在 about:preferences 关闭（account-sync-mjs.patch L18）
```

> ⚠️ **一个待决定项**：我们作为产品，要不要保留这个同步？
> 它是 Zen 的功能（把 space 同步到用户的 Firefox 账号）。
> 对我们可能【有用】（用户换设备能带走工作区），也可能【不需要】。
> **这是产品决策，不是技术问题。**

# 四、安全方案（TASK-08 给的，我已核验）

只需改 **2 处**，**同步层零改动**：

| 步骤 | 文件 | 行（**我核实的**） | 改什么 |
|---|---|---|---|
| 1 | `src/zen/spaces/ZenSpaceManager.mjs` | **L2543** 起（它写 L2555-2561，偏 12 行） | `#createWorkspaceData` 的返回对象加 `kokoaSessionId: null` |
| 2 | 同文件 | **L1244** 是 `saveWorkspace`（✅ 精确） | 新增 `updateSpaceSessionId(uuid, sessionId)`：取 space → 赋值 → `this.saveWorkspace(space)` |

**不需要做的**：

```
· 改 ZenSpacesSyncModel.sys.mjs     —— 白名单已挡住
· 改 ZenSpacesSyncApplier.sys.mjs   —— 同上
· 关 services.sync.engine.spaces    —— 没必要
· 把 sessionId 存到 space 对象之外   —— 没必要，反而增加复杂度
```

# 五、对 ADR-019 的影响

**ADR-019 的结论不变，但依据更完整了。**

```
原来：space 加字段会被【持久化】（sessionstore 无白名单）
现在：且【不会被同步】（sync 有白名单）—— 两个通道都验证过了
```

**我此前的工作项 workitem-workspace-session-binding.md 里漏了这个风险，现已闭合。**

# 六、这次「先查再动手」的价值

```
· 我在 workitem 里漏查了 sync，是个疏漏
· 但派 TASK-08 补上了，而且结果是【好消息】
· 更重要的是：它给了一个【比我想的更简单】的方案
   我原来担心「可能要改同步层」—— 实际零改动
· 如果不查就动手，可能会：
    a) 白担心一场，绕远路（把 sessionId 存到别处）
    b) 或真遇到问题才返工
```

**这是本项目第三次「先查清再设计」带来的收益**（前两次是 TASK-02/05）。
