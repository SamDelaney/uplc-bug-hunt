"""C compiler shim around Zig (pip package `ziglang`) for machines with no clang or gcc.

Used to build blst for wasm32 and, on Windows without Visual Studio, to build host C code
(e.g. when installing the wasm-bindgen CLI). The cc crate passes LLVM target triples; zig cc
wants its own names, so those are translated. Everything else is forwarded unchanged.
"""
import subprocess
import sys

ZIG_TARGETS = {
    "wasm32-unknown-unknown": "wasm32-freestanding",
    "x86_64-pc-windows-gnu": "x86_64-windows-gnu",
}


def zig_target(triple):
    return ZIG_TARGETS.get(triple, triple)


args = []
it = iter(sys.argv[1:])
for a in it:
    if a.startswith("--target="):
        args += ["-target", zig_target(a.split("=", 1)[1])]
    elif a in ("-target", "--target"):
        args += ["-target", zig_target(next(it, ""))]
    else:
        args.append(a)

sys.exit(subprocess.call([sys.executable, "-m", "ziglang", "cc", *args]))
