# ⛔【本文结论已撤回】

> **2026-09-15 更正：我说 how-to 文档那条「prefs/zen/*.yaml 经 tools/ffprefs 编译」是错的**
> **—— 其实那条是对的，错的是我。**
>
> 我只读了 `tools/ffprefs/src/main.rs` 的【头部注释】（那是 Firefox 原版 StaticPrefs 的说明，
> 要求 cpptype/mirror 字段），**没往下读代码**。
> 真相在 L110：`DYNAMIC_PREFS = "../engine/browser/app/profile/zen.js"`，
> 而 L147 就是 `if ext == "yaml"` —— 它确实读 prefs/*.yaml。
>
> 证据还包括 CI 日志：`Writing preferences to: Dynamic: .../app/profile/zen.js`
>
> **见**：`docs/prefs-mechanism-CONFIRMED.md`
>
> 本文以下内容保留，作为「只读了一部分就下结论」的样本。

---

# ★ how-to 文档的机制描述错误（TASK-01 核验的盲区）

> 2026-09-15 发现。**这不是 TASK-01 的错** —— TASK-01 的任务是核验
> 「文件 + 行号 + 内容」是否存在，它做得很好（152 条，找出 4 处真错误）。
> 但**「机制描述对不对」是另一个维度**，那次核验没有覆盖。

---

# 一、发现的错误

`docs/how-to-add-kokoa-ui.md`（748 行）里有 4 处提到：

```
L85   ├── prefs\zen\*.yaml                  默认偏好（经 tools/ffprefs 编译）
L218  - pref 定义：`prefs\zen\compact-mode.yaml` L5–L40。
L235  | 5. 需要 pref 就写 `prefs\zen\*.yaml` | 抄 `prefs\zen\compact-mode.yaml` |
L748  | 新 pref | — | `prefs\zen\*.yaml`（参考 `compact-mode.yaml`） |
```

**「经 `tools/ffprefs` 编译」这条是错的。**

# 二、为什么是错的（**实测**）

## 证据 1：`tools/ffprefs` 是 Firefox 的 StaticPrefs 生成器

`tools/ffprefs/src/main.rs` 头部注释原文：

```
// Any pref defined in one of the files included here should *not* be defined
// in a data file such as all.js; that would just be useless duplication.

// A pref definition looks like this:
//
//   - name: <pref-name>                                 // mandatory
//     cpptype: <cpp-type>                               // mandatory if static
//     value: <default-value>                            // mandatory
//     mirror: <never | once | always>                   // mandatory if static
//     lang: <static | rust | dynamic>                   // optional
```

它要求 `cpptype` / `mirror` 这些**C++ 静态 pref 专用字段**，
并生成 `StaticPrefsBase.h` 之类的东西。

## 证据 2：`prefs/zen/*.yaml` 的字段不匹配

`prefs/zen/compact-mode.yaml`（46 行）实测内容：

```yaml
- name: zen.view.compact.hide-tabbar
  value: true

- name: zen.view.compact.hide-toolbar
  value: false

- name: zen.view.compact.toolbar-flash-popup.duration
  value: 800
```

**只有 `name` 与 `value`，没有 `cpptype` / `mirror` / `lang`。**

**所以它不可能是 `tools/ffprefs` 的输入。**

# 三、那它真正的消费者是谁？**没查到**

试过：

```
1. 全仓搜 prefs/*.yaml 的引用
   -> 只有 docs/how-to-add-kokoa-ui.md 提到（也就是那条错误描述本身）
2. surfer 仓库 src/ 下逐个看
   -> commands/patches/ 只有 branding-patch / command / copy-patches / git-patch / index
      没有 prefs 相关文件
3. 本地无 node_modules（npm ci 只在 CI 上跑过），看不到 surfer 实现
4. 想用 base64 下载 surfer 文件分析 -> PowerShell 脚本长度限制，失败
```

**这是「没查到」，不是「不存在」。**

# 四、影响

## 对那份 748 行文档

**它在「pref 该写哪儿」这件事上给不出可靠答案。**
但**其余部分仍然可用**（组件机制、命令注册、l10n 等，TASK-01 已核验行号）。

## 对我们的工作项

`workitem-kokoa-settings.md` 与 `workitem-ai-workspace-sidebar.md` 里
都提到「需要 pref 就写 prefs/zen/*.yaml」——**这条要打个问号**。

**在搞清楚真正的消费者之前，不要依赖这条。**

# 五、正确的做法（**待确认，不是结论**）

有两条可能的路：

```
A) prefs/*.yaml 确实被某个工具消费（只是我没找到）
   -> 那就按它的格式写
   -> 但要先确认：改完怎么验证 pref 生效？

B) prefs/*.yaml 是【文档性质】的（给人看的清单，不参与构建）
   -> 那真正的默认值在别处（可能是 Zen 的某个 patch 里）
   -> 要找到真正的落点
```

**验证办法**（下次构建后可以做）：

```
1. 在 prefs/zen/ 下加一个明显的新 pref（如 zen.kokoa.test = true）
2. 构建
3. 打开 about:config 看它在不在
4. 在不在 -> 决定走 A 还是 B
```

# 六、教训

**「文件+行号对得上」不等于「机制描述对」。**

TASK-01 核验了 152 条断言、找出 4 处行号错误，做得很扎实。
但它核验的是**存在性**，不是**正确性**。

> 以后核验技术文档时，要加一类检查：
> **「它说的机制，能不能用代码验证？」**
> 例如这条：去读 tools/ffprefs 的字段要求，一看就不匹配。

这条已记录，供 TASK-01 那类工作参考。
