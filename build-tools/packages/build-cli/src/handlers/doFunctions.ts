/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import { Machine } from "jssm";
import chalk from "picocolors";

import { FluidRepo, MonoRepo } from "@fluidframework/build-tools";

import { bumpVersionScheme, detectVersionScheme } from "@fluid-tools/version-tools";

import { getDefaultInterdependencyRange } from "../config.js";
import {
	difference,
	getPreReleaseDependencies,
	npmCheckUpdates,
	setVersion,
} from "../library/index.js";
import { CommandLogger } from "../logging.js";
import { MachineState } from "../machines/index.js";
import { ReleaseGroup, ReleasePackage, isReleaseGroup } from "../releaseGroups.js";
import { FluidReleaseStateHandlerData } from "./fluidReleaseStateHandler.js";
import { BaseStateHandler, StateHandlerFunction } from "./stateHandlers.js";

/**
 * Bumps any pre-release dependencies that have been released.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const doBumpReleasedDependencies: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { context, releaseGroup } = data;

	const { releaseGroups, packages, isEmpty } = await getPreReleaseDependencies(
		context,
		releaseGroup,
	);

	assert(!isEmpty, `No prereleases found in DoBumpReleasedDependencies state.`);

	const preReleaseGroups = new Set(releaseGroups.keys());
	const preReleasePackages = new Set(packages.keys());

	const packagesToBump = new Set(packages.keys());
	for (const rg of releaseGroups.keys()) {
		for (const p of context.packagesInReleaseGroup(rg)) {
			packagesToBump.add(p.name);
		}
	}

	// First, check if any prereleases have released versions on npm
	let { updatedPackages, updatedDependencies } = await npmCheckUpdates(
		context,
		releaseGroup,
		[...packagesToBump],
		undefined,
		"latest",
		/* prerelease */ true,
		/* writeChanges */ false,
		log,
	);

	// Divide the updated packages into individual packages and release groups
	const updatedReleaseGroups = new Set<ReleaseGroup>();
	const updatedPkgs = new Set<ReleasePackage>();

	for (const pkg of updatedPackages) {
		if (pkg.monoRepo === undefined) {
			updatedPkgs.add(pkg.name);
		} else {
			updatedReleaseGroups.add(pkg.monoRepo.releaseGroup);
		}
	}

	const updatedDeps = new Set<string>();
	for (const p of Object.keys(updatedDependencies)) {
		const pkg = context.fullPackageMap.get(p);
		if (pkg === undefined) {
			log.verbose(`Package not in context: ${p}`);
			continue;
		}

		if (pkg.monoRepo === undefined) {
			updatedDeps.add(pkg.name);
		} else {
			updatedDeps.add(pkg.monoRepo.kind);
		}
	}

	const remainingReleaseGroupsToBump = difference(preReleaseGroups, updatedDeps);
	const remainingPackagesToBump = difference(preReleasePackages, updatedPkgs);

	if (remainingReleaseGroupsToBump.size === 0 && remainingPackagesToBump.size === 0) {
		// This is the same command as run above, but this time we write the changes. There are more
		// efficient ways to do this but this is simple.
		({ updatedPackages, updatedDependencies } = await npmCheckUpdates(
			context,
			releaseGroup,
			[...packagesToBump],
			undefined,
			"latest",
			/* prerelease */ true,
			/* writeChanges */ true,
			/* no logger */
		));
	}

	if (updatedPackages.length > 0) {
		log?.verbose(`Running install if needed.`);
		await FluidRepo.ensureInstalled(
			isReleaseGroup(releaseGroup)
				? context.packagesInReleaseGroup(releaseGroup)
				: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					[context.fullPackageMap.get(releaseGroup)!],
		);
		// There were updates, which is considered a failure.
		BaseStateHandler.signalFailure(machine, state);
		context.repo.reload();
		return true;
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};

/**
 * Bumps any pre-release dependencies that have been released.
 *
 * @param state - The current state machine state.
 * @param machine - The state machine.
 * @param testMode - Set to true to run function in test mode.
 * @param log - A logger that the function can use for logging.
 * @param data - An object with handler-specific contextual data.
 * @returns True if the state was handled; false otherwise.
 */
export const doReleaseGroupBump: StateHandlerFunction = async (
	state: MachineState,
	machine: Machine<unknown>,
	testMode: boolean,
	log: CommandLogger,
	data: FluidReleaseStateHandlerData,
): Promise<boolean> => {
	if (testMode) return true;

	const { bumpType, context, releaseGroup, releaseVersion, shouldInstall } = data;

	const rgRepo = isReleaseGroup(releaseGroup)
		? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			context.repo.releaseGroups.get(releaseGroup)!
		: // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			context.fullPackageMap.get(releaseGroup)!;

	const scheme = detectVersionScheme(releaseVersion);
	const newVersion = bumpVersionScheme(releaseVersion, bumpType, scheme);
	const packages = rgRepo instanceof MonoRepo ? rgRepo.packages : [rgRepo];

	log.info(
		`Bumping ${releaseGroup} from ${releaseVersion} to ${newVersion.version} (${chalk.blue(
			bumpType,
		)} bump)!`,
	);

	await setVersion(
		context,
		rgRepo,
		newVersion,
		rgRepo instanceof MonoRepo ? getDefaultInterdependencyRange(rgRepo, context) : undefined,
		log,
	);

	if (shouldInstall === true && !(await FluidRepo.ensureInstalled(packages))) {
		log.errorLog("Install failed.");
		BaseStateHandler.signalFailure(machine, state);
		return true;
	}

	BaseStateHandler.signalSuccess(machine, state);
	return true;
};
