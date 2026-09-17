/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * JSON values in version 1 of the persisted channel configuration protocol.
 * Keep these declarations independent of the DDS-facing configuration API.
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
 * The configuration stored in version 1 channel attributes.
 * @internal
 */
export interface ChannelConfigurationSnapshotV1 {
	readonly version: 1;
	readonly revision: number;
	readonly values: ChannelConfigurationValuesV1;
}

/**
 * A full replacement proposed against a specific configuration revision.
 * @internal
 */
export interface ChannelConfigurationMessageV1 {
	readonly version: 1;
	readonly kind: "configuration";
	readonly expectedRevision: number;
	readonly values: ChannelConfigurationValuesV1;
}

/**
 * Ordinary DDS contents with their original configuration revision.
 * @internal
 */
export interface ConfiguredChannelOperationV1 {
	readonly version: 1;
	readonly kind: "operation";
	readonly revision: number;
	readonly contents: unknown;
}

/**
 * Version 1 channel messages, selected only by a configured channel's attributes.
 * @internal
 */
export type ConfiguredChannelMessage =
	| ChannelConfigurationMessageV1
	| ConfiguredChannelOperationV1;

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
 * Validates an envelope without interpreting obsolete configuration values or DDS contents.
 * @internal
 */
export function parseConfiguredChannelMessage(value: unknown): ConfiguredChannelMessage {
	const record = readRecord(value);
	if (record.version !== 1) {
		throw new UsageError("Unsupported channel configuration protocol version");
	}
	if (record.kind === "configuration") {
		validateConfigurationRevision(record.expectedRevision);
		if (
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
			kind: "configuration",
			expectedRevision: record.expectedRevision,
			values: record.values as ChannelConfigurationValuesV1,
		});
	}
	if (record.kind === "operation") {
		validateConfigurationRevision(record.revision);
		if (Object.keys(record).length !== 4 || !Object.hasOwn(record, "contents")) {
			throw new UsageError("Invalid configured channel operation");
		}
		return Object.freeze({
			version: 1,
			kind: "operation",
			revision: record.revision,
			contents: record.contents,
		});
	}
	throw new UsageError("Invalid configured channel message kind");
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
