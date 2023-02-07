/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryGenericEvent } from "@fluidframework/common-definitions";
import { packagePathToTelemetryProperty } from "@fluidframework/runtime-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import {
	disableTombstoneKey,
	runSweepKey,
	throwOnTombstoneLoadKey,
	throwOnTombstoneUsageKey,
} from "./garbageCollectionConstants";

//* Log the versions as well?

/**
 * Consolidates info / logic for logging when we encounter unexpected usage of GC'd objects. For example, when a
 * tombstoned or deleted object is loaded.
 */
export function sendGCUnexpectedUsageEvent(
	mc: MonitoringContext,
	event: ITelemetryGenericEvent & {
		category: "error" | "generic";
		isSummarizerClient: boolean;
		gcEnforcementDisabled: boolean;
	},
	packagePath: readonly string[] | undefined,
	error?: unknown,
) {
	event.pkg = packagePathToTelemetryProperty(packagePath);
	event.tombstoneFlags = JSON.stringify({
		DisableTombstone: mc.config.getBoolean(disableTombstoneKey),
		ThrowOnTombstoneUsage: mc.config.getBoolean(throwOnTombstoneUsageKey),
		ThrowOnTombstoneLoad: mc.config.getBoolean(throwOnTombstoneLoadKey),
	});
	event.sweepFlags = JSON.stringify({
		EnableSweepFlag: mc.config.getBoolean(runSweepKey),
	});

	mc.logger.sendTelemetryEvent(event, error);
}

//* make it 8 digits not 4

// These all need to match in terms of the number of digits supported / padded to
const wholeNumberRegex = /^\d{1,4}$/;
const padNumericalString = (x: string) => x.padStart(4, "0");
const maxSemver = "9999.9999.9999";

/**
 * Pads each numerical term of the given semver string to the same number of digits.
 * Throws if the input is not a simple (non-prerelease) semver string
 * */
function padSimpleSemVer(semver: string): string {
	return semver
		.split(".")
		.map((x) => {
			if (x.match(wholeNumberRegex) === null) {
				throw new Error("Invalid semver");
			}
			padNumericalString(x);
		})
		.join(".");
}

/**
 * This is intended to be used with FF package versions like 1.1.0-internal.9999.9999.9999 or 2.0.0-internal.2.1.3.
 * For such versions, this converts them to equivalent strings that will sort properly via native string comparison.
 * If the input doesn't match those expected formats, undefined is returned.
 */
export function makeVersionComparableAsString(
	version: string,
): string | undefined {
	const [external, internal, ...rest] = version.split("-internal.");
	if (rest.length > 0) {
		return undefined;
	}

	try {
		[external, internal ?? maxSemver] // If no internal version is there, this should resolve higher than any pre-release
			.map(padSimpleSemVer)
			.join("-internal.");
	} catch (e) {
		return undefined;
	}
}

//* Maybe flip boolean value of this to be "can run" instead of "should disable" -- "allow"

/**
 * In order to protect old documents that were created at a time when known bugs exist that violate invariants GC depends on
 * such that enforcing GC (Fail on Tombstone load/usage, GC Sweep) would cause legitimate data loss,
 * the container author may pass in a min version such that containers created before this point will not be subjected
 * to GC enforcement.
 * @param createContainerRuntimeVersion - The persisted runtimeVersion that was in effect when the container was created
 * @param gcEnforcementMinCreateContainerRuntimeVersion - The app-provided min version (via an undocumented ContainerRuntimeOption)
 * @returns true if GC Enforcement (Fail on Tombstone load/usage, GC Sweep) should be disabled
 */
export function shouldDisableGcEnforcementForOldContainer(
	createContainerRuntimeVersion: string | undefined,
	gcEnforcementMinCreateContainerRuntimeVersion: string | undefined,
): boolean {
	const comparableMinVersion =
		gcEnforcementMinCreateContainerRuntimeVersion &&
		makeVersionComparableAsString(
			gcEnforcementMinCreateContainerRuntimeVersion,
		);
	if (comparableMinVersion === undefined) {
		// No valid min version was provided, so don't disable
		return false;
	}

	// Now we know that there is a min bar - let's check if this file meets it

	if (createContainerRuntimeVersion === undefined) {
		// This file predates the createContainerRuntimeVersion metadata, so it's older than whatever min version was provided, so we should disable
		return true;
	}

	const comparablePersistedVersion = makeVersionComparableAsString(createContainerRuntimeVersion);

	if (comparablePersistedVersion === undefined) {
		// createContainerRuntimeVersion was defined but not a valid version for comparison. Do not disable.
		return false;
	}

	// If the persisted version is less than the min version according to string comparison rules, then we need to disable GC enforcement
	return comparablePersistedVersion < comparableMinVersion;
}
