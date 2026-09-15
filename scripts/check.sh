#!/usr/bin/env bash
# Kokoa 分支 · 秒级静态检查
#
# 为什么需要它：完整构建要 ~2h53m（GitHub 4 vCPU 交叉编译到 Windows），
# 不可能改一行就等两小时。但大量错误根本不用等构建 —— 语法错误、引用不存在的文件、
# 文案键写错，这些都能在【秒级】查出来。
#
# 用法：
#   bash scripts/check.sh              全跑
#   bash scripts/check.sh syntax       只查语法（最快，约 10 秒）
#   bash scripts/check.sh prefs        只查 prefs 一致性
#   bash scripts/check.sh l10n         只查本地化键
#   bash scripts/check.sh brands       只查品牌残留
#
# 【它不能替代构建】—— 它查不出语义错误、运行时错误、布局问题。
# 但能让「构建一次要犹豫」变成「改完先跑 check，通过再排构建」。
set -uo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-all}"
fail=0
say()  { printf '%s\n' "$*"; }
ok()   { printf '  \033[32mOK\033[0m   %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m %s\n' "$*"; fail=1; }
# warn 不计入失败 —— 用于「上游既有、非我们造成的」问题，避免检查长期飘红没人看
warn() { printf '  \033[33mWARN\033[0m %s\n' "$*"; }

# ── 1. 语法检查（node --check，覆盖 src 下全部 .mjs/.js）────────────────
check_syntax() {
  say "=== 语法检查（node --check，并行）==="
  # 串行跑 698 次 node 要 ~85 秒；用 xargs -P 并行后约 10 秒。
  # 并行度取 CPU 核数，上限 8（Windows 上开太多进程反而更慢）。
  local par
  par=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)
  [ "$par" -gt 8 ] && par=8
  local list failed n
  list=$(mktemp)
  git ls-files 'src/**/*.mjs' 'src/**/*.js' 2>/dev/null > "$list"
  n=$(wc -l < "$list" | tr -d ' ')
  failed=$(mktemp)
  # 已知豁免：测试用的故意损坏 fixture（文件名就叫 sessionstore_invalid.js）
  xargs -a "$list" -P "$par" -I{} sh -c '
    case "$1" in *tests/mochitests/sessionstore/unit/data/sessionstore_*.js) exit 0 ;; esac
    node --check "$1" >/dev/null 2>&1 || echo "$1"
  ' _ {} > "$failed"
  local b
  # 注意：文件为空时 `grep -c` 会输出 0 但退出码为 1，
  # 写 `|| echo 0` 会得到 "0\n0" 两个值（踩过这个坑）。用 head 兜底。
  b=$(grep -c . "$failed" 2>/dev/null | head -1)
  [ -z "$b" ] && b=0
  if [ "$b" -eq 0 ]; then
    ok "$n 个文件全部通过"
  else
    bad "$b / $n 个文件语法失败："
    while IFS= read -r f; do
      say "         $f"
      node --check "$f" 2>&1 | head -2 | sed 's/^/           /'
    done < "$failed"
  fi
  rm -f "$list" "$failed"
}

# ── 2. JSON 检查 ───────────────────────────────────────────────────────
check_json() {
  say "=== JSON 检查 ==="
  local n=0 f
  for f in surfer.json package.json; do
    [ -f "$f" ] || continue
    n=$((n+1))
    node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$f" >/dev/null 2>&1 \
      && ok "$f" || bad "$f"
  done
  # tsconfig.json 是 JSONC（带注释），严格 JSON.parse 会失败 —— 剥掉注释再解析
  if [ -f tsconfig.json ]; then
    n=$((n+1))
    if node -e 'var s=require("fs").readFileSync(process.argv[1],"utf8");s=s.replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1");JSON.parse(s)' tsconfig.json >/dev/null 2>&1; then
      ok "tsconfig.json (JSONC，已剥注释)"
    else
      bad "tsconfig.json (JSONC)"
    fi
  fi
  [ $n -eq 0 ] && say "  (无)"
}

# ── 3. prefs 一致性 ────────────────────────────────────────────────────
#   背景：默认层对一部分 pref 静默失效，所以每条都必须能被读回来验证。
#   见主仓 docs/prefs-layer-finding.md 第七节。
check_prefs() {
  say "=== prefs 一致性 ==="
  local k="defaults/preferences/kokoa.js"
  if [ ! -f "$k" ]; then say "  (无 $k，跳过)"; return; fi
  local n
  n=$(grep -cE '^[[:space:]]*pref\(' "$k" 2>/dev/null || echo 0)
  ok "kokoa.js 声明 $n 条 pref"
  # build.py 只认 bool / int / string 三种形态，其余会被【静默跳过】
  local weird
  weird=$(grep -E '^[[:space:]]*pref\(' "$k" | grep -vE 'pref\("[^"]+",[[:space:]]*(true|false|-?[0-9]+|"[^"]*")[[:space:]]*\);' || true)
  if [ -n "$weird" ]; then
    bad "以下 pref 的取值形态 build.py 解析不了（会被静默跳过）："
    printf '%s\n' "$weird" | sed 's/^/         /'
  else
    ok "全部形态可被 build.py 解析（bool/int/string）"
  fi
}

# ── 4. 本地化键 ────────────────────────────────────────────────────────
check_l10n() {
  say "=== 本地化键 ==="
  local ftl
  ftl=$(find locales/en-US -name '*.ftl' 2>/dev/null)
  if [ -z "$ftl" ]; then say "  (找不到 locales/en-US 下的 .ftl，跳过)"; return; fi

  # 分成两桶：
  #   我们自己的文件（KOKOA_OWN_PATHS）缺键 -> FAIL（是我们的回归）
  #   上游 Zen 的文件缺键           -> WARN（上游既有，不是我们造成的）
  # 实测：上游 Zen 自己就有 3 个 data-l10n-id 没有 en-US 定义
  #   preferences-web-appearance-footer / tabs-toolbar / zen-boost-magic-theme
  # 所以不能一律 FAIL，否则会把上游的问题算在我们头上，时间久了没人看。
  local own_pat='^src/zen/kokoa/'
  local miss_own=0 miss_up=0 id refs

  while IFS= read -r id; do
    [ -z "$id" ] && continue
    grep -qhE "^${id}[[:space:]]*=" $ftl 2>/dev/null && continue
    # 找出引用它的文件，判断是我们自己的还是上游的
    refs=$(grep -rlE "data-l10n-id=\"${id}\"" src --include='*.xhtml' 2>/dev/null || true)
    if echo "$refs" | grep -qE "$own_pat"; then
      bad "缺文案键（我们的文件）: $id"
      echo "$refs" | grep -E "$own_pat" | head -2 | sed 's/^/          引用: /'
      miss_own=$((miss_own+1))
    else
      say "  WARN 缺文案键（上游既有）: $id"
      echo "$refs" | head -1 | sed 's/^/          引用: /'
      miss_up=$((miss_up+1))
    fi
  done < <(grep -rhoE 'data-l10n-id="[^"]+"' src --include='*.xhtml' 2>/dev/null | sed 's/.*="//;s/"//' | sort -u)

  if [ $miss_own -eq 0 ] && [ $miss_up -eq 0 ]; then
    ok "全部 data-l10n-id 都有对应 .ftl 定义"
  elif [ $miss_own -eq 0 ]; then
    ok "我们的文件无缺键（上游既有缺键 $miss_up 个，不计入失败）"
  fi
}

# ── 5. 品牌残留（只查我们自己改过的文件）────────────────────────────────
check_brands() {
  say "=== 品牌残留（只看我们改过的文件）==="
  # 【2026-09-15 改：不再依赖 delta，改为扫固定产品路径】
  #
  # 原来的做法是用 base-kokoa tag 算出「我们改过的文件」再扫。
  # 但那个语义是错的：我们要保证的是【产品里没有 Zen 品牌】，
  # 而不是「我们改过的文件里没有」—— 上游文件同样会进产品。
  #
  # 实际踩到的例子：prefs/zen/mods.yaml（上游文件，我们没改过）里
  #   zen.injections.match-urls = "https://zen-browser.app/*"
  # 它会被合并进 omni.ja 的 defaults/preferences/firefox.js，而且是 locked 的。
  # 旧的检查扫不到它（不在 delta 里）。
  #
  # 所以改为：扫固定的产品路径（src/ locales/ configs/ build/ prefs/ tools/），
  # 不管它是不是我们改过的。用户明确说过不要碰「我们改过的」文件，
  # 所以我们【只报告，不修改】—— 交给人工决定。
  local ours
  ours=$(git ls-files 'src/*' 'locales/*' 'configs/*' 'build/*' 'prefs/*' 2>/dev/null)
  if [ -z "$ours" ]; then
    say "  (git ls-files 没返回文件；跳过)"
    return
  fi
  # 【只扫会进产品的目录】。docs/ 一律不扫 ——
  # 文档里谈论上游 Zen 是【正常且必要】的（许可要求致谢、同步流程要指向上游仓库），
  # 把它们判为"品牌残留"是误报。踩过一次。
  local hits=0 f
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    # 只看产品路径（源码 / 文案 / 构建配置 / 主题）
    case "$f" in
      src/*|locales/*|configs/*|build/*|prefs/*|tools/*) ;;
      *) continue ;;
    esac
    # 有意保留的例外：
    #   surfer.json / configs/common/mozconfig 里出现上游名是【为了署名】，
    #   而且这两处已经在贴牌时逐个改过（见 docs/kokoa-zen-residuals.md）
    case "$f" in
      */surfer.json|configs/common/mozconfig) continue ;;
    esac
    # 【2026-09-15 加】两类【有意不改】的文件：
    #
    # (1) 测试数据 —— src/zen/tests/**
    #     里面的 zen-browser.app / zen-browser/desktop 是【测试夹具】，
    #     改了会破坏测试。而且 tests/ 【不进产物】。
    #     例：browser_space_routing_crud.js 用 "zen-browser.app" 当测试输入。
    #
    # (2) macOS hardened runtime entitlement
    #     src/security/mac/hardenedruntime/production/firefox-browser-xml.patch
    #     内容是 <string>9V5K9TP787.app.zen-browser.zen</string>
    #     那是【Zen 的 Apple 开发者 Team ID + bundle id】。
    #     改成我们的需要【我们自己的 Apple 开发者账号】—— 现在没有。
    #     【保留，但要记住这是已知项】。
    case "$f" in
      src/zen/tests/*|src/security/mac/hardenedruntime/production/firefox-browser-xml.patch) continue ;;
    esac
    # 【区分「品牌泄漏」与「必需的署名」】——这两者必须分开，否则检查会逼着人去删许可声明。
    # 带署名语境的行（based on / derived from / thanks to / 版权头 / 上游仓库 URL）是【要留的】：
    # MPL-2.0 与诚实都要求致谢上游。
    # 【2026-09-15 修两处缺陷】
    #
    # 缺陷 1：正则只写了 zen-browser/desktop，漏了 zen-browser.app 这类域名。
    #   实际踩到：prefs/zen/mods.yaml 的 "https://zen-browser.app/*" 没被抓到。
    #   -> 改成匹配 zen-browser. 与 zen-browser/ 两种写法。
    #
    # 缺陷 2：排除规则里的 https?:// 会把【所有 URL】当署名跳过 —— 太宽。
    #   而品牌泄漏恰恰常出现在 URL 里（zen-browser.app、share.zen-browser.app）。
    #   -> 去掉 https?://，只在真正有署名语境词时才跳过。
    #
    # 缺陷 3【2026-09-15 又发现，更隐蔽】：字符类 [./] 漏了【反斜杠】。
    #   实际踩到：src/zen/space-routing/ZenSpaceRoutingDialog.mjs:311
    #       input.placeholder = "zen-browser\\.app";
    #   源码里是转义写法 zen-browser\.app（字节是 zen-browser\ + .app），
    #   而 [./] 只匹配 . 与 / —— \\ 匹配不上，所以【整条漏报】。
    #   -> 字符类改成 [./\\-]（含反斜杠与连字符），覆盖所有写法。
    #
    #   这个漏洞让检查长期处于【假 OK】状态 —— 必须记一笔。
    local leaked
    leaked=$(grep -inE 'zen browser|heyzen|zen-browser[./\\-]|zen\.browser\.app' "$f" 2>/dev/null \
             | grep -viE 'based on|derived from|thanks|credit|licensed|MPL|upstream|上游|致谢|repos/zen-browser|github\.com/zen-browser|githubusercontent' \
             | grep -viE 'zen-browser-[a-z-]+|zen-browser\.(ui|container|generic)' || true)
    if [ -n "$leaked" ]; then
      bad "$f 里仍有 Zen 品牌字样（非署名语境）"
      printf '%s\n' "$leaked" | head -3 | sed 's/^/         /'
      hits=$((hits+1))
    fi
  done <<< "$ours"
  if [ $hits -eq 0 ]; then ok "产品路径下没有 Zen 品牌字样"; fi
}

# ── 6. patch 文件自洽性（hunk 头行数必须与实际行数一致）──────────────
#   背景：2026-09-15 一次构建在 Import 步失败，报
#     error: corrupt patch at src/browser/installer/windows/nsis/defines-nsi-in.patch
#   根因：手写 patch 时 hunk 头写了 @@ -25,7 +25,7 @@，但实际只有 6 行。
#   git apply 会直接拒绝。这个错误【本来可以秒级查出来】——不用浪费一次 3 小时构建。
check_patches() {
  say "=== patch 文件自洽性 ==="
  local n=0 bad=0
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    case "$f" in *.patch) ;; *) continue ;; esac
    n=$((n+1))
    # 用 awk 校验每个 hunk 头与实际行数
    local out
    out=$(awk '
      /^@@ / {
        if (inhunk && (oc != oldn || nc != newn)) {
          printf "  hunk @%d 声称 old=%d new=%d 实际 old=%d new=%d\n", hl, oldn, newn, oc, nc
          bad++
        }
        match($0, /-[0-9]+(,[0-9]+)?/) ; s=substr($0, RSTART+1, RLENGTH-1)
        split(s, a, ","); oldn = (a[2] == "" ? 1 : a[2]+0)
        match($0, /\+[0-9]+(,[0-9]+)?/) ; s=substr($0, RSTART+1, RLENGTH-1)
        split(s, b, ","); newn = (b[2] == "" ? 1 : b[2]+0)
        hl = NR; oc = 0; nc = 0; inhunk = 1; next
      }
      /^diff / {
        if (inhunk && (oc != oldn || nc != newn)) {
          printf "  hunk @%d 声称 old=%d new=%d 实际 old=%d new=%d\n", hl, oldn, newn, oc, nc
          bad++
        }
        inhunk = 0; next
      }
      inhunk {
        c = substr($0, 1, 1)
        if (c == " ") { oc++; nc++ }
        else if (c == "-") { oc++ }
        else if (c == "+") { nc++ }
      }
      END {
        if (inhunk && (oc != oldn || nc != newn)) {
          printf "  hunk @%d 声称 old=%d new=%d 实际 old=%d new=%d\n", hl, oldn, newn, oc, nc
          bad++
        }
        exit (bad > 0 ? 1 : 0)
      }
    ' "$f" 2>/dev/null)
    # 行尾空白 —— 【只作为 WARN】
    # 原因：Zen 上游自己的 patch 就有很多行尾空白（实测 9 个文件），
    # 而 CI 用 `git apply --ignore-space-change --ignore-whitespace`，它们照样能应用。
    # 一律 FAIL 会产生大量误报 —— 误报的检查比没有检查更糟。
    local trail
    trail=$(grep -nE "^[+-].*[ 	]$" "$f" 2>/dev/null | head -2 || true)

    # hunk 行数不符 —— 【这才是 FAIL】
    # git apply 会直接报 corrupt patch，是硬错误。
    if [ -n "$out" ]; then
      bad=$((bad+1))
      printf "%s\n" "$out" | sed "s|^|    $f|"
      bad "$f hunk 行数不符（git apply 会报 corrupt patch）"
    elif [ -n "$trail" ]; then
      warn "$f 有行尾空白的 +- 行（上游也有，CI 已用 --ignore-whitespace）"
    fi
  done < <(git ls-files "src/**/*.patch" 2>/dev/null | sort -u)
  if [ $bad -eq 0 ]; then ok "$n 个 patch 文件 hunk 行数全部自洽"; fi

  # ── ★ 2026-09-15 加：patch 文件必须【以换行结尾】 ────────────────────
  #
  # 【为什么加这个检查】当天一次构建（34985728054）在 Import 步失败：
  #     error: corrupt patch at .../jar-mn.patch:13
  # 而 hunk 行数【完全正确】—— 问题在【文件末尾没有换行符】。
  #
  # git apply 要求 patch 以换行结尾。缺了会报 corrupt patch，
  # 而且报的行号是【最后一行】，看不出真正原因。
  #
  # 上面那段行数检查【抓不到】这种情况 —— 它只数 hunk 内的行，
  # 不看文件末尾字节。所以这里补一道。
  local nlbad=0 f2
  while IFS= read -r f2; do
    [ -f "$f2" ] || continue
    # 用 od 取最后一个字节。0a = LF
    last=$(tail -c 1 "$f2" 2>/dev/null | od -An -tx1 2>/dev/null | tr -d " \n")
    if [ "$last" != "0a" ]; then
      nlbad=$((nlbad+1))
      bad "$f2 末尾没有换行符（git apply 会报 corrupt patch）"
    fi
  done < <(git ls-files "src/**/*.patch" 2>/dev/null | sort -u)
  if [ $nlbad -eq 0 ]; then ok "所有 patch 文件都以换行结尾"; fi
}

# ── 7. mozconfig 里的非法变量 ──────────────────────────────────────────
#   背景：2026-09-15 一次构建在 Build 步失败（11m52s），报：
#     mozbuild.configure.options.InvalidOptionError:
#     MOZ_APP_VENDOR=Kokoa can not be set by mozconfig.
#     Values are accepted from: implied, environment, ...
#   MOZ_APP_VENDOR 是 toolkit/moz.configure 里的 project_flag，
#   【不接受 mozconfig 的 export】。正确做法是给它的 project_flag 加 default（走 patch）。
#   这个错误【本该秒级发现】——不用浪费一次 3 小时构建。
check_mozconfig() {
  say "=== mozconfig 非法变量 ==="
  local bad=0 f
  # 这些变量是 project_flag，不能由 mozconfig 的 export 设
  local forbidden="MOZ_APP_VENDOR MOZ_APP_ID MOZ_APP_UA_NAME MOZ_APP_PROFILE"
  for f in configs/*/mozconfig; do
    [ -f "$f" ] || continue
    for v in $forbidden; do
      # 去掉注释行后再找 export
      if grep -E "^[[:space:]]*export[[:space:]]+$v=" "$f" >/dev/null 2>&1; then
        bad
        bad=$((bad+1))
        local ln
        ln=$(grep -nE "^[[:space:]]*export[[:space:]]+$v=" "$f" | head -1 | cut -d: -f1)
        printf "  %s:%s 不能 export %s（project_flag，mach 会直接报错）\n" "$f" "$ln" "$v"
      fi
    done
  done
  if [ $bad -eq 0 ]; then ok "mozconfig 里没有非法的 project_flag export"; fi
}

case "$MODE" in
  syntax) check_syntax ;;
  json)   check_json ;;
  prefs)  check_prefs ;;
  l10n)   check_l10n ;;
  brands) check_brands ;;
  patches) check_patches ;;
  mozconfig) check_mozconfig ;;
  all)    check_syntax; check_json; check_prefs; check_l10n; check_brands; check_patches; check_mozconfig ;;
  *)      say "用法: bash scripts/check.sh [syntax|json|prefs|l10n|brands|all]"; exit 2 ;;
esac

say ""
if [ $fail -eq 0 ]; then
  printf '\033[32m全部通过\033[0m\n'
else
  printf '\033[31m有失败项 —— 先修这些再排构建（构建要 ~3 小时）\033[0m\n'
fi
exit $fail