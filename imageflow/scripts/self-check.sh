#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "ImageFlow self-check"

if rg -n 'ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+' . >/tmp/imageflow-secret-scan.txt; then
  cat /tmp/imageflow-secret-scan.txt
  rm -f /tmp/imageflow-secret-scan.txt
  echo "Secret-like value found in repository files." >&2
  exit 1
fi
rm -f /tmp/imageflow-secret-scan.txt

while IFS= read -r file; do
  php -l "$file" >/dev/null
done < <(find . -type f -name '*.php' | sort)

php -r 'new SimpleXMLElement(file_get_contents("appinfo/info.xml"));'
php -r '$routes = require "appinfo/routes.php"; if (!isset($routes["routes"]) || count($routes["routes"]) < 1) { exit(1); }'

node --check js/imageflow-main.js
bash -n scripts/self-check.sh
bash -n scripts/production-update.sh

echo "OK"
