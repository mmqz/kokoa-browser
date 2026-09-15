# 贴牌残留：两边独立调研的交叉验证（2026-09-15）

> 我和外部代理**各自独立**查了同一件事。
> **结论不完全一致 —— 它的更深，我的更浅。下面如实记录差异。**

---

## 一致的部分

| 项 | 双方结论 |
|---|---|
| CompanyName 来自 Firefox 品牌机制，不是 surfer.json | ✅ 一致 |
| surfer.json 的 brands.* 只管显示名（ProductName 因此是对的） | ✅ 一致 |
| 安装器有**独立的** branding，完全没被贴牌 | ✅ 一致 |

## 不一致的部分（**它是对的，我的更浅**）

### 我的结论（较浅）

```
根因文件 = browser/branding/official/branding.nsi
  !define CompanyName "Mozilla Corporation"
修法 = 在 src/ 下覆盖这个文件
```

### 它的结论（更深，**推翻了我的修法**）

```
1. surfer 的 branding-patch.ts 的 configureBrandingNsis() [会生成] branding.nsi，
   其中 !define CompanyName "${brandingConfig.brandingVendor}"
   brandingVendor 来自 config.vendor（= surfer.json 的 vendor: "Kokoa"）
   => surfer [本来就会] 把它生成成 Kokoa

2. 但同文件的 copyMozFiles() 会先从 engine/browser/branding/unofficial/
   复制 Firefox 自带的文件[覆盖]掉生成结果

3. 主程序 PE 资源的 CompanyName 实际来自 MOZ_APP_VENDOR
   （toolkit/moz.configure 的 project_flag）
   而我们的 configs/common/mozconfig 在 ZEN_RELEASE 分支下会 export
   MOZILLA_OFFICIAL=1，让 Firefox 走 official branding 路径，
   从而把 MOZ_APP_VENDOR 覆盖成 Mozilla Corporation

4. 它还发现了一个我们[漏掉的 Zen 残留]：
   src/toolkit/moz-configure.patch L8-L9
     project_flag(env="MOZ_APP_VENDOR", + default="Zen Team", ...)
   这是 Zen 上游的品牌，我们的贴牌从来没改到它。
```

**所以正确的修法不是覆盖 branding.nsi（会被 copyMozFiles 覆盖），而是：**

```
a) configs/common/mozconfig 里显式 export MOZ_APP_VENDOR="Kokoa"
b) src/toolkit/moz-configure.patch 的 default="Zen Team" -> "Kokoa"
c) 安装器：AppName / BrandProductName 在 defines.nsi.in 里[硬编码 "Firefox"]，
   surfer 的 branding 生成[完全不碰这两个 define]
   ProductName 取 BrandShortName <- @MOZ_APP_DISPLAYNAME@
   Firefox official 的 MOZ_APP_DISPLAYNAME=Firefox
```

> **它明确把 (c) 标为【我认为】**，并提出了两种可能。这是正确的纪律。

## 它的一个质疑，我已核实：**质疑被排除**

它怀疑：「读错了文件」—— 交接文档里同时有 kokoa-0.1.0t.en-US.win64.installer.exe
和 kokoa.installer.exe，可能徽标不同。

**核实结果：4 个 installer 文件的版本资源完全相同。**

```
kokoa-0.1.0t.en-US.win64.installer-stub.exe   0.4 MB   ProductName=Firefox  CompanyName=Mozilla
kokoa-0.1.0t.en-US.win64.installer.exe      101.5 MB   ProductName=Firefox  CompanyName=Mozilla
kokoa.installer.exe                          101.5 MB   ProductName=Firefox  CompanyName=Mozilla
kokoa.installer.pretty.exe                     0.4 MB   ProductName=Firefox  CompanyName=Mozilla
（FileVersion 都是 18.05 —— 那是 NSIS 的版本号，不是产品版本）
```

**所以我没有读错文件。但它的质疑本身是对的 —— 那种情况下确实该怀疑。**

## 主程序再次确认

```
kokoa.exe
  CompanyName : Mozilla Corporation    <- 残留
  ProductName : Kokoa Twilight         <- 已对
```

## 结论

**这件事应该按它的方案修，不要按我的。** 我的方案（覆盖 branding.nsi）
会被 surfer 的 copyMozFiles() 覆盖掉，是无效的。

它的方案（改 MOZ_APP_VENDOR + 改 moz-configure.patch）触及了真正的赋值点。

> **这是「独立调研」价值的正面例子**：我先查到文件就停了，
> 它继续追到了「为什么赋值没生效」。
> 同时也说明：**我给出的修法不经验证就不能当结论用。**
