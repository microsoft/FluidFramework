/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { describe, it } from "mocha";
import { normalizeTsBuildInfo } from "../fluidBuild/tasks/leaf/tscTask.js";

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

	it("returns undefined for partial TS6 format missing options", () => {
		const partial = {
			fileNames: ["./src/index.ts"],
			fileInfos: ["abc123"],
			version: "6.0.3",
		};

		const result = normalizeTsBuildInfo(partial);
		assert.equal(result, undefined);
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
});
