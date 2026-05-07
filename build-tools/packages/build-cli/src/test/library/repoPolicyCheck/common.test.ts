/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "chai";
import { describe, it } from "mocha";

import { readPackageJson } from "../../../library/repoPolicyCheck/common.js";

describe("readPackageJson", () => {
	async function withTempDir<T>(run: (testDir: string) => Promise<T>): Promise<T> {
		const testDir = await mkdtemp(path.join(tmpdir(), "read-package-json-test-"));
		try {
			return await run(testDir);
		} finally {
			await rm(testDir, { recursive: true, force: true });
		}
	}

	it("returns Ok with the parsed package.json", async () => {
		await withTempDir(async (testDir) => {
			const packageJsonFile = path.join(testDir, "package.json");
			await writeFile(
				packageJsonFile,
				JSON.stringify({ name: "test-package", version: "1.0.0" }),
			);

			const result = readPackageJson(packageJsonFile);

			if (result.isErr) {
				throw new Error(result.error);
			}
			expect(result.value.name).to.equal("test-package");
		});
	});

	it("returns Err with the file path for malformed JSON", async () => {
		await withTempDir(async (testDir) => {
			const packageJsonFile = path.join(testDir, "package.json");
			await writeFile(packageJsonFile, "{");

			const result = readPackageJson(packageJsonFile);

			if (result.isOk) {
				throw new Error("Expected malformed JSON to return Err.");
			}
			expect(result.error).to.include(packageJsonFile);
		});
	});

	it("returns Err with the file path for a missing file", async () => {
		await withTempDir(async (testDir) => {
			const packageJsonFile = path.join(testDir, "package.json");

			const result = readPackageJson(packageJsonFile);

			if (result.isOk) {
				throw new Error("Expected missing file to return Err.");
			}
			expect(result.error).to.include(packageJsonFile);
		});
	});
});
