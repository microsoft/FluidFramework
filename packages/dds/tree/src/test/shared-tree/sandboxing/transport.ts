/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";

import {
	type HandleToken,
	createBufferPlaceholder,
	escapedObjectType,
	getTransportBuffer,
	isEscapedObject,
	isLocalHandle,
	isSerializedHandle,
	SandboxProtocolError,
	type SerializedHandle,
	serializedHandleType,
} from "./common.js";

/**
 * Copies structured-clone messages and replaces handles without changing the input.
 * {@link TransportCodec.decode} restores authorized handles without binding or resolving them.
 * Decoded buffers remain placeholders until blob-response validation.
 * Callers must perform semantic validation after decoding; this layer checks only transport structure.
 */
export abstract class TransportCodec {
	public encode(value: unknown): unknown {
		return copyTransportData(
			value,
			(handle) =>
				createNullPrototypeRecord({
					type: serializedHandleType,
					token: this.encodeHandle(handle),
				} satisfies SerializedHandle),
			(buffer) => buffer,
			(record) =>
				isReservedRecord(record)
					? createNullPrototypeRecord({
							type: escapedObjectType,
							entries: Object.entries(record),
						})
					: record,
		);
	}

	public decode(value: unknown): unknown {
		// Restrict the entire graph before schema checks or token restoration.
		const copied = copyTransportData(value, () => {
			throw new SandboxProtocolError("Handles must cross the sandbox boundary as tokens.");
		});
		const restore = (item: unknown): unknown => {
			if (
				typeof item !== "object" ||
				item === null ||
				getTransportBuffer(item) !== undefined
			) {
				return item;
			}
			if (Array.isArray(item)) {
				return item.map(restore);
			}
			if (
				Object.hasOwn(item, "type") &&
				"type" in item &&
				item.type === serializedHandleType
			) {
				if (!isSerializedHandle(item)) {
					throw new SandboxProtocolError("Invalid sandbox handle token.");
				}
				return this.decodeHandle(item.token);
			}
			let entries: [string, unknown][];
			if (Object.hasOwn(item, "type") && "type" in item && item.type === escapedObjectType) {
				if (!isEscapedObject(item)) {
					throw new SandboxProtocolError("Invalid sandbox object escape.");
				}
				entries = item.entries;
			} else {
				entries = Object.entries(item);
			}
			const record: object = Object.create(null);
			for (const [key, child] of entries) {
				if (Object.hasOwn(record, key)) {
					throw new SandboxProtocolError("Duplicate property in sandbox object escape.");
				}
				defineDataProperty(record, key, restore(child));
			}
			// Do not interpret the reconstructed root as a marker a second time.
			return record;
		};
		return restore(copied);
	}

	protected abstract encodeHandle(handle: IFluidHandle): HandleToken;
	protected abstract decodeHandle(token: HandleToken): IFluidHandle;
}

/**
 * Copies outgoing semantic data into null-prototype records before validation.
 * Local handles remain opaque leaves; buffers become identity-checked placeholders via {@link createBufferPlaceholder}.
 */
export function normalizeTransportData(value: unknown): unknown {
	return copyTransportData(value, (handle) => handle);
}

/**
 * Validates transport data and visits each local handle in it.
 */
export function visitLocalHandles(
	value: unknown,
	visitor: (handle: IFluidHandle) => void,
): void {
	copyTransportData(value, (handle) => {
		visitor(handle);
		return handle;
	});
}

function createNullPrototypeRecord<T extends object>(properties: T): T {
	const record: object = Object.create(null);
	return Object.assign(record, properties);
}

function isReservedRecord(value: object): boolean {
	return (
		Object.hasOwn(value, "type") &&
		"type" in value &&
		(value.type === serializedHandleType || value.type === escapedObjectType)
	);
}

/**
 * Copies only supported data types. Incoming values must originate from structured clone,
 * not arbitrary same-realm proxies. Accessors are rejected without invoking them.
 */
function copyTransportData(
	value: unknown,
	handle: (value: IFluidHandle) => unknown,
	buffer: (value: ArrayBuffer) => unknown = createBufferPlaceholder,
	record: (value: object) => unknown = (item) => item,
): unknown {
	const ancestors = new Set<object>();
	const copy = (item: unknown): unknown => {
		if (
			item === null ||
			item === undefined ||
			typeof item === "boolean" ||
			typeof item === "string"
		) {
			return item;
		}
		if (typeof item === "number" && Number.isFinite(item)) {
			return item;
		}
		if (typeof item !== "object") {
			throw new SandboxProtocolError("Unsupported sandbox transport value.");
		}
		if (isLocalHandle(item)) {
			return handle(item);
		}
		const registeredBuffer = getTransportBuffer(item);
		if (registeredBuffer !== undefined) {
			return buffer(registeredBuffer);
		}
		if (ancestors.has(item)) {
			throw new SandboxProtocolError("Cyclic sandbox transport data.");
		}
		const array = Array.isArray(item);
		const isBuffer = item instanceof ArrayBuffer;
		const prototype: unknown = Object.getPrototypeOf(item);
		if (
			(array && prototype !== Array.prototype) ||
			(isBuffer && prototype !== ArrayBuffer.prototype) ||
			(!array && !isBuffer && prototype !== Object.prototype && prototype !== null)
		) {
			throw new SandboxProtocolError("Unsupported sandbox transport object.");
		}
		const keys = Reflect.ownKeys(item);
		if (isBuffer) {
			if (keys.length > 0) {
				throw new SandboxProtocolError("Sandbox buffers cannot have custom properties.");
			}
			// eslint-disable-next-line unicorn/prefer-spread -- This copies an ArrayBuffer, not an iterable array.
			return buffer(item.slice(0));
		}
		const result: object = array ? [] : Object.create(null);
		ancestors.add(item);
		try {
			let index = 0;
			for (const key of keys) {
				if (array && key === "length") {
					continue;
				}
				if (typeof key !== "string" || (array && key !== String(index++))) {
					throw new SandboxProtocolError("Unsupported sandbox transport property.");
				}
				const descriptor = Object.getOwnPropertyDescriptor(item, key);
				if (descriptor?.enumerable !== true || !("value" in descriptor)) {
					throw new SandboxProtocolError(
						"Sandbox transport requires enumerable data properties.",
					);
				}
				defineDataProperty(result, key, copy(descriptor.value));
			}
			if (array && index !== item.length) {
				throw new SandboxProtocolError("Sparse sandbox transport arrays are not supported.");
			}
			return array ? result : record(result);
		} finally {
			ancestors.delete(item);
		}
	};
	return copy(value);
}

function defineDataProperty(target: object, key: string, value: unknown): void {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		configurable: true,
		writable: true,
	});
}
