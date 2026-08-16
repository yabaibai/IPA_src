#!/usr/bin/env python3
# CI: 禁用 Xcode 工程里 "Upload Debug Symbols to Sentry" 这个 build phase
# 做法：只把该 phase 的 shellScript 内容清空为 ""（绝不删除整块，避免破坏 pbxproj 结构）
# 同时由 workflow 设置 SENTRY_DISABLE_AUTO_UPLOAD=1 兜底
import os
import re

PBX = "ios/SmartWhale.xcodeproj/project.pbxproj"


def main():
    if not os.path.exists(PBX):
        print("no pbxproj, skip")
        return
    with open(PBX, encoding="utf-8") as f:
        s = f.read()

    # 仅在 name 为 Sentry upload 的 phase 内，把其后的 shellScript = "..." 置空
    pattern = re.compile(
        r'(name = "Upload Debug Symbols to Sentry";\s*.*?shellScript = )".*?";',
        re.S,
    )
    new_s, n = pattern.subn(r'\1"";', s)
    with open(PBX, "w", encoding="utf-8") as f:
        f.write(new_s)
    print(f"cleared shellScript in {n} Sentry upload phase(s)")


if __name__ == "__main__":
    main()
