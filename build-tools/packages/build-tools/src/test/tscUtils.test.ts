/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import path from "node:path";
import { describe, it } from "mocha";

import {
	getResolvedTsConfig,
	getTsBuildInfoFileFromConfig,
	getTsBuildInfoFullPath,
	getTscUtils,
	type ResolvedTsConfig,
	remapOutFile,
} from "../fluidBuild/tscUtils.js";
import { testDataPath } from "./init.js";

/**
 * The functions under test only read the `options` bag (and, for build info, the config file
 * path). This helper builds a minimal {@link ResolvedTsConfig} for the pure-function tests
 * without needing to invoke the TypeScript compiler.
 */
function makeConfig(options: Record<string, unknown>): ResolvedTsConfig {
	return { options, fileNames: [], errors: [] } as unknown as ResolvedTsConfig;
}

describe("tscUtils", () => {
	describe("remapOutFile", () => {
		it("emits next to the source when no outDir is set", () => {
			const result = remapOutFile(makeConfig({}), "/pkg/src", "index.tsbuildinfo");
			assert.equal(result, path.join("/pkg/src", "index.tsbuildinfo"));
		});

		it("emits into outDir when rootDir is not set", () => {
			const result = remapOutFile(
				makeConfig({ outDir: "/pkg/lib" }),
				"/pkg/src",
				"index.tsbuildinfo",
			);
			assert.equal(result, path.join("/pkg/lib", "index.tsbuildinfo"));
		});

		it("preserves the rootDir-relative path under outDir", () => {
			const result = remapOutFile(
				makeConfig({ outDir: "/pkg/lib", rootDir: "/pkg/src" }),
				"/pkg/src/sub",
				"index.tsbuildinfo",
			);
			assert.equal(result, path.join("/pkg/lib", "sub", "index.tsbuildinfo"));
		});
	});

	describe("getTsBuildInfoFileFromConfig", () => {
		const configFile = "/pkg/tsconfig.json";

		it("returns undefined when the build is not incremental", () => {
			assert.equal(getTsBuildInfoFileFromConfig(makeConfig({}), configFile), undefined);
		});

		it("uses an explicit tsBuildInfoFile when configured", () => {
			const result = getTsBuildInfoFileFromConfig(
				makeConfig({ incremental: true, tsBuildInfoFile: "./custom.tsbuildinfo" }),
				configFile,
			);
			assert.equal(result, "./custom.tsbuildinfo");
		});

		it("derives the build info file from outFile", () => {
			const result = getTsBuildInfoFileFromConfig(
				makeConfig({ incremental: true, outFile: "/pkg/out/bundle.js" }),
				configFile,
			);
			assert.equal(result, "/pkg/out/bundle.js.tsbuildinfo");
		});

		it("derives the build info file from the legacy out option", () => {
			const result = getTsBuildInfoFileFromConfig(
				makeConfig({ incremental: true, out: "/pkg/out/bundle.js" }),
				configFile,
			);
			assert.equal(result, "/pkg/out/bundle.js.tsbuildinfo");
		});

		it("defaults to the config file name beside the config (.json extension)", () => {
			const result = getTsBuildInfoFileFromConfig(
				makeConfig({ incremental: true }),
				configFile,
			);
			assert.equal(result, path.join("/pkg", "tsconfig.tsbuildinfo"));
		});

		it("keeps a non-.json config extension in the default name", () => {
			const result = getTsBuildInfoFileFromConfig(
				makeConfig({ incremental: true }),
				"/pkg/tsconfig.cjs",
			);
			assert.equal(result, path.join("/pkg", "tsconfig.cjs.tsbuildinfo"));
		});

		it("remaps the default build info file into outDir", () => {
			const result = getTsBuildInfoFileFromConfig(
				makeConfig({ incremental: true, outDir: "/pkg/lib" }),
				configFile,
			);
			assert.equal(result, path.join("/pkg/lib", "tsconfig.tsbuildinfo"));
		});
	});

	describe("getTsBuildInfoFullPath", () => {
		const packageDir = "/pkg";
		const configFile = "/pkg/tsconfig.json";

		it("returns undefined when the build is not incremental", () => {
			assert.equal(getTsBuildInfoFullPath(makeConfig({}), packageDir, configFile), undefined);
		});

		it("returns an absolute tsBuildInfoFile unchanged", () => {
			const result = getTsBuildInfoFullPath(
				makeConfig({ incremental: true, tsBuildInfoFile: "/elsewhere/build.tsbuildinfo" }),
				packageDir,
				configFile,
			);
			assert.equal(result, "/elsewhere/build.tsbuildinfo");
		});

		it("resolves a relative tsBuildInfoFile against the package directory", () => {
			const result = getTsBuildInfoFullPath(
				makeConfig({ incremental: true, tsBuildInfoFile: "./custom.tsbuildinfo" }),
				packageDir,
				configFile,
			);
			assert.equal(result, path.join(packageDir, "custom.tsbuildinfo"));
		});
	});

	describe("getResolvedTsConfig", () => {
		const projectDir = path.resolve(testDataPath, "tsc");
		const tscUtils = getTscUtils(projectDir);

		function resolveProject(command: string): ResolvedTsConfig | undefined {
			const parsedCommand = tscUtils.parseCommandLine(command);
			assert.ok(parsedCommand, "expected the command line to parse");
			const configFile = tscUtils.findConfigFile(projectDir, parsedCommand);
			assert.ok(configFile, "expected to find the config file");
			return getResolvedTsConfig(tscUtils, projectDir, parsedCommand, configFile);
		}

		it("merges options inherited via extends", () => {
			const resolved = resolveProject("tsc --project ./tsconfig.json");
			assert.ok(resolved, "expected the config to resolve");
			// incremental and strict come from tsconfig.base.json via extends.
			assert.equal(resolved.options.incremental, true);
			assert.equal(resolved.options.strict, true);
			// outDir (from base) and rootDir (from the child) are resolved to absolute paths.
			assert.equal(resolved.options.outDir, path.join(projectDir, "lib"));
			assert.equal(resolved.options.rootDir, path.join(projectDir, "src"));
		});

		it("applies command line option overrides", () => {
			const resolved = resolveProject(
				"tsc --project ./tsconfig.json --tsBuildInfoFile ./override.tsbuildinfo",
			);
			assert.ok(resolved, "expected the config to resolve");
			assert.equal(
				resolved.options.tsBuildInfoFile,
				path.join(projectDir, "override.tsbuildinfo"),
			);
		});

		it("computes the build info path from the resolved config", () => {
			const resolved = resolveProject("tsc --project ./tsconfig.json");
			assert.ok(resolved, "expected the config to resolve");
			// outDir=lib, rootDir=src, config dir = projectDir: the default name remaps to the
			// package root (lib/.. relative to src).
			const result = getTsBuildInfoFullPath(
				resolved,
				projectDir,
				path.join(projectDir, "tsconfig.json"),
			);
			assert.equal(result, path.join(projectDir, "tsconfig.tsbuildinfo"));
		});

		it("returns undefined when the config file cannot be read", () => {
			const parsedCommand = tscUtils.parseCommandLine("tsc --project ./tsconfig.json");
			assert.ok(parsedCommand);
			const result = getResolvedTsConfig(
				tscUtils,
				projectDir,
				parsedCommand,
				path.join(projectDir, "does-not-exist.json"),
			);
			assert.equal(result, undefined);
		});
	});
});
