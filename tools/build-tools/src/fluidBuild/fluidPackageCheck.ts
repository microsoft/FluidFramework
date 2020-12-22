/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import path from "path";
import { existsSync, readFileAsync, writeFileAsync, resolveNodeModule } from "../common/utils";
import * as TscUtils from "./tscUtils";
import sortPackageJson from "sort-package-json";
import isEqual from "lodash.isequal";
import chalk from "chalk";
import fs from "fs";

export class FluidPackageCheck {
    private static fixPackageVersions: { [key: string]: string } = {
        "cross-env": "^7.0.2",
        "jest-junit": "^10.0.0",
        "nyc": "^15.0.0",
        "rimraf": "^2.6.2",
    };

    private static ensureDevDependency(pkg: Package, fix: boolean, pkgName: string) {
        if (pkg.packageJson.devDependencies && pkg.packageJson.devDependencies[pkgName]) {
            return;
        }

        const pkgVersion = this.fixPackageVersions[pkgName]
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
            FluidPackageCheck.checkSort(pkg, fix),
            FluidPackageCheck.checkBuildScripts(pkg, fix),
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
        console.warn(`${pkg.nameColored}: warning: ${message}${chalk.greenBright(fix ? " [FIXED]" : "")}`);
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
            const isClient = pkg.monoRepo?.kind === MonoRepoKind.Client;
            if (isClient) {
                const pkgstring = "@fluidframework/mocha-test-setup"
                const requireString = `node_modules/${pkgstring}`;
                if (this.ensureDevDependency(pkg, fix, pkgstring)) {
                    fixed = true;
                }
                if (!testScript.includes(requireString)) {
                    this.logWarn(pkg, `no ${requireString} require in test script`, fix);
                    if (fix) {
                        pkg.packageJson.scripts[testScriptName] += " -r " + requireString;
                        fixed = true;
                    }
                }

                const verboseTestScriptName = `${testScriptName}:verbose`;
                const verboseTestMochaScript = pkg.getScript(verboseTestScriptName);
                const expectedVerboseTestMochaScript = `cross-env FLUID_TEST_VERBOSE=1 npm run ${testScriptName}`;
                if (verboseTestMochaScript !== expectedVerboseTestMochaScript) {
                    this.logWarn(pkg, `${verboseTestScriptName} script not match "${expectedVerboseTestMochaScript}"`, fix);
                    if (fix) {
                        pkg.packageJson.scripts[verboseTestScriptName] = expectedVerboseTestMochaScript;
                        fixed = true;
                    }
                }

                if (this.ensureDevDependency(pkg, fix, "cross-env")) {
                    fixed = true;
                }
            }

            // Make sure --unhandled-rejections=strict switch used
            const unhandledRejectionsSwitch = "--unhandled-rejections=strict";
            if (!testScript.includes(unhandledRejectionsSwitch)) {
                this.logWarn(pkg, `missing --unhandled-rejection switch in test script`, fix);
                if (fix) {
                    pkg.packageJson.scripts[testScriptName] += ` ${unhandledRejectionsSwitch}`;
                    fixed = true;
                }
            }
        }

        return fixed;
    }

    private static checkScript(pkg: Package, name: string, expected: string | undefined, fix: boolean) {
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
            expectedTestScripts.push("npm run test:mocha");
        }
        if (testJestScript) {
            expectedTestScripts.push("npm run test:jest");
        }
        const expectedTestScript = expectedTestScripts.length > 0 ? expectedTestScripts.join(" && ") : undefined;

        if (pkg.monoRepo?.kind === MonoRepoKind.Client && testScript && /^(ts-)?mocha/.test(testScript)) {
            this.logWarn(pkg, `"mocha" in "test" script instead of "test:mocha" script`, fix);
            if (fix) {
                if (!testMochaScript) {
                    pkg.packageJson.scripts["test:mocha"] = pkg.packageJson.scripts["test"];
                    pkg.packageJson.scripts["test"] = expectedTestScript;
                    fixed = true;
                } else {
                    console.warn(`${pkg.nameColored}: couldn't fix: "test" and "test:mocha" scripts both present`)
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
            if (this.ensureDevDependency(pkg, fix, pkgstring)) {
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
            if (this.ensureDevDependency(pkg, fix, "nyc")) {
                fixed = true;
            }
            if (pkg.packageJson.nyc) {
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

    private static checkBuildScripts(pkg: Package, fix: boolean) {
        // Fluid specific
        let fixed = false;
        const buildScript = pkg.getScript("build");
        if (buildScript) {
            if (buildScript.startsWith("echo ") || buildScript === "npm run noop") {
                return;
            }
            // These are script rules in the FluidFramework repo

            // Default build script, tsc + eslint (with optional build:webpack)
            const build: string[] = ["build:compile"];

            // all build tasks, but optional build:webpack
            const buildCompile: string[] = [];
            const buildCommonJs: string[] = [];

            const hasFull = pkg.getScript("build:full") !== undefined;

            // all build and lint steps (build + webpack) (if it is private, webpack would just be included in the main build:compile)
            const buildFull: string[] = pkg.packageJson.private && !hasFull ? [] : ["build"];

            // all build steps (build:compile + webpack) (if it is private, webpack would just be included in the main build:compile)
            const buildFullCompile: string[] = pkg.packageJson.private && !hasFull ? [] : ["build:compile"];

            // prepack scripts
            const prepack: string[] = [];

            let concurrentBuildCompile = true;

            const buildPrefix = pkg.getScript("build:genver") ? "npm run build:genver && " : "";
            if (pkg.getScript("tsc")) {
                if (pkg.getScript("build:test")) {
                    if (pkg.getScript("build:esnext")) {
                        // If we have build:esnext, that means that we are building it two ways (commonjs and esm)
                        buildCommonJs.push("tsc");
                        buildCommonJs.push("build:test");
                        buildCompile.push("build:commonjs");
                    } else {
                        // Only building it one way, so just we only need to to build with tsc and test
                        buildCompile.push("tsc");
                        buildCompile.push("build:test");
                        concurrentBuildCompile = false;
                    }
                } else {
                    buildCompile.push("tsc");
                }
            }

            if (pkg.getScript("build:es5")) {
                buildCompile.push("build:es5");
            }

            if (pkg.getScript("build:esnext")) {
                buildCompile.push("build:esnext");
            }

            if (pkg.getScript("build:copy")) {
                buildCompile.push("build:copy");
            }

            if (pkg.getScript("lint")) {
                build.push("lint");
            }

            if (pkg.getScript("less")) {
                buildCompile.push("less");
            }

            let implicitWebpack = true;

            if (pkg.getScript("build:webpack")) {
                // Having script build:webpack means that we want to do it in build script
                buildCompile.push("build:webpack");
                implicitWebpack = false;
            }

            if (pkg.getScript("webpack")) {
                if (implicitWebpack) {
                    // not having build:webpack means we only want to do webpack on build:full
                    buildFull.push("webpack");
                    buildFullCompile.push("webpack");
                }
                if (!pkg.packageJson.private) {
                    prepack.push("webpack");
                }
            }

            const check = (scriptName: string, parts: string[], concurrently = true, prefix = "") => {
                const expected = parts.length === 0 ? undefined :
                    prefix + (parts.length > 1 && concurrently ? `concurrently npm:${parts.join(" npm:")}` : `npm run ${parts.join(" && npm run ")}`);
                if (this.checkScript(pkg, scriptName, expected, fix)) {
                    fixed = true;
                }
            }
            check("build", build, true, buildPrefix);
            if (buildCompile.length === 0) {
                if (this.checkScript(pkg, "build:compile", "tsc", fix)) {
                    fixed = true;
                }
            } else {
                check("build:compile", buildCompile, concurrentBuildCompile);
            }
            check("build:commonjs", buildCommonJs, false);
            check("build:full", buildFull);
            check("build:full:compile", buildFullCompile);
            if (!pkg.packageJson.private) {
                check("prepack", prepack);
            }

            if (this.splitTestBuild(pkg)) {
                if (!existsSync(path.join(this.getTestDir(pkg), "mocha"))) {
                    const expectedBuildTest = "tsc --project ./src/test/tsconfig.json";
                    if (this.checkScript(pkg, "build:test", expectedBuildTest, fix)) {
                        fixed = true;
                    }
                } else {
                    check("build:test", ["build:test:mocha", "build:test:jest"]);
                }
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
    private static checkSort(pkg: Package, fix: boolean) {
        // Note that package.json is sorted when we save, so this is just for the warning
        const result = sortPackageJson(pkg.packageJson);
        if (JSON.stringify(result) !== JSON.stringify(pkg.packageJson)) {
            this.logWarn(pkg, `package.json not sorted`, fix);
            return fix;
        }
        return false;
    }

    private static checkLintScripts(pkg: Package, fix: boolean) {
        let fixed = false;
        if (pkg.getScript("build")) {
            if (this.checkScript(pkg, "lint", "npm run eslint", fix)) {
                fixed = true;
            }
            if (this.checkScript(pkg, "lint:fix", "npm run eslint:fix", fix)) {
                fixed = true;
            }
            // TODO: for now, some jest test at the root isn't linted yet
            const lintOnlySrc = pkg.getScript("eslint") === `eslint --format stylish src`;
            const dirs = !lintOnlySrc && existsSync(path.join(pkg.directory, "tests")) ? "src tests" : "src";
            const expectedEslintScript = `eslint --format stylish ${dirs}`;
            if (this.checkScript(pkg, "eslint", expectedEslintScript, fix)) {
                fixed = true;
            }
            if (this.checkScript(pkg, "eslint:fix", `${expectedEslintScript} --fix`, fix)) {
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
        const expected = [
            "nyc",
            "*.log",
            "**/*.tsbuildinfo"
        ];
        if (!existsSync(filename)) {
            this.logWarn(pkg, `.npmignore not exist`, fix);
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

    private static async checkTsConfigExtend(pkg: Package, fix: boolean, configJson: any) {
        let changed = false;
        if (configJson.extends !== this.commonConfig) {
            this.logWarn(pkg, `tsc config not extending ts-common-config.json`, fix);
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
                        if (configJson.compilerOptions[option] === commonConfigJson.compilerOptions[option]) {
                            this.logWarn(pkg, `duplicate compilerOptions ${option}: ${configJson.compilerOptions[option]}`, fix);
                            if (fix) {
                                delete configJson.compilerOptions[option];
                                changed = true;
                            }
                        }
                    }
                }
            }

            if (!loaded) {
                this.logWarn(pkg, `can't find ${this.commonConfig}`, false);
            }
        }
        return changed;
    }

    public static async checkTsConfig(pkg: Package, fix: boolean) {
        const command = pkg.getScript("tsc");
        if (command) {
            const parsedCommand = TscUtils.parseCommandLine(command);
            if (!parsedCommand) { return undefined; }

            // Assume tsc with no argument.
            const configFile = TscUtils.findConfigFile(pkg.directory, parsedCommand);
            const configJson = TscUtils.readConfigFile(configFile);

            let changed = false;
            if (await this.checkTsConfigExtend(pkg, fix, configJson)) {
                changed = true;
            }

            if (this.splitTestBuild(pkg)) {
                if (!configJson.compilerOptions) {
                    configJson.compilerOptions = {};
                }
                if (this.checkProperty(configFile, pkg, configJson.compilerOptions, "composite", true, fix)) {
                    changed = true;
                }

                const types: string[] | undefined = configJson.compilerOptions.types;
                if (types && types.includes("mocha")) {
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

    private static checkProperty<T>(file: string, pkg: Package, configJson: any, name: string, value: T, fix: boolean) {
        if (!isEqual(configJson[name], value)) {
            this.logWarn(pkg, `Unexpected ${name} value in ${file}`, fix);
            if (fix) {
                configJson[name] = value;
                return true;
            }
        }
        return false;
    }
    private static async checkOneTestDir(pkg: Package, fix: boolean, testSrcDir: string, subDir?: string) {
        const configFile = path.join(testSrcDir, subDir ?? "", "tsconfig.json");
        const outDir = subDir ? `../../../dist/test/${subDir}` : `../../dist/test`;
        const referencePath = subDir ? "../../.." : "../..";
        const compilerOptions = {
            rootDir: "./",
            outDir,
            types: ["node", ...(subDir === "jest" ?
                ["jest", "jest-environment-puppeteer", "puppeteer"] : ["mocha"])]
        };
        const references = [{ path: referencePath }];
        let configJson;
        let changed = false;
        configJson = TscUtils.readConfigFile(configFile);
        if (await this.checkTsConfigExtend(pkg, fix, configJson)) {
            changed = true;
        }
        if (!configJson.compilerOptions) {
            this.logWarn(pkg, `Missing compilerOptions in test tsconfig.json`, fix);
            if (fix) {
                configJson.compilerOptions = compilerOptions;
                changed = true;
            }
        } else {
            if (this.checkProperty(configFile, pkg, configJson.compilerOptions, "outDir", outDir, fix)) {
                changed = true;
            }
        }

        if (!isEqual(configJson.references, references)) {
            this.logWarn(pkg, `Unexpected references in test tsconfig.json`, fix);
            if (fix) {
                configJson.references = references;
                changed = true;
            }
        }
        if (changed) {
            await writeFileAsync(configFile, JSON.stringify(configJson, undefined, 4));
        }
    }

    public static async checkTestDir(pkg: Package, fix: boolean) {
        if (!this.splitTestBuild(pkg)) { return; }
        const testSrcDir = this.getTestDir(pkg);
        const mochaTestDir = path.join(testSrcDir, "mocha");
        if (existsSync(mochaTestDir)) {
            await this.checkOneTestDir(pkg, fix, testSrcDir, "mocha");
            return this.checkOneTestDir(pkg, fix, testSrcDir, "jest");
        }
        return this.checkOneTestDir(pkg, fix, testSrcDir);
    }

    public static getTestDir(pkg: Package) {
        return path.join(pkg.directory, "src", "test");
    }

    public static splitTestBuild(pkg: Package) {
        return existsSync(path.join(this.getTestDir(pkg), "tsconfig.json"));
    }
};
