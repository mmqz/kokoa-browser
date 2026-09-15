#!/usr/bin/env bash
# 产物贴牌检查 —— 读【产物】而不是读源码树。
#
# 【为什么需要这个脚本】
# 2026-09-15 实测：有一批贴牌残留在【产物】里，源码树里根本不存在：
#   application.ini      Vendor=Mozilla / ID={Firefox GUID}
#   updater.ini          Title=Twilight Update
#   firefox-branding.js  8 个 zen-browser.app URL（用户实测：每次更新跳转 Zen）
#   ZenMods*             zen 模组 / theme-store
#
# 后者尤其典型：它们由 surfer 在构建期【生成】，且 URL 硬编码在 surfer 源码里
#   （src/commands/patches/branding-patch.ts L405-443），
# 我们的 scripts/check.sh 只扫仓库里存在的文件 -> 抓不到。
# 所以必须有这一步，而且必须【进到 omni.ja 里面看】。
#
# 用法（CI 里，构建之后）：
#   bash scripts/check-artifact-branding.sh <dist/bin 路径>
#
# 【只报告，不失败】—— 有些是待决策项。
set -uo pipefail

B="${1:-engine/obj-x86_64-pc-windows-msvc/dist/bin}"

echo "=========================================="
echo "  产物贴牌检查"
echo "=========================================="
if [ ! -d "$B" ]; then
  echo "(没有 $B，跳过)"
  exit 0
fi
echo "目标: $B"

PAT='mozilla|firefox|zen|twilight'

echo ""
for f in application.ini updater.ini update-settings.ini platform.ini; do
  P="$B/$f"
  if [ ! -f "$P" ]; then
    echo "--- $f: 不存在"
    continue
  fi
  echo "--- $f ---"
  grep -inE "$PAT" "$P" 2>/dev/null | head -12 | sed 's/^/    /' || echo "    (无品牌字样)"
done

echo ""
echo "--- 可执行文件的 PE 元数据 ---"
for exe in kokoa.exe zen.exe firefox.exe; do
  P="$B/$exe"
  [ -f "$P" ] || continue
  echo "  $exe:"
  strings -el "$P" 2>/dev/null | grep -iE "mozilla|firefox|zen|kokoa|twilight" \
    | sort -u | head -8 | sed 's/^/      /' || echo "      (读不出)"
done

echo ""
echo "--- dist 下的安装器 ---"
for ins in "$B"/../*.exe; do
  [ -f "$ins" ] || continue
  case "$ins" in
    *installer*) echo "  $(basename "$ins"):" ;;
    *) continue ;;
  esac
  strings -el "$ins" 2>/dev/null | grep -iE "^firefox$|^mozilla|^zen$|^kokoa$|twilight" \
    | sort -u | head -6 | sed 's/^/      /' || echo "      (读不出)"
done

# ─────────────────────────────────────────────────────────────────────
# ★ 2026-09-15 加：进 omni.ja 里面扫
#
# 【这一块是必需的】用户实测报的两个问题都在这里：
#   · 「每次更新跳转到 zen」  -> defaults/preferences/firefox-branding.js
#   · 「zen 模组」            -> ZenMods* / theme-store
# 本脚本原来只查 .ini 文件，check.sh 只扫源码树 —— 两边都抓不到它们。
#
# 用 unzip 解包（omni.ja 就是 zip）。不用 python -c：
# 它在 CI 的 bash 下引号嵌套会坏（实测过）。
# ─────────────────────────────────────────────────────────────────────
OMNI="$(find "$B"/.. -name 'omni.ja' 2>/dev/null | head -1)"
[ -z "$OMNI" ] && OMNI="$(find "$B" -name 'omni.ja' 2>/dev/null | head -1)"

echo ""
echo "--- omni.ja 内部（之前漏掉的一块）---"
if [ -z "$OMNI" ] || [ ! -f "$OMNI" ]; then
  echo "  (没找到 omni.ja，跳过)"
else
  echo "  omni.ja: $OMNI"
  TMP="$(mktemp -d)"
  OK=0
  if command -v unzip >/dev/null 2>&1; then
    if unzip -qq -o "$OMNI" -d "$TMP" 2>/dev/null; then
      echo "  已解包（$(find "$TMP" -type f 2>/dev/null | wc -l | tr -d ' ') 个文件）"
      OK=1
    else
      echo "  (unzip 失败)"
    fi
  else
    echo "  (没有 unzip，跳过)"
  fi

  if [ "$OK" = "1" ]; then
    echo ""
    echo "  === 品牌泄漏（zen-browser.app / heyzen / theme-store）==="
    HITS=0
    for f in $(grep -rlE 'zen-browser\.app|heyzen|zen-browser\.github|theme-store' "$TMP" 2>/dev/null | head -20); do
      N=$(grep -cE 'zen-browser\.app|heyzen|zen-browser\.github|theme-store' "$f" 2>/dev/null || echo 0)
      echo "    [$N] ${f#$TMP/}"
      HITS=1
    done
    [ "$HITS" = "0" ] && echo "    (无)"

    echo ""
    echo "  === 用户可见的跳转 pref ==="
    FJS="$TMP/defaults/preferences/firefox-branding.js"
    if [ -f "$FJS" ]; then
      grep -nE 'homepage_override|homepage_welcome|app\.update\.url|releaseNotesURL' "$FJS" \
        | sed 's/^/    /' | head -12
    else
      echo "    (没有 defaults/preferences/firefox-branding.js)"
    fi
  fi
  rm -rf "$TMP" 2>/dev/null
fi

echo ""
echo "=========================================="
echo "  说明：这一步只报告，不会失败。"
echo "=========================================="
