# ✅ prefs/*.yaml 机制【终于查清】—— 我之前两次判断都错了

> 2026-09-15。**撤回 `docs/howto-mechanism-error.md` 与 `docs/prefs-mechanism-and-residue.md` 的相关结论。**

---

# 一、正确答案（**有 CI 日志 + 源码双重证据**）

```
链路：
  prefs/{firefox,zen,privatefox,fastfox}/*.yaml
       |  tools/ffprefs（Rust 程序，Zen 改造过）
       v
  engine/browser/app/profile/zen.js          <- 动态 pref
  engine/modules/libpref/init/zen-static-prefs.inc   <- 静态 pref
       |  ffprefs 在 firefox.js 末尾加一行：
       |     #include zen.js
       v
  Firefox 构建 -> omni.ja 的 defaults/preferences/firefox.js
```

## 证据 A：CI 日志

```
L15709  Running `target/debug/ffprefs ../../`
L15710  Writing preferences to:
L15711  Static:  .../engine/modules/libpref/init/zen-static-prefs.i
L15712  Dynamic: .../engine/browser/app/profile/zen.js
```

## 证据 B：源码 `tools/ffprefs/src/main.rs`

```
L110  const STATIC_PREFS: &str = "../engine/modules/libpref/init/zen-static-prefs.inc";
L112  const DYNAMIC_PREFS: &str = "../engine/browser/app/profile/zen.js";
L139  fn get_prefs_files_recursively(dir, files)
L147      if ext == "yaml" || ext == "yml" { files.push(path); }
L304  // Add `#include zen.js` to the bottom of the firefox.js file if it doesn't exist
L305  let line = "#include zen.js";
L363  fn main() {
L372    prepare_zen_prefs();
L373    let mut preferences = load_preferences();
L375    write_preferences(&preferences);
```

# 二、我错了两次，怎么错的

## 第一次错：说「经 tools/ffprefs 编译」是错的

**我读的是 `tools/ffprefs/src/main.rs` 的【头部注释】**（L5-L41），
那里写着 `cpptype` / `mirror` / `lang` 字段要求 —— **那是 Firefox 原版 StaticPrefs 的说明。**

**我没往下读代码主体**（L110 之后才是 Zen 改造的逻辑）。

```
于是我看到 prefs/*.yaml 只有 name/value（没有 cpptype），
就推断「格式不匹配，不可能是它的输入」—— 【结论下得太早】。
```

**实际上 Zen 改造后的 ffprefs 就是读 name/value 的 YAML。**

## 第二次错：其实是对的，但我又绕回来了

我在 `prefs-mechanism-and-residue.md` 里写「prefs/*.yaml 的内容被合并进 firefox.js」，
那【方向是对的】，但我把它归因于「某个未确认的工具」。

**现在确认：那个工具就是 `tools/ffprefs`，路径是 `zen.js` + `#include`。**

# 三、附带确认：有一条残留

```
engine/browser/app/profile/zen.js      <- 文件名是 zen
engine/modules/libpref/init/zen-static-prefs.inc  <- 文件名是 zen

这两个是【构建期生成】的，源码树里没有。
用户看不到（在 engine/ 里），但如果要彻底贴牌，这是两个点。
改动方式：tools/ffprefs/src/main.rs 的 L110/L112 常量。
```

# 四、教训（第三次了）

```
1. 【不要只读文件头部就下结论】
   我读了 main.rs 的注释（那是 Firefox 原版说明），没读代码。
   -> 注释可能过时、可能是上游遗留，【代码才是事实】。

2. 【「格式不匹配」这种推断要谨慎】
   我看到 cpptype 字段缺失就断定「不是它的输入」，
   但代码可能已经被改造过（Zen fork 了它）。
   -> 应该直接看【读取逻辑】，而不是看注释里的字段要求。

3. 这是我在这个项目里第 3 次因为【只看了一部分】而误判：
     1) MOZ_APP_VENDOR 的 default 管 Vendor      -> 产物证明不管
     2) application.ini 来自 Firefox 模板        -> URL 格式对不上
     3) tools/ffprefs 不处理 prefs/*.yaml        -> 实际处理（这次）

   第 3 次尤其可惜：**答案就在同一个文件里，我读了前 60 行就下结论，
   而真相在 L110。**
```

# 五、对文档的影响

```
· docs/howto-mechanism-error.md      -> 【撤回】：那条说法其实是对的
· docs/prefs-mechanism-and-residue.md -> 【部分保留】：
    「内容被合并进 firefox.js」是对的，
    但「消费者未知」已查明（tools/ffprefs）
```
