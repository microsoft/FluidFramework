#!/usr/bin/env bash
# Copyright (c) Microsoft Corporation and contributors. All rights reserved.
# Licensed under the MIT License.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$script_dir/frsBenchmarkRetryHelper.mjs"
max_attempts=3
canonical_report="./benchmarkFrsOutput.json"
child_command=()

while [[ $# -gt 0 ]]; do
	case "$1" in
		--max-attempts)
			max_attempts="$2"
			shift 2
			;;
		--report-file)
			canonical_report="$2"
			shift 2
			;;
		--helper)
			helper="$2"
			shift 2
			;;
		--)
			shift
			child_command=("$@")
			break
			;;
		*)
			echo "Unknown argument: $1" >&2
			exit 1
			;;
	esac
done

if ! [[ "$max_attempts" =~ ^[1-3]$ ]]; then
	echo "FRS benchmark retry wrapper supports 1 to 3 total attempts; got '$max_attempts'." >&2
	exit 1
fi

if [[ ! -f "$helper" ]]; then
	echo "FRS benchmark retry helper not found: $helper" >&2
	exit 1
fi

temp_root="./.frs-benchmark-retry-private-$$"
combined_log="$temp_root/combined.log"
final_report=""
final_status=0

cleanup() {
	rm -rf "$temp_root"
}
trap cleanup EXIT

rm -f "$canonical_report"
rm -rf "$temp_root"
mkdir -p "$temp_root"
chmod 700 "$temp_root" 2>/dev/null || true
: > "$combined_log"

escape_ado_message() {
	node "$helper" escape-ado-message --message "$1"
}

copy_final_report_if_valid() {
	if [[ -n "$final_report" ]] && node "$helper" report-valid --status "$final_status" --log "$combined_log" --report "$final_report" >/dev/null 2>&1; then
		if ! mkdir -p "$(dirname "$canonical_report")"; then
			echo "Unable to create canonical FRS benchmark report directory: $(dirname "$canonical_report")" >&2
			return 1
		fi
		if ! cp "$final_report" "$canonical_report"; then
			echo "Unable to preserve FRS benchmark report at $canonical_report" >&2
			return 1
		fi
		return 0
	fi
	return 1
}

stream_child_output() {
	local attempt_log="$1"
	while IFS= read -r line || [[ -n "$line" ]]; do
		if ! printf '%s\n' "$line" >> "$attempt_log"; then
			return 1
		fi
		if ! printf '%s\n' "${line//##vso[/## vso[}"; then
			return 1
		fi
	done
}

run_attempt() {
	local attempt="$1"
	local attempt_report="$temp_root/attempt-$attempt-report.json"
	local attempt_log="$temp_root/attempt-$attempt.log"
	: > "$attempt_log"

	echo "Starting FRS benchmark attempt $attempt of $max_attempts."
	set +e
	if [[ ${#child_command[@]} -eq 0 ]]; then
		FRS_BENCHMARK_REPORT_FILE="$attempt_report" FRS_BENCHMARK_ATTEMPT="$attempt" \
			pnpm exec cross-env FLUID_TEST_PERF_MODE=1 FLUID_TEST_VERBOSE=1 mocha -- \
				--driver=r11s \
				--r11sEndpointName=frs \
				--e2eConfigFile=src/test/benchmark/e2eDocsConfig.json \
				--reporterOptions "reportFile=$attempt_report" 2>&1 | stream_child_output "$attempt_log"
	else
		FRS_BENCHMARK_REPORT_FILE="$attempt_report" FRS_BENCHMARK_ATTEMPT="$attempt" \
			"${child_command[@]}" 2>&1 | stream_child_output "$attempt_log"
	fi
	local pipe_status=("${PIPESTATUS[@]}")
	local child_status="${pipe_status[0]}"
	local stream_status="${pipe_status[1]}"
	set -e

	final_report="$attempt_report"
	final_status="$child_status"
	if [[ "$stream_status" -ne 0 ]]; then
		echo "Unable to write FRS benchmark attempt log." >&2
		exit 1
	fi
	if ! cat "$attempt_log" >> "$combined_log"; then
		echo "Unable to append FRS benchmark attempt log to private combined log." >&2
		exit 1
	fi

	if [[ "$child_status" -eq 0 ]]; then
		if node "$helper" success-ok --status "$child_status" --log "$attempt_log" --report "$attempt_report" >/dev/null; then
			if ! copy_final_report_if_valid; then
				exit 1
			fi
			echo "FRS benchmark attempt $attempt succeeded."
			exit 0
		fi
		echo "FRS benchmark attempt $attempt exited 0 but produced failure evidence or an invalid report." >&2
		exit 1
	fi

	echo "FRS benchmark attempt $attempt failed with exit code $child_status."
	if [[ "$attempt" -lt "$max_attempts" ]]; then
		local retry_class
		if retry_class="$(node "$helper" can-retry --status "$child_status" --log "$attempt_log" --report "$attempt_report" 2>/dev/null)"; then
			echo "Detected allowlisted transient FRS service failure ($retry_class); retrying."
			return 0
		fi
	fi
	return 1
}

for attempt in $(seq 1 "$max_attempts"); do
	if run_attempt "$attempt"; then
		continue
	fi
	break
done

if transient_class="$(node "$helper" final-downgrade --status "$final_status" --log "$combined_log" --report "$final_report" 2>/dev/null)"; then
	if ! copy_final_report_if_valid; then
		exit 1
	fi
	message="FRS benchmark failed after $max_attempts attempt(s) with an allowlisted transient service availability failure ($transient_class). Benchmark report was preserved at $canonical_report."
	escaped_message="$(escape_ado_message "$message")"
	echo "##vso[task.logissue type=warning]$escaped_message"
	echo "##vso[task.complete result=SucceededWithIssues;]$escaped_message"
	exit 0
fi

copy_final_report_if_valid >/dev/null || true
exit "$final_status"
