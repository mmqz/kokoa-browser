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

## 五、想在本地先看冲突（推荐）

本地**保留着 Zen 的完整历史**（约 5.8 GB，在 `E:\Code\ai\kokoa-browser\.git`），
所以可以在推送前做一次真实的合并来预演冲突：

```
git fetch upstream dev
git checkout -b merge-preview main
git merge --allow-unrelated-histories upstream/dev
# 看冲突 → 解决 → 记录结论
git checkout main && git branch -D merge-preview
```

**注意：这样合出来的提交【推不上去】**（就是第一节那个 5.62 GiB）。
它只用来**看冲突**，看完就扔。真正的同步还是走第四节。

> 已存一例：分支 `lab/upstream-merged`（合并了 `upstream/dev@644bf48b6`，0 冲突）。
> 它**只在本地**，没有也不该推到远端。

---

## 六、判断同步是否成功

```
git log --oneline -1                    # 应是我们的最新提交
git diff --name-only <新基线tag> main    # 应还是那 15 个文件（数量只增不减，且都是我们的）
git merge-base --is-ancestor <新基线tag> main ; echo $?   # 0 = 基线是我们的祖先
```

最后一条是关键：**新基线必须是 main 的祖先**，否则说明 delta 没重放干净。
