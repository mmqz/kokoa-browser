#!/usr/bin/env bash
# 产物贴牌检查 —— 读【产物】而不是读源码树。
#
# 【为什么需要这个脚本】
# 2026-09-15 实测：有一批贴牌残留在【产物】里，源码树里根本不存在：
#   application.ini   Vendor=Mozilla / Name=Zen / Profile=zen
#                     Version=1.23t / ID={Firefox GUID}
#                     [AppUpdate] URL=https://updates.zen-browser.app/...
#   updater.ini       Title=Twilight Update / Info=Twilight is installing...
#   update-settings.ini  ACCEPTED_MAR_CHANNEL_IDS=twilight
# 它们是构建期由 moz.build 生成的，本地 scripts/check.sh 扫不到。
#
# 用法（在 CI 里，构建之后）：
#   bash scripts/check-artifact-branding.sh <dist/bin 路径>
#
# 【只报告，不失败】—— 有些是待决策项（见 docs/branding-residue-artifacts.md）。
# 这一轮的目的是「看见」，不是「拦住」。等决策后再改成失败。
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

for f in application.ini updater.ini update-settings.ini platform.ini; do
  P="$B/$f"
  echo ""
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
  # 用 strings + grep 粗略找（不依赖 python）
  strings -el "$P" 2>/dev/null | grep -iE "mozilla|firefox|zen|kokoa|twilight" \
    | sort -u | head -8 | sed 's/^/      /' || echo "      (读不出)"
done

echo ""
echo "--- dist 下的安装器 ---"
for ins in "$B"/../*.exe; do
  [ -f "$ins" ] || continue
  case "$ins" in *installer*) echo "  $(basename "$ins"):" ;; *) continue ;; esac
  strings -el "$ins" 2>/dev/null | grep -iE "^firefox$|^mozilla|^zen$|^kokoa$|twilight" \
    | sort -u | head -6 | sed 's/^/      /' || echo "      (读不出)"
done

echo ""
echo "=========================================="
echo "  说明：这一步只报告，不会失败。"
echo "  待决策项见 docs/branding-residue-artifacts.md"
echo "=========================================="
