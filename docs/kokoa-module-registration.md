# 验证：Kokoa 模块的注册与导入方式（**已核实到底**）

> 2026-09-15。我在这个点上一度走错（先写 `jar.inc.mn` 的 `chrome://`，
> 后来改成 `moz.build` 的 `resource:///modules/zen/`）。
> 本文记录【最终确认的做法】与全部证据，避免以后反复。

---

# 一、结论

```
注册：src/zen/kokoa/moz.build 里
        EXTRA_JS_MODULES.zen += [ "KokoaAiPanel.mjs", ... ]

导入：const { openAiTab } = ChromeUtils.importESModule(
         "resource:///modules/zen/KokoaAiPanel.mjs"
       );
```

# 二、证据（全部来自仓库，可复核）

## 2.1 `.mjs`（非 `.sys.mjs`）放进 EXTRA_JS_MODULES.zen 是标准做法

```
src/zen/spaces/moz.build:
  EXTRA_JS_MODULES.zen += [
      "ZenGradientGenerator.mjs",
      "ZenSpace.mjs",
      "ZenSpaceCreation.mjs",
      "ZenSpaceIcons.mjs",
      "ZenSpaceManager.mjs",
      "ZenSpacesSwipe.mjs",
  ]

src/zen/boosts/moz.build:
  "ZenBoostsEditor.mjs",        <- 也是普通 .mjs
  "ZenBoostsManager.sys.mjs",   <- 两种混用
```

**所以后缀不影响** —— `.mjs` 与 `.sys.mjs` 都能这样注册。

## 2.2 「解构 importESModule 返回值」有确凿先例，而且【在同一个文件里】

```js
// 定义：src/zen/live-folders/ZenLiveFoldersManager.sys.mjs L706
export const ZenLiveFoldersManager = new nsZenLiveFoldersManager();

// 导入：src/zen/common/zen-sets.js L155-157
const { ZenLiveFoldersManager } = ChromeUtils.importESModule(
  "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs"
);
```

**我们就是在 `zen-sets.js` 里加同样的解构** —— 与 L155 的写法一模一样。

## 2.3 为什么不用 jar.inc.mn 的 `chrome://`

```
· jar.inc.mn 注册的路径是 chrome://browser/content/...
· 那主要用于 UI 脚本（ZenStartup / ZenMenubar 等，见 ZenPreloadedScripts.js L15-32）
· 而 Zen 的「逻辑模块」统一在 modules/zen/ 下（EXTRA_JS_MODULES.zen）
· 我们这三个都是纯逻辑（拿 URL / 找标签 / 拉起 dsh / 分屏）

【另外】ZenPreloadedScripts.js L34-36 是这样加载 chrome:// 的 .mjs 的：
  ChromeUtils.importESModule(script, { global: "current" });
  即【注入到全局】，而不是解构返回值 ——
  也就是说「chrome:// + 解构返回值」在仓库里【没有先例】。
  这进一步支持我们选 resource:///modules/zen/ 这条路。
```

# 三、当时的弯路（记录，避免重走）

```
我先写的是：
  src/zen/common/jar.inc.mn 加一行 content/browser/kokoa/KokoaAiPanel.mjs
  zen-sets.js 用 chrome://browser/content/kokoa/KokoaAiPanel.mjs

然后自问「这个组合有先例吗」—— 查下来【没有】。
于是去查 Zen 自己的逻辑模块怎么注册的，发现 EXTRA_JS_MODULES.zen。
改过来，并撤销了 jar.inc.mn 的改动。
```

# 四、以后加 Kokoa 模块的清单

```
1. 文件放 src/zen/kokoa/<名字>.mjs
2. 在 src/zen/kokoa/moz.build 的 EXTRA_JS_MODULES.zen 里加文件名
3. 用 export function / export const 导出
4. 调用方用：
     const { 名字 } = ChromeUtils.importESModule(
       "resource:///modules/zen/<文件名>.mjs"
     );
5. 跑 bash scripts/check.sh all（它会做语法检查）
```

> 【注意】`check.sh` 只做静态检查，
> 模块能否真的被导入，要等构建产物实测。
> 本仓库的构建一次约 3 小时 —— 所以宁可多查先例，也别猜。
