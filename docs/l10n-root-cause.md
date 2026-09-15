# 根因：CI 跳过了 `download-language-packs.sh`（2026-09-15）

## 结论

**菜单文字缺失 / Zen 文案缺失的根因：CI 构建时跳过了 `scripts/download-language-packs.sh`。**

**这是我在工单里写错的建议 —— 我曾写「这一步可以先跳过，省时间」。**
它【不能跳过】。

## 证据链

### 1. 产物里确凿的差异

```
我们的 browser/omni.ja    12906 个条目
官方 Zen 的 browser/omni.ja 13393 个条目
差集：533 个文件，【全部是 zen-* 的】（如 localization/zh-CN/browser/zen-command-palette.ftl）
```

Firefox 自带的 appMenu 文案一个都没缺：

```
localization/en-US/browser/appmenu.ftl   存在
localization/zh-CN/browser/appmenu.ftl   存在
```

### 2. 谁负责把 Zen 文案放进产物

`package.json` 里有专门的脚本：

```
"sync:l10n": "python3 scripts/update_ff.py --just-l10n"
```

`scripts/download-language-packs.sh` 是主流程，它做三件事：

```
L72-74   for lang in $(cat ./locales/supported-languages); do
           update_language $lang       # 从 mozilla-l10n/firefox-l10n 拉上游翻译
         done

L79-82   python3 scripts/copy_language_pack.py en-US
         for lang in $(cat ./locales/supported-languages); do
           python3 scripts/copy_language_pack.py $lang
         done

L90-93   for lang in ...; do
           find ./locales/$lang -type f -not -name "zen*" -delete   # 只留 zen* 的
         done
```

### 3. 真正的搬运脚本

`scripts/copy_language_pack.py`：

```
BROWSER_LOCALES = "engine/browser/locales"      # L10

def copy_browser_locales(lang_id):
  lang_code = get_language_code(lang_id)
  lang_path = os.path.join(BROWSER_LOCALES, lang_code)
  ...
  source_path = f"./locales/{lang_id}/"             # L61
  copy_files(source_path, lang_path)                 # 复制到 engine/
```

**它把仓库里的 `locales/<lang>/` 复制到 `engine/browser/locales/<lang_code>/`，
Firefox 构建时再从这里打进 `omni.ja` 的 `localization/`。**

## 因果链

```
CI 跳过了 download-language-packs.sh
  -> copy_language_pack.py 没跑
  -> locales/<lang>/ 的内容没被搬到 engine/browser/locales/
  -> Firefox 构建时不知道有这些文件
  -> omni.ja 里少了 533 个 zen-* 文案
  -> （可能连带影响 Fluent 资源组的加载，导致菜单文字也不显示）
```

## 修法

**把这一步加回 CI workflow。** 位置：在 `Import` 之后、`Bootstrap` 之前（或之后，
取决于它是否依赖 engine/ 存在 —— 它写 engine/browser/locales/，所以必须在 engine/ 建好之后）。

```
- name: Download language packs（**不能跳过**）
  run: sh scripts/download-language-packs.sh
```

⚠️ **注意**：这个脚本会 `git clone https://github.com/mozilla-l10n/firefox-l10n`
（完整克隆，不是浅克隆），而且要 `git checkout $LAST_FIREFOX_L10N_COMMIT`。
它会显著增加构建时间与磁盘占用 —— 需要重新测量。

同时它依赖 `./build/firefox-cache/l10n-last-commit-hash` 这个文件存在。
要确认它是否在仓库里，还是也需要先生成。

## 待确认（**未验证**）

```
❓ 这两条都还没验证，不要当结论：

1. 菜单文字缺失是否真的是这个原因？
   目前只证明【Zen 文案缺失 = 这一步没跑】。
   但菜单文字（appMenu 的 Firefox 自带文案）在包里是【存在】的。
   两者可能无关，也可能有关（Fluent 资源组机制）。
   【需要用一次含这一步的构建来验证】

2. build/firefox-cache/l10n-last-commit-hash 在不在仓库里？
   如果不在，脚本会在 L23 `cat` 时失败。
```

## 我的错误

我在给分支线的工单（`docs/kokoa-fork-briefing.md`）里写过：

```
"7. sh scripts/download-language-packs.sh   <- 可以先跳过，省时间"
```

**这是错的，已造成实际后果。** 当时的判断依据是「先只要能编出动二进制」，
但没考虑到这个脚本还负责【把 Zen 自己的文案搬进构建】—— 那不是可选的。

已修正工单。
