/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadRC, saveRC } from "../fluidToolRc.js";

// Permission bits are not meaningful on Windows (chmod only toggles the read-only bit there).
const itPosix = process.platform === "win32" ? it.skip : it;

/**
 * Returns the octal group/other permission digits of a file mode (e.g. "00" for 0600, "44" for 0644),
 * avoiding bitwise operators (disallowed by the repo lint config).
 */
function groupOtherPerms(mode: number): string {
	return mode.toString(8).slice(-2);
}

describe("fluidToolRc saveRC", () => {
	let tempHome: string;
	let originalHome: string | undefined;
	let originalUserProfile: string | undefined;

	// Isolate each test from the user's real home directory and .fluidtoolrc file.
	beforeEach(() => {
		tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "fluidtoolrc-test-"));
		originalHome = process.env.HOME;
		originalUserProfile = process.env.USERPROFILE;
		// getRCFileName() resolves os.homedir() at call time, which honors these on POSIX/Windows.
		process.env.HOME = tempHome;
		process.env.USERPROFILE = tempHome;
	});

	// Restore the process environment and remove the isolated home directory after each test.
	afterEach(() => {
		if (originalHome === undefined) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
		if (originalUserProfile === undefined) {
			delete process.env.USERPROFILE;
		} else {
			process.env.USERPROFILE = originalUserProfile;
		}
		fs.rmSync(tempHome, { recursive: true, force: true });
	});

	itPosix("creates ~/.fluidtoolrc with owner-only (0600) permissions", async () => {
		await saveRC({ tokens: { version: 1, data: {} } });
		const stat = fs.statSync(path.join(tempHome, ".fluidtoolrc"));
		assert.strictEqual(
			groupOtherPerms(stat.mode),
			"00",
			`expected no group/other permissions, got 0${stat.mode.toString(8).slice(-3)}`,
		);
	});

	itPosix("repairs a pre-existing world-readable (0644) file to 0600", async () => {
		const fileName = path.join(tempHome, ".fluidtoolrc");
		fs.writeFileSync(fileName, "{}", { mode: 0o644 });
		fs.chmodSync(fileName, 0o644); // force 0644 regardless of the process umask
		await saveRC({ tokens: { version: 1, data: {} } });
		const stat = fs.statSync(fileName);
		assert.strictEqual(
			groupOtherPerms(stat.mode),
			"00",
			`expected the existing file to be repaired to 0600, got 0${stat.mode.toString(8).slice(-3)}`,
		);
	});

	it("round-trips saved content", async () => {
		const rc = { tokens: { version: 1, data: { user1: {} } } };
		await saveRC(rc);
		assert.deepStrictEqual(await loadRC(), rc);
	});
});
