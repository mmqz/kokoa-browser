# ★ 贴牌残留完整清单（17 处）—— 比之前估计的大得多

> 2026-09-15。通过两个手段发现：
>   1. 从【构建产物】反推（`omni.ja` 里的 `defaults/preferences/firefox.js`）
>   2. 修正 `check.sh brands` 的两处缺陷后重扫

---

# 一、两个发现手段（都可复用）

## 手段 1：从产物反推

解包 `browser/omni.ja` 里的 `defaults/preferences/firefox.js`（1869 行），
搜 `zen`：**142 条 Zen 的 pref 在里面**。

**这一下解决了两个悬案**：

```
1. prefs/*.yaml 的机制：它的内容【被合并进了 firefox.js】
   （之前搜引用搜不到，因为合并在构建期做，不在仓库里留痕）

2. 顺手发现两处品牌残留：
     pref("zen.injections.match-urls", "https://zen-browser.app/*", locked);
     share 的域名 share.zen-browser.app
```

## 手段 2：修正 check.sh brands 的两处缺陷

**缺陷 1：正则写窄了**

```
原：'zen browser|heyzen|zen-browser/desktop'
    -> 只匹配 zen-browser/desktop，【漏了 zen-browser.app 这类域名】
新：'zen browser|heyzen|zen-browser[./]|zen\.browser\.app'
```

**缺陷 2：排除规则太宽**

```
原：... | grep -viE '...|https?://|...'
    -> 把【所有 URL】当署名跳过 —— 而品牌泄漏恰恰常在 URL 里
新：去掉 https?://，只在真正有署名语境词时才跳过
    （保留：based on / derived from / thanks / licensed / MPL / upstream / 上游 / 致谢
      另加：repos/zen-browser / github.com/zen-browser / githubusercontent）
```

**修正后立刻多抓出 15 处。**

# 二、完整清单（17 处）

## A. 影响功能或身份（**优先修**）

| # | 文件 | 内容 | 影响 |
|---|---|---|---|
| 1 | `src/build/moz-build.patch` | `MOZ_APPUPDATE_HOST = updates.zen-browser.app` | **更新服务器指向 Zen** |
| 2 | `src/zen/mods/ZenMods.mjs:323` | `zen-browser.github.io/theme-store` | **主题商店指向 Zen** |
| 3 | `src/browser/base/content/aboutDialog-xhtml.patch` | `zen-browser.app/about` + `privacy-policy` | **关于页链接** |
| 4 | `src/security/mac/hardenedruntime/production/firefox-browser-xml.patch:10` | `9V5K9TP787.app.zen-browser.zen` | **macOS 签名标识** |
| 5 | `src/browser/installer/windows/nsis/uninstaller-nsi.patch` | `links.zen-browser.app/uninstall-feedback` | 卸载调查指向 Zen |
| 6 | `src/browser/components/preferences/zenMarketplace.inc.xhtml:20` | `zen-browser.app/mods/` | 市场链接 |

## B. pref 里的（会被合并进产物，且可能 locked）

| # | 文件 | 内容 | 影响 |
|---|---|---|---|
| 7 | `prefs/zen/mods.yaml:18` | `https://zen-browser.app/*` | 注入白名单，**locked** |
| 8 | `prefs/zen/share.yaml:6` | `https://share.zen-browser.app` | 分享域名 |

## C. 链接与文案

| # | 文件 | 内容 |
|---|---|---|
| 9 | `src/zen/common/modules/ZenUpdates.mjs:40` | `zen-browser.app/donate` |
| 10 | `src/zen/common/sys/ZenUIMigration.sys.mjs:147` | `docs.zen-browser.app/user-manual` |
| 11 | `locales/pt-BR/browser/browser/preferences/zen-preferences.ftl:266` | `Sair do Zen Browser`（**葡语未贴牌**） |
| 12 | `src/zen/space-routing/ZenSpaceRoutingDialog.mjs:314` | `zen-browser.app`（placeholder） |

## D. 低优先（构建脚本 / 测试数据）

| # | 文件 | 内容 |
|---|---|---|
| 13 | `build/windows/sign.ps1:219` | `zen-browser/windows-binaries` |
| 14-17 | `src/zen/tests/` 下 4 个测试文件 | `zen-browser.app` / `zen-browser/desktop` |

# 三、与之前发现的合并

之前（读产物元数据）发现的两处：

```
kokoa.exe            CompanyName = Mozilla Corporation
kokoa.installer.exe  ProductName = Firefox / CompanyName = Mozilla
```

**加上这次的 17 处，贴牌残留共 19 处。**
之前那份 `docs/kokoa-zen-residuals.md` 只列了 4 处 —— **严重不完备**。

# 四、为什么之前的清单漏了这么多

```
1. 只查了【源码树里的字符串】，没查产物
   -> 漏了 CompanyName / 安装器（这两个读源码树找不到）

2. 查源码树时，正则只写 zen-browser/desktop，漏了 zen-browser.app
   -> 漏了 15 处（大多是域名）

3. 排除规则把 https?:// 当署名跳过
   -> 连 json 里已经命中的 URL 也被过滤掉了
```

# 五、教训

**「我们改了 N 个文件」不等于「产品里没有残留」。**

要保证的是【产物里没有 Zen 品牌】，所以要：

```
1. 扫【固定的产品路径】（src/ locales/ configs/ build/ prefs/ tools/）
   而不是「我们改过的文件」—— 上游文件同样会进产品
2. 正则要覆盖品牌的所有形态：名称、域名、仓库路径
    zen browser / heyzen / zen-browser.app / zen-browser/desktop / zen-browser.github.io
3. 排除规则只跳【真署名】，不要跳 URL
4. 【还要读产物】—— 有些残留只在产物里（CompanyName、安装器）
```

# 六、修复的优先级建议

```
必改（影响功能/身份）：
  A 组 6 处 —— 尤其 1（更新服务器）与 4（macOS 签名）
B 组 2 处 —— 尤其 7 是 locked 的，用户改不了
文案 1 处 —— 葡语（可能还有别的语言）
低优先：
  13-17 —— 构建脚本与测试数据，不影响产品行为
```

**注意：修 A 组第 1 条（MOZ_APPUPDATE_HOST）要慎重** ——
改错了会导致更新功能失效。要先确认我们打算用哪个更新服务器。
（目前 `surfer.json` 设的是 `updateHostname: "updates.kokoa.local"`）
