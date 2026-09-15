# 秒级静态检查（`scripts/check.sh`）

## 为什么需要它

完整构建的代价是 **~2h53m**（GitHub 4 vCPU 免费 runner，Linux→Windows 交叉编译）。
**不可能改一行就排一次构建** —— 那会让人不敢改代码，或者一次改一大批然后一起赌。

但大量错误根本不用等构建：

```
能秒级查出来的              必须等构建才知道的
─────────────────────      ─────────────────────
语法错误                   语义错误（能跑但结果不对）
JSON/JSONC 格式错误         运行时异常
引用不存在的文案键          布局是否正确
pref 形态 build.py 解析不了  界面是否真的出现
品牌字样泄漏                性能
```

所以：**改完先跑 check.sh，通过再排构建。**

## 用法

```
bash scripts/check.sh              # 全跑（约 40 秒）
bash scripts/check.sh syntax       # 只查语法（约 30 秒，最常用）
bash scripts/check.sh json         # JSON / JSONC
bash scripts/check.sh prefs        # kokoa.js 的 pref 形态
bash scripts/check.sh l10n         # 本地化键
bash scripts/check.sh brands       # 品牌残留
```

失败时退出码为 1，可直接接进 CI。

## 它查什么

| 检查 | 方法 | 代价 |
|---|---|---|
| **语法** | node --check，并行（xargs -P），覆盖 src 下全部 .mjs/.js | 698 文件 / ~30 秒 |
| **JSON** | JSON.parse；tsconfig.json 按 **JSONC** 处理（剥注释再解析） | 瞬间 |
| **prefs** | kokoa.js 里每条 pref 的形态必须是 bool/int/string —— 否则 build.py 会**静默跳过** | 瞬间 |
| **l10n** | 每个 data-l10n-id 都要在 locales/en-US 的 .ftl 里有定义 | 瞬间 |
| **品牌** | 产品路径下不该出现上游品牌（**但署名语句除外**，见下） | 1.6 秒 |

## 设计上的两个关键决定

### 1. 区分「我们的回归」与「上游既有问题」

**上游 Zen 自己就有 3 个 data-l10n-id 没有 en-US 定义**：

```
preferences-web-appearance-footer   <- src/browser/components/preferences/zenLooksAndFeel.inc.xhtml
tabs-toolbar                        <- src/browser/base/content/zen-sidebar-icons.inc.xhtml
zen-boost-magic-theme               <- src/zen/boosts/zen-boost-editor.inc.xhtml
```

这些**不是我们造成的**。如果把上游的问题也算作失败，检查就会一直红着，
**久了就没人看了** —— 那比没有检查更糟。

所以：我们自己路径（src/zen/kokoa/）下的缺键 → **FAIL**；上游的 → **WARN**。

### 2. 区分「品牌泄漏」与「必需的署名」

**带署名语境的行是要留的** —— MPL-2.0 与诚实都要求致谢上游。例如：

```
build/AppDir/zen.desktop:3
  Comment=AI workspace and the web, side by side. Based on Zen Browser and Firefox.
```

这**不该**被判为品牌残留。检查会跳过含 based on / derived from / thanks /
licensed / MPL / 上游 URL 的行。

> 同理，**docs/ 一律不扫** —— 文档里谈论上游 Zen 是正常且必要的
> （同步流程要指向上游仓库、残留清单要列出对照）。

## 已知豁免

```
src/zen/tests/mochitests/sessionstore/unit/data/sessionstore_invalid.js
src/zen/tests/mochitests/sessionstore/unit/data/sessionstore_valid.js
```

这两个是**故意损坏的测试 fixture**（文件名就写着 invalid/valid），node --check 必然失败。

## 它【不能】替代构建

**它查不出**：语义错误、运行时异常、界面是否真的出现、布局是否正确、性能。

**它只是把「改一行要不要排构建」这个问题，变成「改一行先跑 30 秒检查」。**
真正的验收仍然要构建 + 截图 + 探针。

## 调试这个脚本时踩过的坑（供后来者）

```
1. grep -c 在文件为空时【输出 0 且退出码为 1】，
   写 `|| echo 0` 会得到 "0\n0" 两个值 —— 用 `| head -1` 兜底。
2. 串行跑 698 次 node 要 ~85 秒；改成 xargs -P 并行后降到 ~30 秒。
3. case 模式 */docs/* 匹配不到 docs/xxx.md（缺前导目录）——
   应该用 docs/* ，或直接按白名单放行产品路径。
4. tsconfig.json 是 JSONC（带注释），严格 JSON.parse 会失败 —— 要先剥注释。
5. 【最重要】误报的检查比没有检查更糟：
   每次都红、每次都要人肉判断「这个红是不是真的」，久了就没人看了。
   **每一条 FAIL 都必须是真问题。** 宁可把上游既有问题降为 WARN。
```
