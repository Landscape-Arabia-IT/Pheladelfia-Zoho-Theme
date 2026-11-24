#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
CONFIG="$ROOT/template/template.conf"

if [ ! -f "$CONFIG" ]; then
  printf 'Missing theme manifest: %s\n' "$CONFIG" >&2
  exit 1
fi

VERSION=$(node -e '
const fs = require("node:fs");
const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (typeof config.version !== "string" || !/^\d+\.\d+\.\d+$/.test(config.version)) {
  throw new Error("template.conf must contain a semantic version.");
}
process.stdout.write(config.version);
' "$CONFIG")

ARCHIVE="$ROOT/Pheladelfia-Nursery-V${VERSION}-Upload.zip"
rm -f "$ARCHIVE"
(
  cd "$ROOT"
  zip -qr "$ARCHIVE" template
)
unzip -t "$ARCHIVE" >/dev/null
printf 'Created and verified: %s\n' "$ARCHIVE"
