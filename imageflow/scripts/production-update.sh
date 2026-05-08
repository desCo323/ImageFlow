#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NEXTCLOUD_ROOT="${NEXTCLOUD_ROOT:-/var/www/nextcloud}"
LIVE_APP_DIR="${LIVE_APP_DIR:-$NEXTCLOUD_ROOT/apps/imageflow}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/cloud/imageflow-backups}"
MODE="${1:---preflight}"
RESTORE_SOURCE="${2:-}"

cd "$APP_DIR"

usage() {
	cat <<'USAGE'
Usage:
  scripts/production-update.sh --preflight
  IMAGEFLOW_PRODUCTION_UPDATE=1 scripts/production-update.sh --deploy
  IMAGEFLOW_RESTORE=1 scripts/production-update.sh --restore <backup-dir>

Environment:
  NEXTCLOUD_ROOT            Defaults to /var/www/nextcloud
  LIVE_APP_DIR              Defaults to $NEXTCLOUD_ROOT/apps/imageflow
  BACKUP_ROOT               Defaults to /home/cloud/imageflow-backups
  IMAGEFLOW_ENABLE_APP=1    Enable the app after deploy. This can run migrations.
  IMAGEFLOW_ALLOW_DIRTY=1   Allow preflight/deploy with a dirty worktree.
USAGE
}

read_xml_value() {
	php -r '$xml = simplexml_load_file($argv[1]); echo (string)$xml->{$argv[2]};' "$1" "$2"
}

require_command() {
	if ! command -v "$1" >/dev/null 2>&1; then
		echo "Missing required command: $1" >&2
		exit 1
	fi
}

require_clean_token_scan() {
	local token_prefix="ghp"
	if rg -n "${token_prefix}_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+" \
		--glob '!node_modules/**' \
		--glob '!test-results/**' \
		--glob '!playwright-report/**' \
		. >/tmp/imageflow-production-secret-scan.txt; then
		cat /tmp/imageflow-production-secret-scan.txt >&2
		rm -f /tmp/imageflow-production-secret-scan.txt
		echo "Potential GitHub personal access token found in source tree." >&2
		exit 1
	fi
	rm -f /tmp/imageflow-production-secret-scan.txt
}

require_clean_worktree() {
	if [[ "${IMAGEFLOW_ALLOW_DIRTY:-}" == "1" ]]; then
		return
	fi
	if git rev-parse --is-inside-work-tree >/dev/null 2>&1 && [[ -n "$(git status --porcelain)" ]]; then
		echo "Git worktree is not clean. Commit changes before a production update." >&2
		git status --short >&2
		exit 1
	fi
}

occ() {
	sudo -n -u www-data php "$NEXTCLOUD_ROOT/occ" "$@"
}

write_mysql_defaults() {
	local target="$1"
	umask 077
	php -r '
		$CONFIG = [];
		include $argv[1];
		$dbtype = (string)($CONFIG["dbtype"] ?? "");
		if ($dbtype !== "mysql") {
			exit(2);
		}
		$dbhost = (string)($CONFIG["dbhost"] ?? "localhost");
		$host = $dbhost;
		$port = null;
		$socket = null;
		if (str_contains($dbhost, ":")) {
			[$host, $tail] = explode(":", $dbhost, 2);
			if ($tail !== "" && ctype_digit($tail)) {
				$port = $tail;
			} elseif ($tail !== "") {
				$socket = $tail;
			}
		}
		echo "[client]\n";
		echo "user=" . (string)($CONFIG["dbuser"] ?? "") . "\n";
		echo "password=" . (string)($CONFIG["dbpassword"] ?? "") . "\n";
		echo "database=" . (string)($CONFIG["dbname"] ?? "") . "\n";
		if ($host !== "") {
			echo "host=" . $host . "\n";
		}
		if ($port !== null) {
			echo "port=" . $port . "\n";
		}
		if ($socket !== null) {
			echo "socket=" . $socket . "\n";
		}
	' "$NEXTCLOUD_ROOT/config/config.php" >"$target"
	chmod 600 "$target"
}

db_name() {
	php -r '$CONFIG = []; include $argv[1]; echo (string)($CONFIG["dbname"] ?? "");' "$NEXTCLOUD_ROOT/config/config.php"
}

backup_database_tables() {
	local backup_dir="$1"
	local dbtype
	dbtype="$(php -r '$CONFIG = []; include $argv[1]; echo (string)($CONFIG["dbtype"] ?? "");' "$NEXTCLOUD_ROOT/config/config.php")"

	if [[ "$dbtype" != "mysql" ]]; then
		echo "Database backup skipped: unsupported dbtype '$dbtype'." >"$backup_dir/db-backup-skipped.txt"
		return
	fi

	require_command mysql
	require_command mysqldump

	local defaults
	defaults="$(mktemp)"
	trap 'rm -f "$defaults"' RETURN
	write_mysql_defaults "$defaults"

	local tables
	tables="$(mysql --defaults-extra-file="$defaults" --batch --skip-column-names -e "SHOW TABLES LIKE 'imageflow\\_%';" 2>/dev/null || true)"
	if [[ -z "$tables" ]]; then
		echo "No imageflow_* tables existed before this operation." >"$backup_dir/db-imageflow-tables-missing.txt"
		return
	fi

	local db
	db="$(db_name)"
	local -a table_array
	mapfile -t table_array <<<"$tables"
	mysqldump --defaults-extra-file="$defaults" --single-transaction --skip-lock-tables "$db" "${table_array[@]}" >"$backup_dir/db-imageflow.sql"
}

write_restore_prompt() {
	local backup_dir="$1"
	cat >"$backup_dir/RESTORE_PROMPT.txt" <<RESTORE
Restore ImageFlow from backup:

1. Put Nextcloud in maintenance mode if needed:
   sudo -u www-data php $NEXTCLOUD_ROOT/occ maintenance:mode --on

2. Restore the app directory.
   If '$backup_dir/app' exists:
     sudo rsync -a --delete '$backup_dir/app/' '$LIVE_APP_DIR/'
     sudo chown -R www-data:www-data '$LIVE_APP_DIR'

   If '$backup_dir/app-directory-missing.txt' exists:
     sudo -u www-data php $NEXTCLOUD_ROOT/occ app:disable imageflow || true
     sudo rm -rf '$LIVE_APP_DIR'

3. Restore ImageFlow database tables only if needed.
   If '$backup_dir/db-imageflow.sql' exists, import it with the Nextcloud DB credentials.
   If '$backup_dir/db-imageflow-tables-missing.txt' exists and rollback must remove bootstrap tables,
   drop only tables named imageflow_% after confirming no other app uses them.

4. Leave maintenance mode and verify:
   sudo -u www-data php $NEXTCLOUD_ROOT/occ maintenance:mode --off
   sudo -u www-data php $NEXTCLOUD_ROOT/occ status

Expected after restore: maintenance false and needsDbUpgrade false.
RESTORE
}

backup_live_state() {
	local version
	local stamp
	local backup_dir
	version="$(read_xml_value appinfo/info.xml version)"
	stamp="$(date +%Y%m%d-%H%M%S)"
	backup_dir="$BACKUP_ROOT/imageflow-pre-update-${version}-${stamp}"

	sudo mkdir -p "$backup_dir"
	sudo chown "$(id -u):$(id -g)" "$backup_dir"

	if [[ -d "$LIVE_APP_DIR" ]]; then
		sudo cp -a "$LIVE_APP_DIR" "$backup_dir/app"
		sudo chown -R "$(id -u):$(id -g)" "$backup_dir/app"
	else
		echo "Live app directory did not exist before deploy: $LIVE_APP_DIR" >"$backup_dir/app-directory-missing.txt"
	fi

	occ status >"$backup_dir/occ-status-before.txt"
	git rev-parse HEAD >"$backup_dir/source-commit.txt" 2>/dev/null || true
	backup_database_tables "$backup_dir"
	write_restore_prompt "$backup_dir"

	printf '%s\n' "$backup_dir"
}

preflight() {
	require_command php
	require_command node
	require_command rg
	require_command git
	require_command rsync

	local app_id
	local version
	local package_version
	app_id="$(read_xml_value appinfo/info.xml id)"
	version="$(read_xml_value appinfo/info.xml version)"
	package_version="$(php -r '$data = json_decode(file_get_contents("package.json"), true, 512, JSON_THROW_ON_ERROR); echo (string)($data["version"] ?? "");')"

	if [[ "$app_id" != "imageflow" ]]; then
		echo "Unexpected app id: $app_id" >&2
		exit 1
	fi
	if [[ -z "$version" || "$version" != "$package_version" ]]; then
		echo "Version mismatch: appinfo=$version package.json=$package_version" >&2
		exit 1
	fi

	./scripts/self-check.sh
	require_clean_token_scan
	require_clean_worktree

	local status
	status="$(occ status)"
	printf '%s\n' "$status"
	if printf '%s\n' "$status" | rg -n "maintenance:\s*true|needsDbUpgrade:\s*true" >/dev/null; then
		echo "Nextcloud is not in a safe deploy state." >&2
		exit 1
	fi

	echo "Production preflight passed for ImageFlow $version."
}

deploy() {
	if [[ "${IMAGEFLOW_PRODUCTION_UPDATE:-}" != "1" ]]; then
		echo "Refusing deploy. Set IMAGEFLOW_PRODUCTION_UPDATE=1 for an intentional production update." >&2
		exit 1
	fi

	preflight

	local backup_dir
	backup_dir="$(backup_live_state)"
	echo "Backup created: $backup_dir"
	cat "$backup_dir/RESTORE_PROMPT.txt"

	sudo mkdir -p "$LIVE_APP_DIR"
	sudo rsync -a --delete \
		--exclude='.git' \
		--exclude='.github' \
		--exclude='node_modules' \
		--exclude='vendor' \
		--exclude='test-results' \
		--exclude='playwright-report' \
		--exclude='coverage' \
		--exclude='*.log' \
		"$APP_DIR/" "$LIVE_APP_DIR/"
	sudo chown -R www-data:www-data "$LIVE_APP_DIR"

	if [[ "${IMAGEFLOW_ENABLE_APP:-}" == "1" ]]; then
		occ app:enable imageflow
	else
		echo "App copied but not enabled. Set IMAGEFLOW_ENABLE_APP=1 during deploy to enable and run migrations."
	fi

	occ status
}

restore() {
	if [[ "${IMAGEFLOW_RESTORE:-}" != "1" ]]; then
		echo "Refusing restore. Set IMAGEFLOW_RESTORE=1 for an intentional rollback." >&2
		exit 1
	fi
	if [[ -z "$RESTORE_SOURCE" || ! -d "$RESTORE_SOURCE" ]]; then
		echo "Restore source must be an existing backup directory." >&2
		exit 1
	fi

	if [[ -d "$RESTORE_SOURCE/app" ]]; then
		sudo mkdir -p "$LIVE_APP_DIR"
		sudo rsync -a --delete "$RESTORE_SOURCE/app/" "$LIVE_APP_DIR/"
		sudo chown -R www-data:www-data "$LIVE_APP_DIR"
	elif [[ -f "$RESTORE_SOURCE/app-directory-missing.txt" ]]; then
		occ app:disable imageflow || true
		sudo rm -rf "$LIVE_APP_DIR"
	else
		echo "Backup does not contain app or app-directory-missing marker." >&2
		exit 1
	fi

	occ status
	echo "File-level restore completed. Review '$RESTORE_SOURCE/RESTORE_PROMPT.txt' for DB rollback instructions."
}

case "$MODE" in
	--preflight)
		preflight
		;;
	--deploy)
		deploy
		;;
	--restore)
		restore
		;;
	--help|-h)
		usage
		;;
	*)
		usage >&2
		exit 1
		;;
esac
