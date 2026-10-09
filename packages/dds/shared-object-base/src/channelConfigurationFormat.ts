/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, isObject } from "@fluidframework/core-utils/internal";

/**
 * JSON values in version 1 of the persisted channel configuration protocol.
 *
 * Keep these declarations independent of the DDS-facing configuration API. A change to that API
 * must not silently change the format already stored in documents or sent between clients.
 * @internal
 */
export type ChannelConfigurationValueV1 =
	// eslint-disable-next-line @rushstack/no-new-null -- Null is a JSON value in the persisted format.
	| null
	| boolean
	| number
	| string
	| readonly ChannelConfigurationValueV1[]
	| { readonly [key: string]: ChannelConfigurationValueV1 };

/**
 * A version 1 configuration property bag.
 * @internal
 */
export interface ChannelConfigurationValuesV1 {
	readonly [key: string]: ChannelConfigurationValueV1;
}

/**
 * The configuration stored with a channel instance's attributes.
 *
 * The version identifies the encoding format. The revision counts accepted replacements,
 * including replacements with unchanged values. It is not the channel's op sequence number.
 * @internal
 */
export interface ChannelConfigurationSnapshotV1 {
	/**
	 * Encoding version, separate from the configuration revision exposed to the DDS.
	 * Change this when the persisted format requires a backward-incompatible change.
	 */
	readonly version: 1;
	readonly revision: number;
	readonly values: ChannelConfigurationValuesV1;
}

/**
 * Requests a full replacement of a channel's configuration.
 *
 * The controller applies the replacement only if `expectedRevision` still matches the current
 * revision when this message is sequenced. Otherwise, an older revision produces a conflict.
 * @internal
 */
export interface ChannelConfigurationMessageV1 {
	readonly version: 1;
	readonly isChannelConfigurationOp: true;
	readonly expectedRevision: number;
	readonly values: ChannelConfigurationValuesV1;
}

/**
 * Detects the reserved top-level key without interpreting ordinary DDS payloads.
 * A present but invalid marker must fail validation, not fall through to the DDS.
 */
export function hasChannelConfigurationMarker(value: unknown): boolean {
	return isObject(value) && Object.hasOwn(value, "isChannelConfigurationOp");
}

/**
 * Rejects invalid revision identities.
 * @internal
 */
export function validateConfigurationRevision(revision: unknown): asserts revision is number {
	assert(
		typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0,
		"Channel configuration revision must be a non-negative safe integer",
	);
}

/**
 * Checks the top-level shape without copying or inspecting configuration values.
 */
function readRecord(value: unknown): Record<string, unknown> {
	assert(
		isObject(value) && !Array.isArray(value),
		"Channel configuration must use a JSON object",
	);
	return value as Record<string, unknown>;
}

/**
 * Validates a marked configuration op without interpreting obsolete configuration values.
 * @internal
 */
export function parseChannelConfigurationMessage(
	value: unknown,
): ChannelConfigurationMessageV1 {
	const record = readRecord(value);
	assert(record.version === 1, "Unsupported channel configuration protocol version");
	validateConfigurationRevision(record.expectedRevision);
	assert(
		record.isChannelConfigurationOp === true &&
			Object.keys(record).length === 4 &&
			Object.hasOwn(record, "values") &&
			isObject(record.values) &&
			!Array.isArray(record.values),
		"Invalid channel configuration message",
	);
	return value as ChannelConfigurationMessageV1;
}

/**
 * Reads a version 1 snapshot, allowing additional fields. Reader-specific validation is separate.
 * @internal
 */
export function parseChannelConfigurationSnapshot(
	value: unknown,
): ChannelConfigurationSnapshotV1 {
	const record = readRecord(value);
	assert(record.version === 1, "Invalid channel configuration snapshot version");
	validateConfigurationRevision(record.revision);
	readRecord(record.values);
	return value as ChannelConfigurationSnapshotV1;
}
