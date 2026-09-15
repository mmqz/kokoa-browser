# 已知事实库（从主线既有实现提取，2026-09-15）

> **这份文档的存在理由**：
> 我在写实施计划时设计了一个主线早就验证过不可行的方案。
> 主线的旧外壳做的是【同一件事】，而且把大量底层行为**实测过了** ——
> 结论就写在它的代码注释里，但没有集中成文。**这份就是把它整理出来。**

> **用法**：动手前先查这里。**不要重新设计已经验证过的部分。**

> 来源：`apps/gecko-shell/omni-overlay/chrome/browser/content/browser/kokoa/boot.js`
> （主线仓库，**只读**）

---

# 一、dsh 集成（**与我们最相关**）

出处：`boot.js` L1250–L1265（原文是注释，逐条标注了实测）

## 1.1 dsh 前端【没有任何 URL 路由】

```
· dsh web 地址【当前不含会话 id】：页面只认 ?token=
  拿到 cookie 后 302 到干净根路径
· 全量扫 dsh 客户端产物（dsh-web-frontend/dist + 所有 dsh-client-* 的 lib/client.js）：
    pushState 0 处、location.hash 0 处、window.history 0 处
```

**结论：往 URL 里塞参数告诉 dsh「打开哪个会话」是无效的。**

## 1.2 会话 id 的形态

```
· dsh 唯一带会话 id 的 URL 形态是它的 HTTP 约定：sessionId=session-<uuid>
  （dsh-session-log-export/lib/client.js:105-107 的 /api/session.export）
· UUID 正则：session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
```

## 1.3 真实可用的「标签 → 会话」信号是**标签标题**

```
· dsh 会把当前会话标题写进 document.title
  格式："<会话标题> — <产品名>"   （U+2014 em dash，前后各一个空格）
  出处：dsh-client-ui-layout/lib/client.js:62
· 外壳能直接读 contentTitle
· 提取办法：lastIndexOf(" — ")，取前半；没有分隔符 = 还是产品标题本身，返回 null
```

## 1.4 工作区标识走 **URL fragment**（外壳自用，dsh 不读）

```
· 外壳往 AI 标签 URL 写 #kokoa-ws=<id>
· dsh 不读 fragment（1.1 已证 0 处 location.hash，且它登录时主动清空 hash）
· 【对 dsh 无副作用】，却让「标签 -> 工作区」随时能从 URL 认出来
```

## 1.5 ★ 一个必须记住的坑

```
比较 URL 判断「是不是同一个 AI 标签」时，必须【同时切掉 ? 和 #】：
  只切 "?" 的话，findAiTab 再也认不出 AI 标签（分屏/复用会全部失配）。
```

## 1.6 取 sessionId 的四级回退（`sessionIdFromUrl`）

```
① query 上的会话参数（参数名：sessionid / session_id / session / kokoa-session）
② fragment 上的同上
③ 路径形态 /session/<id>
④ 都没有 -> { id: null, source: "none" }    【不编造】
```

---

# 二、Subprocess（Firefox 的，分支上同样适用）

出处：`boot.js` L330–L342。原文注明「**读 Subprocess.sys.mjs 及其 worker 源码**，不是推测」。

```
1. options.command 必须是【全路径】：
     源码原文 "Relative paths are not accepted, and $PATH is not searched."
     -> 必须先 Subprocess.pathSearch("node")

2. 传 options.environment 而【不带】environmentAppend:true 时，
   environment 会【整体替换】继承环境：
     源码：if (!options.environment || options.environmentAppend)
             environment = this.getEnvironment()
   -> node 会失去 PATH 等变量

3. 子进程【stdout 恒为管道】
     （subprocess_win.worker.js 的 initPipes 无条件建 fds[1]；
      stderr 默认 "ignore" 才是继承）
   -> 不持续读 stdout，缓冲区满后子进程写操作会【阻塞】。必须 drain。
```

**Windows 特例**（`boot.js` L444–L448，源码 + 实测）：

```
pathSearch 的 Windows 实现：
  if (environment.PATHEXT) exts = environment.PATHEXT.split(";");
即【没有 PATHEXT 时 exts 为空】，只做「精确名」匹配 —— "node" 匹配不到 node.exe。
实测确实如此（sidecar_error=pathSearch(node): Executable not found: node）。
-> 逐个候选名试，不依赖 PATHEXT 是否存在。
```

---

# 三、DOM / 注入时机（旧外壳踩过，分支上原理相同）

出处：`boot.js` L7–L14、L284–L287

```
1. 注入时机在 browser.xhtml 【解析早期】，#browser 主内容区在很后面
   -> 必须【等窗口 load 之后】再操作 DOM

2. XUL <browser> 默认是【独立进程/远程】的：
     contentDocument 恒为 null
     标题读 contentTitle，地址读 currentURI
     加载完成看 webProgress.isLoadingDocument 的 true -> false，
     【不能只等 load 事件】

3. 【不要把 vbox 改成 display:block】—— 那会破坏 XUL 弹性布局，
   内部 <browser> 会退化成 1px 高（实测踩过）。
   正确做法：保留 XUL display，把尺寸沿 容器 -> stack -> browser 逐层显式传递。
```

---

# 四、文件读写（分支上写文件时会遇到）

出处：`boot.js` L114–L117

```
写文件用 IOUtils.writeUTF8，【不要用 nsIFileOutputStream.write】。
实测教训：fos.write(text, text.length) 把每个 JS 字符当【一个字节】写出，
中文等多字节字符会被截断（证据文件里出现过 "*??H? npm --prefix ..." 这种乱码）。
IOUtils.writeUTF8 按 UTF-8 编码，中文完好。
```

---

# 五、路径处理

出处：`boot.js` L58

```
不用固定 parent 层数 —— 实测踩过：
initWithPath 对【末尾分隔符】的处理会让层数差一。
```

---

# 六、与本次构建相关的（我在排查中实测的）

## 6.1 release 构建失败不会产生 minidump

```
【未响应】这类挂起不产生 minidump，所以崩溃转储目录里看不到它。
排查时要靠别的手段（定时器审计、进程 CPU 占用观测）。
```

## 6.2 Windows 上长字符串走命令行会劫持环境

```
实测（构建日志里）：含长字符串的命令行会触发「命令行被劫持为环境变量」
这类问题在拼长命令时出现。
```

---

# 附：这份文档的来源与局限

```
来源：read-only 地通读主线 apps/gecko-shell/.../kokoa/boot.js 的注释。
局限：
  - 只提取了【明确标注为实测/读源码所得】的部分，未逐条复验
  - 主线的实现环境是【资源层覆盖】，分支是【源码级】，
    但以上结论大多关于【Firefox/dsh 的底层行为】，与上层形态无关
  - 第 1 节（dsh）与第 2 节（Subprocess）对分支【直接适用】
  - 第 3-5 节在分支上原理相同，但具体写法要按 Zen 的方式
```
