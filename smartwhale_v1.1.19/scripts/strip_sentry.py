#!/usr/bin/env python3
# CI: 彻底移除 Xcode 工程里 "Upload Debug Symbols to Sentry" 这个 build phase
# 未签名构建不需要上传 dSYM，且该 phase 会阻断 archive
import os
import re

PBX = "ios/SmartWhale.xcodeproj/project.pbxproj"


def main():
    if not os.path.exists(PBX):
        print("no pbxproj, skip")
        return
    with open(PBX, encoding="utf-8") as f:
        s = f.read()

    # pbxproj 中每个 PBXShellScriptBuildPhase 块形如:
    #   /* <comment> */ = {
    #       isa = PBXShellScriptBuildPhase;
    #       ...
    #       name = "Upload Debug Symbols to Sentry";
    #       shellScript = "...";
    #       ...
    #   };
    # 我们把 name 含 "Sentry" 的整个块删除。
    pattern = re.compile(
        r"/\*[^*]*\*/ = \{\s*isa = PBXShellScriptBuildPhase;.*?name = \"[^\"]*Sentry[^\"]*\";.*?\};\s*",
        re.S,
    )
    new_s, n = pattern.subn("", s)
    # 同时清理可能遗留的空注释引用
    new_s = re.sub(r"\n\s*\n\s*\n", "\n\n", new_s)
    with open(PBX, "w", encoding="utf-8") as f:
        f.write(new_s)
    print(f"removed {n} Sentry build phase block(s)")


if __name__ == "__main__":
    main()
