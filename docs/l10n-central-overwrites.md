# ⛔【本文结论已撤回】

> **2026-09-15 更正：本文的结论是错的。**
>
> 我说「l10n-central 覆盖了我们的 kokoa 文案」—— **实际没有**。
> 包里的 `localization/en-US/browser/zen-general.ftl` **确实包含**
> `kokoa-open-ai-workspace-button`（5413 字节 / 164 行）。
>
> **错因**：我的解析脚本 bug —— 在本地文件头找条目、却从中央目录读 csize，
> 两者差 6 字节导致读出错误内容（69 字节 / 1 行）。
> 而且我【没有怀疑那个明显不合理的结果】，还据此编出了一个因果链。
>
> **见**：`docs/CORRECTION-l10n-not-overwritten.md`
>
> **本文以下内容保留，仅作为「一个错误推断的样本」——不要采信其结论。**

---

# ★ 新发现：l10n-central 步骤会覆盖我们的文案

> 2026-09-15。验证构建 34924042114 的产物时发现。

---

# 一、好消息：533 个 zen-*.ftl 回来了

```
新产物 browser/omni.ja  13439 条目  其中 zen*.ftl 533 个
旧产物 browser/omni.ja  12906 条目  其中 zen*.ftl   0 个
官方 Zen                 13393 条目
```

**`533` 正好是之前缺失的数字。language packs 修复完美生效。**
（比官方 Zen 多 46 个条目 —— 那是我们的其它改动）

# 二、坏消息：我们的 kokoa 文案被覆盖了

## 现象

```
包里的 localization/en-US/browser/zen-general.ftl
  -> 是 Zen 的原始版本，【不含】我们的 kokoa-open-ai-workspace-button

我们仓库里那份（locales/en-US/browser/browser/zen-general.ftl L77-80）：
  ## Kokoa
  kokoa-open-ai-workspace-button =
      .label = AI Workspace
      .tooltiptext = Open Kokoa AI Workspace

包里那份（5419 字节）从第 1 行就是 zen-panel-ui-current-profile-text，
【完全没有我们的文案】
```

## 根因：Firefox 构建会自己拉 l10n-central

CI 日志里的决定性证据（L92125）：

```
00:02:01 Ensuring that the l10n-central repository exists and is up to date.
00:02:01 Processing chrome Gecko resources for locales
         ['ar','bg','bs','ca','cs','cy','da','de','el','en-GB',...,'zh-CN','zh-TW']
```

## 完整因果链

```
1. copy_language_pack.py（我们加的 language packs 步骤）
     把 locales/<lang>/ 复制到 engine/browser/locales/<lang>/
     -> 此时 engine 里【有】我们的 kokoa 文案

2. Firefox 构建的 l10n-central 步骤
     【重新拉取上游翻译】并处理 chrome 资源
     -> 覆盖了 engine/browser/locales/**

3. 结果
     · 533 个 zen-*.ftl 进了包  <- 来自 l10n-central（上游 Zen 的翻译）
     · 我们的 kokoa 文案【丢了】 <- 被覆盖
```

## 为什么 533 个还是回来了

**因为上游 l10n-central 里本来就有 Zen 的翻译**（`mozilla-l10n/firefox-l10n` 收录了 Zen 的 ftl）。

所以「加回 language packs 步骤」**修好了 Zen 文案缺失**（那 533 个回来了），
**但没有保住我们自己的新增文案**。

# 三、要修什么

## 问题：我们的新增文案怎么才能进包？

**候选方案**（**都未验证**，需要实验）：

```
a) 把我们的文案放进【构建后不会被覆盖】的位置
   例如：不走 engine/browser/locales/，而走我们自己的 jar.mn + chrome:// 路径

b) 在 l10n-central 步骤【之后】再复制一次
   即在 workflow 里把 language packs 步骤挪到 Build 之前【紧邻】的位置
   （但现在它已经在 Bootstrap 之前了，而 l10n-central 在 Build 里 —— 难插）

c) 不用 ftl，直接把文字写进 XUL（不推荐：失去多语言能力）

d) 查 Zen 自己是怎么加新文案的 —— 它的 locales/ 也有 zen-*.ftl，
   而且那些【确实进了包】（533 个在里面）。说明 Zen 的流程是有效的。
   【应该去看 Zen 的 CI 里 l10n 是怎么组织的】
```

**我倾向 (d) —— 先查上游怎么做，而不是自己发明。**
这正是之前踩过的教训（应该先搜既有实现）。

# 四、一个讽刺的发现

**我加的 language packs 步骤，解决了「Zen 文案缺失」，**
**但同时暴露出「我们的新增文案会被上游覆盖」这个问题。**

如果不加那一步，我们的文案可能反而在包里（因为没有 l10n-central 覆盖？）——
**但这只是猜测，未验证。**而且那样会丢 533 个 Zen 文案，得不偿失。

# 五、影响与优先级

## 影响

```
· AI 工作区工具栏按钮的【标签与提示文字】显示不出来
  （因为 kokoa-open-ai-workspace-button 这个 l10n id 没有定义）
· 按钮本身在（TASK-04 的产物检查显示 toolbar_button=created）
· 但用户看到的是一个没有文字/提示的按钮
```

## 优先级

**中 —— 不影响功能（按钮能点），但影响可用性（用户不知道那是什么）。**

## 与其它问题的关系

我们之前看到的「三个点菜单文字全缺失」是另一个问题（Firefox 自带文案），
**那个已经修好了**（533 个 ftl 回来了）。
**这个是「我们自己的新文案」的问题，规模小得多。**

# 六、待验证

```
❓ Zen 是怎么让自己的 zen-*.ftl 进包的？
   （它的 locales/ 也有这些文件，而且确实在包里）
❓ 我们的 kokoa 文案为什么没进 —— 是【被覆盖】还是【根本没复制进去】？
   目前只证明「包里没有」，没证明覆盖发生的具体机制
❓ 有没有构建后复制的位置（在 l10n-central 之后）
```
