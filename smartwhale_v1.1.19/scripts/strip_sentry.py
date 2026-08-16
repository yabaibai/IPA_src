#!/usr/bin/env python3
# CI: 清空 Xcode 工程里 "Upload Debug Symbols to Sentry" 的 shellScript
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
    # 把包含 Sentry dSYM 上传的 shellScript 内容置空
    s2 = re.sub(
        r'(shellScript = ")[^"]*Upload Debug Symbols to Sentry[^"]*(";)',
        r'\1\2',
        s,
    )
    with open(PBX, "w", encoding="utf-8") as f:
        f.write(s2)
    print("stripped Sentry phase")


if __name__ == "__main__":
    main()
