/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidRepo } from "./fluidRepo";
import { MonoRepo } from "../common/fluidRepoBase";
import { Package } from "../common/npmPackage";

export class FluidPackageCheck {
    constructor(private readonly repoType: MonoRepo) {
    }

    public static checkScripts(repo: FluidRepo, pkg: Package, fix: boolean) {
        const monoRepo = repo.getMonoRepo(pkg);
        const fixed = [
            FluidPackageCheck.checkBuildScripts(pkg, fix, monoRepo),
            FluidPackageCheck.checkTestCoverageScripts(pkg, fix),
            FluidPackageCheck.checkTestSafePromiseRequire(pkg, fix, monoRepo),
            FluidPackageCheck.checkMochaTestScripts(pkg, fix, monoRepo),
            FluidPackageCheck.checkJestJunitTestEntry(pkg, fix),
        ];
        return fixed.some((bool) => bool);
    }

    /**
     * Verify that all packages with 'test' scripts require the 'make-promises-safe' package, which will cause unhandled
     * promise rejections to throw errors
     */
    private static checkTestSafePromiseRequire(pkg: Package, fix: boolean, monoRepo: MonoRepo) {
        let fixed = false;
        const pkgstring = "make-promises-safe";
        const pkgversion = "^5.1.0";
        const testScript = monoRepo === MonoRepo.Server ? "test" : "test:mocha";
        if (pkg.packageJson.scripts && pkg.packageJson.scripts[testScript] && /(ts-)?mocha/.test(pkg.packageJson.scripts[testScript]!)) {
            if (pkg.packageJson.devDependencies && !pkg.packageJson.devDependencies[pkgstring]) {
                console.warn(`${pkg.nameColored}: warning: missing ${pkgstring} dependency`);
                if (fix) {
                    pkg.packageJson.devDependencies[pkgstring] = pkgversion;
                    fixed = true;
                }
            }
            if (!pkg.packageJson.scripts[testScript]!.includes(pkgstring)) {
                if (/(ts-)?mocha/.test(pkg.packageJson.scripts[testScript]!)) {
                    console.warn(`${pkg.nameColored}: warning: no ${pkgstring} require in test script`);
                    if (fix) {
                        pkg.packageJson.scripts[testScript] += " -r " + pkgstring;
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
    public static checkMochaTestScripts(pkg: Package, fix: boolean, monoRepo: MonoRepo) {
        let fixed = false;
        if (monoRepo !== MonoRepo.Server && pkg.packageJson.scripts && pkg.packageJson.scripts.test && /^(ts-)?mocha/.test(pkg.packageJson.scripts.test)) {
            console.warn(`${pkg.nameColored}: warning: "mocha" in "test" script instead of "test:mocha" script`)
            if (fix) {
                if (!pkg.packageJson.scripts["test:mocha"]) {
                    pkg.packageJson.scripts["test:mocha"] = pkg.packageJson.scripts["test"];
                    pkg.packageJson.scripts["test"] = "npm run test:mocha";
                    fixed = true;
                } else {
                    console.warn(`${pkg.nameColored}: couldn't fix: "test" and "test:mocha" scripts both present`)
                }
            }
        }

        return fixed;
    }

    private static checkJestJunitTestEntry(pkg: Package, fix: boolean) {
        let fixed = false;
        const pkgstring = "jest-junit";
        const pkgversion = "^10.0.0";
        if (pkg.packageJson.scripts && pkg.packageJson.scripts["test:jest"]) {
            if (!pkg.packageJson.devDependencies[pkgstring]) {
                console.warn(`${pkg.nameColored}: warning: missing ${pkgstring} dependency`);
                if (fix) {
                    pkg.packageJson.devDependencies[pkgstring] = pkgversion;
                    fixed = true;
                }
            }
            if (!pkg.packageJson["jest-junit"]) {
                console.warn(`${pkg.nameColored} warning: no jest-junit entry for jest test`);
            }
        }

        return fixed;
    }

    private static checkTestCoverageScripts(pkg: Package, fix: boolean) {
        let fixed = false;
        // Fluid specific
        const testCoverageScript = pkg.getScript("test:coverage");
        if (testCoverageScript && testCoverageScript.startsWith("nyc")) {
            if (!pkg.packageJson.devDependencies.nyc) {
                console.warn(`${pkg.nameColored}: warning: missing nyc dependency`);
            }
            if (pkg.packageJson.nyc) {
                if (pkg.packageJson.nyc["exclude-after-remap"] !== false) {
                    console.warn(`${pkg.nameColored}: warning: nyc.exclude-after-remap need to be false`);
                    if (fix) {
                        pkg.packageJson.nyc["exclude-after-remap"] = false;
                        fixed = true;
                    }
                }
            } else {
                console.warn(`${pkg.nameColored}: warning: missing nyc configuration`);
            }
        }

        return fixed;
    }

    private static checkBuildScripts(pkg: Package, fix: boolean, monoRepo: MonoRepo) {
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

            // all build steps prod
            const buildCompileMin: string[] = ["build:compile"];
            const buildPrefix = pkg.packageJson.scripts["build:genver"] ? "npm run build:genver && " : "";
            if (pkg.getScript("tsc")) {
                buildCompile.push("tsc");
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
            if (pkg.getScript("build:webpack:min")) {
                buildCompileMin.push("build:webpack:min");
                implicitWebpack = false;
            }
            if (pkg.getScript("build:webpack")) {
                buildCompile.push("build:webpack");
                implicitWebpack = false;
            }

            if (implicitWebpack && pkg.getScript("webpack")) {
                buildFull.push("webpack");
                buildFullCompile.push("webpack");
            }

            if (buildCompile.length === 0) {
                console.warn(`${pkg.nameColored}: warning: can't detect anything to build`);
                return;
            }

            const check = (scriptName: string, parts: string[], prefix = "") => {
                const expected = prefix +
                    (parts.length > 1 ? `concurrently npm:${parts.join(" npm:")}` : `npm run ${parts[0]}`);
                if (pkg.packageJson.scripts[scriptName] !== expected) {
                    console.warn(`${pkg.nameColored}: warning: non-conformant script ${scriptName}`);
                    console.warn(`${pkg.nameColored}: warning:   expect: ${expected}`);
                    console.warn(`${pkg.nameColored}: warning:      got: ${pkg.packageJson.scripts[scriptName]}`);
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
            if (monoRepo !== MonoRepo.None) {
                check("build:compile:min", buildCompileMin);
            }

            if (!pkg.getScript("clean")) {
                console.warn(`${pkg.nameColored}: warning: package has "build" script without "clean" script`);
            }
        }
        return fixed;
    }
};
