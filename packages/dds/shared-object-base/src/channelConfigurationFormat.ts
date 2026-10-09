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
export function isChannelConfigurationOp(value: unknown): value is ChannelConfigurationMessageV1 {
	return isObject(value) && Object.hasOwn(value, "isChannelConfigurationOp") && (value as ChannelConfigurationMessageV1).isChannelConfigurationOp === true;
}

function isNonArrayObject(value: unknown): value is Record<string, unknown> {
	return isObject(value) && !Array.isArray(value);
}

/**
 * Rejects invalid revision identities.
 * @internal
 */
export function validateConfigurationRevision(revision: unknown): asserts revision is number {
	assert(
		typeof revision === "number" && revision >= 0 && Number.isSafeInteger(revision),
		"Channel configuration revision must be a non-negative safe integer",
	);
}

function assertHasValidConfigurationValues(hasValues: Record<string, unknown> | ChannelConfigurationMessageV1): asserts hasValues is { values: ChannelConfigurationValuesV1 } {
	assert(
		Object.hasOwn(hasValues, "values") && isNonArrayObject(hasValues.values),
		"Invalid configuration values",
	);
}

/**
 * Validates a marked configuration op without interpreting obsolete configuration values.
 * @internal
 */
export function parseChannelConfigurationMessage(
	op: unknown,
): ChannelConfigurationMessageV1 {
	assert(isChannelConfigurationOp(op), "Not a channel configuration operation");
	assert(op.version === 1, "Unsupported channel configuration protocol version");
	validateConfigurationRevision(op.expectedRevision);
	assertHasValidConfigurationValues(op);
	return op;
}

/**
 * Reads a version 1 snapshot, allowing additional fields. Reader-specific validation is separate.
 * @internal
 */
export function parseChannelConfigurationSnapshot(
	snapshot: unknown,
): ChannelConfigurationSnapshotV1 {
	assert(isNonArrayObject(snapshot), "Invalid channel configuration snapshot");
	assert(snapshot.version === 1, "Invalid channel configuration snapshot version");
	validateConfigurationRevision(snapshot.revision);
	assertHasValidConfigurationValues(snapshot);
	return snapshot as ChannelConfigurationSnapshotV1;
}
