/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, it } from "mocha";

import { handler } from "../../../library/repoPolicyCheck/dockerfilePackages.js";

describe("dockerfile-packages policy check", () => {
	let testDir: string;

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "dockerfile-packages-test-"));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	async function writeDockerfileFixture(): Promise<{
		dockerfileDir: string;
		packageDir: string;
	}> {
		const dockerfileDir = path.join(testDir, "server/routerlicious");
		const packageDir = path.join(dockerfileDir, "packages/foo");
		await mkdir(packageDir, { recursive: true });
		await writeFile(
			path.join(dockerfileDir, "Dockerfile"),
			[
				"COPY packages/a/package*.json packages/a/",
				"COPY packages/b/package*.json packages/b/",
				"COPY packages/c/package*.json packages/c/",
				"",
				"",
			].join("\n"),
		);
		return { dockerfileDir, packageDir };
	}

	async function runResolver(packageJsonPath: string): Promise<string> {
		const dockerfilePath = path.join(testDir, "server/routerlicious", "Dockerfile");

		const originalCwd = process.cwd();
		process.chdir(testDir);
		try {
			handler.resolver?.(packageJsonPath, testDir);
		} finally {
			process.chdir(originalCwd);
		}

		return readFile(dockerfilePath, "utf8");
	}

	it("writes POSIX COPY text when fixing a Windows-style relative path", async function () {
		if (path.sep !== "\\") {
			this.skip();
		}

		const { packageDir } = await writeDockerfileFixture();
		const packageJsonPath = path.join(packageDir, "package.json");
		await writeFile(packageJsonPath, "");

		const dockerfile = await runResolver(packageJsonPath);

		assert.match(dockerfile, /COPY packages\/foo\/package\*\.json packages\/foo\//);
		assert.doesNotMatch(dockerfile, /COPY packages\\foo/);
	});

	it("normalizes backslash-containing package paths on any platform", async () => {
		const { dockerfileDir } = await writeDockerfileFixture();
		const packageJsonPath = path.join(dockerfileDir, "packages\\bar", "package.json");

		const dockerfile = await runResolver(packageJsonPath);

		assert.match(dockerfile, /COPY packages\/bar\/package\*\.json packages\/bar\//);
		assert.doesNotMatch(dockerfile, /COPY packages\\bar/);
	});
});
