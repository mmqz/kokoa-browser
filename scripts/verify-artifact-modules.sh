#!/usr/bin/env bash
# 对【构建产物】里的 Kokoa 模块跑我们的单测。
#
# 【为什么要这个脚本】
#   日常 check.sh 测的是【源码树】里的模块。
#   但真正运行的是【打包进 omni.ja 之后】的那个版本 ——
#   中间经过打包/压缩，理论上不该改变行为，但值得验证。
#   构建 35047911545 首次这么做：104 个用例全过。
#
# 【用法】
#   bash scripts/verify-artifact-modules.sh <构建产物目录>
#   例：bash scripts/verify-artifact-modules.sh /e/builds/35047911545
#
# 【前提】已用 gh run download 下载产物到那个目录。
# 【依赖】python（解 zip）、node（跑测试）

set -uo pipefail

DIR="${1:-}"
if [[ -z "$DIR" ]]; then
  echo "用法: bash scripts/verify-artifact-modules.sh <构建产物目录>"
  exit 2
fi
if [[ ! -d "$DIR" ]]; then
  echo "目录不存在: $DIR"
  exit 2
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO/src/zen/kokoa"

echo "=== 对产物里的 Kokoa 模块跑单测 ==="
echo "产物目录: $DIR"
echo ""

# ── 1. 解出 omni.ja ────────────────────────────────────────────
OMNI="$DIR/omni.ja"
if [[ ! -f "$OMNI" ]]; then
  echo "解出 omni.ja ..."
  python "$REPO/scripts/extract-omnija.py" "$DIR" "$OMNI" || exit 2
else
  echo "omni.ja 已存在，复用"
fi
echo ""

# ── 2. 抽出 Kokoa 模块 ─────────────────────────────────────────
OUT="$DIR/modules"
echo "抽出 modules/zen/Kokoa*.mjs ..."
python "$REPO/scripts/extract-kokoa-modules.py" "$OMNI" "$OUT" || exit 2
echo ""

# ── 3. 把测试复制过去（它们 import ./Xxx.mjs，所以要同目录）────
for t in "$SRC"/*.test.js; do
  [[ -e "$t" ]] || continue
  cp "$t" "$OUT/"
done

# ── 4. 跑 ──────────────────────────────────────────────────────
echo "=== 结果 ==="
fail=0
total=0
for t in "$OUT"/*.test.js; do
  [[ -e "$t" ]] || continue
  name=$(basename "$t")
  # 跳过依赖【未抽出】模块的测试（比如某模块还没进这次构建）
  deps_ok=1
  while read -r m; do
    [[ -z "$m" ]] && continue
    [[ -f "$OUT/${m#./}" ]] || deps_ok=0
  done < <(grep -o "\./[A-Za-z0-9]*\.mjs" "$t" | sort -u)
  if [[ $deps_ok -eq 0 ]]; then
    echo "  跳过 $name（依赖的模块不在本次产物里）"
    continue
  fi

  # 【★ 特殊】一致性测试查的是【源码树】里的文件（设置页 / prefs yaml），
  # 与产物无关 —— 而且它靠 ../../.. 推仓库根，复制到产物目录后路径就错了。
  # 所以在仓库原位置跑它，不复制。
  if [[ "$name" == "KokoaMenuConsistency.test.js" ]]; then
    if out=$(cd "$SRC" && node "$name" 2>&1); then
      n=$(echo "$out" | grep -o "[0-9]* 通过" | head -1 | grep -o "[0-9]*")
      total=$((total + ${n:-0}))
      echo "  OK   $name（${n:-?} 用例，在源码树跑 —— 与本产物无关）"
    else
      echo "  FAIL $name（在源码树跑）"
      echo "$out" | tail -5 | sed "s/^/       /"
      fail=$((fail + 1))
    fi
    continue
  fi

  if out=$(cd "$OUT" && node "$name" 2>&1); then
    n=$(echo "$out" | grep -o "[0-9]* 通过" | head -1 | grep -o "[0-9]*")
    total=$((total + ${n:-0}))
    echo "  OK   $name（${n:-?} 用例）"
  else
    echo "  FAIL $name"
    echo "$out" | tail -5 | sed "s/^/       /"
    fail=$((fail + 1))
  fi
done

echo ""
if [[ $fail -eq 0 ]]; then
  echo "全部通过（共 $total 个用例 —— 跑的是【产物里】的模块）"
  exit 0
else
  echo "$fail 个测试文件失败"
  exit 1
fi