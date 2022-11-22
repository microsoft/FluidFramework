/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import chalk from "chalk";
import fs from "fs";
import isEqual from "lodash.isequal";
import path from "path";
import sortPackageJson from "sort-package-json";

import { MonoRepoKind } from "../common/monoRepo";
import { Package, ScriptDependencies } from "../common/npmPackage";
import { existsSync, readFileAsync, resolveNodeModule, writeFileAsync } from "../common/utils";
import * as TscUtils from "./tscUtils";

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
            FluidPackageCheck.checkSort(pkg, fix),
            FluidPackageCheck.checkBuildScripts(pkg, fix),
            FluidPackageCheck.checkCleanScript(pkg, fix),
            FluidPackageCheck.checkTestCoverageScripts(pkg, fix),
            FluidPackageCheck.checkTestScripts(pkg, fix),
            FluidPackageCheck.checkClientTestScripts(pkg, fix),
            FluidPackageCheck.checkJestJunitTestEntry(pkg, fix),
            FluidPackageCheck.checkLintScripts(pkg, fix),
            FluidPackageCheck.checkFluidBuildDependencies(pkg),
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
                pkg.monoRepo?.kind === MonoRepoKind.Client ||
                pkg.monoRepo?.kind === MonoRepoKind.Azure;
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

            if (!hasConfig) {
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

    private static checkChildrenScripts(
        pkg: Package,
        name: string,
        expected: string[] | undefined,
        concurrent: boolean,
        fix: boolean,
    ) {
        const expectedScript = expected
            ? concurrent
                ? `concurrently ${expected.map((value) => `npm:${value}`).join(" ")}`
                : expected.map((value) => `npm run ${value}`).join(" && ")
            : undefined;
        return this.checkScript(pkg, name, expectedScript, fix);
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

        if (
            pkg.monoRepo?.kind === MonoRepoKind.Client &&
            testScript &&
            /^(ts-)?mocha/.test(testScript)
        ) {
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
            const buildFullCompile: string[] =
                pkg.packageJson.private && !hasFull ? [] : ["build:compile"];

            // prepack scripts
            const prepack: string[] = [];

            let concurrentBuildCompile = true;

            const buildPrefix = pkg.getScript("build:gen")
                ? "npm run build:gen && "
                : pkg.getScript("build:genver")
                ? "npm run build:genver && "
                : "";

            // if build:docs script exist, we require it in to be called in the build script for @fluidframework packages
            // otherwise, it is optional
            const buildSuffix =
                pkg.getScript("build:docs") &&
                (pkg.name.startsWith("@fluidframework") ||
                    pkg.getScript("build")?.endsWith(" && npm run build:docs"))
                    ? " && npm run build:docs"
                    : "";
            // tsc should be in build:commonjs if it exists, otherwise, it should be in build:compile
            if (pkg.getScript("tsc")) {
                if (pkg.getScript("build:commonjs")) {
                    buildCommonJs.push("tsc");
                } else {
                    buildCompile.push("tsc");
                }
            }

            if (pkg.getScript("typetests:gen")) {
                // typetests:gen should be in build:commonjs if it exists, otherwise, it should be in build:compile
                const buildTargetScripts = pkg.getScript("build:commonjs")
                    ? buildCommonJs
                    : buildCompile;
                if (pkg.getScript("build:test")) {
                    // if there is a test target put test type gen after tsc
                    // as the type test will build with the tests
                    buildTargetScripts.push("typetests:gen");
                } else {
                    // if there is no test target put it before tsc
                    // so type test build with tsc
                    buildTargetScripts.unshift("typetests:gen");
                }
            }

            const splitTestBuild = this.splitTestBuild(pkg, true);
            // build:test should be in build:commonjs if it exists, otherwise, it should be in build:compile
            if (pkg.getScript("build:test") || splitTestBuild) {
                if (pkg.getScript("build:commonjs")) {
                    buildCommonJs.push("build:test");
                    // build common js is not concurrent by default
                } else {
                    buildCompile.push("build:test");
                    // test is depended on tsc, so we can't do it concurrently for build:compile
                    concurrentBuildCompile = !splitTestBuild;
                }
            }

            if (pkg.getScript("build:realsvctest")) {
                buildCompile.push("build:realsvctest");
            }

            // build:commonjs build:es5 and build:esnext should be in build:compile if they exist
            if (pkg.getScript("build:commonjs")) {
                buildCompile.push("build:commonjs");
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

            const check = (
                scriptName: string,
                parts: string[],
                concurrently = true,
                prefix = "",
                suffix = "",
            ) => {
                const expected =
                    parts.length === 0
                        ? undefined
                        : prefix +
                          (parts.length > 1 && concurrently
                              ? `concurrently npm:${parts.join(" npm:")}`
                              : `npm run ${parts.join(" && npm run ")}`) +
                          suffix;
                if (this.checkScript(pkg, scriptName, expected, fix)) {
                    fixed = true;
                }
            };
            check("build", build, true, buildPrefix, buildSuffix);
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

            const testDirs = this.getTestDirs(pkg);
            if (testDirs.length === 1) {
                const expectedBuildTest = `tsc --project ./src/test/${
                    testDirs[0] ? testDirs[0] + "/" : ""
                }tsconfig.json`;
                if (this.checkScript(pkg, "build:test", expectedBuildTest, fix)) {
                    fixed = true;
                }
            } else if (testDirs.length !== 0) {
                check(
                    "build:test",
                    testDirs.map((dir) => {
                        const script = `build:test:${dir}`;
                        const expectedBuildTest = `tsc --project ./src/test/${dir}/tsconfig.json`;
                        if (this.checkScript(pkg, script, expectedBuildTest, fix)) {
                            fixed = true;
                        }
                        return script;
                    }),
                );
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
            const hasPrettier = pkg.getScript("prettier");
            const lintChildren = hasPrettier ? ["prettier", "eslint"] : ["eslint"];
            if (this.checkChildrenScripts(pkg, "lint", lintChildren, false, fix)) {
                fixed = true;
            }
            if (
                this.checkChildrenScripts(
                    pkg,
                    "lint:fix",
                    lintChildren.map((value) => `${value}:fix`),
                    false,
                    fix,
                )
            ) {
                fixed = true;
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
            if (!isEqual(configJson.references, references)) {
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

    private static checkFluidBuildScriptDependencies(
        pkg: Package,
        name: string,
        scriptDeps: { [key: string]: ScriptDependencies },
    ) {
        const type = typeof scriptDeps;
        if (type !== "object") {
            this.logWarn(
                pkg,
                `invalid type ${type} for fluidBuild.buildDependencies.${name}`,
                false,
            );
            return;
        }
        for (const key of Object.keys(scriptDeps)) {
            if (!pkg.getScript(key)) {
                this.logWarn(
                    pkg,
                    `non-exist script ${key} specified in fluidBuild.buildDependencies.${name}`,
                    false,
                );
                continue;
            }
            const scriptDep = scriptDeps[key];
            const scriptDepType = typeof scriptDep;
            if (scriptDepType !== "object") {
                this.logWarn(
                    pkg,
                    `invalid type ${scriptDepType} for fluidBuild.buildDependencies.${name}.${key}`,
                    false,
                );
                return;
            }
            for (const depPackage of Object.keys(scriptDep)) {
                if (
                    !pkg.packageJson.dependencies[depPackage] &&
                    !pkg.packageJson.devDependencies[depPackage]
                ) {
                    this.logWarn(
                        pkg,
                        `non-dependent package ${depPackage} specified in fluidBuild.buildDependencies.${name}.${key}`,
                        false,
                    );
                }
                if (!Array.isArray(scriptDep[depPackage])) {
                    this.logWarn(
                        pkg,
                        `non-array specified in fluidBuild.buildDependencies.${name}.${key}.${depPackage}`,
                        false,
                    );
                }
            }
        }
    }

    private static checkFluidBuildDependencies(pkg: Package) {
        const buildDependencies = pkg.packageJson.fluidBuild?.buildDependencies;
        if (!buildDependencies) {
            return;
        }
        if (buildDependencies.merge) {
            this.checkFluidBuildScriptDependencies(pkg, "merge", buildDependencies.merge);
        }
    }
}
