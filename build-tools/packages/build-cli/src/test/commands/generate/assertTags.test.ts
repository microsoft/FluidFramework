/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import execa from "execa";
import { lilconfig } from "lilconfig";
import { afterEach, beforeEach, describe, it } from "mocha";
import {
	generateShortCodeMap,
	generateShortCodeMappingFileContents,
} from "../../../commands/generate/assertTags.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

describe("generate:assertTags", () => {
	describe("integration tests", () => {
		let testDir: string;
		let mappingPath: string;

		// Tagging rewrites source files and the mapping. Use a fresh temporary repo per test
		// instead of modifying checked-in src/test/data fixtures, keeping the checkout clean
		// and preventing changes from one test from affecting another.
		beforeEach(async () => {
			testDir = await mkdtemp(path.join(tmpdir(), "assertTagging-integration-"));
			await writeFile(
				path.join(testDir, "package.json"),
				JSON.stringify({
					name: "assert-tagging-test-repo",
					version: "1.0.0",
					private: true,
					fluidBuild: { version: 1, repoPackages: {} },
				}),
			);
			await writeFile(
				path.join(testDir, "flub.config.cjs"),
				"module.exports = { version: 1 };\n",
			);
			mappingPath = path.join(
				testDir,
				"packages/runtime/test-runtime-utils/src/assertionShortCodesMap.ts",
			);
			await mkdir(path.dirname(mappingPath), { recursive: true });
			await writeFile(mappingPath, "export const shortCodeMap = {};\n");
		});

		afterEach(async () => {
			await rm(testDir, { recursive: true, force: true });
		});

		async function createPackage(name: string, source: string): Promise<string> {
			const directory = path.join(testDir, name);
			await mkdir(directory);
			await writeFile(
				path.join(directory, "package.json"),
				JSON.stringify({ name, version: "1.0.0", private: true, type: "module" }),
			);
			// Additional source files must be discovered through imports, not the tsconfig file list.
			await writeFile(
				path.join(directory, "tsconfig.json"),
				JSON.stringify({
					files: ["index.ts"],
					compilerOptions: { types: [], module: "NodeNext", moduleResolution: "NodeNext" },
				}),
			);
			await writeFile(path.join(directory, "index.ts"), source);
			return directory;
		}

		async function runCommand(
			directories: string[],
			flags: string[] = [],
		): Promise<execa.ExecaReturnValue> {
			// Isolate both repo discovery and cwd-relative mapping writes from the real checkout.
			return execa(
				process.execPath,
				[
					path.resolve(__dirname, "../../../../bin/run.js"),
					"generate:assertTags",
					"--disableConfig",
					"--dir",
					...directories,
					...flags,
				],
				{ cwd: testDir, env: { _FLUID_ROOT_: testDir }, reject: false },
			);
		}

		async function validate(
			directories: string[],
			flags: string[] = [],
		): Promise<execa.ExecaReturnValue> {
			return runCommand(directories, ["--validate", ...flags]);
		}

		describe("tagging", () => {
			it("tags messages across packages, writes the mapping, and is idempotent", async () => {
				const first = await createPackage(
					"first",
					'assert(true, 0x005 /* existing first */); assert(true, "new string"); assert(true, `new template`);',
				);
				// Codes assigned in the first package must account for the higher code in the second.
				const second = await createPackage(
					"second",
					'assert(true, 0x010 /* existing second */); assert(true, "another message");',
				);
				// Exercise creation of the mapping directory as well as the mapping file.
				await rm(path.dirname(mappingPath), { recursive: true });
				const result = await runCommand([first, second]);
				assert.equal(result.exitCode, 0, result.stdout + result.stderr);
				const firstPath = path.join(first, "index.ts");
				const secondPath = path.join(second, "index.ts");
				const expectedFirst =
					"assert(true, 0x005 /* existing first */); assert(true, 0x011 /* new string */); assert(true, 0x012 /* new template */);";
				const expectedSecond =
					"assert(true, 0x010 /* existing second */); assert(true, 0x013 /* another message */);";
				const expectedMapping = generateShortCodeMappingFileContents(
					new Map([
						["0x005", "existing first"],
						["0x010", "existing second"],
						["0x011", "new string"],
						["0x012", "new template"],
						["0x013", "another message"],
					]),
				);
				assert.equal(await readFile(firstPath, "utf8"), expectedFirst);
				assert.equal(await readFile(secondPath, "utf8"), expectedSecond);
				assert.equal(await readFile(mappingPath, "utf8"), expectedMapping);

				const repeated = await runCommand([first, second]);
				assert.equal(repeated.exitCode, 0, repeated.stdout + repeated.stderr);
				assert.equal(await readFile(firstPath, "utf8"), expectedFirst);
				assert.equal(await readFile(secondPath, "utf8"), expectedSecond);
				assert.equal(await readFile(mappingPath, "utf8"), expectedMapping);
				const required = await runCommand([first, second], ["--requireTagged"]);
				assert.equal(required.exitCode, 0, required.stdout + required.stderr);
			});

			it("tags configured local imports without modifying external imports", async () => {
				const externalSource = 'assert(true, "external message");';
				const external = await createPackage("external", externalSource);
				const localSource = 'import "./nested.js"; import "../external/index.js";';
				const directory = await createPackage("local", localSource);
				await writeFile(
					path.join(directory, "assertTagging.config.mjs"),
					"export default { assertionFunctions: { fail: 0 } };\n",
				);
				const nestedPath = path.join(directory, "nested.ts");
				await writeFile(nestedPath, 'fail("local message");');
				const result = await runCommand([directory]);
				assert.equal(result.exitCode, 0, result.stdout + result.stderr);
				assert.equal(await readFile(nestedPath, "utf8"), "fail(0x000 /* local message */);");
				assert.equal(await readFile(path.join(directory, "index.ts"), "utf8"), localSource);
				assert.equal(await readFile(path.join(external, "index.ts"), "utf8"), externalSource);
				assert.equal(
					await readFile(mappingPath, "utf8"),
					generateShortCodeMappingFileContents(new Map([["0x000", "local message"]])),
				);
			});

			it("does not modify sources or the mapping when a selected package is invalid", async () => {
				const validSource = 'assert(true, "new message");';
				const invalidSource = "assert(true, 123);";
				const valid = await createPackage("valid", validSource);
				const invalid = await createPackage("invalid", invalidSource);
				const mapping = await readFile(mappingPath, "utf8");
				// A later validation error must prevent writes to the earlier valid package too.
				const result = await runCommand([valid, invalid]);
				assert.equal(result.exitCode, 1, result.stdout + result.stderr);
				assert(
					result.stdout.includes(
						"Shortcodes must be provided by automation and be in hex format",
					),
					result.stdout + result.stderr,
				);
				assert.equal(await readFile(path.join(valid, "index.ts"), "utf8"), validSource);
				assert.equal(await readFile(path.join(invalid, "index.ts"), "utf8"), invalidSource);
				assert.equal(await readFile(mappingPath, "utf8"), mapping);
			});
		});

		describe("validation", () => {
			for (const [type, source, target] of [
				["commonjs", 'void import("#dep");', "import.ts"],
				["module", 'import dependency = require("#dep");', "require.ts"],
			] as const) {
				it(`uses the import's resolution mode in a ${type} file`, async () => {
					const directory = await createPackage("conditional-import", source);
					await writeFile(
						path.join(directory, "package.json"),
						JSON.stringify({
							name: "conditional-import",
							version: "1.0.0",
							private: true,
							type,
							imports: { "#dep": { import: "./import.ts", require: "./require.ts" } },
						}),
					);
					// Only the target selected by the import's mode contains an invalid assertion.
					await writeFile(path.join(directory, "import.ts"), "export {};");
					await writeFile(path.join(directory, "require.ts"), "export {};");
					await writeFile(path.join(directory, target), "assert(true, 123);");
					const result = await validate([directory]);
					assert.equal(result.exitCode, 1, result.stdout + result.stderr);
					assert(result.stdout.includes(`${target}:1`), result.stdout + result.stderr);
				});
			}

			for (const flags of [["--validate"], [], ["--requireTagged"]]) {
				it(`rejects comment terminators without writes in ${flags[0] ?? "tagging"} mode`, async () => {
					// Check decoded strings as well as template literals: tagging inserts their text in a comment.
					const source =
						'assert(true, "*/"); assert(true, "*\\u002f"); assert(true, `*/`); assert(true, "next");';
					const directory = await createPackage("unsafe-message", source);
					const mapping = await readFile(mappingPath, "utf8");
					const result = await runCommand([directory], flags);
					assert.equal(result.exitCode, 1, result.stdout + result.stderr);
					assert.equal(
						result.stdout.split("Assertion messages must not contain '*/'").length - 1,
						3,
						result.stdout + result.stderr,
					);
					assert.equal(await readFile(path.join(directory, "index.ts"), "utf8"), source);
					assert.equal(await readFile(mappingPath, "utf8"), mapping);
				});
			}

			it("accepts literal messages without modifying files", async () => {
				const source =
					'assert(true, "message"); assert(true, `template`); assert(true, 0x001);';
				const directory = await createPackage("valid", source);
				const mapping = await readFile(mappingPath, "utf8");
				const result = await validate([directory]);
				assert.equal(result.exitCode, 0, result.all ?? result.stdout + result.stderr);
				assert.equal(await readFile(path.join(directory, "index.ts"), "utf8"), source);
				assert.equal(await readFile(mappingPath, "utf8"), mapping);
			});

			for (const [message, expected] of [
				["123", "Shortcodes must be provided by automation and be in hex format"],
				[`\`message \${true}\``, "Template expressions are not supported"],
				["message", "Unsupported argument kind"],
			] as const) {
				it(`rejects ${message}`, async () => {
					const directory = await createPackage("invalid", `assert(true, ${message});`);
					const result = await validate([directory]);
					assert.equal(result.exitCode, 1);
					assert(result.stdout.includes(expected), result.stdout + result.stderr);
				});
			}

			it("detects duplicate shortcodes across packages", async () => {
				const first = await createPackage("first", "assert(true, 0x001);");
				const second = await createPackage("second", "assert(true, 0x001);");
				const result = await validate([first, second]);
				assert.equal(result.exitCode, 1);
				assert(
					result.stdout.includes("Duplicate shortcode 0x1"),
					result.stdout + result.stderr,
				);
			});

			it("validates transitive local imports omitted from tsconfig files", async () => {
				const directory = await createPackage("local-import", 'import "./excluded.js";');
				await writeFile(path.join(directory, "excluded.ts"), 'export * from "./nested.js";');
				await writeFile(path.join(directory, "nested.ts"), "assert(true, 123);");
				const result = await validate([directory]);
				assert.equal(result.exitCode, 1);
				assert(result.stdout.includes("nested.ts:1"), result.stdout + result.stderr);
			});

			it("does not validate imports outside the selected package", async () => {
				await createPackage("external", "assert(true, 123);");
				const directory = await createPackage("local", 'import "../external/index.js";');
				const result = await validate([directory]);
				assert.equal(result.exitCode, 0, result.stdout + result.stderr);
				assert(result.stdout.includes("1 source files"), result.stdout);
			});

			it("still checks requireTagged when combined with validate", async () => {
				const directory = await createPackage("untagged", 'assert(true, "message");');
				const result = await validate([directory], ["--requireTagged"]);
				assert.equal(result.exitCode, 1);
				assert(
					result.stdout.includes("Asserts would be tagged in untagged"),
					result.stdout + result.stderr,
				);
			});
		});
	});

	it("sorts short codes", () => {
		const codeToMsgMap = new Map<string, string>([
			["0x1", "A"],
			["0x6", "B"],
			["0x5", "C"],
		]);

		const expectedShortCodeMap = {
			"0x1": "A",
			"0x5": "C",
			"0x6": "B",
		};

		const generatedShortCodeMap = generateShortCodeMap(codeToMsgMap);
		assert.deepStrictEqual(generatedShortCodeMap, expectedShortCodeMap);
	});

	it("generateShortCodeMappingFileContents", () => {
		const codeToMsgMap = new Map<string, string>([
			["0x2", "A"],
			["0x1", "B"],
		]);
		const generatedShortCodeMap = generateShortCodeMappingFileContents(codeToMsgMap);
		assert.equal(
			generatedShortCodeMap,
			`/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 *
 * THIS IS AN AUTOGENERATED FILE. DO NOT EDIT THIS FILE DIRECTLY
 */

// Auto-generated by policy-check in @fluidframework/build-tools.

export const shortCodeMap = {
	"0x1": "B",
	"0x2": "A"
};
`,
		);
	});

	describe("lilconfig config loading", () => {
		const configName = "assertTagging";
		let testDirs: string[] = [];

		/**
		 * Creates a temporary test directory and copies a fixture config file into it
		 */
		async function createTestFixture(fixtureFileName: string): Promise<string> {
			const testDir = await mkdtemp(path.join(tmpdir(), "assertTagging-test-"));
			testDirs.push(testDir);

			const sourceFile = path.join(fixturesDir, fixtureFileName);
			const targetFile = path.join(testDir, fixtureFileName);
			await copyFile(sourceFile, targetFile);

			return testDir;
		}

		afterEach(async () => {
			// Clean up test directories
			const dirsToClean = testDirs;
			testDirs = [];
			await Promise.all(
				dirsToClean.map(async (dir) => rm(dir, { recursive: true, force: true })),
			);
		});

		it("loads .mjs config files", async () => {
			const testDir = await createTestFixture("assertTagging.config.mjs");

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.mjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert("assertionFunctions" in result.config, "Config should have expected structure");
			const configData = result.config as {
				assertionFunctions: Record<string, number>;
			};
			assert.strictEqual(configData.assertionFunctions.assert, 1);
			assert.strictEqual(configData.assertionFunctions.fail, 0);
		});

		it("loads .cjs config files", async () => {
			const testDir = await createTestFixture("assertTagging.config.cjs");

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.cjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert("assertionFunctions" in result.config, "Config should have expected structure");
			const configData = result.config as {
				assertionFunctions: Record<string, number>;
			};
			assert.strictEqual(configData.assertionFunctions.assert, 1);
			assert.strictEqual(configData.assertionFunctions.fail, 0);
		});

		it("loads .mjs config with empty assertionFunctions", async () => {
			const testDir = await createTestFixture("assertTagging-empty.config.mjs");

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}-empty.config.mjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null);
			const configContentParsed = result.config as {
				assertionFunctions: Record<string, number>;
			};
			assert(
				typeof configContentParsed.assertionFunctions === "object",
				"assertionFunctions should be an object",
			);
			assert(
				Object.keys(configContentParsed.assertionFunctions).length === 0,
				"assertionFunctions should be empty (disables tagging)",
			);
		});

		it("returns null when no config file exists", async () => {
			const testDir = await mkdtemp(path.join(tmpdir(), "assertTagging-no-config-"));
			testDirs.push(testDir);

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.mjs`],
			});

			const result = await config.search(testDir);

			// Should return null when no config is found
			assert(result === null, "Should return null when no config exists");
		});

		it("respects config loading order", async () => {
			const testDir = await mkdtemp(path.join(tmpdir(), "assertTagging-test-"));
			testDirs.push(testDir);

			// Copy both config files
			await copyFile(
				path.join(fixturesDir, "assertTagging.config.cjs"),
				path.join(testDir, "assertTagging.config.cjs"),
			);
			await copyFile(
				path.join(fixturesDir, "assertTagging.config.mjs"),
				path.join(testDir, "assertTagging.config.mjs"),
			);

			const config = lilconfig(configName, {
				searchPlaces: [`${configName}.config.cjs`, `${configName}.config.mjs`],
			});

			const result = await config.search(testDir);

			assert(result !== null, "Config should be found");
			assert(result.filepath.endsWith(".cjs"), "Should load .cjs file when listed first");
		});
	});
});
