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
	//* Probably support more than 4 digit version segments, why not
	//* Fix this regex per the lint warning
	// eslint-disable-next-line unicorn/no-unsafe-regex, unicorn/better-regex
	const r = /^(\d{1,4}\.\d{1,4}\.\d{1,4})(?:-internal\.(\d{1,4}\.\d{1,4}\.\d{1,4}))?$/;

	function padSemVer(semver: string): string {
		return semver
			.split(".")
			.map((x) => x.padStart(4, "0"))
			.join(".");
	}

	function makeVersionComparableAsString(
		version: string | undefined,
	): string | { fail: "undefined" | "invalid" } {
		if (version === undefined) {
			return { fail: "undefined" };
		}

		const m = version.match(r);
		if (m === null) {
			return { fail: "invalid" };
		}
		const [_full, external, internal] = m;
		const paddedExternal = padSemVer(external);
		return internal !== undefined
			? `${paddedExternal}-internal.${padSemVer(internal)}`
			: `${paddedExternal}RELEASE`;
	}

	const comparableMinVersion = makeVersionComparableAsString(
		gcEnforcementMinCreateContainerRuntimeVersion,
	);
	if (typeof comparableMinVersion !== "string") {
		// No valid min version was provided, so don't disable
		return false;
	}

	const comparablePersistedVersion = makeVersionComparableAsString(createContainerRuntimeVersion);

	if (typeof comparablePersistedVersion !== "string") {
		// If undefined, this file predates the createContainerRuntimeVersion metadata, so it's older than whatever min version was provided, so we should disable
		// Otherwise it's invalid (e.g. -dev version) and we should NOT disable
		return comparablePersistedVersion.fail === "undefined";
	}

	// If the persisted version is less than the min version according to string comparison rules, then we need to disable GC enforcement
	const result = comparablePersistedVersion < comparableMinVersion;

	console.log(`~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	${createContainerRuntimeVersion}
	${gcEnforcementMinCreateContainerRuntimeVersion}
	${result}
	~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~`)


	return result;
}
