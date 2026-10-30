/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assert, expect } from "chai";
import execa from "execa";
import { afterEach, beforeEach, describe, it } from "mocha";
import YAML from "yaml";

import {
	normalizeConfig,
	normalizeTypeTestScript,
	previousVersion,
	resetBrokenTests,
	updateTypeTestDependency,
	VersionOptions,
} from "../../commands/typetests.js";
import {
	defaultTypeValidationConfig,
	type ITypeValidationConfig,
	type PackageWithTypeTestSettings,
} from "../../typeValidator/typeValidatorConfig.js";

/**
 * A minimal test package.json. It defines only the required fields according to the type definition.
 */
function packageMinimal(): PackageWithTypeTestSettings {
	return {
		name: "test-package",
		version: "6.0.0",
		scripts: {},
	};
}

/**
 * A test package.json with a typeValidation node.
 *
 * @param enabled - Set this to false to return a package with disabled type tests.
 */
function packageWithTypeValidation(enabled = true): PackageWithTypeTestSettings {
	return {
		...packageMinimal(),
		devDependencies: {
			"test-package-previous": "4.0.0",
		},
		typeValidation: {
			entrypoint: "legacyAlpha",
			broken: {
				"broken-api": {
					backCompat: false,
					forwardCompat: false,
				},
			},
			disabled: !enabled,
		},
	};
}

describe("typetests tests", () => {
	describe("updateTypeTestDependency", () => {
		it("does not remove unrelated dependencies", () => {
			const pkg: PackageWithTypeTestSettings = {
				...packageMinimal(),
				devDependencies: {
					"test-package-previous": "4.0.0",
					"other-dependency": "^1.0.0",
				},
			};
			updateTypeTestDependency(pkg, VersionOptions.Clear);
			expect(pkg.devDependencies).to.deep.equal({
				"other-dependency": "^1.0.0",
			});
		});

		describe("VersionOptions.Clear", () => {
			it("removes previous test package dependency", () => {
				const pkg = packageWithTypeValidation();
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.Clear);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidation(/* enabled */ false);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.Clear);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});
		});

		describe("VersionOptions.ClearIfDisabled", () => {
			it("leaves previous test package dependency when type tests are enabled", () => {
				const pkg = packageWithTypeValidation();
				const expected = packageWithTypeValidation();
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.typeValidation?.disabled).is.false;
				updateTypeTestDependency(pkg, VersionOptions.ClearIfDisabled);
				expect(pkg).to.deep.equal(expected);
			});

			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidation(/* enabled */ false);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.ClearIfDisabled);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});
		});

		describe("VersionOptions.Previous", () => {
			it("sets previous version", () => {
				const pkg = packageWithTypeValidation();
				updateTypeTestDependency(pkg, VersionOptions.Previous);
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@5.0.0",
				);
			});
			it("sets previous version even without typeValidation node", () => {
				const pkg = packageMinimal();
				updateTypeTestDependency(pkg, VersionOptions.Previous);
				expect(pkg.devDependencies?.["test-package-previous"]).to.equal(
					"npm:test-package@5.0.0",
				);
			});
			it("removes previous test package dependency when type tests are disabled", () => {
				const pkg = packageWithTypeValidation(/* enabled */ false);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.exist;
				updateTypeTestDependency(pkg, VersionOptions.Previous);
				// eslint-disable-next-line @typescript-eslint/no-unused-expressions
				expect(pkg.devDependencies?.["test-package-previous"]).to.not.exist;
			});
		});
		describe("catalog dependencies", () => {
			it("collects the npm alias and writes a catalog reference", () => {
				const pkg = packageWithTypeValidation();
				const updates = new Map<string, string>();
				updateTypeTestDependency(pkg, VersionOptions.Previous, updates);
				expect(pkg.devDependencies).to.deep.equal({
					"test-package-previous": "catalog:typeTest-previous",
				});
				expect([...updates]).to.deep.equal([
					["test-package-previous", "npm:test-package@5.0.0"],
				]);
			});

			it("supports scoped packages and exact baseline constraints", () => {
				const pkg = { ...packageMinimal(), name: "@test/example" };
				const updates = new Map<string, string>();
				updateTypeTestDependency(pkg, "4.0.0-beta.1", updates);
				expect(updates.get("@test/example-previous")).to.equal(
					"npm:@test/example@4.0.0-beta.1",
				);
			});

			for (const option of [VersionOptions.Clear, VersionOptions.ClearIfDisabled]) {
				it(`does not change the catalog when removing a disabled dependency with option ${option}`, () => {
					const pkg = packageWithTypeValidation(false);
					const updates = new Map([["test-package-previous", "npm:test-package@4.0.0"]]);
					updateTypeTestDependency(pkg, option, updates);
					expect(pkg.devDependencies).to.deep.equal({});
					expect([...updates]).to.deep.equal([
						["test-package-previous", "npm:test-package@4.0.0"],
					]);
				});
			}
		});
	});

	describe("resetBrokenTests", () => {
		it("empty", () => {
			const pkgJson: { typeValidation?: ITypeValidationConfig } = {
				typeValidation: defaultTypeValidationConfig,
			};
			resetBrokenTests(pkgJson);
			assert.deepEqual(pkgJson.typeValidation?.broken, {});
		});

		it("minimal", () => {
			const pkgJson: { typeValidation?: ITypeValidationConfig } = {
				typeValidation: {
					entrypoint: "legacyAlpha",
					broken: {
						"broken-api": {
							backCompat: false,
							forwardCompat: false,
						},
					},
				},
			};
			resetBrokenTests(pkgJson);
			assert.deepEqual(pkgJson, { typeValidation: { broken: {}, entrypoint: "legacyAlpha" } });
		});

		it("ignores packages with no typeValidation node", () => {
			const pkg = packageMinimal();
			const expected = packageMinimal();

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			expect(pkg.typeValidation).to.not.exist;
			resetBrokenTests(pkg);
			expect(pkg).to.deep.equal(expected);
		});

		it("resets package with type tests", () => {
			const pkg = packageWithTypeValidation();
			resetBrokenTests(pkg);
			expect(pkg.typeValidation?.broken).to.deep.equal({});
		});

		it("resets even if type validation is disabled", () => {
			const pkg = packageWithTypeValidation(/* enabled */ false);
			resetBrokenTests(pkg);
			expect(pkg.typeValidation?.broken).to.deep.equal({});
		});
	});

	describe("previousVersion", () => {
		const cases: [string, string][] = [
			["1.3.3", "1.3.2"],
			["2.0.0", "1.0.0"],
			["4.5.12", "4.5.11"],
			["2.0.0-internal.1.1.0", "2.0.0-internal.1.0.0"],
			["2.0.0-internal.2.0.0", "2.0.0-internal.1.0.0"],
			["2.0.0-internal.3.2.2", "2.0.0-internal.3.2.1"],

			// These cases meet spec, but show cases that you might not want to use "previousVersion".
			// Fortunately if this is not the desired behaviors, all of these result in packages that won't exist,
			// so install will fail (assuming this is used to select a version of a package to install) and the bad version can't be merged.
			["0.4.1000", "0.4.999"],
			["0.4.2000", "0.4.1999"],
			["0.59.3000", "0.59.2999"],
			["2.0.0-internal.1.0.0", "2.0.0-internal.0.0.0"],
		];
		for (const [input, expected] of cases) {
			it(input, () => {
				assert.equal(previousVersion(input), expected);
			});
		}
	});

	describe("normalizeTypeTestScript", () => {
		it("adds script when typeValidation is enabled", () => {
			const pkg: PackageWithTypeTestSettings = {
				...packageMinimal(),
				typeValidation: { broken: {} },
			};
			normalizeTypeTestScript(pkg);
			expect(pkg.scripts?.["typetests:gen"]).to.equal("flub generate typetests --dir . -v");
		});

		it("removes script when typeValidation is disabled", () => {
			const pkg: PackageWithTypeTestSettings = {
				...packageMinimal(),
				scripts: { "typetests:gen": "flub generate typetests --dir . -v" },
				typeValidation: { disabled: true },
			};
			normalizeTypeTestScript(pkg);
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			expect(pkg.scripts?.["typetests:gen"]).to.not.exist;
		});

		it("replaces non-standard script value", () => {
			const pkg: PackageWithTypeTestSettings = {
				...packageMinimal(),
				scripts: { "typetests:gen": "some-old-command" },
				typeValidation: { broken: {} },
			};
			normalizeTypeTestScript(pkg);
			expect(pkg.scripts?.["typetests:gen"]).to.equal("flub generate typetests --dir . -v");
		});

		it("does nothing when typeValidation is undefined", () => {
			const pkg = packageMinimal();
			normalizeTypeTestScript(pkg);
			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			expect(pkg.scripts?.["typetests:gen"]).to.not.exist;
		});
	});

	describe("normalizeConfig", () => {
		it("undefined config", () => {
			const result = normalizeConfig(undefined);
			expect(result).to.deep.equal({
				broken: {},
			});
		});

		it("config with defaults", () => {
			const result = normalizeConfig(defaultTypeValidationConfig);
			expect(result).to.deep.equal({
				broken: {},
			});
		});

		it("disabled config", () => {
			const result = normalizeConfig({
				disabled: true,
				broken: {
					"broken-api": {
						backCompat: false,
					},
				},
				entrypoint: defaultTypeValidationConfig.entrypoint,
			});
			expect(result).to.deep.equal({
				disabled: true,
			});
		});
	});
});
describe("typetests catalog integration", () => {
	let testDir: string;
	const initialWorkspace = [
		"# Workspace settings must be preserved.",
		"packages:",
		"  - packages/*",
		"catalogs:",
		"  tools:",
		'    typescript: "~5.9.3" # Keep this comment.',
		"",
	].join("\n");

	beforeEach(async () => {
		testDir = await mkdtemp(path.join(tmpdir(), "flub-typetests-"));
		await writeFile(
			path.join(testDir, "package.json"),
			JSON.stringify({
				name: "test-root",
				version: "6.0.0",
				private: true,
				scripts: {},
				fluidBuild: {
					version: 1,
					repoPackages: { client: ".", server: "server", independent: "independent" },
				},
			}),
		);
		await writeFile(
			path.join(testDir, "flub.config.cjs"),
			"module.exports = { version: 1 };\n",
		);
		await writeFile(path.join(testDir, "pnpm-workspace.yaml"), initialWorkspace);
		await mkdir(path.join(testDir, "server"));
		await writeFile(
			path.join(testDir, "server", "package.json"),
			JSON.stringify({ name: "server-root", version: "8.0.0", private: true }),
		);
		await writeFile(path.join(testDir, "server", "pnpm-workspace.yaml"), initialWorkspace);
		await mkdir(path.join(testDir, "independent"));
		await createPackage("packages/first", "first");
		await createPackage("packages/second", "@test/second");
		await createPackage("server/packages/third", "third");
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	/**
	 * Writes a package into the temporary repository.
	 */
	async function createPackage(
		directory: string,
		name: string,
		enabled = true,
	): Promise<void> {
		const target = path.join(testDir, directory);
		await mkdir(target, { recursive: true });
		await writeFile(
			path.join(target, "package.json"),
			JSON.stringify({
				...packageWithTypeValidation(enabled),
				name,
				devDependencies: {
					[`${name}-previous`]: `npm:${name}@4.0.0`,
					unrelated: "^1.0.0",
				},
			}),
		);
	}

	/**
	 * Runs the compiled command with repository discovery isolated from the real checkout.
	 */
	async function runCommand(flags: string[]): Promise<execa.ExecaReturnValue> {
		const result = await execa(
			process.execPath,
			[
				fileURLToPath(new URL("../../../bin/run.js", import.meta.url)),
				"typetests",
				"--quiet",
				...flags,
			],
			{ cwd: testDir, env: { _FLUID_ROOT_: testDir }, reject: false },
		);
		return result;
	}

	/**
	 * Reads a package.json from the temporary repository.
	 */
	async function readPackage(directory: string): Promise<PackageWithTypeTestSettings> {
		return JSON.parse(
			await readFile(path.join(testDir, directory, "package.json"), "utf8"),
		) as PackageWithTypeTestSettings;
	}

	it("creates one catalog for concurrent packages and only updates catalog versions on later bumps", async () => {
		await createPackage("packages/disabled", "disabled", false);
		const result = await runCommand(["-g", "client", "--previous", "--reset", "--normalize"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		const workspacePath = path.join(testDir, "pnpm-workspace.yaml");
		const workspace = await readFile(workspacePath, "utf8");
		const catalogs = YAML.parseDocument(workspace).getIn(["catalogs", "typeTest-previous"]);
		assert(YAML.isMap(catalogs));
		assert.deepEqual(catalogs.toJSON(), {
			"@test/second-previous": "npm:@test/second@5.0.0",
			"first-previous": "npm:first@5.0.0",
		});
		assert.include(workspace, "# Workspace settings must be preserved.");
		assert.include(workspace, 'typescript: "~5.9.3" # Keep this comment.');
		const first = await readPackage("packages/first");
		assert.equal(first.devDependencies?.["first-previous"], "catalog:typeTest-previous");
		assert.equal(first.devDependencies?.unrelated, "^1.0.0");
		assert.deepEqual(first.typeValidation?.broken, {});
		assert.equal(first.scripts["typetests:gen"], "flub generate typetests --dir . -v");
		assert.notProperty(
			(await readPackage("packages/disabled")).devDependencies,
			"disabled-previous",
		);

		const repeated = await runCommand([
			"-g",
			"client",
			"--previous",
			"--reset",
			"--normalize",
		]);
		assert.equal(repeated.exitCode, 0, repeated.stdout + repeated.stderr);
		assert.equal(await readFile(workspacePath, "utf8"), workspace);
		const firstManifest = await readFile(
			path.join(testDir, "packages/first/package.json"),
			"utf8",
		);
		const bumped = await runCommand(["-g", "client", "--exact", "5.1.0"]);
		assert.equal(bumped.exitCode, 0, bumped.stdout + bumped.stderr);
		assert.deepEqual(await readPackage("packages/first"), first);
		assert.equal(
			await readFile(path.join(testDir, "packages/first/package.json"), "utf8"),
			firstManifest,
		);
		assert.equal(
			YAML.parseDocument(await readFile(workspacePath, "utf8")).getIn([
				"catalogs",
				"typeTest-previous",
				"first-previous",
			]),
			"npm:first@5.1.0",
		);
	});

	it("uses the owning workspace for relative directory selection and leaves unselected packages unchanged", async () => {
		const second = await readFile(path.join(testDir, "packages/second/package.json"), "utf8");
		const result = await runCommand(["--dir", path.join("packages", "first"), "--previous"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		const workspace = YAML.parseDocument(
			await readFile(path.join(testDir, "pnpm-workspace.yaml"), "utf8"),
		);
		const catalog = workspace.getIn(["catalogs", "typeTest-previous"]);
		assert(YAML.isMap(catalog));
		assert.deepEqual(catalog.toJSON(), {
			"first-previous": "npm:first@5.0.0",
		});
		assert.equal(
			await readFile(path.join(testDir, "packages/second/package.json"), "utf8"),
			second,
		);
	});

	it("shares one catalog editor for relative workspace-root and release-group selections", async () => {
		await createPackage("server", "server-root");
		const result = await runCommand(["--dir", "server", "-g", "server", "--exact", "5.0.0"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		const workspace = YAML.parseDocument(
			await readFile(path.join(testDir, "server", "pnpm-workspace.yaml"), "utf8"),
		);
		const catalog = workspace.getIn(["catalogs", "typeTest-previous"]);
		assert(YAML.isMap(catalog));
		assert.deepEqual(catalog.toJSON(), {
			"server-root-previous": "npm:server-root@5.0.0",
			"third-previous": "npm:third@5.0.0",
		});
		for (const [directory, name] of [
			["server", "server-root"],
			[path.join("server", "packages", "third"), "third"],
		] as const) {
			assert.equal(
				(await readPackage(directory)).devDependencies?.[`${name}-previous`],
				"catalog:typeTest-previous",
			);
		}
	});

	it("keeps catalogs separate when selecting multiple release groups", async () => {
		const result = await runCommand(["-g", "client", "server", "--previous"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		const server = YAML.parseDocument(
			await readFile(path.join(testDir, "server/pnpm-workspace.yaml"), "utf8"),
		);
		const catalog = server.getIn(["catalogs", "typeTest-previous"]);
		assert(YAML.isMap(catalog));
		assert.deepEqual(catalog.toJSON(), {
			"third-previous": "npm:third@5.0.0",
		});
		const client = YAML.parseDocument(
			await readFile(path.join(testDir, "pnpm-workspace.yaml"), "utf8"),
		);
		assert.isUndefined(client.getIn(["catalogs", "typeTest-previous", "third-previous"]));
	});

	it("supports independent pnpm packages without using the parent workspace catalog", async () => {
		await createPackage("independent/standalone", "standalone");
		await writeFile(
			path.join(testDir, "independent/standalone/pnpm-workspace.yaml"),
			"# Independent workspace.\n",
		);
		const result = await runCommand(["--packages", "--previous"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		assert.equal(
			await readFile(path.join(testDir, "pnpm-workspace.yaml"), "utf8"),
			initialWorkspace,
		);
		const standalone = YAML.parseDocument(
			await readFile(path.join(testDir, "independent/standalone/pnpm-workspace.yaml"), "utf8"),
		);
		assert.equal(
			standalone.getIn(["catalogs", "typeTest-previous", "standalone-previous"]),
			"npm:standalone@5.0.0",
		);
	});

	it("uses inline aliases for non-pnpm packages", async () => {
		await createPackage("independent/npm-package", "npm-package");
		const result = await runCommand(["--packages", "--previous"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		assert.equal(
			(await readPackage("independent/npm-package")).devDependencies?.["npm-package-previous"],
			"npm:npm-package@5.0.0",
		);
		assert.equal(
			await readFile(path.join(testDir, "pnpm-workspace.yaml"), "utf8"),
			initialWorkspace,
		);
	});

	it("restores inline aliases with --no-catalog without changing existing catalog entries", async () => {
		const migrated = await runCommand(["-g", "client", "--previous"]);
		assert.equal(migrated.exitCode, 0, migrated.stdout + migrated.stderr);
		const workspacePath = path.join(testDir, "pnpm-workspace.yaml");
		const workspace = await readFile(workspacePath, "utf8");
		const result = await runCommand(["-g", "client", "--exact", "4.1.0", "--no-catalog"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		assert.equal(
			(await readPackage("packages/first")).devDependencies?.["first-previous"],
			"npm:first@4.1.0",
		);
		assert.equal(await readFile(workspacePath, "utf8"), workspace);
	});

	for (const flag of ["--remove", "--disable"]) {
		it(`${flag} removes dependencies but preserves potentially shared catalog entries`, async () => {
			const migrated = await runCommand(["-g", "client", "--previous"]);
			assert.equal(migrated.exitCode, 0, migrated.stdout + migrated.stderr);
			const workspacePath = path.join(testDir, "pnpm-workspace.yaml");
			const workspace = await readFile(workspacePath, "utf8");
			const result = await runCommand(["-g", "client", flag, "--reset", "--normalize"]);
			assert.equal(result.exitCode, 0, result.stdout + result.stderr);
			const first = await readPackage("packages/first");
			assert.notProperty(first.devDependencies, "first-previous");
			if (flag === "--disable") {
				assert.isTrue(first.typeValidation?.disabled);
				assert.notProperty(first.scripts, "typetests:gen");
			}
			assert.equal(await readFile(workspacePath, "utf8"), workspace);
		});
	}

	it("does not migrate dependencies when only resetting and normalizing", async () => {
		const result = await runCommand(["-g", "client", "--reset", "--normalize"]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		assert.equal(
			(await readPackage("packages/first")).devDependencies?.["first-previous"],
			"npm:first@4.0.0",
		);
		assert.equal(
			await readFile(path.join(testDir, "pnpm-workspace.yaml"), "utf8"),
			initialWorkspace,
		);
	});

	it("enables disabled type tests while migrating their baseline dependency", async () => {
		await createPackage("packages/disabled", "disabled", false);
		const result = await runCommand([
			"--dir",
			path.join("packages", "disabled"),
			"--enable",
			"--previous",
		]);
		assert.equal(result.exitCode, 0, result.stdout + result.stderr);
		const pkg = await readPackage("packages/disabled");
		assert.isUndefined(pkg.typeValidation?.disabled);
		assert.equal(pkg.devDependencies?.["disabled-previous"], "catalog:typeTest-previous");
	});

	it("saves catalog entries for successful packages even when another package fails", async () => {
		const manifestPath = path.join(testDir, "packages/second/package.json");
		const invalid = { ...(await readPackage("packages/second")), version: "invalid" };
		const original = JSON.stringify(invalid);
		await writeFile(manifestPath, original);
		const result = await runCommand(["-g", "client", "--previous"]);
		assert.notEqual(result.exitCode, 0);
		const workspace = YAML.parseDocument(
			await readFile(path.join(testDir, "pnpm-workspace.yaml"), "utf8"),
		);
		assert.equal(
			workspace.getIn(["catalogs", "typeTest-previous", "first-previous"]),
			"npm:first@5.0.0",
		);
		assert.isUndefined(
			workspace.getIn(["catalogs", "typeTest-previous", "@test/second-previous"]),
		);
		assert.equal(await readFile(manifestPath, "utf8"), original);
	});

	it("rejects an invalid catalog before changing any package manifests", async () => {
		const workspacePath = path.join(testDir, "pnpm-workspace.yaml");
		await writeFile(workspacePath, `${initialWorkspace}  typeTest-previous: invalid\n`);
		const first = await readFile(path.join(testDir, "packages/first/package.json"), "utf8");
		const result = await runCommand(["-g", "client", "--previous"]);
		assert.notEqual(result.exitCode, 0);
		assert.include(result.stderr, "Expected a mapping at 'catalogs.typeTest-previous'");
		assert.equal(
			await readFile(path.join(testDir, "packages/first/package.json"), "utf8"),
			first,
		);
	});
});
