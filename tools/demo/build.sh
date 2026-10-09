#!/usr/bin/env bash
# Builds the browser demo (the plugin's own street with made-up games) into docs/index.html,
# a single self-contained page for GitHub Pages. Also writes a body-only copy for previews.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p docs tmp
bun build tools/demo/demo.ts --format esm --minify --target browser --outfile tmp/demo.js >/dev/null
python3 - <<'EOF'
page = open("tools/demo/page.html", encoding="utf-8").read()
js = open("tmp/demo.js", encoding="utf-8").read().replace("</script", "<\\/script")
body = page.replace("/*DEMO_JS*/", js)
open("tmp/demo-body.html", "w", encoding="utf-8").write(body)
doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       '<meta name="description" content="Minimi Town: a Decky plugin that turns your Steam Deck library into a little street with a penguin. Live demo.">\n'
       '</head>\n<body style="margin:0">\n' + body + '\n</body>\n</html>\n')
open("docs/index.html", "w", encoding="utf-8").write(doc)
print("docs/index.html", len(doc) // 1024, "KB")
EOF
