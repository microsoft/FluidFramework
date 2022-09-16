/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidRepo, findPackagesUnderPath } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import { BaseCommand } from "../../base";
import {
    generateBumpDepsBranchName,
    indentString,
    isDependencyUpdateType,
    npmCheckUpdates,
} from "../../lib";

export default class GenerateTypeTestsCommand extends BaseCommand<typeof GenerateTypeTestsCommand.flags> {
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
        // prepare: Flags.boolean({
        //     char: "p",
        //     description: "Only prepares the package json. Doesn't generate tests. This should be done before npm install.",
        // }),
        // generate: Flags.boolean({
        //     char: "g",
        //     description: "This only generates the tests. If does not prepare the package.json",
        // }),
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

    public async run(): Promise<void> {
        const args = this.processedArgs;
        const flags = this.processedFlags;

        const context = await this.getContext();


        const packageDirs: string[] = [];
        if (flags.releaseGroupRootDir !== undefined) {
            this.info(`Finding packages in release group directory: ${flags.releaseGroupRootDir}`);
            packageDirs.push(... (await findPackagesUnderPath(flags.releaseGroupRootDir)));
        } else if (flags.packageDir !== undefined) {
            this.info(flags.packageDir);
            packageDirs.push(flags.packageDir);
        }

        // writeOutLine(`preinstallOnly: ${program.preinstallOnly}`)
        // writeOutLine(`generateOnly: ${program.generateOnly}`)

        const concurrency = 25;
        const runningGenerates: Promise<boolean>[]=[];
        // this loop incrementally builds up the runningGenerates promise list
        // each dir with an index greater than concurrency looks back the concurrency value
        // to determine when to run
        // eslint-disable-next-line unicorn/no-array-for-each
        packageDirs.forEach(( packageDir,i)=> runningGenerates.push((async ()=> {
            if(i >= concurrency){
                await runningGenerates[i - concurrency];
            }

            const packageName = packageDir.slice(Math.max(0, packageDir.lastIndexOf("/") + 1));
            const output = [`${(i+1).toString()}/${packageDirs.length}`,`${packageName}`];
            try{
                const start = Date.now();
                const updateOptions: Parameters<typeof getAndUpdatePackageDetails>[1] =
                    program.generateOnly ? undefined : {cwd: program.monoRepoDir};
                const packageData = await getAndUpdatePackageDetails(packageDir, updateOptions)
                    .finally(()=>output.push(`Loaded(${Date.now() - start}ms)`));
                if(packageData.skipReason !== undefined){
                    output.push(packageData.skipReason)
                }
                else if(packageData.oldVersions.length > 0
                    && program.preinstallOnly === undefined){
                    const start = Date.now();
                    await generateTests(packageData)
                        .then((s)=>output.push(`dirs(${s.dirs}) files(${s.files}) tests(${s.tests})`))
                        .finally(()=> output.push(`Generated(${Date.now() - start}ms)`));
                }
                output.push("Done");
            }catch(error){
                output.push("Error");
                if(typeof error === "string"){
                    output.push(error);
                }else if(error instanceof Error){
                    output.push(error.message, `\n ${error.stack}`)
                }else{
                    output.push(typeof error, `${error}`);
                }
                return false;
            }finally{
                writeOutLine(output.join(": "));
            }
            return true;
        })()));

        return (await Promise.all(runningGenerates)).every((v)=>v);


        this.logHr();
        this.log(`Dependencies: ${chalk.blue(args.package_or_release_group)}`);
        this.log(`Packages: ${chalk.blueBright(flags.releaseGroup ?? "all packages")}`);
        this.log(`Prerelease: ${flags.prerelease ? chalk.green("yes") : "no"}`);
        this.log(`Bump type: ${chalk.bold(versionToSet)}`);
        this.logHr();
        this.log("");

        if (!isDependencyUpdateType(flags.updateType) || flags.updateType === undefined) {
            this.error(`Unknown dependency update type: ${flags.updateType}`);
        }

        const { updatedPackages, updatedDependencies } = await npmCheckUpdates(
            context,
            flags.releaseGroup, // if undefined the whole repo will be checked
            depsToUpdate,
            args.package_or_release_group,
            flags.updateType,
            /* prerelease */ flags.prerelease,
            /* writeChanges */ true,
            this.logger,
        );

        if (updatedPackages.length > 0) {
            if (shouldInstall) {
                if (!(await FluidRepo.ensureInstalled(updatedPackages, false))) {
                    this.error("Install failed.");
                }
            } else {
                this.warning(`Skipping installation. Lockfiles might be outdated.`);
            }

            const updatedReleaseGroups: ReleaseGroup[] = [
                ...new Set(
                    updatedPackages
                        .filter((p) => p.monoRepo !== undefined)
                        .map((p) => p.monoRepo!.kind),
                ),
            ];

            const changedVersionsString = [`Updated the following:`, ""];

            for (const rg of updatedReleaseGroups) {
                changedVersionsString.push(indentString(`${rg} (release group)`));
            }

            for (const pkg of updatedPackages) {
                if (pkg.monoRepo === undefined) {
                    changedVersionsString.push(indentString(`${pkg.name}`));
                }
            }

            changedVersionsString.push(
                "",
                `Dependencies on ${chalk.blue(args.package_or_release_group)} updated:`,
                "",
            );

            for (const [pkgName, ver] of Object.entries(updatedDependencies)) {
                changedVersionsString.push(indentString(`${pkgName}: ${chalk.bold(ver)}`));
            }

            const changedVersionMessage = changedVersionsString.join("\n");
            if (shouldCommit) {
                const commitMessage = stripAnsi(`Bump dependencies\n\n${changedVersionMessage}`);

                const bumpBranch = generateBumpDepsBranchName(
                    args.package_or_release_group,
                    flags.updateType,
                    flags.releaseGroup,
                );
                this.log(`Creating branch ${bumpBranch}`);
                await context.createBranch(bumpBranch);
                await context.gitRepo.commit(commitMessage, "Error committing");
                this.finalMessages.push(
                    `You can now create a PR for branch ${bumpBranch} targeting ${context.originalBranchName}`,
                );
            } else {
                this.warning(`Skipping commit. You'll need to manually commit changes.`);
            }

            this.finalMessages.push(
                `\nUpdated ${depsToUpdate.length} dependencies across ${updatedPackages.length} packages.\n`,
                `${changedVersionMessage}`,
            );
        } else {
            this.log(chalk.red("No dependencies need to be updated."));
        }

        if (this.finalMessages.length > 0) {
            this.logHr();
            for (const msg of this.finalMessages) {
                this.log(msg);
            }
        }
    }
}
