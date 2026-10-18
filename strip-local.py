#!/usr/bin/env python3
"""维护者用：从作者主库里的插件源码生成公开版的 main.js / styles.css。

源码里有些功能只在作者自己的库里有意义（依赖库里的私人脚本和笔记），不进仓库、不进 Release。
它们在源码里用标记圈出来，这个脚本把圈出来的部分去掉：

    // @local-begin 说明        （CSS 里是 /* @local-begin 说明 */）
    …这一段只留在本机…
    // @local-end
    某一行代码;   // 说明 @local    ← 以 @local 结尾的单独一行

去完以后再查一遍：标记有没有配对、有没有漏下的、公开版里还有没有提到这些功能、语法对不对。
任何一项不过就报错退出，不写文件，sync.sh 跟着停下，不会把半截的东西推上去。

用法：strip-local.py <源码目录> <输出目录>
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BEGIN = re.compile(r"^\s*(?://|/\*)\s*@local-begin\b")
END = re.compile(r"^\s*(?://|/\*)\s*@local-end\b")
LINE = re.compile(r"@local\s*(?:\*/)?\s*$")
# 公开版里不该再出现的字眼：新加了只留本机的功能，把它的关键字补在这里
LEFTOVER = re.compile(r"@local|长期项目|长期计划|long-projects|LP_SCRIPT|showProjects|projFolded|projRef|projOf|renderProjects|scheduleProjects|recomputeProjects|_lp[A-Z]\w*|\._lp\b|botTodo|pauseTodo|📸|snapRun|takeSnapshot|restoreSnapshot|snapshotState|nautilus-snapshot|SnapModal|naut-shot|SNAP_PAGE|snapPageAdd|openSnapPage")


def strip(text, name):
    out, depth, start = [], 0, 0
    for no, line in enumerate(text.split("\n"), 1):
        if BEGIN.search(line):
            if depth:
                sys.exit(f"✗ {name}:{no} @local-begin 套在另一段里（上一段从第 {start} 行开始）")
            depth, start = 1, no
        elif END.search(line):
            if not depth:
                sys.exit(f"✗ {name}:{no} 多出来一个 @local-end")
            depth = 0
        elif not depth and not LINE.search(line):
            out.append(line)
    if depth:
        sys.exit(f"✗ {name}:{start} @local-begin 没有对应的 @local-end")
    return "\n".join(out)


def find_node():
    """sync.sh 是非交互的 zsh，nvm 装的 node 不在它的 PATH 里：PATH 里没有就到常见位置找。"""
    hit = shutil.which("node")
    if hit:
        return hit
    home = Path.home()
    spots = sorted((home / ".nvm/versions/node").glob("*/bin/node"), reverse=True) if (home / ".nvm/versions/node").is_dir() else []
    spots += [Path("/opt/homebrew/bin/node"), Path("/usr/local/bin/node"), home / ".volta/bin/node"]
    return next((str(p) for p in spots if p.exists()), None)


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    built = {}
    for name in ("main.js", "styles.css"):
        text = strip((src / name).read_text(encoding="utf8"), name)
        for no, line in enumerate(text.split("\n"), 1):
            m = LEFTOVER.search(line)
            if m:
                sys.exit(f"✗ 公开版 {name}:{no} 还留着「{m.group(0)}」：{line.strip()[:120]}")
        built[name] = text
    with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf8") as f:
        f.write(built["main.js"])
        f.flush()
        node = find_node()
        if not node:
            sys.exit("✗ 没找到 node，没法检查公开版的语法。装一个，或者把它所在的目录加进 PATH 再跑")
        r = subprocess.run([node, "--check", f.name], capture_output=True, text=True)
        if r.returncode:
            sys.exit("✗ 公开版 main.js 语法不对（去掉 @local 的部分以后）：\n" + r.stderr[:800])
    # 说明文档也查一遍
    for readme in sorted([*dst.glob("README*.md"), *dst.glob("docs/*.md")]):
        for no, line in enumerate(readme.read_text(encoding="utf8").split("\n"), 1):
            m = LEFTOVER.search(line)
            if m:
                sys.exit(f"✗ {readme.relative_to(dst)}:{no} 还留着「{m.group(0)}」")
    for name, text in built.items():
        (dst / name).write_text(text, encoding="utf8")
    print("公开版已生成：main.js、styles.css（只留本机的部分已去掉）")


if __name__ == "__main__":
    main()
