/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Flags } from "@oclif/core";

import { generateTests, getAndUpdatePackageDetails } from "@fluidframework/build-tools";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";

export default class GenerateTypeTestsCommand extends BaseCommand<
    typeof GenerateTypeTestsCommand.flags
> {
    static summary =
        "Generates type tests based on the individual package settings in package.json.";

    static description = `Generating type tests has two parts: preparing package.json and generating type tests. By default, both steps are run for each package. This can be overridden using the --prepare and --generate flags.`;

    static flags = {
        dir: Flags.directory({
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
            options: [
                "^previousMajor",
                "^previousMinor",
                "~previousMajor",
                "~previousMinor",
                "previousMajor",
                "previousMinor",
            ],
        }),
        exact: Flags.string({
            exclusive: ["versionConstraint"],
        }),
        ...BaseCommand.flags,
    };

    static examples = [
        {
            description: "",
            command: "<%= config.bin %> <%= command.id %>",
        },
    ];

    public async run(): Promise<void> {
        const flags = this.processedFlags;

        const context = await this.getContext();
        const releaseGroup = flags.releaseGroup;
        const releaseGroupRepo =
            releaseGroup === undefined ? undefined : context.repo.releaseGroups.get(releaseGroup);
        const independentPackages = flags.packages;
        const dir = flags.dir;

        if (dir === undefined && releaseGroup === undefined && independentPackages === undefined) {
            this.error(`Must provide a --dir, --packages, or --releaseGroup argument.`);
        }

        // if(flags.prepare === undefined && flags.generate === undefined) {
        //     this.error(`Must pass --prepare or --generate.`);
        // }

        const prepareOnly = flags.prepare ?? false;
        const generateOnly = flags.generate ?? false;

        this.logHr();
        this.log(`prepareOnly: ${prepareOnly}, ${flags.prepare}`);
        this.log(`generateOnly: ${generateOnly}, ${flags.generate}`);
        this.logHr();

        const packageDirs: string[] = [];
        if (independentPackages) {
            this.info(`Finding independent packages`);
            packageDirs.push(...context.independentPackages.map((p) => p.directory));
        }

        if (releaseGroup !== undefined) {
            this.info(`Finding packages for release group: ${releaseGroup}`);
            packageDirs.push(
                ...context.packagesInReleaseGroup(releaseGroup).map((p) => p.directory),
            );
        }

        if (dir !== undefined) {
            this.info(`Finding package in directory: ${dir}`);
            packageDirs.push(dir);
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
                        // const updateOptions: Parameters<typeof getAndUpdatePackageDetails>[1] =
                        //     shouldGenerate ? undefined : { cwd: releaseGroupRepo?.repoPath };

                        const packageData = await getAndUpdatePackageDetails(
                            packageDir,
                            // TODO: This logic doesn't make a lot of sense. Why does cwd need to be assed in sometimes?
                            // It also seems weird that
                            generateOnly ? undefined : { cwd: releaseGroupRepo?.repoPath },
                            flags.versionConstraint as any,
                            flags.exact,
                        ).finally(() => output.push(`Loaded(${Date.now() - start}ms)`));

                        if (packageData.skipReason !== undefined) {
                            output.push(packageData.skipReason);
                        } else if (
                            (prepareOnly ?? false) === false &&
                            packageData.oldVersions.length > 0
                        ) {
                            // eslint-disable-next-line @typescript-eslint/no-shadow
                            const start = Date.now();
                            await generateTests(packageData)
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
                            output.push(error);
                        } else if (error instanceof Error) {
                            output.push(error.message, `\n ${error.stack}`);
                        } else {
                            output.push(typeof error, `${error}`);
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
        if (!results) {
            this.error(`Some type test generation failed.`);
        }
    }
}
