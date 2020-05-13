/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidRepo } from "./fluidRepo";
import { MonoRepoKind } from "../common/monoRepo";
import { Package } from "../common/npmPackage";
import path from "path";
import { existsSync, readFileAsync, writeFileAsync, resolveNodeModule } from "../common/utils";
import TscUtils from "./tscUtils";
import sortPackageJson from "sort-package-json";

export class FluidPackageCheck {
    private static fixPackageVersions: { [key: string]: string } = {
        "jest-junit": "^10.0.0",
        "make-promises-safe": "^5.1.0",
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

    public static checkScripts(repo: FluidRepo, pkg: Package, fix: boolean) {
        const fixed = [
            FluidPackageCheck.checkSort(pkg, fix),
            FluidPackageCheck.checkBuildScripts(pkg, fix),
            FluidPackageCheck.checkCleanScript(pkg, fix),
            FluidPackageCheck.checkTestCoverageScripts(pkg, fix),
            FluidPackageCheck.checkTestSafePromiseRequire(pkg, fix),
            FluidPackageCheck.checkClientTestScripts(pkg, fix),
            FluidPackageCheck.checkJestJunitTestEntry(pkg, fix),
        ];
        return fixed.some((bool) => bool);
    }

    private static logWarn(pkg: Package, message: string, fix: boolean) {
        console.warn(`${pkg.nameColored}: warning:${fix ? " [FIXED]" : ""} ${message}`);
    }

    /**
     * Verify that all packages with 'test' scripts require the 'make-promises-safe' package, which will cause unhandled
     * promise rejections to throw errors
     */
    private static checkTestSafePromiseRequire(pkg: Package, fix: boolean) {
        let fixed = false;
        const pkgstring = "make-promises-safe";
        const testScriptName = pkg.monoRepo?.kind === MonoRepoKind.Server ? "test" : "test:mocha";
        const testScript = pkg.getScript(testScriptName);
        if (testScript && /(ts-)?mocha/.test(testScript)) {
            if (this.ensureDevDependency(pkg, fix, pkgstring)) {
                fixed = true;
            }
            if (!testScript.includes(pkgstring)) {
                if (/(ts-)?mocha/.test(testScript)) {
                    this.logWarn(pkg, `no ${pkgstring} require in test script`, fix);
                    if (fix) {
                        pkg.packageJson.scripts[testScriptName] += " -r " + pkgstring;
                        fixed = true;
                    }
                }
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
        } else if (expectedTestScript && testScript !== expectedTestScript) {
            this.logWarn(pkg, `non-conformant script "test"`, fix);
            this.logWarn(pkg, `  expect: ${expectedTestScript}`, fix);
            this.logWarn(pkg, `     got: ${testScript}`, fix);
            if (fix) {
                pkg.packageJson.scripts["test"] = expectedTestScript;
                fixed = true;
            }
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

            // all build and lint steps (build + webpack)
            const buildFull: string[] = ["build"];

            // all build steps (build:compile + webpack)
            const buildFullCompile: string[] = ["build:compile"];

            // prepack scripts
            const prepack: string[] = [];

            const buildPrefix = pkg.getScript("build:genver") ? "npm run build:genver && " : "";
            if (pkg.getScript("tsc")) {
                buildCompile.push("tsc");
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
                buildCompile.push("build:webpack");
                implicitWebpack = false;
            }

            if (pkg.getScript("webpack")) {
                if (implicitWebpack) {
                    buildFull.push("webpack");
                    buildFullCompile.push("webpack");
                }
                if (pkg.monoRepo?.kind !== MonoRepoKind.Server) {
                    prepack.push("webpack");
                }
            }

            if (buildCompile.length === 0) {
                this.logWarn(pkg, `can't detect anything to build`, false);
                return;
            }

            const check = (scriptName: string, parts: string[], prefix = "") => {
                const expected = parts.length === 0 ? undefined :
                    prefix + (parts.length > 1 ? `concurrently npm:${parts.join(" npm:")}` : `npm run ${parts[0]}`);
                const script = pkg.getScript(scriptName);
                if (script !== expected) {
                    this.logWarn(pkg, `non-conformant script "${scriptName}"`, fix);
                    this.logWarn(pkg, `  expect: ${expected}`, fix);
                    this.logWarn(pkg, `     got: ${script}`, fix);
                    if (fix) {
                        pkg.packageJson.scripts[scriptName] = expected;
                        fixed = true;
                    }
                }
            }
            check("build", build, buildPrefix);
            check("build:compile", buildCompile);
            check("build:full", buildFull);
            check("build:full:compile", buildFullCompile);
            check("prepack", prepack);
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

    public static async checkNpmIgnore(pkg: Package, fix: boolean) {
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

    public static async checkTsConfig(pkg: Package, fix: boolean) {
        const command = pkg.getScript("tsc");
        if (command) {
            const parsedCommand = TscUtils.parseCommandLine(command);
            if (!parsedCommand) { return undefined; }

            // Assume tsc with no argument.
            const configFile = TscUtils.findConfigFile(pkg.directory, parsedCommand);
            const configJson = TscUtils.readConfigFile(configFile);

            const commonConfig = "@microsoft/fluid-build-common/ts-common-config.json";
            let changed = false;
            if (configJson.extends !== commonConfig) {
                this.logWarn(pkg, `tsc config not extending ts-common-config.json`, fix);
                if (fix) {
                    configJson.extends = commonConfig;
                    changed = true;
                }
            }

            if (configJson.extends === commonConfig) {
                let loaded = false;
                const commonConfigFullPath = resolveNodeModule(pkg.directory, commonConfig);
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
                    this.logWarn(pkg, `can't found ${commonConfig}`, false);
                }
            }


            if (changed) {
                await writeFileAsync(configFile, JSON.stringify(configJson, undefined, 4));
            }
        }
    }
};
