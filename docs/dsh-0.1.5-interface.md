# dsh 0.1.5-rc.1 接口调研（2026-09-16，云端完成）

> 回答 `docs/workitem-ai-panel-interface.md` 第五节列出的三个"没查清"。
> 方法：从 npm 拉取 dsh 发布包，**逐文件读源码**。每条结论都标注
> 【我验证了】（包名 + 文件 + 行号）或【我认为】。

---

# 一、调研对象与版本

```
启动器   @deepseek-ai/dsh@0.1.5-rc.1          （npm latest）
负载     @deepseek-ai/dsh-web-app@0.1.5-rc.1  （web 档案的 patch 层）
传输     @deepseek-ai/dsh-client-connection@0.1.5-rc.1
API 契约 @deepseek-ai/dsh-api-remotes@0.1.5-rc.1
UI       @deepseek-ai/dsh-client-ui-workspace / -ui-layout / -ui-sidebar
会话导出 @deepseek-ai/dsh-session-log-export@0.1.5-rc.1
```

**版本警告**【我认为】：主线已知事实来自更早版本。本文所有行号以
0.1.5-rc.1 为准；dsh 是 0.x 版本，接口可能随版本变。升级 dsh 后
**必须重跑本调研**（跑法见文末）。

# 二、传输：一元 RPC 就是普通 HTTP POST（★ 最重要的发现）

【我验证了】`dsh-client-connection/lib/client.js` L6184-6223（createWebConnectionRpc）、
L6253-6256（resolveBase）：

```
POST {origin}/api/<namespace>/<method>
Content-Type: application/json

body  = {"type":"client-request","rpcId":"<uuid>","method":"<namespace>/<method>","payload":{...}}
响应  = {"type":"server-response","rpcId":"<同一个>","result":{"ok":true,"value":...}}
      或 {"result":{"ok":false,"error":{"code":"...","message":"...","details":{}}}}
```

* rpcId 由调用方生成、服务端原样回带；不匹配要当传输错误（L6214 也这么做）。
* 客户端解析响应是【逐字段严格校验】，不对就抛 TypeError（L6224-6240）——
  我们的外壳客户端照抄了这个态度。
* 流式端点（session/follow 等）走另一条 worker-local 载体，外壳一元调用用不到。

# 三、认证：token 换 cookie，401 之前必须做

【我验证了】`dsh-client-connection/lib/index.js`：

```
L222   TOKEN_QUERY = "token"
L223   COOKIE_PREFIX = "dsh-auth-"
L280-282  cookie 名 = "dsh-auth-" + base64url(sha256(Host头))   （绑 authority）
L292-293  属性 = HttpOnly; SameSite=Strict; Path=/; Max-Age=...
L386-408  GET /?token=<launchToken> （必须 GET、路径 /、单个 token）
          -> 303 + Set-Cookie + 跳 /
L431-446  isAuthenticated：cookie 签名 + authority 一致 + 未过期
L449-456  401 响应体："dsh web authentication required; reopen the URL printed by dsh web."
L555      每个 /api 请求都过这道闸（401 或放行）
```

**对外壳的含义**【我验证了链路、实机未验】：

* 我们已有带 token 的 panel URL（KokoaDshSidecar 产物）——它本身就是交换入口。
* `fetch(origin + "/?token=…", {credentials:"include"})` 让浏览器把 cookie
  存进 jar；随后对 `/api/*` 的 `fetch(…, {credentials:"include"})` 自动带上。
* 不需要、也读不到 Set-Cookie（HttpOnly）；不需要知道 cookie 名。

# 四、会话列表接口【存在】—— 三个未知里最大的一个

## 4.1 端点与 payload

【我验证了】`dsh-api-remotes/lib/client.js`：

```
L8596-8617  face 表项 id "@deepseek-ai/dsh-api-session-controller#session/list"
            invocation: direct
L8028       请求 payload schema：{ cursor?: string }        （分页游标）
L8029-8130+ 结果 schema：{ items: [...] }
```

## 4.2 items 的每个元素（逐字段核对过 schema）

```
sessionId           string（session-<uuid>）
updatedAt           number（毫秒）
running             boolean
blank               boolean
parentSessionId?    string
origin?             "subagent"
cwd?                string
projections: {
  asOfSeq: number,
  values: {
    title?: string|null            ← ★ 会话标题直接给
    todos?: [...]
    goal?: {...}
    modelSelection?: {...}
    sessionListMetadata?: { blank: boolean, lastPromptAt: number|null }
    subagent? / inbox? / imageLimits? / subagentCatalog? ...
  }
}
```

服务端已按 updatedAt 降序排好（fixture `dsh-client-connection/lib/client.js`
L5245 与真实 face 一致）——客户端不重排。

## 4.3 全部一元端点（同方法表）

【我验证了】`dsh-client-connection/lib/client.js` L6090-6131（fixture 分派表
镜像真实 face）+ `dsh-api-remotes` face 表：

```
session/list        session/create     session/fork       session/rename
session/search      session/page       session/cancel     session/prompt
session/attachment  session/updateQueue  session/selectModel
session/modelCatalog  session/canOpenWorkspacePath  session/openWorkspacePath
workspace/create|delete|rename|follow|insertBefore|insertSessionBefore|archiveSession
directoryPicker/pick|list|createDirectory
settings/get|replace|mutate   commands/list   skills/list
agentPresets/list|read   goals/create|resume   fileReferences/list
workspaceFiles/read|list|changes   subagents/list   sessionReferenceResolver/candidates
```

## 4.4 会话导出（精确签名）

【我验证了】`dsh-session-log-export/lib/index.js` L463（`/api/session.export`）、
L484-486（GET/HEAD）；`lib/client.js` L105-107：

```
GET /api/session.export?sessionId=<id>&includeDescendants=true
```

与主线 known-facts 1.2 记录一致（L105-107 行号都吻合）。

# 五、「切到指定会话」：外壳【做不到】（推翻一个潜在预期）

【我验证了】`dsh-client-ui-workspace/lib/client.js`：

```
L61-64   openSession(sessionId) = this.sessions.open(sessionId)
                              + this.ctx.layout.selectPanel(null)
         —— 纯页面本地状态（zustand store），没有网络调用
L115-152 watchNavigation：页面冷启动时如果 sessions.current 为空，
         自动挑【最近的工作区】-> connectWorkspace（L44-59：
         找该工作区里的空白会话，没有就 session/create 新建）-> 打开
```

结合主线已证的「dsh 前端 0 处 URL 路由」，结论：

```
1. 没有服务端"当前会话"概念 —— current 只存在于每个页面实例里
2. 没有 URL 参数能指定初始会话（?token= 只在根路径换 cookie）
3. 没有外部触发通道（$events / session/control 都是服务端 -> 页面的推送）
=> 外壳无法命令一个已存在的 dsh 标签切换到指定会话
=> 重新加载也不行：冷启动只会落到"最近工作区的空白/新建会话"
```

**这是 dsh 的产品边界，不是我们能在分支里绕掉的。**（【我认为】如果产品
强需"点工作区 -> 打开指定会话"，路径是给 dsh 上游提 deep-link 需求，
或在 dsh 页面内注入引导 —— 后者违背 ADR-017 的"不对抗"原则，不建议。）

# 六、标题协议（复核）

【我验证了】`dsh-client-ui-layout/lib/client.js` L55-67：

```
L62   document.title = title === undefined ? productTitle : `${title} — ${productTitle}`
```

与主线 known-facts 1.3 完全一致（em dash U+2014、前后各一空格、
无会话时回落产品名）。我们的 sessionTitleFromTabTitle 继续有效。

# 七、对分支的落地

```
· 新模块  src/zen/kokoa/KokoaDshSessions.mjs
          —— 外壳侧会话列表客户端（token 交换 + POST /api/session/list + 归一化）
             fetch 与 rpcId 工厂可注入，Node 零依赖可测（49 用例）
· 已登记  src/zen/kokoa/moz.build（字母序 KokoaDshSessions < KokoaDshSidecar）
· UI 接线（设置页显示列表 / 导出按钮）是下一步工作项，需要实机验证
```

# 八、本次调研怎么复跑（dsh 升级后）

```bash
mkdir /tmp/dsh-research && cd /tmp/dsh-research
for p in dsh-client-connection dsh-api-remotes dsh-client-ui-workspace \
         dsh-client-ui-layout dsh-session-log-export; do
  npm pack @deepseek-ai/$p@<新版本> && mkdir -p pkg-$p \
    && tar -xzf deepseek-ai-$p-<新版本>.tgz -C pkg-$p --strip-components=1
done
# 核对四处关键点：L 区（传输/认证）-> 二、三节；face 表 -> 四节；
# ui-workspace 的 openSession/watchNavigation -> 五节；ui-layout 的 title -> 六节
```
