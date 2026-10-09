/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import type { BuildContext } from "../fluidBuild/buildContext.js";
import type { BuildPackage } from "../fluidBuild/buildGraph.js";
import { FileHashCache } from "../fluidBuild/fileHashCache.js";
import { normalizeTsBuildInfo, TscTask } from "../fluidBuild/tasks/leaf/tscTask.js";
import { testDataPath } from "./init.js";

const require = createRequire(import.meta.url);

class TestTscTask extends TscTask {
	public check(): Promise<boolean> {
		return this.checkLeafIsUpToDate();
	}

	public get supportsWorker(): boolean {
		return this.useWorker;
	}
}

for (const compiler of ["typescript-5.4", "typescript-5.9", "typescript-6.0"]) {
	describe(`TscTask incremental integration (${compiler})`, function () {
		this.timeout(10_000);
		let projectDir: string;
		let compilerOptions: Record<string, unknown>;

		beforeEach(async () => {
			projectDir = path.join(testDataPath, `.tsc-integration-${randomUUID()}`);
			await mkdir(path.join(projectDir, "node_modules"), { recursive: true });
			await symlink(
				path.dirname(require.resolve(`${compiler}/package.json`)),
				path.join(projectDir, "node_modules/typescript"),
				"junction",
			);
			await writeFile(path.join(projectDir, "index.ts"), "export const value = 1;");
			compilerOptions = {
				incremental: true,
				target: "es2020",
				module: "node16",
				types: [],
				skipLibCheck: true,
				outDir: "./lib",
				noPropertyAccessFromIndexSignature: true,
				alwaysStrict: true,
			};
		});

		afterEach(async () => {
			await rm(projectDir, { recursive: true, force: true });
		});

		async function writeConfig(): Promise<void> {
			await writeFile(
				path.join(projectDir, "tsconfig.json"),
				JSON.stringify({ compilerOptions, files: ["index.ts"] }),
			);
		}

		async function compile(expectErrors = false): Promise<void> {
			await writeConfig();
			const result = spawnSync(
				process.execPath,
				[require.resolve(`${compiler}/bin/tsc`), "--project", projectDir],
				{ encoding: "utf8", timeout: 10_000 },
			);
			assert.equal(result.error, undefined);
			assert.notEqual(result.status, null);
			assert.equal(result.status !== 0, expectErrors, result.stdout + result.stderr);
		}

		function createTask(command = "tsc"): TestTscTask {
			const node = {
				pkg: { directory: projectDir, name: "tsc-test", nameColored: "tsc-test" },
				context: { fileHashCache: new FileHashCache() },
			} as unknown as BuildPackage;
			return new TestTscTask(node, command, {} as unknown as BuildContext, undefined, true);
		}

		async function check(command = "tsc"): Promise<boolean> {
			return createTask(command).check();
		}

		it("recognizes an unchanged build with serialized diagnostic options", async () => {
			await compile();
			assert.equal(await check(), true);
		});

		it("detects changed source files", async () => {
			await compile();
			await writeFile(path.join(projectDir, "index.ts"), "export const value = 2;");
			assert.equal(await check(), false);
		});

		it("detects changed diagnostic options", async () => {
			await compile();
			compilerOptions.noPropertyAccessFromIndexSignature = false;
			await writeConfig();
			assert.equal(await check(), false);
		});

		it("recognizes composite builds without explicit incremental", async () => {
			delete compilerOptions.incremental;
			compilerOptions.composite = true;
			await compile();
			assert.equal(await check(), true);
		});

		it("recognizes a successful noEmit build", async () => {
			compilerOptions.noEmit = true;
			await compile();
			assert.equal(await check(), true);
		});

		it("checks build-mode project references", async () => {
			await compile();
			assert.equal(await check("tsc -b --force"), true);
		});

		it("keeps build mode out of the single-project compiler worker", () => {
			assert.equal(createTask("tsc").supportsWorker, true);
			assert.equal(createTask("tsc -b --force").supportsWorker, false);
		});

		it("tracks bundled output", async () => {
			delete compilerOptions.outDir;
			compilerOptions.module = "amd";
			compilerOptions.outFile = "./bundle.js";
			if (compiler === "typescript-6.0") {
				compilerOptions.ignoreDeprecations = "6.0";
			}
			await compile();
			assert.equal(await check(), true);
			if (compiler !== "typescript-5.4") {
				compilerOptions.noEmit = true;
				await rm(path.join(projectDir, "bundle.tsbuildinfo"));
				await compile();
				assert.equal(await check(), true);
				delete compilerOptions.noEmit;
				await writeConfig();
				assert.equal(await check(), false);
			}
		});

		if (compiler === "typescript-6.0") {
			it("tracks TypeScript 6 stableTypeOrdering", async () => {
				compilerOptions.stableTypeOrdering = true;
				await compile();
				assert.equal(await check(), true);
				compilerOptions.stableTypeOrdering = false;
				await writeConfig();
				assert.equal(await check(), false);
			});
		}

		if (compiler !== "typescript-5.4") {
			it("rechecks builds that previously skipped type checking", async () => {
				compilerOptions.noCheck = true;
				await compile();
				assert.equal(await check(), true);
				delete compilerOptions.noCheck;
				await writeConfig();
				assert.equal(await check(), false);
			});

			it("does not reuse builds with compiler-option errors", async () => {
				compilerOptions.allowImportingTsExtensions = true;
				await compile(true);
				assert.equal(
					await check(),
					false,
					await readFile(path.join(projectDir, "lib/tsconfig.tsbuildinfo"), "utf8"),
				);
			});
		}
	});
}

describe("normalizeTsBuildInfo", () => {
	it("parses TS5.x format with program wrapper", () => {
		const ts5BuildInfo = {
			program: {
				fileNames: ["../lib.d.ts", "./src/index.ts"],
				fileInfos: ["abc123", { version: "def456", affectsGlobalScope: true }],
				options: {
					target: 1,
					module: 1,
					strict: true,
				},
				changeFileSet: [1],
				affectedFilesPendingEmit: undefined,
				emitDiagnosticsPerFile: undefined,
				semanticDiagnosticsPerFile: undefined,
			},
			version: "5.4.5",
		};

		const result = normalizeTsBuildInfo(ts5BuildInfo);

		assert.notEqual(result, undefined, "Expected a defined result");
		assert.ok(result);
		assert.deepEqual(result.program.fileNames, ["../lib.d.ts", "./src/index.ts"]);
		assert.deepEqual(result.program.fileInfos, [
			"abc123",
			{ version: "def456", affectsGlobalScope: true },
		]);
		assert.deepEqual(result.program.options, { target: 1, module: 1, strict: true });
		assert.deepEqual(result.program.changeFileSet, [1]);
		assert.equal(result.version, "5.4.5");
	});

	it("parses TS6 format with top-level keys (no program wrapper)", () => {
		const ts6BuildInfo = {
			fileNames: ["../lib.d.ts", "./src/index.ts"],
			fileIdsList: [[1, 2]],
			fileInfos: [
				{ version: "abc123", affectsGlobalScope: true, impliedFormat: 1 },
				{ version: "def456", impliedFormat: 99 },
			],
			root: [2],
			options: {
				composite: true,
				declaration: true,
				module: 100,
				target: 8,
				tsBuildInfoFile: "./tsconfig.tsbuildinfo",
			},
			referencedMap: [],
			affectedFilesPendingEmit: [2],
			emitSignatures: [],
			version: "6.0.3",
		};

		const result = normalizeTsBuildInfo(ts6BuildInfo);

		assert.notEqual(result, undefined, "Expected a defined result");
		assert.ok(result);
		assert.deepEqual(result.program.fileNames, ["../lib.d.ts", "./src/index.ts"]);
		assert.deepEqual(result.program.fileInfos, [
			{ version: "abc123", affectsGlobalScope: true, impliedFormat: 1 },
			{ version: "def456", impliedFormat: 99 },
		]);
		assert.deepEqual(result.program.options, {
			composite: true,
			declaration: true,
			module: 100,
			target: 8,
			tsBuildInfoFile: "./tsconfig.tsbuildinfo",
		});
		assert.deepEqual(result.program.affectedFilesPendingEmit, [2]);
		assert.equal(result.version, "6.0.3");
	});

	it("returns undefined for invalid input missing required keys", () => {
		const invalid = {
			someRandomKey: true,
			version: "5.4.5",
		};

		const result = normalizeTsBuildInfo(invalid);
		assert.equal(result, undefined);
	});

	it("returns undefined for partial TS5 format missing fileInfos", () => {
		const partial = {
			program: {
				fileNames: ["./src/index.ts"],
				options: { strict: true },
			},
			version: "5.4.5",
		};

		const result = normalizeTsBuildInfo(partial);
		assert.equal(result, undefined);
	});

	it("accepts TS6 format with no explicitly serialized options", () => {
		const partial = {
			fileNames: ["./src/index.ts"],
			fileInfos: ["abc123"],
			version: "6.0.3",
		};

		const result = normalizeTsBuildInfo(partial);
		assert.deepEqual(result?.program.options, {});
	});

	it("returns undefined for non-object input", () => {
		// The raw value comes from JSON.parse of a file on disk, so it can be any JSON value.
		assert.equal(normalizeTsBuildInfo(undefined), undefined);
		assert.equal(normalizeTsBuildInfo(null), undefined);
		assert.equal(normalizeTsBuildInfo("not an object"), undefined);
		assert.equal(normalizeTsBuildInfo(42), undefined);
	});

	it("returns undefined when the program wrapper is not an object", () => {
		const invalid = {
			program: "not an object",
			version: "5.4.5",
		};

		assert.equal(normalizeTsBuildInfo(invalid), undefined);
	});

	it("returns undefined for malformed required fields", () => {
		const malformedPrograms = [
			{ fileNames: "not an array", fileInfos: ["abc123"], options: {} },
			{ fileNames: ["./src/index.ts"], fileInfos: "not an array", options: {} },
			{ fileNames: ["./src/index.ts"], fileInfos: [42], options: {} },
			{ fileNames: ["./src/index.ts"], fileInfos: ["abc123"], options: "not an object" },
		];

		for (const program of malformedPrograms) {
			assert.equal(normalizeTsBuildInfo({ ...program, version: "6.0.3" }), undefined);
			assert.equal(normalizeTsBuildInfo({ program, version: "5.4.5" }), undefined);
		}
	});

	it("returns undefined for malformed optional array fields", () => {
		const optionalFields = [
			"affectedFilesPendingEmit",
			"emitDiagnosticsPerFile",
			"semanticDiagnosticsPerFile",
			"changeFileSet",
		] as const;

		for (const field of optionalFields) {
			const malformed = {
				fileNames: ["./src/index.ts"],
				fileInfos: ["abc123"],
				options: {},
				[field]: "not an array",
				version: "6.0.3",
			};
			assert.equal(normalizeTsBuildInfo(malformed), undefined);
		}
	});

	it("returns undefined for missing or malformed versions", () => {
		const program = {
			fileNames: ["./src/index.ts"],
			fileInfos: ["abc123"],
			options: {},
		};

		assert.equal(normalizeTsBuildInfo({ program }), undefined);
		assert.equal(normalizeTsBuildInfo({ program, version: 123 }), undefined);
		assert.equal(normalizeTsBuildInfo(program), undefined);
		assert.equal(normalizeTsBuildInfo({ ...program, version: 123 }), undefined);
	});

	it("handles TS6 format with semanticDiagnosticsPerFile errors", () => {
		const ts6WithErrors = {
			fileNames: ["./src/index.ts"],
			fileInfos: ["abc123"],
			options: { strict: true },
			semanticDiagnosticsPerFile: [[1, [{ code: 2322, message: "Type error" }]]],
			version: "6.0.3",
		};

		const result = normalizeTsBuildInfo(ts6WithErrors);

		assert.notEqual(result, undefined, "Expected a defined result");
		assert.ok(result);
		const diagnostics = result.program.semanticDiagnosticsPerFile;
		assert.ok(Array.isArray(diagnostics));
		assert.equal(diagnostics.length, 1);
		// The entry is an array (indicating errors), which the caller uses to detect issues
		assert.ok(Array.isArray(diagnostics[0]));
	});

	it("distinguishes unchecked diagnostics from legacy clean diagnostics", () => {
		const program = {
			fileNames: ["./src/index.ts"],
			fileInfos: ["abc123"],
			options: {},
			semanticDiagnosticsPerFile: [1],
		};
		assert.equal(
			normalizeTsBuildInfo({ ...program, version: "6.0.3" })?.program.checkPending,
			true,
		);
		assert.equal(
			normalizeTsBuildInfo({ program, version: "5.4.5" })?.program.checkPending,
			undefined,
		);
	});

	it("preserves error and pending-emission flags", () => {
		const result = normalizeTsBuildInfo({
			fileNames: ["./src/index.ts"],
			fileInfos: ["abc123"],
			errors: true,
			checkPending: true,
			pendingEmit: false,
			version: "6.0.3",
		});
		assert.equal(result?.program.errors, true);
		assert.equal(result?.program.checkPending, true);
		assert.equal(result?.program.pendingEmit, false);
	});
});
