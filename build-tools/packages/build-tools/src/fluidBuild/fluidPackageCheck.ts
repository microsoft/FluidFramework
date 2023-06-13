/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import chalk from "chalk";
import fs from "fs";
import isEqual from "lodash.isequal";
import path from "path";

import { Package } from "../common/npmPackage";
import { existsSync, readFileAsync, resolveNodeModule, writeFileAsync } from "../common/utils";
import * as TscUtils from "../common/tscUtils";

export class FluidPackageCheck {
	private static fixPackageVersions: { [key: string]: string } = {
		"cross-env": "^7.0.2",
		"jest-junit": "^10.0.0",
		"nyc": "^15.0.0",
		"rimraf": "^2.6.2",
	};

	private static ensureTestDevDependency(pkg: Package, fix: boolean, pkgName: string): boolean {
		if (
			pkg.isTestPackage &&
			pkg.packageJson.dependencies &&
			pkg.packageJson.dependencies[pkgName]
		) {
			return false;
		}
		return this.ensureDevDependency(pkg, fix, pkgName);
	}

	private static ensureDevDependency(pkg: Package, fix: boolean, pkgName: string): boolean {
		if (pkg.packageJson.devDependencies && pkg.packageJson.devDependencies[pkgName]) {
			return false;
		}

		const pkgVersion = this.fixPackageVersions[pkgName];
		if (!pkgVersion) {
			fix = false;
		}

		this.logWarn(pkg, `missing ${pkgName} dependency`, fix);
		if (fix) {
			if (!pkg.packageJson.devDependencies) {
				pkg.packageJson.devDependencies = {};
			}
			pkg.packageJson.devDependencies[pkgName] = pkgVersion;
		}
		return fix;
	}

	public static checkScripts(pkg: Package, fix: boolean) {
		const fixed = [
			FluidPackageCheck.checkCleanScript(pkg, fix),
			FluidPackageCheck.checkTestCoverageScripts(pkg, fix),
			FluidPackageCheck.checkTestScripts(pkg, fix),
			FluidPackageCheck.checkClientTestScripts(pkg, fix),
			FluidPackageCheck.checkJestJunitTestEntry(pkg, fix),
			FluidPackageCheck.checkLintScripts(pkg, fix),
		];
		return fixed.some((bool) => bool);
	}

	private static logWarn(pkg: Package, message: string, fix: boolean) {
		console.warn(
			`${pkg.nameColored}: warning: ${message}${chalk.greenBright(fix ? " [FIXED]" : "")}`,
		);
	}

	/**
	 * Verify that all packages with 'test' scripts require the 'mocha-test-setup' package
	 * and have --unhandled-rejections=strict flag so to failed test with unhandled rejection
	 */
	private static checkTestScripts(pkg: Package, fix: boolean) {
		let fixed = false;

		const testMochaScript = pkg.getScript("test:mocha");
		const testScriptName = testMochaScript ? "test:mocha" : "test";
		const testScript = testMochaScript ?? pkg.getScript(testScriptName);
		if (testScript && /(ts-)?mocha/.test(testScript)) {
			const shouldHaveConfig =
				pkg.monoRepo?.kind === "client" || pkg.monoRepo?.kind === "azure";
			const hasConfig = testScript.includes(" --config ");
			if (shouldHaveConfig) {
				const pkgstring = "@fluidframework/mocha-test-setup";
				if (this.ensureTestDevDependency(pkg, fix, pkgstring)) {
					fixed = true;
				}
				if (!hasConfig) {
					const requireString = `node_modules/${pkgstring}`;
					if (!testScript.includes(requireString)) {
						this.logWarn(pkg, `no ${requireString} require in test script`, fix);
						if (fix) {
							pkg.packageJson.scripts[testScriptName] += " -r " + requireString;
							fixed = true;
						}
					}
				}

				const verboseTestScriptName = `${testScriptName}:verbose`;
				const verboseTestMochaScript = pkg.getScript(verboseTestScriptName);
				const expectedVerboseTestMochaScript = `cross-env FLUID_TEST_VERBOSE=1 npm run ${testScriptName}`;
				if (verboseTestMochaScript !== expectedVerboseTestMochaScript) {
					this.logWarn(
						pkg,
						`${verboseTestScriptName} script not match "${expectedVerboseTestMochaScript}"`,
						fix,
					);
					if (fix) {
						pkg.packageJson.scripts[verboseTestScriptName] =
							expectedVerboseTestMochaScript;
						fixed = true;
					}
				}

				if (this.ensureTestDevDependency(pkg, fix, "cross-env")) {
					fixed = true;
				}
			}
		}

		return fixed;
	}

	private static checkScript(
		pkg: Package,
		name: string,
		expected: string | undefined,
		fix: boolean,
	) {
		let fixed = false;
		const actual = pkg.getScript(name);
		if (expected !== actual) {
			this.logWarn(pkg, `non-conformant script "${name}"`, fix);
			this.logWarn(pkg, `  expect: ${expected}`, fix);
			this.logWarn(pkg, `  actual: ${actual}`, fix);
			if (fix) {
				pkg.packageJson.scripts[name] = expected;
				fixed = true;
			}
		}
		return fixed;
	}

	/**
	 * mocha tests in packages/ should be in a "test:mocha" script so they can be run separately from jest tests
	 */
	public static checkClientTestScripts(pkg: Package, fix: boolean) {
		let fixed = false;
		const testScript = pkg.getScript("test");
		const testMochaScript = pkg.getScript("test:mocha");
		const testJestScript = pkg.getScript("test:jest");
		const expectedTestScripts: string[] = [];
		if (testMochaScript) {
			if (pkg.getScript("start:tinylicious:test") !== undefined) {
				expectedTestScripts.push(
					"start-server-and-test start:tinylicious:test 7070 test:mocha",
				);
			} else {
				expectedTestScripts.push("npm run test:mocha");
			}
		}
		if (testJestScript) {
			expectedTestScripts.push("npm run test:jest");
		}
		let expectedTestScript =
			expectedTestScripts.length > 0 ? expectedTestScripts.join(" && ") : undefined;

		// Allow packages that wants to have coverage by default.
		if (testScript?.startsWith("nyc ")) {
			expectedTestScript = `nyc ${expectedTestScript}`;
		}

		if (pkg.monoRepo?.kind === "client" && testScript && /^(ts-)?mocha/.test(testScript)) {
			this.logWarn(pkg, `"mocha" in "test" script instead of "test:mocha" script`, fix);
			if (fix) {
				if (!testMochaScript) {
					pkg.packageJson.scripts["test:mocha"] = pkg.packageJson.scripts["test"];
					pkg.packageJson.scripts["test"] = expectedTestScript;
					fixed = true;
				} else {
					console.warn(
						`${pkg.nameColored}: couldn't fix: "test" and "test:mocha" scripts both present`,
					);
				}
			}
		} else if (expectedTestScript && this.checkScript(pkg, "test", expectedTestScript, fix)) {
			fixed = true;
		}

		return fixed;
	}

	private static checkJestJunitTestEntry(pkg: Package, fix: boolean) {
		let fixed = false;
		const pkgstring = "jest-junit";
		const testScript = pkg.getScript("test:jest");
		if (testScript) {
			if (this.ensureTestDevDependency(pkg, fix, pkgstring)) {
				fixed = true;
			}
			if (!pkg.packageJson["jest-junit"]) {
				this.logWarn(pkg, `no jest-junit entry for jest test`, false);
			}
		}

		return fixed;
	}

	private static checkTestCoverageScripts(pkg: Package, fix: boolean) {
		let fixed = false;

		// Make sure that if we enable test coverage for the package using nyc
		// we have the package in the devDependencies and configuration
		const testCoverageScript = pkg.getScript("test:coverage");
		if (testCoverageScript && testCoverageScript.startsWith("nyc")) {
			if (this.ensureTestDevDependency(pkg, fix, "nyc")) {
				fixed = true;
			}
			if (pkg.packageJson.nyc !== undefined && pkg.packageJson.nyc !== null) {
				if (pkg.packageJson.nyc["exclude-after-remap"] !== false) {
					this.logWarn(pkg, `nyc.exclude-after-remap need to be false`, fix);
					if (fix) {
						pkg.packageJson.nyc["exclude-after-remap"] = false;
						fixed = true;
					}
				}
			} else {
				this.logWarn(pkg, `missing nyc configuration`, false);
			}
		}

		return fixed;
	}

	private static checkCleanScript(pkg: Package, fix: boolean) {
		const cleanScript = pkg.getScript("clean");
		if (!cleanScript) {
			if (pkg.getScript("build")) {
				this.logWarn(pkg, `package has "build" script without "clean" script`, false);
			}
			return false;
		}

		if (cleanScript.startsWith("rimraf")) {
			return this.ensureDevDependency(pkg, fix, "rimraf");
		}
		return false;
	}

	private static checkLintScripts(pkg: Package, fix: boolean) {
		const verifyLintScriptStructure = (
			pkg: Package,
			scriptKey: string,
			script: string,
			fix: boolean,
		) => {
			const lintType = scriptKey === "lint" ? "lint" : "lint:fix";

			const prettier = scriptKey === "lint" ? "npm run prettier" : "npm run prettier:fix";
			const eslint = scriptKey === "lint" ? "npm run eslint" : "npm run eslint:fix";

			const hasPrettier = script?.includes(prettier);
			const endsWithEslint = script?.endsWith(eslint);

			if (!(hasPrettier && endsWithEslint)) {
				this.logWarn(pkg, `non-conformant ${lintType} script`, fix);

				if (script === "") {
					this.logWarn(pkg, `${lintType} script is missing!`, fix);
					script = `${prettier} && ${eslint}`;
				} else {
					if (!hasPrettier) {
						this.logWarn(pkg, `${lintType} script must include: ${prettier}`, fix);
						script = `${prettier} && ${script}`;
					}

					if (!endsWithEslint) {
						this.logWarn(pkg, `${lintType} script must end with: ${eslint}`, fix);
						script = `${script} && ${eslint}`;
					}
				}
			}

			return script;
		};

		let fixed = false;
		if (pkg.getScript("build")) {
			// TODO: add prettier check comment once prettier is enforced globally, hasPrettier commented out to discard build warnings from "lint" & "lint:fix" scripts
			// const hasPrettier = pkg.getScript("prettier");
			// const lintChildren = hasLint ? ["prettier", "eslint"] : ["eslint"];

			/* Policy for "lint" & "lint:fix" scripts
                1. Must end with "npm run eslint" / "npm run eslint:fix" respectively
                2. Must contain "npm run prettier" / "npm run prettier:fix" respectively
            */
			const scripts = ["lint", "lint:fix"];

			for (const scriptKey of scripts) {
				let script = pkg.getScript(scriptKey);

				if (script === undefined) {
					script = "";
				}
				const expectedScript = verifyLintScriptStructure(pkg, scriptKey, script, fix);

				if (fix) {
					pkg.packageJson.scripts[scriptKey] = expectedScript;
					fixed = true;
				}
			}

			// TODO: for now, some jest test at the root isn't linted yet
			const eslintScript = pkg.getScript("eslint");
			const hasFormatStylish = eslintScript && eslintScript.search("--format stylish") >= 0;
			const command = hasFormatStylish ? "eslint --format stylish" : "eslint";
			const lintOnlySrc = eslintScript === `${command} src`;
			const dirs =
				!lintOnlySrc && existsSync(path.join(pkg.directory, "tests")) ? "src tests" : "src";
			const expectedEslintScript = `${command} ${dirs}`;
			if (this.checkScript(pkg, "eslint", expectedEslintScript, fix)) {
				fixed = true;
			}

			const eslintFixScript = pkg.getScript("eslint:fix");
			const hasFixType =
				eslintFixScript &&
				eslintFixScript.search("--fix-type problem,suggestion,layout") >= 0;
			if (
				this.checkScript(
					pkg,
					"eslint:fix",
					`${expectedEslintScript} --fix${
						hasFixType ? " --fix-type problem,suggestion,layout" : ""
					}`,
					fix,
				)
			) {
				fixed = true;
			}
		}
		return fixed;
	}

	public static async checkNpmIgnore(pkg: Package, fix: boolean) {
		if (pkg.packageJson.private || pkg.getScript("build") === undefined) {
			return;
		}
		const filename = path.join(pkg.directory, ".npmignore");
		const expectedCommon = ["nyc", "*.log", "**/*.tsbuildinfo"];

		if (pkg.getScript("build:docs")) {
			expectedCommon.push("**/_api-extractor-temp/**");
		}

		const testPackage =
			pkg.name.startsWith("@fluidframework/test-") ||
			pkg.name.startsWith("@fluid-internal/test-");
		const expected = testPackage
			? expectedCommon
			: [...expectedCommon, "src/test", "dist/test"];
		if (!existsSync(filename)) {
			this.logWarn(pkg, `.npmignore does not exist`, fix);
			if (fix) {
				await writeFileAsync(filename, expected.join("\n"), "utf8");
			}
		} else {
			const content = await readFileAsync(filename, "utf8");
			const split = content.split(/\r?\n/);
			if (split.length !== 0 && split[split.length - 1] === "") {
				split.pop();
			}
			for (const v of expected) {
				if (!split.includes(v)) {
					this.logWarn(pkg, `.npmignore missing "${v}"`, fix);
					if (fix) {
						split.push(v);
					}
				}
			}
			if (fix) {
				if (split.length !== 0 && split[split.length - 1] !== "") {
					split.push("");
				}
				const ret = split.join("\n");
				if (ret !== content) {
					await writeFileAsync(filename, ret, "utf8");
				}
			}
		}
	}

	private static readonly commonConfig = "@fluidframework/build-common/ts-common-config.json";

	private static async checkTsConfigExtend(
		pkg: Package,
		fix: boolean,
		configJson: any,
		configFile: string,
	) {
		let changed = false;
		if (configJson.extends !== this.commonConfig) {
			this.logWarn(pkg, `${configFile}: tsc config not extending ts-common-config.json`, fix);
			if (fix) {
				configJson.extends = this.commonConfig;
				changed = true;
			}
		}

		if (configJson.extends === this.commonConfig) {
			let loaded = false;
			const commonConfigFullPath = resolveNodeModule(pkg.directory, this.commonConfig);
			if (commonConfigFullPath) {
				const commonConfigJson = TscUtils.readConfigFile(commonConfigFullPath);
				if (commonConfigJson) {
					loaded = true;
					for (const option in configJson.compilerOptions) {
						if (
							configJson.compilerOptions[option] ===
							commonConfigJson.compilerOptions[option]
						) {
							this.logWarn(
								pkg,
								`${configFile}: duplicate compilerOptions - ${option}: ${configJson.compilerOptions[option]}`,
								fix,
							);
							if (fix) {
								delete configJson.compilerOptions[option];
								changed = true;
							}
						}
					}
				}
			}

			if (!loaded) {
				this.logWarn(pkg, `${configFile}: can't find ${this.commonConfig}`, false);
			}
		}
		return changed;
	}

	public static async checkTsConfig(pkg: Package, fix: boolean) {
		const command = pkg.getScript("tsc");
		if (command) {
			const parsedCommand = TscUtils.parseCommandLine(command);
			if (!parsedCommand) {
				return;
			}

			// Assume tsc with no argument.
			const configFile = TscUtils.findConfigFile(pkg.directory, parsedCommand);
			const configJson = TscUtils.readConfigFile(configFile);
			if (configJson === undefined) {
				this.logWarn(pkg, `Failed to load config file '${configFile}'`, false);
				return;
			}

			let changed = false;
			if (await this.checkTsConfigExtend(pkg, fix, configJson, configFile)) {
				changed = true;
			}

			if (this.splitTestBuild(pkg)) {
				if (!configJson.compilerOptions) {
					configJson.compilerOptions = {};
				}
				if (
					this.checkProperty(
						configFile,
						pkg,
						configJson.compilerOptions,
						"composite",
						true,
						fix,
					)
				) {
					changed = true;
				}

				const types: string[] | undefined = configJson.compilerOptions.types;
				if (types && types.includes("mocha") && !pkg.name.startsWith("@fluid-tools/")) {
					this.logWarn(pkg, "tsc config for main src shouldn't depend on mocha", fix);
					if (fix) {
						const newTypes = types.filter((v) => v !== "mocha");
						if (newTypes.length === 0) {
							delete configJson.compilerOptions.types;
						} else {
							configJson.compilerOptions.types = newTypes;
						}
						changed = true;
					}
				}

				const exclude = ["src/test/**/*"];
				if (this.checkProperty(configFile, pkg, configJson, "exclude", exclude, fix)) {
					changed = true;
				}
			}

			if (changed) {
				await writeFileAsync(configFile, JSON.stringify(configJson, undefined, 4));
			}
		}
	}

	private static checkProperty<T>(
		file: string,
		pkg: Package,
		configJson: any,
		name: string,
		value: T,
		fix: boolean,
	) {
		if (!isEqual(configJson[name], value)) {
			this.logWarn(pkg, `Unexpected ${name} value in ${file}`, fix);
			if (fix) {
				configJson[name] = value;
				return true;
			}
		}
		return false;
	}
	private static async checkOneTestDir(pkg: Package, fix: boolean, subDir: string) {
		const configFile = path.join(this.getTestBaseDir(pkg), subDir, "tsconfig.json");
		const configJson = TscUtils.readConfigFile(configFile);
		if (!configJson) {
			this.logWarn(pkg, `Unable to read ${configFile}`, false);
			return;
		}

		const baseDir = !subDir && configJson.compilerOptions?.rootDir === "../";
		const rootDir = baseDir ? "../" : "./";
		const outDir = subDir
			? `../../../dist/test/${subDir}`
			: baseDir
			? "../../dist"
			: "../../dist/test";

		const referencePath = subDir ? "../../.." : "../..";
		const compilerOptions = {
			rootDir,
			outDir,
			types: [
				"node",
				...(subDir === "jest"
					? ["jest", "jest-environment-puppeteer", "puppeteer"]
					: ["mocha"]),
			],
		};

		let changed = false;

		if (await this.checkTsConfigExtend(pkg, fix, configJson, configFile)) {
			changed = true;
		}
		if (!configJson.compilerOptions) {
			this.logWarn(pkg, `Missing compilerOptions in ${configFile}`, fix);
			if (fix) {
				configJson.compilerOptions = compilerOptions;
				changed = true;
			}
		} else {
			if (
				this.checkProperty(
					configFile,
					pkg,
					configJson.compilerOptions,
					"rootDir",
					rootDir,
					fix,
				)
			) {
				changed = true;
			}
			if (
				this.checkProperty(
					configFile,
					pkg,
					configJson.compilerOptions,
					"outDir",
					outDir,
					fix,
				)
			) {
				changed = true;
			}
		}

		if (this.hasMainBuild(pkg)) {
			// We should only have references if we have a main build.
			const references = [{ path: referencePath }];
			if (
				configJson.references !== undefined &&
				!isEqual(configJson.references, references)
			) {
				this.logWarn(pkg, `Unexpected references in ${configFile}`, fix);
				if (fix) {
					configJson.references = references;
					changed = true;
				}
			}
		}

		if (changed) {
			await writeFileAsync(configFile, JSON.stringify(configJson, undefined, 4));
		}
	}

	public static async checkTestDir(pkg: Package, fix: boolean) {
		const testSrcDirs = this.getTestDirs(pkg);
		await Promise.all(testSrcDirs.map((dir) => this.checkOneTestDir(pkg, fix, dir)));
	}

	public static splitTestBuild(pkg: Package, warnNoSource = false) {
		if (!this.hasMainBuild(pkg)) {
			// don't split test build if there is no main build
			return false;
		}
		const testDirs = this.getTestDirs(pkg, warnNoSource);
		return testDirs.length !== 0;
	}

	private static hasMainBuild(pkg: Package) {
		return existsSync(path.join(pkg.directory, "tsconfig.json"));
	}

	private static getTestBaseDir(pkg: Package) {
		return path.join(pkg.directory, "src", "test");
	}

	private static getTestDirs(pkg: Package, warnNoSource = false) {
		const testSrcBaseDir = this.getTestBaseDir(pkg);
		if (this.isTestDir(pkg, testSrcBaseDir, warnNoSource)) {
			return [""];
		}

		const testSrcDirNames = ["mocha", "jest", "types"];
		return testSrcDirNames.filter((maybeTestDirName) => {
			const maybeTestDir = path.join(testSrcBaseDir, maybeTestDirName);
			return this.isTestDir(pkg, maybeTestDir, warnNoSource);
		});
	}

	private static isTestDir(pkg: Package, maybeTestDir: string, warnNoSource: boolean) {
		if (!existsSync(path.join(maybeTestDir, "tsconfig.json"))) {
			return false;
		}

		// Only split test build if there is some ts files in the test directory
		const dirs = [maybeTestDir];
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const dir = dirs.pop();
			if (!dir) {
				if (warnNoSource) {
					this.logWarn(
						pkg,
						"src/test/tsconfig.json exists, but no test file detected",
						false,
					);
				}
				return false;
			}
			if (dir !== maybeTestDir && existsSync(path.join(dir, "tsconfig.json"))) {
				// skip test dir already covered.
				continue;
			}
			const files = fs.readdirSync(dir, { withFileTypes: true });
			if (
				files.some(
					(dirent) =>
						!dirent.isDirectory() &&
						(dirent.name.endsWith(".ts") || dirent.name.endsWith(".spec.js")),
				)
			) {
				return true;
			}
			dirs.push(
				...files
					.filter((dirent) => dirent.isDirectory())
					.map((dirent) => path.join(dir, dirent.name)),
			);
		}
	}
}
