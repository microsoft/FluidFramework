/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { CliUx, Flags } from "@oclif/core";
import chalk from "chalk";

import {
	PreviousVersionStyle,
	generateTests,
	getAndUpdatePackageDetails,
} from "@fluidframework/build-tools";

import { BaseCommand } from "../../base";
import { releaseGroupFlag } from "../../flags";

export default class GenerateTypeTestsCommand extends BaseCommand<
	typeof GenerateTypeTestsCommand.flags
> {
	static description = `Generates type tests based on the individual package settings in package.json.

    Generating type tests has two parts: preparing package.json and generating test modules. By default, both steps are run for each package. You can run only one part at a time using the --prepare and --generate flags.

    Preparing package.json determines the baseline previous version to use, then sets that version in package.json. If the previous version changes after running preparation, then npm install must be run before the generate step will run correctly.

    Optionally, any type tests that are marked "broken" in package.json can be reset using the --reset flag during preparation. This is useful when resetting the type tests to a clean state, such as after a major release.

    Generating test modules takes the type test information from package.json, most notably any known broken type tests, and generates test files that should be committed.

    To learn more about how to configure type tests, see the detailed documentation at <https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md>.`;

	static flags = {
		dir: Flags.directory({
			char: "d",
			description:
				"Run on the package in this directory. Cannot be used with --releaseGroup or --packages.",
			exclusive: ["packages", "releaseGroup"],
		}),
		packages: Flags.boolean({
			description:
				"Run on all independent packages in the repo. This is an alternative to using the --dir flag for independent packages.",
			default: false,
			exclusive: ["dir", "releaseGroup"],
		}),
		releaseGroup: releaseGroupFlag({
			description:
				"Run on all packages within this release group. Cannot be used with --dir or --packages.",
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
		reset: Flags.boolean({
			description:
				"Resets the broken type test settings in package.json. Only applies to the prepare phase.",
			exclusive: ["generate"],
		}),
		versionConstraint: Flags.string({
			char: "s",
			description: `The type of version constraint to use for previous versions. This overrides the branch-specific configuration in package.json, which is used by default.

                For more information about the options, see https://github.com/microsoft/FluidFramework/blob/main/build-tools/packages/build-cli/docs/typetestDetails.md#configuring-a-branch-for-a-specific-baseline

                Cannot be used with --dir or --packages.\n`,
			options: [
				"^previousMajor",
				"^previousMinor",
				"~previousMajor",
				"~previousMinor",
				"previousMajor",
				"previousMinor",
				"previousPatch",
				"baseMinor",
				"baseMajor",
				"~baseMinor",
			],
		}),
		branch: Flags.string({
			char: "b",
			description: `Use the specified branch name to determine the version constraint to use for previous versions, rather than using the current branch name.

            The version constraint used will still be loaded from branch configuration; this flag only controls which branch's settings are used.`,
			exclusive: ["versionConstraint"],
		}),
		exact: Flags.string({
			description:
				"An exact string to use as the previous version constraint. The string will be used as-is. Only applies to the prepare phase.",
			exclusive: ["generate", "versionConstraint"],
		}),
		pin: Flags.boolean({
			description: `Searches the release git tags in the repo and selects the baseline version as the maximum
            released version that matches the range.

            This effectively pins the version to a specific version while allowing it to be updated manually as
            needed by running type test preparation again.`,
			default: false,
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
			const ctx = await this.getContext();
			if (flags.pin === true) {
				// preload the release data if we're pinning to a version matching the range. This speeds release
				// lookups later, which are done async so without the precaching there's a big when all the async tasks
				// execute.
				this.info(`Loading release data from git tags`);
				await ctx.loadReleases();
			}
			if (independentPackages) {
				this.info(`Finding independent packages`);
				packageDirs.push(...ctx.independentPackages.map((p) => p.directory));
			} else if (releaseGroup !== undefined) {
				this.info(`Finding packages for release group: ${releaseGroup}`);
				packageDirs.push(
					...ctx.packagesInReleaseGroup(releaseGroup).map((p) => p.directory),
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

		const context = await this.getContext();
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
							context,
							packageDir,
							/* writeUpdates */ runPrepare,
							flags.versionConstraint as PreviousVersionStyle | undefined,
							flags.branch,
							flags.exact,
							flags.reset,
							flags.pin,
							this.logger,
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
							this.errorLog(chalk.red(error));
						} else if (error instanceof Error) {
							this.errorLog(`${chalk.red(error.message)}\n ${error.stack}`);
						} else {
							this.errorLog(`${typeof error} - ${chalk.red(`${error}`)}`);
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
