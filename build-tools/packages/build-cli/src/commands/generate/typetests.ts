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
    static description =
        "Generates type tests based on the individual package settings in package.json.";

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
                "Only prepares the package json. Doesn't generate tests. This should be done before npm install.",
            exclusive: ["generate"],
        }),
        generate: Flags.boolean({
            description: "This only generates the tests. It does not prepare the package.json",
            exclusive: ["prepare"],
        }),
        ...BaseCommand.flags,
    };

    static examples = [
        {
            description:
                "Bump dependencies on @fluidframework/build-common to the latest release version across all release groups.",
            command: "<%= config.bin %> <%= command.id %> @fluidframework/build-common -t latest",
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

        this.logHr();
        this.log(`prepare: ${flags.prepare}`);
        this.log(`generateOnly: ${flags.generate}`);
        this.logHr();

        const packageDirs: string[] = [];
        if (independentPackages) {
            this.info(`Finding independent packages`);
            packageDirs.push(...context.independentPackages.map((p) => p.directory));
            // packageDirs.push(...context.packages.map(p=>p.directory));
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
                        const updateOptions: Parameters<typeof getAndUpdatePackageDetails>[1] =
                            flags.generate ? undefined : { cwd: releaseGroupRepo?.repoPath };

                        const packageData = await getAndUpdatePackageDetails(
                            packageDir,
                            updateOptions,
                        ).finally(() => output.push(`Loaded(${Date.now() - start}ms)`));

                        if (packageData.skipReason !== undefined) {
                            output.push(packageData.skipReason);
                        } else if (
                            packageData.oldVersions.length > 0 &&
                            flags.prepare === undefined
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
            this.error(`Results were false.`);
        }
    }
}
