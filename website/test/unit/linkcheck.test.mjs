/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installLinkcheck } from "../../infra/linkcheck.mjs";

describe("linkcheck installation", () => {
	let directory;
	let fetchMock;

	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), "fluid-linkcheck-test-"));
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(async () => {
		vi.unstubAllGlobals();
		await rm(directory, { recursive: true, force: true });
	});

	it("rejects unsupported platforms before a download", async () => {
		await expect(installLinkcheck(directory, "win32", "arm64")).rejects.toThrow(
			"Unsupported linkcheck platform: win32 arm64",
		);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reports HTTP errors without extraction", async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
		await expect(installLinkcheck(directory, "linux", "x64")).rejects.toThrow("HTTP 404");
		expect(await readdir(directory)).toEqual([]);
	});

	it.each([
		["linux", "x64", "linux-x64.tar.gz"],
		["darwin", "arm64", "macos-arm64.tar.gz"],
		["win32", "x64", "windows-x64.zip"],
	])("rejects changed archives on %s %s before extraction", async (platform, arch, filename) => {
		fetchMock.mockResolvedValue(new Response("changed archive"));
		await expect(installLinkcheck(directory, platform, arch)).rejects.toThrow(
			`SHA-256 mismatch for linkcheck-3.0.0-${filename}`,
		);
		expect(fetchMock).toHaveBeenCalledWith(
			`https://github.com/filiph/linkcheck/releases/download/3.0.0/linkcheck-3.0.0-${filename}`,
		);
		expect(await readdir(directory)).toEqual([]);
	});

	it("propagates download failures", async () => {
		fetchMock.mockRejectedValue(new Error("Connection failed"));
		await expect(installLinkcheck(directory, "linux", "x64")).rejects.toThrow(
			"Connection failed",
		);
		expect(await readdir(directory)).toEqual([]);
	});
});
