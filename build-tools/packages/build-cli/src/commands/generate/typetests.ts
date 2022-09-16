/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    findPackagesUnderPath,
    generateTests,
    getAndUpdatePackageDetails,
} from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import { BaseCommand } from "../../base";
import {
    isDependencyUpdateType,
} from "../../lib";

export default class GenerateTypeTestsCommand extends BaseCommand<
    typeof GenerateTypeTestsCommand.flags
> {
    static description =
        "Generates type tests based on the individual package settings in package.json.";

    static flags = {
        packageDir: Flags.directory({
            char: "d",
            description: "The directory of the package to generate tests for.",
        }),
        releaseGroupRootDir: Flags.directory({
            char: "m",
            description: "The root directory of the mono repo, under which there are packages.",
        }),
        prepare: Flags.boolean({
            char: "p",
            description: "Only prepares the package json. Doesn't generate tests. This should be done before npm install.",
        }),
        generate: Flags.boolean({
            char: "g",
            description: "This only generates the tests. If does not prepare the package.json",
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

    /** An array of messages that will be shown after the command runs. */
    private readonly finalMessages: string[] = [];

    public async run(): Promise<boolean> {
        const args = this.processedArgs;
        const flags = this.processedFlags;

        const context = await this.getContext();

        const packageDirs: string[] = [];
        if (flags.releaseGroupRootDir !== undefined) {
            this.info(`Finding packages in release group directory: ${flags.releaseGroupRootDir}`);
            packageDirs.push(...(await findPackagesUnderPath(flags.releaseGroupRootDir)));
        } else if (flags.packageDir !== undefined) {
            this.info(flags.packageDir);
            packageDirs.push(flags.packageDir);
        }

        this.verbose(`prepare: ${flags.prepare}`);
        this.verbose(`generateOnly: ${flags.generate}`);

        const concurrency = 25;
        const runningGenerates: Promise<boolean>[] = [];
        // this loop incrementally builds up the runningGenerates promise list
        // each dir with an index greater than concurrency looks back the concurrency value
        // to determine when to run
        // eslint-disable-next-line unicorn/no-array-for-each
        packageDirs.forEach((packageDir, i) =>
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
                            flags.generate ? undefined : { cwd: flags.releaseGroupRootDir };

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
            ),
        );

        // eslint-disable-next-line unicorn/no-await-expression-member
        const results = (await Promise.all(runningGenerates)).every((v) => v);
        return results;
    }
}
