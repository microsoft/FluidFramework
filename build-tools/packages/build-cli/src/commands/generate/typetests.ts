/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { CliUx, Flags } from "@oclif/core";
import chalk from "chalk";

import { generateTests, getAndUpdatePackageDetails } from "@fluidframework/build-tools";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";

export default class GenerateTypeTestsCommand extends BaseCommand<
    typeof GenerateTypeTestsCommand.flags
> {
    static summary =
        "Generates type tests based on the individual package settings in package.json.";

    static description = `Generating type tests has two parts: preparing package.json and generating test modules. By default, both steps are run for each package. You can run only one part at a time using the --prepare and --generate flags.

    Preparing package.json determines the baseline previous version to use, then sets that version in package.json. If the previous version changes after running preparation, then npm install must be run before the generate step will run correctly.

    Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during preparation. This is useful when resetting the type tests to a clean state, such as after a major release.

    Generating test modules takes the type test information from package.json, most notably any known broken type tests, and generates an appropriate `;

    static flags = {
        dir: Flags.directory({
            char: "d",
            description: "Run on the package in this directory.",
            exclusive: ["packages", "releaseGroup"],
        }),
        packages: Flags.boolean({
            description: "Run on all independent packages in the repo.",
            default: false,
            exclusive: ["dir", "releaseGroup"],
        }),
        releaseGroup: releaseGroupFlag({
            description: "Run on all packages within this release group.",
            exclusive: ["dir", "packages"],
        }),
        prepare: Flags.boolean({
            description:
                "Prepares the package.json only. Doesn't generate tests. Note that npm install may need to be run after preparation.",
            exclusive: ["generate"],
        }),
        generate: Flags.boolean({
            description: "Generates tests only. Doesn't prepare the package.json.",
            exclusive: ["prepare"],
        }),
        versionConstraint: Flags.string({
            char: "s",
            description:
                "The type of version constraint to use for previous versions. Only applies to the prepare phase.",
            options: [
                "^previousMajor",
                "^previousMinor",
                "~previousMajor",
                "~previousMinor",
                "previousMajor",
                "previousMinor",
                "baseMinor",
                "baseMajor",
            ],
            required: true,
        }),
        exact: Flags.string({
            description:
                "An exact string to use as the previous version constraint. The string will be used as-is. Only applies to the prepare phase.",
            exclusive: ["generate", "versionConstraint"],
        }),
        reset: Flags.boolean({
            description:
                "Resets the broken type test settings in package.json. Only applies to the prepare phase.",
            exclusive: ["generate"],
        }),
        generateInName: Flags.boolean({
            description: "Includes .generated in the generated type test filenames.",
            default: true,
            allowNo: true,
        }),
        ...BaseCommand.flags,
    };

    static examples = [
        {
            description: "Prepare the package.json for all packages in the client release group.",
            command: "<%= config.bin %> <%= command.id %> --prepare -g client",
        },
        {
            description: "Reset all broken type tests across the client release group.",
            command: "<%= config.bin %> <%= command.id %> --prepare -g client --reset",
        },
        {
            description: "Pin the type tests to the previous major version.",
            command: "<%= config.bin %> <%= command.id %> --prepare -s previousMajor",
        },
        {
            description: "Pin the type tests to the current base major version.",
            command: "<%= config.bin %> <%= command.id %> --prepare -s baseMajor",
        },
        {
            description: "Regenerate type tests for the client release group.",
            command: "<%= config.bin %> <%= command.id %> --generate -g client",
        },
    ];

    public async run(): Promise<void> {
        const flags = this.processedFlags;

        if (
            flags.dir === undefined &&
            flags.releaseGroup === undefined &&
            (flags.packages ?? false) === false
        ) {
            this.error(`Must provide a --dir, --packages, or --releaseGroup argument.`);
        }

        const releaseGroup = flags.releaseGroup;
        const independentPackages = flags.packages;
        const dir = flags.dir;

        const runPrepare =
            flags.prepare === undefined && flags.generate === undefined
                ? true
                : flags.prepare ?? false;
        const runGenerate =
            flags.prepare === undefined && flags.generate === undefined
                ? true
                : flags.generate ?? false;

        this.logHr();
        this.log(`prepareOnly: ${runPrepare}, ${flags.prepare}`);
        this.log(`generateOnly: ${runGenerate}, ${flags.generate}`);
        this.logHr();

        const packageDirs: string[] = [];
        // eslint-disable-next-line no-negated-condition
        if (dir !== undefined) {
            this.info(`Finding package in directory: ${dir}`);
            packageDirs.push(dir);
        } else {
            const context = await this.getContext();
            if (independentPackages) {
                this.info(`Finding independent packages`);
                packageDirs.push(...context.independentPackages.map((p) => p.directory));
            } else if (releaseGroup !== undefined) {
                this.info(`Finding packages for release group: ${releaseGroup}`);
                packageDirs.push(
                    ...context.packagesInReleaseGroup(releaseGroup).map((p) => p.directory),
                );
            }
        }

        // In verbose mode, we output a log line per package. In non-verbose mode, we want to display an activity
        // spinner, so we only start the spinner if verbose is false.
        if (!flags.verbose) {
            CliUx.ux.action.start("Preparing/generating type tests...", "generating", {
                stdout: true,
            });
        }

        const concurrency = 25;
        const runningGenerates: Promise<boolean>[] = [];
        // this loop incrementally builds up the runningGenerates promise list
        // each dir with an index greater than concurrency looks back the concurrency value
        // to determine when to run
        for (const [i, packageDir] of packageDirs.entries()) {
            runningGenerates.push(
                (async () => {
                    if (i >= concurrency) {
                        await runningGenerates[i - concurrency];
                    }

                    const packageName = packageDir.slice(
                        Math.max(0, packageDir.lastIndexOf("/") + 1),
                    );

                    const output = [
                        `${(i + 1).toString()}/${packageDirs.length}`,
                        `${packageName}`,
                    ];

                    try {
                        const start = Date.now();
                        const packageData = await getAndUpdatePackageDetails(
                            packageDir,
                            /* writeUpdates */ runPrepare,
                            flags.versionConstraint as any,
                            flags.exact,
                            flags.reset,
                        ).finally(() => output.push(`Loaded(${Date.now() - start}ms)`));

                        if (packageData.skipReason !== undefined) {
                            output.push(packageData.skipReason);
                        } else if (runGenerate === true && packageData.oldVersions.length > 0) {
                            // eslint-disable-next-line @typescript-eslint/no-shadow
                            const start = Date.now();
                            await generateTests(packageData, flags.generateInName)
                                .then((s) =>
                                    output.push(
                                        `dirs(${s.dirs}) files(${s.files}) tests(${s.tests})`,
                                    ),
                                )
                                .finally(() => output.push(`Generated(${Date.now() - start}ms)`));
                        }

                        output.push("Done");
                    } catch (error) {
                        output.push("Error");
                        if (typeof error === "string") {
                            output.push(chalk.red(error));
                        } else if (error instanceof Error) {
                            output.push(chalk.red(error.message), `\n ${error.stack}`);
                        } else {
                            output.push(typeof error, chalk.red(`${error}`));
                        }

                        return false;
                    } finally {
                        this.verbose(output.join(": "));
                    }

                    return true;
                })(),
            );
        }

        // eslint-disable-next-line unicorn/no-await-expression-member
        const results = (await Promise.all(runningGenerates)).every((v) => v);

        // Stop the spinner if needed.
        if (!flags.verbose) {
            CliUx.ux.action.stop("Done");
        }

        if (!results) {
            this.error(`Some type test generation failed.`);
        }
    }
}
