/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type SpawnSyncReturns, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const installer = fileURLToPath(new URL("../../infra/install-linkcheck.sh", import.meta.url));

describe.skipIf(process.platform === "win32")("linkcheck installer", () => {
	let directory: string;
	let bin: string;
	let temporaryDirectory: string;
	let destination: string;

	beforeEach(() => {
		directory = mkdtempSync(join(tmpdir(), "install-linkcheck-test-"));
		bin = join(directory, "bin");
		temporaryDirectory = join(directory, "temporary");
		destination = join(directory, "destination");
		mkdirSync(bin);
		mkdirSync(temporaryDirectory);
	});

	afterEach(() => {
		rmSync(directory, { recursive: true, force: true });
	});

	function stub(name: string, body: string): void {
		writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
	}

	function runInstaller(): SpawnSyncReturns<string> {
		return spawnSync("bash", [installer, destination], {
			encoding: "utf8",
			env: {
				...process.env,
				PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
				TMPDIR: temporaryDirectory,
			},
		});
	}

	it("rejects a downloaded archive with the wrong checksum before extraction", () => {
		stub(
			"curl",
			`while [ "$#" -gt 0 ]; do
	if [ "$1" = "--output" ]; then
		printf 'invalid archive' > "$2"
		exit 0
	fi
	shift
done
exit 2`,
		);

		const result = runInstaller();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("checksum");
		expect(existsSync(destination)).toBe(false);
		expect(readdirSync(temporaryDirectory)).toEqual([]);
	});

	it("propagates download failures and cleans up temporary files", () => {
		stub("curl", 'echo "Download failed" >&2\nexit 22');

		const result = runInstaller();
		expect(result.status).toBe(22);
		expect(result.stderr).toContain("Download failed");
		expect(existsSync(destination)).toBe(false);
		expect(readdirSync(temporaryDirectory)).toEqual([]);
	});

	it("reports unsupported platforms without downloading or installing anything", () => {
		stub("uname", "echo unsupported");
		stub("curl", 'echo "Unexpected download" >&2\nexit 99');

		const result = runInstaller();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain("Unsupported platform");
		expect(result.stderr).not.toContain("Unexpected download");
		expect(existsSync(destination)).toBe(false);
		expect(readdirSync(temporaryDirectory)).toEqual([]);
	});
});
