#!/usr/bin/env bash
# Builds the evaluator to WebAssembly and writes the browser bundle to ../pkg.
#
# Needs: rustup, the wasm-bindgen CLI at the version pinned in Cargo.toml, and a C compiler
# that targets wasm32 for blst (clang, or `pip install ziglang` as a fallback).
set -euo pipefail
cd "$(dirname "$0")"

BINDGEN_VERSION=0.2.100
toolchain=()

case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*)
    # Host build scripts need a linker. Without Visual Studio Build Tools, use the GNU
    # toolchain, which bundles its own.
    if ! command -v cl.exe >/dev/null 2>&1; then
      toolchain=(+1.86-x86_64-pc-windows-gnu)
    fi
    zcc="$PWD/tools/zcc.cmd"; zar="$PWD/tools/zar.cmd"
    ;;
  *)
    zcc="$PWD/tools/zcc.sh"; zar="$PWD/tools/zar.sh"
    ;;
esac

if ! command -v clang >/dev/null 2>&1; then
  echo "no clang found; compiling C with zig cc"
  export CC_wasm32_unknown_unknown="$zcc" AR_wasm32_unknown_unknown="$zar"
fi

cargo "${toolchain[@]}" build --release --target wasm32-unknown-unknown

if ! wasm-bindgen --version 2>/dev/null | grep -q " $BINDGEN_VERSION"; then
  echo "wasm-bindgen $BINDGEN_VERSION not found; install it with:" >&2
  if [ ${#toolchain[@]} -gt 0 ]; then
    # Its dependencies include C code (ring); zig can stand in for the missing host compiler.
    echo "  CC_x86_64_pc_windows_gnu=\"$zcc\" AR_x86_64_pc_windows_gnu=\"$zar\" \\" >&2
  fi
  echo "  cargo ${toolchain[*]} install wasm-bindgen-cli --version $BINDGEN_VERSION --locked" >&2
  exit 1
fi

wasm-bindgen --target web --out-dir ../pkg --out-name uplc_eval \
  target/wasm32-unknown-unknown/release/uplc_eval.wasm

ls -l ../pkg
