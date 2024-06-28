import { MonoRepo, type Package } from "@fluidframework/build-tools";
import { every } from "async";
import execa from "execa";
import { ResetMode } from "simple-git";
import type { Context } from "./context.js";
import { Repository } from "./git.js";
import { getPreReleaseDependencies } from "./package.js";

/**
 * An async function that executes a release preparation check. The function returns a {@link CheckResult} with details
 * about the results of the check.
 *
 * Example checks might include:
 *
 * - Branch has no local changes
 * - The local branch is up to date with the remote
 * - Dependencies are installed locally
 * - No repo policy violations
 */
export type CheckFunction = (
	/**
	 * The repository context.
	 */
	context: Context,

	/**
	 * The release group or package that is being checked.
	 *
	 * @privateRemarks
	 * In this case the MonoRepo class represents a release group. This naming and conceptual conflict will be resolved in
	 * future refactoring.
	 */
	releaseGroupOrPackage: MonoRepo | Package,
) => Promise<CheckResult>;

/**
 * The result of a failing {@link CheckFunction}.
 */
export interface CheckResultFailure {
	/**
	 * The result of the check. This will be true if the check was passed successfully; false otherwise.
	 */
	// passedCheck: false;

	/**
	 * If true, the failure will stop all further checks. Setting this to `true` should be reserved for cases where
	 * continuing might result in making unrecoverable changes to the branch or repository state.
	 */
	fatal?: true;

	/**
	 * A message explaining the failure. This value is displayed to the user when the check fails.
	 */
	message: string;

	/**
	 * A terminal command that can be used to resolve the failure. This value is suggested to the user when the check
	 * fails, with the expectation that running it will resolve the failed check.
	 */
	fixCommand?: string;
}

/**
 * The results of a {@link CheckFunction}. If a CheckResult is `true`, then the check succeeded. Otherwise the result is
 * a {@link CheckResultFailure}.
 */
type CheckResult = CheckResultFailure | undefined;

/**
 * Checks that there are no local changes in the local repository. This failure is fatal to ensure changes aren't lost.
 *
 * @param context - The repository context.
 * @returns a {@link CheckResultSuccess} if there are no local changes. Otherwise, returns a {@link CheckResultFailure}.
 */
export const CheckNoLocalChanges: CheckFunction = async (
	context: Context,
): Promise<CheckResult> => {
	const status = await context.gitRepo.getStatus();
	if (status !== "") {
		return {
			message:
				"There are some local changes. The branch should be clean. Stopping further checks to ensure changes aren't lost. Stash your changes and try again.",
			fixCommand: "git stash",
			fatal: true,
		};
	}
};

/**
 * Checks that the dependencies for a release group or package are installed. Returns a failure result if any
 * dependencies are missing.
 */
export const CheckDependenciesInstalled: CheckFunction = async (
	_context: Context,
	releaseGroupOrPackage: MonoRepo | Package,
): Promise<CheckResult> => {
	const packagesToCheck =
		releaseGroupOrPackage instanceof MonoRepo
			? releaseGroupOrPackage.packages
			: [releaseGroupOrPackage];

	const checkDeps = async (pkg: Package): Promise<boolean> => {
		return pkg.checkInstall(false);
	};

	// const installed = await every(packagesToCheck, checkDeps);
	const installed = await every(packagesToCheck, () => checkDeps);
	if (!installed) {
		return {
			message: "Some dependencies aren't installed. Try installing dependencies manually.",
			fixCommand: "pnpm install",
		};
	}
};

/**
 * Checks that the local git repository has a remote for the microsoft/FluidFramework repo, and that the local branch is
 * up-to-date with the remote. Returns a failure result if such a remote is not found, or if the local branch is not
 * up-to-date.
 */
export const CheckHasRemoteBranchUpToDate: CheckFunction = async (
	context: Context,
): Promise<CheckResult> => {
	const remote = await context.gitRepo.getRemote(context.originRemotePartialUrl);

	if (remote === undefined) {
		return {
			message: "No remote found that points to the microsoft/FluidFramework repo.",
		};
	}

	let succeeded = false;
	try {
		succeeded = await context.gitRepo.isBranchUpToDate(context.originalBranchName, remote);
	} catch (error) {
		return {
			message: `Error when checking remote branch. Does the remote branch exist? Full error message:\n${
				(error as Error).message
			}`,
		};
	}

	if (!succeeded) {
		return {
			message: "Branch is out of date with the remote. Try pulling the latest from upstream.",
			fixCommand: "git pull",
		};
	}
};

/**
 * Returns true if the release group/package has no prerelease dependencies on other Fluid packages.
 */
/**
 * Checks that the release group or package has no prerelease dependencies on other Fluid packages. Returns a failure
 * result if prerelease dependencies are found.
 */
export const CheckHasNoPrereleaseDependencies: CheckFunction = async (
	context: Context,
	releaseGroupOrPackage: MonoRepo | Package,
): Promise<CheckResult> => {
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
		return;
	}

	return {
		message: `Prerelease dependencies found. These release groups and packages must be released and integrated before a release can be done:\n\n${[
			...releaseGroups.keys(),
		].join("\n")}\n${[...packages.keys()].join("\n")}`,
		fixCommand: "pnpm flub bump deps <release group or package>",
	};
};

/**
 * Checks that repository policies are all passing. Any failing policies will cause this function to return a failure
 * result.
 */
export const CheckNoPolicyViolations: CheckFunction = async (
	context: Context,
): Promise<CheckResult> => {
	// policy-check is scoped to the path that it's run in. Since we have multiple folders at the root that represent
	// the client release group, we can't easily scope it to just the client. Thus, we always run it at the root just
	// like we do in CI.
	const result = await execa("npm", ["run", "policy-check"], {
		cwd: context.gitRepo.resolvedRoot,
	});

	if (result.exitCode !== 0) {
		return {
			message: "Policy check failed. These failures must be fixed before release.",
			fixCommand: "pnpm run policy-check:fix",
		};
	}
};

/**
 * Checks that all asserts are tagged. Any untagged asserts will return a failure result.
 */
export const CheckNoUntaggedAsserts: CheckFunction = async (
	context: Context,
): Promise<CheckResult> => {
	// policy-check is scoped to the path that it's run in. Since we have multiple folders at the root that represent
	// the client release group, we can't easily scope it to just the client. Thus, we always run it at the root just
	// like we do in CI.
	await execa("npm", ["run", "policy-check:asserts"], {
		cwd: context.gitRepo.resolvedRoot,
	});

	// check for policy check violation
	const afterPolicyCheckStatus = await context.gitRepo.getStatus();
	if (afterPolicyCheckStatus !== "") {
		const repo = new Repository({ baseDir: context.repo.resolvedRoot });
		await repo.gitClient.reset(ResetMode.HARD);
		return {
			message: "Found some untagged asserts. These should be tagged before release.",
			fixCommand: "pnpm run policy-check:asserts",
		};
	}
};
