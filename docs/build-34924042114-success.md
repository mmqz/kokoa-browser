# ★ 构建 34924042114 成功 —— 关键修复已验证

| | |
|---|---|
| 结论 | **success** |
| 耗时 | **2h57m14s**（3:11:34 → 6:08:48 UTC） |
| 产物 | `kokoa-win64-build`，**495.4 MB**（上次 468.7 MB，大了 26.7 MB）|
| 前置步骤 | 22 步全绿 |

**产物变大 26.7 MB —— 那正是加回来的 language packs。**

---

# 一、language packs 修复：**已验证生效**

## 证据 A：日志里能看到它在复制 zen-*.ftl

```
L72863  Copying ./locales/en-US/browser/browser/zen-split-view.ftl to engine/browser/locales/en-US/...
L72864  Copying ./locales/en-US/browser/browser/zen-menubar.ftl to ...
L72866  Copying ./locales/en-US/browser/browser/zen-live-folders.ftl to ...
L72871  Copying ./locales/en-US/browser/browser/zen-vertical-tabs.ftl to ...
L72872  Copying ./locales/en-US/browser/browser/zen-folders.ftl to ...
L72873  Copying ./locales/en-US/browser/browser/zen-command-palette.ftl to ...
```

**这正是 `copy_language_pack.py` 在把 Zen 的文案搬进构建。**

## 证据 B：我加的校验输出

```
en-US: 13 个 zen*.ftl
zh-CN: 14 个 zen*.ftl
de:    14 个 zen*.ftl
fr:    14 个 zen*.ftl
```

**之前是 0 个**（因为跳过了那一步）。现在是 13-14 个。

> 这条校验是我在加回那一步时顺手写的（`for L in en-US zh-CN de fr; do find ... -name 'zen*.ftl'`），
> **它当时就起作用了 —— 不用等产物下载完就能确认修复生效。**

# 二、贴牌：**至少部分生效**

日志里出现过：

```
00:00:00 Bootstrapping Kokoa Browser...
```

**不是 "Zen Browser"** —— 说明 `surfer ci --brand` 与我们的贴牌改动在起作用。

> 但 PE 元数据（`CompanyName`）与 `application.ini` 的逐字段结果**要等产物**。

# 三、还没验证的（**等产物下载完**）

```
1. omni.ja 的条目数（应从 12906 涨到接近官方 Zen 的 13393）
2. zen-*.ftl 在 omni.ja 里是否真的有（不只是在构建目录里）
3. kokoa.exe 的 CompanyName 是否变成 Kokoa
4. installation 的 ProductName 是否变成 Kokoa
5. application.ini 的 Profile 是否变成 kokoa（验证我那处改动）
6. 【重要】产物贴牌检查那一步【这次没跑】（workflow 是在构建触发后才更新的）
   -> 要等下一次构建
   -> 但我会手动读产物做同样的检查
```

# 四、一个流程教训

**我加 CI 步骤的时机，与它生效的时机之间有一轮构建的延迟。**

```
我改 workflow -> 提交 -> 【触发构建】 -> 构建跑完
                    ^^^ 这一轮用的是改之前的 workflow
```

所以：**改 workflow 之后要重新触发，才能让新步骤生效。**
这次我改完 workflow（06c2431）之后没有重新触发，
而那次构建（34924042114）是在更早的 8c91275 触发的。
