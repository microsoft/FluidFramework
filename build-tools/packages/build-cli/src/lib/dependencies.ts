import {
	InterdependencyRange,
	detectVersionScheme,
	getVersionRange,
} from "@fluid-tools/version-tools";
import {
	Context,
	Logger,
	MonoRepo,
	Package,
	VersionBag,
	updatePackageJsonFile,
} from "@fluidframework/build-tools";
import execa from "execa";
import { readJson, writeFile } from "fs-extra";
import path from "node:path";
import { format as prettier, resolveConfig as resolvePrettierConfig } from "prettier";
import semver from "semver";

export interface DependencyWithRange {
	pkg: Package;
	rangeOrBumpType: string | "workspace:*" | "workspace:^" | "workspace:~";
}

/**
 * Sets the version of a release group or standalone package.
 *
 * @param context - The {@link Context}.
 * @param releaseGroupOrPackage - A release group repo or package to bump.
 * @param version - The version to set.
 * @param interdependencyRange - The type of dependency to use on packages within the release group.
 * @param log - A logger to use.
 *
 * @internal
 */
export async function setReleaseGroupVersion(
	context: Context,
	releaseGroupOrPackage: MonoRepo | Package,
	version: semver.SemVer,
	// eslint-disable-next-line default-param-last
	interdependencyRange: Exclude<InterdependencyRange, "*"> = "^",
	log?: Logger,
): Promise<void> {
	const translatedVersion = version;
	const scheme = detectVersionScheme(translatedVersion);

	let name: string;
	const cmds: [string, string[], execa.Options | undefined][] = [];
	let options: execa.Options | undefined;

	// Run npm version in each package to set its version in package.json. Also regenerates packageVersion.ts if needed.
	if (releaseGroupOrPackage instanceof MonoRepo) {
		name = releaseGroupOrPackage.kind;
		options = {
			cwd: releaseGroupOrPackage.repoPath,
			stdio: "inherit",
			shell: true,
		};
		cmds.push(
			[
				`flub`,
				[
					`exec`,
					"-g",
					name,
					"--",
					`"npm version ${translatedVersion.version} --allow-same-version"`,
				],
				options,
			],
			["pnpm", ["-r", "run", "build:genver"], options],
		);
	} else {
		name = releaseGroupOrPackage.name;
		options = {
			cwd: releaseGroupOrPackage.directory,
			stdio: "inherit",
			shell: true,
		};
		cmds.push([`npm`, ["version", translatedVersion.version, "--allow-same-version"], options]);
		if (releaseGroupOrPackage.getScript("build:genver") !== undefined) {
			cmds.push([`npm`, ["run", "build:genver"], options]);
		}
	}

	for (const [cmd, args, opts] of cmds) {
		log?.verbose(`Running command: ${cmd} ${args} in ${opts?.cwd}`);
		try {
			// TODO: The shell option should not need to be true. AB#4067
			// eslint-disable-next-line no-await-in-loop
			const results = await execa(cmd, args, options);
			if (results.all !== undefined) {
				log?.verbose(results.all);
			}
		} catch (error: any) {
			log?.errorLog(`Error running command: ${cmd} ${args}\n${error}`);
			throw error;
		}
	}

	if (releaseGroupOrPackage instanceof Package) {
		// Return early; packages only need to be bumped using npm. The rest of the logic is only for release groups.
		return;
	}

	// Since we don't use lerna to bump, manually updates the lerna.json file. Also updates the root package.json for good
	// measure. Long term we may consider removing lerna.json and using the root package version as the "source of truth".
	const lernaPath = path.join(releaseGroupOrPackage.repoPath, "lerna.json");
	const [lernaJson, prettierConfig] = await Promise.all([
		readJson(lernaPath),
		resolvePrettierConfig(lernaPath),
	]);

	if (prettierConfig !== null) {
		prettierConfig.filepath = lernaPath;
	}
	lernaJson.version = translatedVersion.version;
	const output = prettier(
		JSON.stringify(lernaJson),
		prettierConfig === null ? undefined : prettierConfig,
	);
	await writeFile(lernaPath, output);

	updatePackageJsonFile(path.join(releaseGroupOrPackage.repoPath, "package.json"), (json) => {
		json.version = translatedVersion.version;
	});

	context.repo.reload();

	// The package versions have been updated, so now we update the dependency ranges for packages within the release
	// group. We need to account for Fluid internal versions and the requested interdependencyRange.
	let newRange: "workspace:*" | "workspace:~" | "workspace:^" | string;

	if (
		// Workspace ranges should be used as-is.
		interdependencyRange === "workspace:*" ||
		interdependencyRange === "workspace:~" ||
		interdependencyRange === "workspace:^"
	) {
		newRange = interdependencyRange;
	} // Fluid internal versions that use ~ or ^ need to be translated to >= < ranges.
	else if (["internal", "internalPrerelease"].includes(scheme)) {
		newRange =
			interdependencyRange === ""
				? translatedVersion.version
				: getVersionRange(translatedVersion, interdependencyRange);
	} else {
		newRange = `${interdependencyRange}${translatedVersion.version}`;
	}

	const packagesToCheckAndUpdate = releaseGroupOrPackage.packages;
	const dependencyVersionMap = new Map<string, DependencyWithRange>();
	for (const pkg of packagesToCheckAndUpdate) {
		dependencyVersionMap.set(pkg.name, { pkg, rangeOrBumpType: newRange });
	}

	for (const pkg of packagesToCheckAndUpdate) {
		// eslint-disable-next-line no-await-in-loop
		await setPackageDependencies(
			pkg,
			dependencyVersionMap,
			/* updateWithinSameReleaseGroup */ true,
		);
	}
}

/**
 * Set the version of dependencies within a package according to the provided map of packages to bump types.
 *
 * @param pkg - The package whose dependencies should be updated.
 * @param dependencyVersionMap - A Map of dependency names to a range string.
 * @param updateWithinSameReleaseGroup - If true, will update dependency ranges of deps within the same release group.
 * Generally this should be false, but in some cases you may need to set a precise dependency range string within the
 * same release group.
 * @returns True if the packages dependencies were changed; false otherwise.
 *
 * @remarks
 *
 * By default, dependencies on packages within the same release group -- that is, intra-release-group dependencies --
 * will not be changed (`updateWithinSameReleaseGroup === false`). This is typically the behavior you want. However,
 * there are some cases where you need to forcefully change the dependency range of packages across the whole repo. For
 * example, when bumping packages using the Fluid internal version scheme, we need to adjust the dependency ranges that
 * lerna creates automatically, because the Fluid internal version scheme requires us to use \>= \< dependency ranges
 * instead of ^.
 *
 * @internal
 */
export async function setPackageDependencies(
	pkg: Package,
	dependencyVersionMap: Map<string, DependencyWithRange>,
	// eslint-disable-next-line default-param-last
	updateWithinSameReleaseGroup = false,
	changedVersions?: VersionBag,
): Promise<boolean> {
	let changed = false;
	let newRangeString: string;
	for (const { name, dev } of pkg.combinedDependencies) {
		const dep = dependencyVersionMap.get(name);
		if (dep !== undefined) {
			const isSameReleaseGroup = MonoRepo.isSame(dep?.pkg.monoRepo, pkg.monoRepo);
			if (!isSameReleaseGroup || (updateWithinSameReleaseGroup && isSameReleaseGroup)) {
				const dependencies = dev
					? pkg.packageJson.devDependencies
					: pkg.packageJson.dependencies;

				newRangeString = dep.rangeOrBumpType;
				dependencies[name] = newRangeString;
				changed = true;
				changedVersions?.add(dep.pkg, newRangeString);
			}
		}
	}

	if (changed) {
		await pkg.savePackageJson();
	}

	return changed;
}
