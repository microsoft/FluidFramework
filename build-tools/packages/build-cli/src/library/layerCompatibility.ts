/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidCompatibilityMetadata, Logger } from "@fluidframework/build-tools";
import { formatISO, isDate, isValid, parseISO } from "date-fns";
import { diff, parse } from "semver";

/**
 * Approximate month as 33 days to add some buffer and avoid over-counting months in longer spans.
 */
export const DAYS_IN_MONTH_APPROXIMATION = 33;

/**
 * The default minimum compatibility window in months for layer generation.
 * This matches the default value used in the compatLayerGeneration command.
 */
export const DEFAULT_MINIMUM_COMPAT_WINDOW_MONTHS = 3;

/**
 * Determines if the current package version represents a patch release.
 *
 * @param pkgVersion - The semantic version of the package (e.g., "2.0.1")
 * @returns True if the version is a patch release, false otherwise
 *
 * @throws Error When the provided version string is not a valid semantic version
 *
 * @example
 * ```typescript
 * isCurrentPackageVersionPatch("2.0.1"); // returns true
 * isCurrentPackageVersionPatch("2.1.0"); // returns false
 * isCurrentPackageVersionPatch("3.0.0"); // returns false
 * ```
 */
export function isCurrentPackageVersionPatch(pkgVersion: string): boolean {
	const parsed = parse(pkgVersion);
	if (parsed === null) {
		throw new Error(`Package version ${pkgVersion} is not a valid semver`);
	}
	return parsed.patch > 0;
}

/**
 * Determines if a new generation should be generated based on package version changes and time since
 * the last release.
 *
 * This function parses an existing layer generation file and decides whether to increment the generation
 * number based on:
 * 1. Whether the package version has changed since the last update
 * 2. How much time has elapsed since the previous release date
 * 3. The minimum compatibility window constraints
 *
 * The generation increment is calculated as the number of months since the previous release,
 * but capped at (minimumCompatWindowMonths - 1) to maintain compatibility requirements.
 *
 * @param currentPkgVersion - The current package version to compare against the stored version
 * @param fluidCompatMetadata - The existing Fluid compatibility metadata from the previous generation
 * @param minimumCompatWindowMonths - The maximum number of months of compatibility to maintain across layers
 * @param log - Optional logger instance for verbose output about the calculation process
 * @param currentDate - Optional current date for testing purposes. Defaults to new Date()
 * @returns The new generation number if an update is needed, or undefined if no update is required
 *
 * @throws Error When the generation file content doesn't match the expected format
 * @throws Error When the current date is older than the previous release date
 */
export function maybeGetNewGeneration(
	currentPkgVersion: string,
	fluidCompatMetadata: IFluidCompatibilityMetadata,
	minimumCompatWindowMonths: number,
	log?: Logger,
	currentDate: Date = new Date(),
): number | undefined {
	// Only "minor" or "major" version changes trigger generation updates.
	const result = diff(currentPkgVersion, fluidCompatMetadata.releasePkgVersion);
	if (result === null || (result !== "minor" && result !== "major")) {
		log?.verbose(`No minor or major release since last update; skipping generation update.`);
		return undefined;
	}

	log?.verbose(
		`Previous package version: ${fluidCompatMetadata.releasePkgVersion}, Current package version: ${currentPkgVersion}`,
	);

	const previousReleaseDate = parseISO(fluidCompatMetadata.releaseDate);
	if (!isValid(previousReleaseDate) || !isDate(previousReleaseDate)) {
		throw new Error(
			`Previous release date "${fluidCompatMetadata.releaseDate}" is not a valid date.`,
		);
	}

	const timeDiff = currentDate.getTime() - previousReleaseDate.getTime();
	if (timeDiff < 0) {
		throw new Error("Current date is older that previous release date");
	}
	const daysBetweenReleases = Math.round(timeDiff / (1000 * 60 * 60 * 24));
	const monthsBetweenReleases = Math.floor(daysBetweenReleases / DAYS_IN_MONTH_APPROXIMATION);
	log?.verbose(`Previous release date: ${previousReleaseDate}, Today: ${currentDate}`);
	log?.verbose(
		`Time between releases: ${daysBetweenReleases} day(s) or ~${monthsBetweenReleases} month(s)`,
	);

	const newGeneration =
		fluidCompatMetadata.generation +
		Math.min(monthsBetweenReleases, minimumCompatWindowMonths - 1);
	if (newGeneration === fluidCompatMetadata.generation) {
		log?.verbose(
			`Generation remains the same (${newGeneration}); skipping generation update.`,
		);
		return undefined;
	}
	return newGeneration;
}
