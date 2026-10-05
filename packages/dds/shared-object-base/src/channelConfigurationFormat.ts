/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataProcessingError, UsageError } from "@fluidframework/telemetry-utils/internal";

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
	return (
		typeof value === "object" &&
		value !== null &&
		Object.hasOwn(value, "isChannelConfigurationOp")
	);
}

/**
 * Prevents DDS-authored ops from being mistaken for configuration changes.
 * The key is reserved even on unconfigured channels; nested application data is unaffected.
 */
export function verifyOrdinaryChannelMessage(value: unknown): void {
	if (hasChannelConfigurationMarker(value)) {
		throw DataProcessingError.create(
			"Ordinary DDS ops cannot use the reserved isChannelConfigurationOp key",
			"SharedObjectReservedConfigurationKey",
		);
	}
}

/**
 * Rejects invalid revision identities.
 * @internal
 */
export function validateConfigurationRevision(revision: unknown): asserts revision is number {
	if (
		typeof revision !== "number" ||
		!Number.isSafeInteger(revision) ||
		revision < 0 ||
		Object.is(revision, -0)
	) {
		throw new UsageError("Channel configuration revision must be a non-negative safe integer");
	}
}

/**
 * Reads plain, enumerable data properties without invoking accessors.
 */
function readRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new UsageError("Channel configuration must use a JSON object");
	}
	const prototype: unknown = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new UsageError("Channel configuration cannot use custom prototypes");
	}
	const result: Record<string, unknown> = {};
	for (const key of Reflect.ownKeys(value)) {
		if (typeof key !== "string") {
			throw new UsageError("Channel configuration cannot contain symbol properties");
		}
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (descriptor?.enumerable !== true || !("value" in descriptor)) {
			throw new UsageError("Channel configuration requires enumerable data properties");
		}
		Object.defineProperty(result, key, {
			value: descriptor.value,
			enumerable: true,
		});
	}
	return result;
}

/**
 * Validates a marked configuration op without interpreting obsolete configuration values.
 * @internal
 */
export function parseChannelConfigurationMessage(
	value: unknown,
): ChannelConfigurationMessageV1 {
	const record = readRecord(value);
	if (record.version !== 1) {
		throw new UsageError("Unsupported channel configuration protocol version");
	}
	validateConfigurationRevision(record.expectedRevision);
	if (
		record.isChannelConfigurationOp !== true ||
		Object.keys(record).length !== 4 ||
		!Object.hasOwn(record, "values") ||
		typeof record.values !== "object" ||
		record.values === null ||
		Array.isArray(record.values)
	) {
		throw new UsageError("Invalid channel configuration message");
	}
	return Object.freeze({
		version: 1,
		isChannelConfigurationOp: true,
		expectedRevision: record.expectedRevision,
		values: record.values as ChannelConfigurationValuesV1,
	});
}

/**
 * Validates, copies, and freezes JSON without executing application serialization code.
 * Rejects negative zero rather than changing it to zero during serialization.
 * @internal
 */
export function copyChannelConfiguration(value: unknown): ChannelConfigurationValuesV1 {
	const ancestors = new Set<object>();
	function copy(input: unknown): ChannelConfigurationValueV1 {
		if (input === null || typeof input === "boolean" || typeof input === "string") {
			return input;
		}
		if (typeof input === "number" && Number.isFinite(input) && !Object.is(input, -0)) {
			return input;
		}
		if (typeof input !== "object" || input === null) {
			throw new UsageError("Channel configuration contains a non-JSON value");
		}
		if (ancestors.has(input)) {
			throw new UsageError("Channel configuration cannot contain cycles");
		}
		ancestors.add(input);
		try {
			if (Array.isArray(input)) {
				if (Object.getPrototypeOf(input) !== Array.prototype) {
					throw new UsageError("Channel configuration cannot use custom array prototypes");
				}
				const keys = Reflect.ownKeys(input);
				if (
					keys.length !== input.length + 1 ||
					keys.some(
						(key) =>
							typeof key !== "string" ||
							(key !== "length" &&
								(!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= input.length)),
					)
				) {
					throw new UsageError("Channel configuration cannot contain sparse or custom arrays");
				}
				const array: ChannelConfigurationValueV1[] = [];
				for (let index = 0; index < input.length; index++) {
					const descriptor = Object.getOwnPropertyDescriptor(input, index);
					if (descriptor?.enumerable !== true || !("value" in descriptor)) {
						throw new UsageError("Channel configuration arrays require data elements");
					}
					array.push(copy(descriptor.value));
				}
				return Object.freeze(array);
			}
			const record = readRecord(input);
			if (record.type === "__fluid_handle__") {
				throw new UsageError("Channel configuration cannot contain Fluid handles");
			}
			const result: Record<string, ChannelConfigurationValueV1> = {};
			for (const key of Object.keys(record)) {
				Object.defineProperty(result, key, {
					value: copy(record[key]),
					enumerable: true,
				});
			}
			return Object.freeze(result);
		} finally {
			ancestors.delete(input);
		}
	}

	readRecord(value);
	return copy(value) as ChannelConfigurationValuesV1;
}

/**
 * Copies a validated version 1 snapshot. Reader-specific validation is separate.
 * @internal
 */
export function copyChannelConfigurationSnapshot(
	value: unknown,
): ChannelConfigurationSnapshotV1 {
	const record = readRecord(value);
	if (record.version !== 1 || Object.keys(record).length !== 3) {
		throw new UsageError("Invalid channel configuration snapshot version or fields");
	}
	validateConfigurationRevision(record.revision);
	return Object.freeze({
		version: 1,
		revision: record.revision,
		values: copyChannelConfiguration(record.values),
	});
}
