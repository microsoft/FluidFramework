/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
	getInstalledPackageVersion,
	getOxLintConfigFilePath,
} from "../../../fluidBuild/tasks/taskUtils.js";

describe("OxlintTask", () => {
	let directory: string;

	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), "fluid-oxlint-task-"));
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	it("discovers Oxlint JSON configs", async () => {
		await writeFile(path.join(directory, ".oxlintrc.json"), "{}");

		assert.equal(getOxLintConfigFilePath(directory), path.join(directory, ".oxlintrc.json"));
	});

	it("discovers Oxlint TypeScript configs", async () => {
		await writeFile(path.join(directory, "oxlint.config.mts"), "");

		assert.equal(
			getOxLintConfigFilePath(directory),
			path.join(directory, "oxlint.config.mts"),
		);
	});

	it("returns undefined when no config exists", () => {
		assert.equal(getOxLintConfigFilePath(directory), undefined);
	});

	it("reads the version of a binary-only package", async () => {
		const packageDirectory = path.join(directory, "node_modules", "binary-only");
		await mkdir(packageDirectory, { recursive: true });
		await writeFile(
			path.join(packageDirectory, "package.json"),
			JSON.stringify({ name: "binary-only", version: "1.2.3", bin: "./bin.js" }),
		);

		assert.equal(await getInstalledPackageVersion("binary-only", directory), "1.2.3");
	});
});
