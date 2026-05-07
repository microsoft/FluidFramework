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

	it("returns success with the parsed package.json", async () => {
		await withTempDir(async (testDir) => {
			const packageJsonFile = path.join(testDir, "package.json");
			await writeFile(
				packageJsonFile,
				JSON.stringify({ name: "test-package", version: "1.0.0" }),
			);

			const result = readPackageJson(packageJsonFile);

			if (!result.success) {
				throw new Error(result.error);
			}
			expect(result.value.name).to.equal("test-package");
		});
	});

	it("returns failure with the file path for malformed JSON", async () => {
		await withTempDir(async (testDir) => {
			const packageJsonFile = path.join(testDir, "package.json");
			await writeFile(packageJsonFile, "{");

			const result = readPackageJson(packageJsonFile);

			if (result.success) {
				throw new Error("Expected malformed JSON to return an error result.");
			}
			expect(result.error).to.include(packageJsonFile);
		});
	});

	it("returns failure with the file path for a missing file", async () => {
		await withTempDir(async (testDir) => {
			const packageJsonFile = path.join(testDir, "package.json");

			const result = readPackageJson(packageJsonFile);

			if (result.success) {
				throw new Error("Expected missing file to return an error result.");
			}
			expect(result.error).to.include(packageJsonFile);
		});
	});
});
