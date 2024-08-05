/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";

import {
	DEFAULT_INTERDEPENDENCY_RANGE,
	InterdependencyRange,
	VersionBumpType,
} from "@fluid-tools/version-tools";

import registerDebug from "debug";
import { TaskDefinitionsOnDisk } from "./fluidTaskDefinitions";
import { loadFluidBuildConfig } from "./fluidUtils";
import { MonoRepo } from "./monoRepo";
import { Package, Packages } from "./npmPackage";
import { ExecAsyncResult } from "./utils";
const traceInit = registerDebug("fluid-build:init");

/**
 * Fluid build configuration that is expected in the repo-root package.json.
 */
export interface IFluidBuildConfig {
	/**
	 * Build tasks and dependencies definitions
	 */
	tasks?: TaskDefinitionsOnDisk;

	/**
	 * A mapping of package or release group names to metadata about the package or release group. This can only be
	 * configured in the repo-wide Fluid build config (the repo-root package.json).
	 */
	repoPackages?: {
		[name: string]: IFluidRepoPackageEntry;
	};

	/**
	 * Policy configuration for the `check:policy` command. This can only be configured in the repo-wide Fluid build
	 * config (the repo-root package.json).
	 */
	policy?: PolicyConfig;

	/**
	 * Configuration for assert tagging.
	 */
	assertTagging?: AssertTaggingConfig;

	/**
	 * A mapping of branch names to previous version baseline styles. The type test generator takes this information
	 * into account when calculating the baseline version to use when it's run on a particular branch. If this is not
	 * defined for a branch or package, then that package will be skipped during type test generation.
	 */
	branchReleaseTypes?: {
		[name: string]: VersionBumpType | PreviousVersionStyle;
	};

	/**
	 * Configuration for the `generate:releaseNotes` command.
	 */
	releaseNotes?: ReleaseNotesConfig;
}

/**
 * A type representing the different version constraint styles we use when determining the previous version for type
 * test generation.
 *
 * The "base" versions are calculated by zeroing out all version segments lower than the base. That is, for a version v,
 * the baseMajor version is `${v.major}.0.0` and the baseMinor version is `${v.major}.${v.minor}.0`.
 *
 * The "previous" versions work similarly, but the major/minor/patch segment is reduced by 1. That is, for a version v,
 * the previousMajor version is `${min(v.major - 1, 1)}.0.0`, the previousMinor version is
 * `${v.major}.${min(v.minor - 1, 0)}.0`, and the previousPatch is `${v.major}.${v.minor}.${min(v.patch - 1, 0)}.0`.
 *
 * The "previous" versions never roll back below 1 for the major version and 0 for minor and patch. That is, the
 * previousMajor, previousMinor, and previousPatch versions for `1.0.0` are all `1.0.0`.
 *
 * @example
 *
 * Given the version 2.3.5:
 *
 * baseMajor: 2.0.0
 * baseMinor: 2.3.0
 * ~baseMinor: ~2.3.0
 * previousPatch: 2.3.4
 * previousMinor: 2.2.0
 * previousMajor: 1.0.0
 * ^previousMajor: ^1.0.0
 * ^previousMinor: ^2.2.0
 * ~previousMajor: ~1.0.0
 * ~previousMinor: ~2.2.0
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.3.5:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.3.0
 * ~baseMinor: >=2.0.0-internal.2.3.0 <2.0.0-internal.3.0.0
 * previousPatch: 2.0.0-internal.2.3.4
 * previousMinor: 2.0.0-internal.2.2.0
 * previousMajor: 2.0.0-internal.1.0.0
 * ^previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0
 * ^previousMinor: >=2.0.0-internal.2.2.0 <2.0.0-internal.3.0.0
 * ~previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0
 * ~previousMinor: >=2.0.0-internal.2.2.0 <2.0.0-internal.2.2.0
 *
 * @example
 *
 * Given the version 2.0.0-internal.2.0.0:
 *
 * baseMajor: 2.0.0-internal.2.0.0
 * baseMinor: 2.0.0-internal.2.0.0
 * ~baseMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0
 * previousPatch: 2.0.0-internal.2.0.0
 * previousMinor: 2.0.0-internal.2.0.0
 * previousMajor: 2.0.0-internal.1.0.0
 * ^previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.2.0.0
 * ^previousMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.3.0.0
 * ~previousMajor: >=2.0.0-internal.1.0.0 <2.0.0-internal.1.1.0
 * ~previousMinor: >=2.0.0-internal.2.0.0 <2.0.0-internal.2.1.0
 *
 * @internal
 */
export type PreviousVersionStyle =
	| "baseMajor"
	| "baseMinor"
	| "previousPatch"
	| "previousMinor"
	| "previousMajor"
	| "~baseMinor"
	| "^previousMajor"
	| "^previousMinor"
	| "~previousMajor"
	| "~previousMinor";

/**
 * A short name for the section. Each section in a {@link ReleaseNotesConfig} must have a unique name.
 */
export type ReleaseNotesSectionName = string;

/**
 * Configuration for a release notes section.
 */
export interface ReleaseNotesSection {
	/**
	 * A full string to serve as the heading for the section when displayed in release notes.
	 */
	heading: string;
}

/**
 * Configuration for the `generate:releaseNotes` command. If this configuration is not present in the config, the
 * `generate:releaseNotes` command will report an error.
 */
export interface ReleaseNotesConfig {
	sections: Record<ReleaseNotesSectionName, ReleaseNotesSection>;
}

/**
 * Policy configuration for the `check:policy` command.
 */
export interface PolicyConfig {
	additionalLockfilePaths?: string[];
	pnpmSinglePackageWorkspace?: string[];
	fluidBuildTasks: {
		tsc: {
			ignoreTasks: string[];
			ignoreDependencies: string[];
			ignoreDevDependencies: string[];
		};
	};
	dependencies?: {
		commandPackages: [string, string][];
	};
	/**
	 * An array of strings/regular expressions. Paths that match any of these expressions will be completely excluded from
	 * policy-check.
	 */
	exclusions?: string[];

	/**
	 * An object with handler name as keys that maps to an array of strings/regular expressions to
	 * exclude that rule from being checked.
	 */
	handlerExclusions?: { [rule: string]: string[] };

	packageNames?: PackageNamePolicyConfig;

	/**
	 * (optional) requirements to enforce against each public package.
	 */
	publicPackageRequirements?: PackageRequirements;
}

export interface AssertTaggingConfig {
	assertionFunctions: { [functionName: string]: number };

	/**
	 * An array of paths under which assert tagging applies to. If this setting is provided, only packages whose paths
	 * match the regular expressions in this setting will be assert-tagged.
	 */
	enabledPaths?: RegExp[];
}

/**
 * Configuration for package naming and publication policies.
 */
export interface PackageNamePolicyConfig {
	/**
	 * A list of package scopes that are permitted in the repo.
	 */
	allowedScopes?: string[];
	/**
	 * A list of packages that have no scope.
	 */
	unscopedPackages?: string[];
	/**
	 * Packages that must be published.
	 */
	mustPublish: {
		/**
		 * A list of package names or scopes that must publish to npm, and thus should never be marked private.
		 */
		npm?: string[];

		/**
		 * A list of package names or scopes that must publish to an internal feed, and thus should always be marked
		 * private.
		 */
		internalFeed?: string[];
	};

	/**
	 * Packages that may or may not be published.
	 */
	mayPublish: {
		/**
		 * A list of package names or scopes that may publish to npm, and thus might or might not be marked private.
		 */
		npm?: string[];

		/**
		 * A list of package names or scopes that must publish to an internal feed, and thus might or might not be marked
		 * private.
		 */
		internalFeed?: string[];
	};
}

/**
 * Expresses requirements for a given package, applied to its package.json.
 */
export interface PackageRequirements {
	/**
	 * (optional) list of script requirements for the package.
	 */
	requiredScripts?: ScriptRequirement[];

	/**
	 * (optional) list of required dev dependencies for the package.
	 * @remarks Note: there is no enforcement of version requirements, only that a dependency on the specified name must exist.
	 */
	requiredDevDependencies?: string[];
}

/**
 * Requirements for a given script.
 */
export interface ScriptRequirement {
	/**
	 * Name of the script to check.
	 */
	name: string;

	/**
	 * Body of the script being checked.
	 * A contents match will be enforced iff {@link ScriptRequirement.bodyMustMatch}.
	 * This value will be used as the default contents inserted by the policy resolver (regardless of {@link ScriptRequirement.bodyMustMatch}).
	 */
	body: string;

	/**
	 * Whether or not the script body is required to match {@link ScriptRequirement.body} when running the policy checker.
	 * @defaultValue `false`
	 */
	bodyMustMatch?: boolean;
}

/**
 * Metadata about known-broken types.
 */
export interface BrokenCompatSettings {
	backCompat?: false;
	forwardCompat?: false;
}

/**
 * A mapping of a type name to its {@link BrokenCompatSettings}.
 */
export type BrokenCompatTypes = Partial<Record<string, BrokenCompatSettings>>;

export interface ITypeValidationConfig {
	/**
	 * An object containing types that are known to be broken.
	 */
	broken: BrokenCompatTypes;

	/**
	 * If true, disables type test preparation and generation for the package.
	 */
	disabled?: boolean;
}

/**
 * Configures a package or release group
 */
export interface IFluidRepoPackage {
	/**
	 * The path to the package. For release groups this should be the path to the root of the release group.
	 */
	directory: string;

	/**
	 * An array of paths under `directory` that should be ignored.
	 */
	ignoredDirs?: string[];

	/**
	 * The interdependencyRange controls the type of semver range to use between packages in the same release group. This
	 * setting controls the default range that will be used when updating the version of a release group. The default can
	 * be overridden using the `--interdependencyRange` flag in the `flub bump` command.
	 */
	defaultInterdependencyRange: InterdependencyRange;
}

export type IFluidRepoPackageEntry =
	| string
	| IFluidRepoPackage
	| (string | IFluidRepoPackage)[];

export class FluidRepo {
	private readonly _releaseGroups = new Map<string, MonoRepo>();

	public get releaseGroups() {
		return this._releaseGroups;
	}

	public readonly packages: Packages;

	public static create(resolvedRoot: string) {
		const packageManifest = loadFluidBuildConfig(resolvedRoot);
		return new FluidRepo(resolvedRoot, packageManifest);
	}

	protected constructor(
		public readonly resolvedRoot: string,
		packageManifest: IFluidBuildConfig,
	) {
		// Expand to full IFluidRepoPackage and full path
		const normalizeEntry = (
			item: IFluidRepoPackageEntry,
		): IFluidRepoPackage | IFluidRepoPackage[] => {
			if (Array.isArray(item)) {
				return item.map((entry) => normalizeEntry(entry) as IFluidRepoPackage);
			}
			if (typeof item === "string") {
				traceInit(
					`No defaultInterdependencyRange setting found for '${item}'. Defaulting to "${DEFAULT_INTERDEPENDENCY_RANGE}".`,
				);
				return {
					directory: path.join(resolvedRoot, item),
					ignoredDirs: undefined,
					defaultInterdependencyRange: DEFAULT_INTERDEPENDENCY_RANGE,
				};
			}
			const directory = path.join(resolvedRoot, item.directory);
			return {
				directory,
				ignoredDirs: item.ignoredDirs?.map((dir) => path.join(directory, dir)),
				defaultInterdependencyRange: item.defaultInterdependencyRange,
			};
		};
		const loadOneEntry = (item: IFluidRepoPackage, group: string) => {
			return Packages.loadDir(item.directory, group, item.ignoredDirs);
		};

		const loadedPackages: Package[] = [];
		for (const group in packageManifest.repoPackages) {
			const item = normalizeEntry(packageManifest.repoPackages[group]);
			if (Array.isArray(item)) {
				for (const i of item) {
					loadedPackages.push(...loadOneEntry(i, group));
				}
				continue;
			}
			const monoRepo = MonoRepo.load(group, item);
			if (monoRepo) {
				this.releaseGroups.set(group, monoRepo);
				loadedPackages.push(...monoRepo.packages);
			} else {
				loadedPackages.push(...loadOneEntry(item, group));
			}
		}
		this.packages = new Packages(loadedPackages);
	}

	public createPackageMap() {
		return new Map<string, Package>(this.packages.packages.map((pkg) => [pkg.name, pkg]));
	}

	public reload() {
		this.packages.packages.forEach((pkg) => pkg.reload());
	}

	public static async ensureInstalled(packages: Package[]) {
		const installedMonoRepo = new Set<MonoRepo>();
		const installPromises: Promise<ExecAsyncResult>[] = [];
		for (const pkg of packages) {
			if (pkg.monoRepo) {
				if (!installedMonoRepo.has(pkg.monoRepo)) {
					installedMonoRepo.add(pkg.monoRepo);
					installPromises.push(pkg.monoRepo.install());
				}
			} else {
				installPromises.push(pkg.install());
			}
		}
		const rets = await Promise.all(installPromises);
		return !rets.some((ret) => ret.error);
	}

	public async install() {
		return FluidRepo.ensureInstalled(this.packages.packages);
	}

	/**
	 * Transforms an absolute path to a path relative to the repo root.
	 *
	 * @param p - The path to make relative to the repo root.
	 * @returns the relative path.
	 */
	public relativeToRepo(p: string): string {
		// Replace \ in result with / in case OS is Windows.
		return path.relative(this.resolvedRoot, p).replace(/\\/g, "/");
	}
}
