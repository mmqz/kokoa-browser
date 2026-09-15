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
  local base ours
  # base-kokoa = 我们孤儿历史的第一个提交（= 上游快照被替换后的状态）
  # 注意：用它算出的 delta 【不含】README.md 与 docs/overnight-sprint.md 的替换
  #（那两个在快照根里就已是我们的版本），所以品牌检查只看 src/ 即可。
  base=$(git tag -l 'base-kokoa' | head -1)
  ours=""
  if [ -n "$base" ]; then ours=$(git diff --name-only "$base" HEAD 2>/dev/null); fi
  if [ -z "$ours" ]; then
    say "  (没有基线 tag，无法算出我们的文件；跳过)"
    say "  提示: git tag base-zen-<上游SHA前7位> <上游SHA>"
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
    # 【区分「品牌泄漏」与「必需的署名」】——这两者必须分开，否则检查会逼着人去删许可声明。
    # 带署名语境的行（based on / derived from / thanks to / 版权头 / 上游仓库 URL）是【要留的】：
    # MPL-2.0 与诚实都要求致谢上游。
    local leaked
    leaked=$(grep -inE 'zen browser|heyzen|zen-browser/desktop' "$f" 2>/dev/null \
             | grep -viE 'based on|derived from|thanks|credit|licensed|MPL|https?://|upstream|上游|致谢' || true)
    if [ -n "$leaked" ]; then
      bad "$f 里仍有 Zen 品牌字样（非署名语境）"
      printf '%s\n' "$leaked" | head -3 | sed 's/^/         /'
      hits=$((hits+1))
    fi
  done <<< "$ours"
  if [ $hits -eq 0 ]; then ok "产品路径下没有 Zen 品牌字样"; fi
}

case "$MODE" in
  syntax) check_syntax ;;
  json)   check_json ;;
  prefs)  check_prefs ;;
  l10n)   check_l10n ;;
  brands) check_brands ;;
  all)    check_syntax; check_json; check_prefs; check_l10n; check_brands ;;
  *)      say "用法: bash scripts/check.sh [syntax|json|prefs|l10n|brands|all]"; exit 2 ;;
esac

say ""
if [ $fail -eq 0 ]; then
  printf '\033[32m全部通过\033[0m\n'
else
  printf '\033[31m有失败项 —— 先修这些再排构建（构建要 ~3 小时）\033[0m\n'
fi
exit $fail
