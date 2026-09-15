#!/usr/bin/env bash
# Packs the package exactly as npm would publish it, installs the tarball into a
# throwaway project, and exercises the published entry points from there.
# Catches broken `files`/`bin` globs and anything that only breaks once the code
# runs from inside node_modules (wasm resolution, render scratch dir, ...).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
tarball=""
cleanup() {
  rm -rf "$work"
  [ -n "$tarball" ] && rm -f "$root/$tarball"
}
trap cleanup EXIT

cd "$root"
tarball="$(npm pack --silent | tail -n 1)"

echo '{"name":"nimg-pack-smoke","private":true}' >"$work/package.json"
cat >"$work/render.ts" <<'EOF'
import { renderModule } from "niceimage/src/render.ts";

const code = `export default ({ width, height }: { width: number; height: number }) => (
	<div style={{ width, height, display: "flex", background: "#111", color: "#fff", fontSize: 48, alignItems: "center", justifyContent: "center" }}>ok</div>
);`;
const result = await renderModule(code, { width: 400, height: 200, images: [] }, 1);
if (!result.svg.includes("<svg") || result.png.length === 0)
	throw new Error("render produced no output");
console.log(`render ok: svg ${result.svg.length}B png ${result.png.length}B`);
EOF

cd "$work"
bun add "$root/$tarball" >/dev/null
./node_modules/.bin/nimg --help | grep -q '^Usage: nimg'
bun render.ts

echo "pack smoke ok: $tarball"
