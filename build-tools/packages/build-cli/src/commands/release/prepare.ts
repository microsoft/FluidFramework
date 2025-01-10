/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "picocolors";

import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args.js";
import { BaseCommand } from "../../library/index.js";
import {
	CheckDependenciesInstalled,
	type CheckFunction,
	CheckHasNoPrereleaseDependencies,
	CheckHasRemoteBranchUpToDate,
	CheckNoLocalChanges,
	CheckNoPolicyViolations,
	CheckNoUntaggedAsserts,
	// library is overloaded with too much stuff now, and we should consider allowing interior imports.
	// eslint-disable-next-line import/no-internal-modules
} from "../../library/releasePrepChecks.js";

/**
 * All the checks that should be executed. The checks are executed serially in this order.
 */
const allChecks: ReadonlyMap<string, CheckFunction> = new Map([
	["Branch has no local changes", CheckNoLocalChanges],
	[
		"The local branch is up to date with the microsoft/FluidFramework remote",
		CheckHasRemoteBranchUpToDate,
	],
	["Dependencies are installed locally", CheckDependenciesInstalled],
	["Has no pre-release Fluid dependencies", CheckHasNoPrereleaseDependencies],
	["No repo policy violations", CheckNoPolicyViolations],
	["No untagged asserts", CheckNoUntaggedAsserts],
]);

/**
 * Runs checks on a local branch to verify it is ready to serve as the base for a release branch.
 */
export class ReleasePrepareCommand extends BaseCommand<typeof ReleasePrepareCommand> {
	public static readonly summary =
		`Runs checks on a local branch to verify it is ready to serve as the base for a release branch.`;

	public static readonly aliases: string[] = ["release:prep"];

	public static readonly description = `Runs the following checks:\n${[
		"",
		...allChecks.keys(),
	].join("\n- ")}`;

	public static readonly args = {
		package_or_release_group: packageOrReleaseGroupArg({
			description:
				"The name of a package or a release group. Defaults to the client release group if not specified.",
			default: "client",
		}),
	} as const;

	public async run(): Promise<void> {
		const context = await this.getContext();

		const rgArg = this.args.package_or_release_group;
		const pkgOrReleaseGroup = findPackageOrReleaseGroup(rgArg, context);
		if (pkgOrReleaseGroup === undefined) {
			this.error(`Can't find package or release group "${rgArg}"`, { exit: 1 });
		}
		this.verbose(`Release group or package found: ${pkgOrReleaseGroup.name}`);

		this.logHr();
		for (const [name, check] of allChecks) {
			// eslint-disable-next-line no-await-in-loop -- the checks are supposed to run serially
			const checkResult = await check(context, pkgOrReleaseGroup);
			const checkPassed = checkResult === undefined;
			const icon = checkPassed
				? chalk.bgGreen(chalk.black(" ✔︎ "))
				: chalk.bgRed(chalk.white(" ✖︎ "));

			this.log(`${icon} ${checkPassed ? name : chalk.red(checkResult.message)}`);
			if (!checkPassed) {
				if (checkResult.fixCommand !== undefined) {
					this.logIndent(
						`${chalk.yellow(`Possible fix command:`)} ${chalk.yellow(
							chalk.bold(checkResult.fixCommand),
						)}`,
						6,
					);
				}
				if (checkResult.fatal === true) {
					this.error("Can't do other checks until the failures are resolved.", { exit: 5 });
				}
			}
		}
	}
}
