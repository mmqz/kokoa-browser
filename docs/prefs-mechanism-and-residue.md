# ⚠️【部分更正】

> **2026-09-15**：本文的【主结论是对的】（prefs/*.yaml 的内容被合并进 firefox.js），
> 但我当时写「消费者未确认」—— **现在已确认：就是 `tools/ffprefs`。**
>
> 链路：`prefs/*.yaml` → `tools/ffprefs` → `engine/browser/app/profile/zen.js`
> → 在 firefox.js 末尾加 `#include zen.js` → 构建进 `defaults/preferences/firefox.js`
>
> **见**：`docs/prefs-mechanism-CONFIRMED.md`
>
> 本文其它内容（两处品牌残留的发现）仍然有效。

---

# ★ 突破：prefs/*.yaml 的机制查清了 + 发现两处贴牌残留

> 2026-09-15。这一轮把之前「查不到」的问题解决了。

---

# 一、机制查清了

## 之前的困境

我在全仓搜 `prefs/*.yaml` 的引用，只搜到那份 748 行文档里的（错误的）说法：
「经 tools/ffprefs 编译」—— 但 `tools/ffprefs` 是 Firefox 的 StaticPrefs 生成器，
字段格式（`cpptype`/`mirror`）与 `prefs/*.yaml`（只有 `name`/`value`）**不匹配**。

## 这次的办法：**从产物反推**

不再搜引用，而是【直接看构建产物的 `defaults/preferences/firefox.js` 里有什么】。

解包 `browser/omni.ja` 里的 `defaults/preferences/firefox.js`（1869 行），
搜 `zen`：

```
含 zen 的 pref 行：142 条

  pref("zen.boosts.enabled", true);
  pref("zen.glance.activation-method", "alt");
  pref("zen.folders.max-subfolders", 5);
  pref("zen.keyboard.shortcuts.version", 0);
  ...
```

**结论：`prefs/*.yaml` 的内容被合并进了 `defaults/preferences/firefox.js`。**

```
prefs/{firefox,zen,privatefox,fastfox}/*.yaml
        |  (某个工具 —— 仍未确认是哪个)
        v
engine/browser/... -> omni.ja 的 defaults/preferences/firefox.js
```

**「哪个工具」仍未确认**，但**效果已经确证**：Zen 的 142 条 pref 确实进了包。

# 二、附带发现：两处 **Zen 品牌残留**（我们的贴牌遗漏）

## 残留 1：`zen.injections.match-urls`（**而且是 locked 的**）

产物 `firefox.js` 里原文：

```
pref("zen.injections.match-urls", "https://zen-browser.app/*", locked);
```

来源：`prefs/zen/mods.yaml` L17-L18：

```yaml
- name: zen.injections.match-urls
  value: "https://zen-browser.app/*"
```

**两个问题**：

```
1. 它是【Zen 的域名】—— 我们的产品不该往 zen-browser.app 注入东西
2. 它带 locked —— 【用户改不了】，我们也没法用运行时覆盖
```

## 残留 2：`share.zen-browser.app`

来源：`prefs/zen/share.yaml` L6：

```yaml
value: "https://share.zen-browser.app"
```

## 为什么之前没发现

```
· 我们的贴牌清单只查了【源码树里的字符串】
· 这两处藏在 prefs/*.yaml 里，而那份清单没把 prefs/ 列进去
· 而且 check.sh brands 只扫【我们改过的文件】
  —— prefs/zen/mods.yaml 是上游文件，我们没改过，所以不扫
```

**这正是「读产物」才能发现的类型错误**（和之前那个安装器贴牌同一类）。

# 三、要做的修复

```
1. 覆盖 prefs/zen/mods.yaml —— 改 zen.injections.match-urls 的值
   （改成什么？见下）
2. 覆盖 prefs/zen/share.yaml —— 改 share 的域名
3. 把 prefs/ 加进贴牌残留的检查范围
```

## `zen.injections.match-urls` 应该改成什么？

**这是个需要决策的问题，我不能替产品定。** 三个候选：

```
a) 改成我们自己的域名（如果我们有对应的 mods 服务）
b) 改成空（禁用注入功能）—— 但我们可能不想禁用整个 mods 系统
c) 保持不动（如果它只影响 mods 的可用域名，且我们不用 mods）
```

**注意**：它是 `locked` 的，说明 Zen 认为这条很重要。
**改它之前要先搞清 `zen.injections` 是干什么的**（可能是 mods 系统的域名白名单）。

# 四、更新：prefs 相关的写法（修正之前工作项里的说法）

之前我在两份工作项里写「需要 pref 就写 prefs/zen/*.yaml」，并打了问号。
**现在可以确认了：那条是对的**（Zen 的 pref 确实通过 prefs/*.yaml 走）。

但仍有一条**未确认**：

```
❓ 到底是哪个工具把 prefs/*.yaml 合进 firefox.js
   —— 这个还没找到（但效果已确证）
```

# 五、check.sh 应该加一条检查

**把 prefs/ 纳入品牌残留检查范围。**

现在的 `check.sh brands` 只扫【我们改过的文件】（用 base-kokoa tag 算 delta），
而 `prefs/zen/mods.yaml` 是上游文件，**不在 delta 里，所以不扫**。

应该改成：**扫描固定的产品路径**（src/、locales/、configs/、prefs/），
不管它是不是我们改过的 —— 因为我们要保证的是【产品里没有 Zen 品牌】，
而不是「我们改过的文件里没有」。

