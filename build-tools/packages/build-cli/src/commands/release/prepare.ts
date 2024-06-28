/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MonoRepo, Package } from "@fluidframework/build-tools";
import async from "async";
import chalk from "chalk";
import execa from "execa";
import { ResetMode } from "simple-git";

import { findPackageOrReleaseGroup, packageOrReleaseGroupArg } from "../../args.js";
import {
	BaseCommand,
	type Context,
	Repository,
	getPreReleaseDependencies,
} from "../../library/index.js";

type CheckFunction = (
	context: Context,
	rgOrPkg: MonoRepo | Package,
	print?: boolean,
) => Promise<CheckResult>;

interface CheckResult {
	result: boolean;
	message?: string;
	fixCommand?: string;
	fatal?: boolean;
}

async function checkNoLocalChanges(context: Context): Promise<CheckResult> {
	const status = await context.gitRepo.getStatus();
	if (status !== "") {
		return {
			result: false,
			message: "There are some local changes. The branch should be clean.",
			fixCommand: "git stash",
			fatal: true,
		};
	}

	return { result: true };
}

/**
 * Returns true if all the dependencies are installed for the package/release group.
 */
async function checkDepsInstalled(
	context: Context,
	rgOrPkg: MonoRepo | Package,
): Promise<CheckResult> {
	const packagesToCheck = rgOrPkg instanceof MonoRepo ? rgOrPkg.packages : [rgOrPkg];

	// eslint-disable-next-line @typescript-eslint/no-misused-promises -- The usage appears correct so maybe a false positive
	const checkDeps: async.AsyncBooleanIterator<Package> = async (
		pkg: Package,
	): Promise<boolean> => {
		return pkg.checkInstall(false);
	};

	// I think the unicorn/no-array-method-this-argument lint error is a false positive. As far as I can tell, the
	// checkDeps function is defined correctly and has the correct type. It appears to work as expected at runtime.
	// eslint-disable-next-line unicorn/no-array-method-this-argument
	const installed = await async.every(packagesToCheck, checkDeps);
	if (!installed) {
		return {
			result: false,
			message: "Some dependencies aren't installed. Try installing dependencies manually.",
			fixCommand: "pnpm install",
		};
	}

	return { result: true };
}

/**
 * Returns true if the local git repo has a remote for the microsoft/FluidFramework repo.
 */
async function checkHasRemote(context: Context): Promise<CheckResult> {
	const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);
	if (remote === undefined) {
		return {
			result: false,
			message: "No remote found that points to the microsoft/FluidFramework repo.",
		};
	}
	return { result: true };
}

/**
 * Returns true if the local git repo has a remote for the microsoft/FluidFramework repo.
 */
async function checkBranchUpToDate(context: Context): Promise<CheckResult> {
	const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);

	let succeeded = false;
	try {
		succeeded = await context.gitRepo.isBranchUpToDate(
			context.originalBranchName,
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			remote!,
		);
	} catch (error) {
		return {
			result: false,
			message: `Error when checking remote branch. Does the remote branch exist? Full error message:\n${
				(error as Error).message
			}`,
		};
	}

	if (!succeeded) {
		return {
			result: false,
			message: "Branch is out of date with the remote. Try pulling the latest from upstream.",
			fixCommand: "git pull",
		};
	}
	return { result: true };
}

/**
 * Returns true if the release group/package has no prerelease dependencies on other Fluid packages.
 */
async function checkHasNoPrereleaseDependencies(
	context: Context,
	releaseGroupOrPackage: MonoRepo | Package,
): Promise<CheckResult> {
	const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
		context,
		releaseGroupOrPackage,
	);

	const packagesToBump = new Set(packages.keys());
	for (const releaseGroup of releaseGroups.keys()) {
		for (const pkg of context.packagesInReleaseGroup(releaseGroup)) {
			packagesToBump.add(pkg.name);
		}
	}

	if (isEmpty) {
		return {
			result: true,
		};
	}

	return {
		result: false,
		message: `Prerelease dependencies found. These release groups and packages must be released and integrated before a release can be done:\n\n${[
			...releaseGroups.keys(),
		].join("\n")}\n${[...packages.keys()].join("\n")}`,
		fixCommand: "pnpm flub bump deps <release group or package>",
	};
}

/**
 * Returns true if there are no policy-check failures.
 */
async function checkPolicy(context: Context): Promise<CheckResult> {
	// policy-check is scoped to the path that it's run in. Since we have multiple folders at the root that represent
	// the client release group, we can't easily scope it to just the client. Thus, we always run it at the root just
	// like we do in CI.
	const result = await execa(`npm`, [`run `, `policy-check`], {
		cwd: context.gitRepo.resolvedRoot,
	});

	if (result.exitCode !== 0) {
		return {
			result: false,
			message: "Policy check failed. These failures must be fixed before release.",
			fixCommand: "pnpm run policy-check:fix",
		};
	}

	return { result: true };
}

/**
 * Returns true if there are no asserts to be tagged.
 */
async function checkAsserts(context: Context): Promise<CheckResult> {
	// policy-check is scoped to the path that it's run in. Since we have multiple folders at the root that represent
	// the client release group, we can't easily scope it to just the client. Thus, we always run it at the root just
	// like we do in CI.
	await execa.command(`npm run policy-check:asserts`, {
		cwd: context.gitRepo.resolvedRoot,
	});

	// check for policy check violation
	const afterPolicyCheckStatus = await context.gitRepo.getStatus();
	if (afterPolicyCheckStatus !== "") {
		const repo = new Repository({ baseDir: context.repo.resolvedRoot });
		await repo.gitClient.reset(ResetMode.HARD);
		return {
			result: false,
			message: "Found some untagged asserts. These should be tagged before release.",
			fixCommand: "pnpm run policy-check:asserts",
		};
	}

	return { result: true };
}

/**
 * All the checks that should be executed. The checks are executed serially in this order.
 */
const allChecks: ReadonlyMap<string, CheckFunction> = new Map([
	["Branch has no local changes", checkNoLocalChanges],
	["Has a microsoft/FluidFramework remote", checkHasRemote],
	["The local branch is up to date with the remote", checkBranchUpToDate],
	["Dependencies are installed locally", checkDepsInstalled],
	["Has no pre-release Fluid dependencies", checkHasNoPrereleaseDependencies],
	["No repo policy violations", checkPolicy],
	["No untagged asserts", checkAsserts],
]);

export class ReleasePrepareCommand extends BaseCommand<typeof ReleasePrepareCommand> {
	static readonly summary =
		`Runs checks on a local branch to verify it is ready to serve as the base for a release branch.`;

	static readonly description = `Runs the following checks:\n${["", ...allChecks.keys()].join(
		"\n- ",
	)}`;

	static readonly args = {
		package_or_release_group: packageOrReleaseGroupArg({
			description:
				"The name of a package or a release group. Defaults to the client release group if not specified.",
			default: "client",
		}),
	} as const;

	async run(): Promise<void> {
		const context = await this.getContext();

		const rgArg = this.args.package_or_release_group;
		const pkgOrReleaseGroup = findPackageOrReleaseGroup(rgArg, context);
		if (pkgOrReleaseGroup === undefined) {
			this.error(`Can't find package or release group "${rgArg}"`, { exit: 1 });
		}
		this.verbose(`Release group or package found: ${pkgOrReleaseGroup.name}`);

		this.logHr();
		for (const [name, check] of allChecks) {
			// eslint-disable-next-line no-await-in-loop
			const checkResult = await check(context, pkgOrReleaseGroup, this.flags.verbose);
			const { result, message, fixCommand, fatal } = checkResult;
			this.log(
				`${result ? chalk.bgGreen.black(" ✔︎ ") : chalk.bgRed.white(" ✖︎ ")} ${
					message === undefined ? name : chalk.red(message)
				}`,
			);
			if (fixCommand !== undefined) {
				this.logIndent(
					`${chalk.yellow(`Possible fix command:`)} ${chalk.yellow.bold(fixCommand)}`,
					6,
				);
			}
			if (fatal === true) {
				this.error("Can't do other checks until the failures are resolved.", { exit: 5 });
			}
		}
	}
}
