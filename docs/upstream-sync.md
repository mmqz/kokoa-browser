# 上游同步流程（重要 —— 先读「为什么」再照做）

## 一、为什么我们的仓库没有 Zen 的历史

**这不是疏忽，是被 GitHub 的推送上限逼出来的。**

我们试过接完整历史（`git merge --allow-unrelated-histories upstream/dev`，本地完全成功，
15 个文件 delta、0 冲突），但**推不上去**：

```
Writing objects: 100% (72564/72564), 5.62 GiB | 28.11 MiB/s, done.
fatal: the remote end hung up unexpectedly
```

**连续两次、失败点完全相同**（都是 100% 写完对象之后被掐断）→ 不是网络抖动，
是 GitHub 拒收 5.62 GiB 的单次推送。Zen 自己没事，是因为它每次只推小增量；
我们是**一次性灌入它的全部历史**。

| | 体量 |
|---|---|
| 现在远端仓库 | **27 MB** |
| 接上 Zen 完整历史后 | **约 5.8 GB**（涨 200 倍） |

**所以我们的仓库采用「上游快照 + 我们的 delta」的孤儿结构，每次同步重建。**
代价是没有 `git merge` 的历史；收益是仓库小、推送可靠、delta 清楚可算。

---

## 二、我们的 delta 是什么

相对**上游 Zen 的提交**，我们改动过的文件。**随时可以这样算出来**：

```
git diff --name-only base-zen-<上游SHA前7位> main
```

> ⚠️ **基线 tag 必须打在【Zen 的提交】上，不能打在我们的快照根上。**
> 我们的快照根（`5f1b419`）里**已经包含**了 `README.md` 与 `docs/overnight-sprint.md` 的替换，
> 拿它当基线会少算这两个文件（算出 13 而不是 15）。**这是一个真实踩过的坑。**

截至建立本文件时（基线 `4980f3ce1`）是 **15 个文件**，分三类：

| 类别 | 文件 |
|---|---|
| **贴牌** | `surfer.json`、`configs/common/mozconfig`、`build/AppDir/zen.desktop`、`README.md` |
| **Kokoa 自有 UI** | `src/browser/base/content/zen-commands.inc.xhtml`、`src/zen/common/zen-sets.js`、`src/zen/common/sys/ZenCustomizableUI.sys.mjs`、`src/browser/themes/shared/zen-icons/icons.css`、`locales/en-US/…/zen-general.ftl`、`locales/zh-CN/…/zen-general.ftl` |
| **工程/CI/文档** | `.github/workflows/probe-zen-cross-build.yml`、`docs/how-to-add-kokoa-ui.md`、`docs/kokoa-zen-residuals.md`、`docs/sprint-report.md`、`docs/overnight-sprint.md` |

**这三类文件，就是我们以后唯一会跟上游冲突的地方。**

---

## 三、一次性准备

```
git remote add upstream https://github.com/zen-browser/desktop.git
git fetch upstream dev
```

> ⚠️ **坑 1**：加了 `upstream` 之后，在这个目录里跑 `gh` 会认错仓库
> （它按 remote 解析，会认成 zen-browser/desktop）。
> **一律显式加 `--repo tomjiu/kokoa-browser`。**
>
> ⚠️ **坑 2 —— 基线 tag 绝对不要 push。**
> 基线 tag 指向的是 **Zen 的提交**，推送它等于要求远端拥有 Zen 的历史，
> 于是又变成第一节那个 5.62 GiB 的推送，**必然失败**（实测报 `RPC failed; HTTP 500`）。
> 基线 tag 是**纯本地工具**，只用来算 delta。
>
> ```
> git push origin main          # ✅ 只推分支
> git push --tags               # ❌ 会带上指向 Zen 历史的 tag，必挂
> ```

---

## 四、每次 Zen 发新版后的同步流程

```
# 1. 拉上游
git fetch upstream dev
git log --oneline -1 upstream/dev            # 记下新的上游 SHA

# 2. 以新上游快照做孤儿根（树 = 上游最新，无父提交）
git checkout --orphan sync upstream/dev
git commit -m "base: zen-browser/desktop@<新SHA>"

# 3. 把我们的 delta 提交逐个重放上去
git rev-list --reverse <基线tag>..main       # 先列出要重放的提交
git cherry-pick <上面列出的提交>

# 4. 打新基线 tag，换 main，强推
git tag base-zen-<新SHA前7位>
git branch -M main
git push --force origin main
```

**冲突只会出现在第二节那 15 个文件里。** 别的文件两边一致，不可能冲突。

---

## 五、本仓库【不保存】Zen 的历史（2026-09-15 的决定）

早先本地曾抓过 Zen 的完整历史（`.git` 一度涨到 **5,818 MB**，而我们的源码工作树只有 **39 MB**），
用来做了一次真实合并以验证 delta 干净。**现已删除。**

**理由**：我们**用不上**。要看上游，GitHub 上随时能看
（https://github.com/zen-browser/desktop）；真要合并时再按需抓即可。

**删除前的记录**（删掉就查不到了，故存于此）：

```
上游当时 HEAD   upstream/dev = 644bf48b6cc4e41f62f39adecd877b0d248e9cab
  其最近 3 个提交（即我们基线 4980f3ce1 之后的全部）：
    644bf48b6  gh-13196: Fixed sidebar not hiding if the urlbar is open (gh-15403)
    d2acc61a8  gh-15402: Add archived:false to github live folder queries (gh-14854)
    f84278317  gh-15400: Fixed duplicate "paste and go" items (gh-15401)
我们的基线             4980f3ce18bfc5904f5c884f122062e9b3960f96
```

**那次合并的结论（重要 —— 这是 delta 干净的唯一证明）**：

15 个文件 delta，**双方都改的文件 = 0 个**。我们会改的与上游会改的**完全不重叠**：
10 个只有我们改（取 ours）、9 个只有 Zen 改（取 theirs），**无一处需要人工判断**。

**推论**：上游那 3 个提交改的 9 个文件
（`ZenUIManager.mjs`、`styles/zen-browser-{container,ui,theme}.css`、`ZenCompactMode.mjs`、
`ZenDragAndDrop.js`、`GithubLiveFolder.sys.mjs`、`vertical-tabs.css`、
`tests/live-folders/browser_github_live_folder.js`）
**目前还没进我们的树** —— 等下次同步会一并带进来。

> `.git` 里保留 `upstream` 这个 remote **配置**（几行 URL，不占空间）。
> 需要时 `git fetch upstream dev` 即可，用完再删。

---

## 六、想在本地先看冲突（可选）

本地**默认不保留**上游历史（第五节）。要预演冲突就**临时抓一份、用完删掉**：

```
git fetch upstream dev                    # 约 5.6 GB，几分钟
git checkout -b merge-preview main
git merge --allow-unrelated-histories upstream/dev
# 看冲突 → 记录结论（冲突只会出现在第二节那 15 个文件里）
git checkout main && git branch -D merge-preview
git update-ref -d refs/remotes/upstream/dev
git reflog expire --expire=now --all && git gc --prune=now
```

**注意两点**：
1. 这样合出来的提交【**推不上去**】（就是第一节那个 5.62 GiB），只用来**看冲突**。
2. 看完**务必删干净**（最后两行），否则 `.git` 会一直停在 5.8 GB。

> **一次性收益**：这个预演**做过一次**（`upstream/dev@644bf48b6`，0 冲突，
> 结论见第五节）。所以**不是每次同步都要做** —— 只有当你怀疑 delta 与上游撞车时才值得，
> 平时直接走第四节的 cherry-pick 就够，冲突会在 cherry-pick 时自然暴露。

---

## 七、判断同步是否成功

```
git log --oneline -1                    # 应是我们的最新提交
git diff --name-only <新基线tag> main    # 应还是那 15 个文件（数量只增不减，且都是我们的）
git merge-base --is-ancestor <新基线tag> main ; echo $?   # 0 = 基线是我们的祖先
```

最后一条是关键：**新基线必须是 main 的祖先**，否则说明 delta 没重放干净。
