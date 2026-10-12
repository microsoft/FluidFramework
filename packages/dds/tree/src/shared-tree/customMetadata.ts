/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { JsonCompatibleReadOnlyObject } from "../util/index.js";

/**
 * Returns a defensive copy of the given metadata, validating that it can be persisted.
 */
export function snapshotCustomMetadata(
	customMetadata: JsonCompatibleReadOnlyObject | undefined,
): JsonCompatibleReadOnlyObject | undefined {
	if (customMetadata === undefined) {
		return undefined;
	}
	let serialized: string | undefined;
	try {
		serialized = JSON.stringify(customMetadata);
	} catch (error: unknown) {
		throw new UsageError(
			`"customMetadata" must be JSON-serializable: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
	if (serialized === undefined) {
		throw new UsageError(`"customMetadata" must be JSON-serializable.`);
	}
	const snapshot: unknown = JSON.parse(serialized);
	if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) {
		throw new UsageError(`"customMetadata" must be a JSON object.`);
	}
	return snapshot as JsonCompatibleReadOnlyObject;
}
