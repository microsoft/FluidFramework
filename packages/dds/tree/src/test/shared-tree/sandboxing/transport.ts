/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	FluidHandleBase,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import {
	type ISharedObjectHandle,
	isISharedObjectHandle,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { brand } from "../../../util/index.js";

import {
	type BlobRequestId,
	type BlobRequestMessage,
	type BlobResponseMessage,
	type HandleToken,
	createBufferPlaceholder,
	escapedObjectType,
	getTransportBuffer,
	isEscapedObject,
	isHandleToken,
	isLocalHandle,
	isSerializedHandle,
	normalizeProtocolError,
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
abstract class TransportCodec {
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

/**
 * Owns the handles authorized for one Guest. Entries live until {@link HostTransportCodec.dispose}.
 * Equivalent handle paths share a token; returned tokens restore the original Host handles.
 * {@link HostTransportCodec.bindHandles} is separate from decoding so callers can first validate and apply the change locally.
 */
export class HostTransportCodec extends TransportCodec {
	private readonly handles: IFluidHandle[] = [];
	private readonly tokens = new Map<string, HandleToken>();
	private readonly bindingHandle: ISharedObjectHandle;
	private disposed = false;

	public constructor(bindingHandle: IFluidHandle) {
		super();
		const internal = toFluidHandleInternal(bindingHandle);
		if (!isISharedObjectHandle(internal)) {
			throw new UsageError("The Host requires a SharedTree handle for binding.");
		}
		this.bindingHandle = internal;
	}

	protected encodeHandle(handle: IFluidHandle): HandleToken {
		this.checkActive();
		const path = toFluidHandleInternal(handle).absolutePath;
		let token = this.tokens.get(path);
		if (token === undefined) {
			token = brand<HandleToken>(this.handles.length);
			this.handles.push(handle);
			this.tokens.set(path, token);
		}
		return token;
	}

	protected decodeHandle(token: HandleToken): IFluidHandle {
		return this.getHandle(token);
	}

	/**
	 * Binds restored handles only after the receiving code has validated the change.
	 */
	public bindHandles(value: unknown): void {
		const handles = new Set<IFluidHandle>();
		copyTransportData(value, (handle) => {
			handles.add(handle);
			return handle;
		});
		for (const handle of handles) {
			this.bindingHandle.bind(toFluidHandleInternal(handle));
		}
	}

	private checkActive(): void {
		if (this.disposed) {
			throw new UsageError("The Host handle session is disposed.");
		}
	}

	private getHandle(token: HandleToken): IFluidHandle {
		this.checkActive();
		if (!isHandleToken(token) || token >= this.handles.length) {
			throw new SandboxProtocolError("Unknown sandbox handle token.");
		}
		return this.handles[token];
	}

	/**
	 * Checks authorization before resolution errors are converted into nonfatal blob responses.
	 */
	public assertAuthorizedToken(token: HandleToken): void {
		this.getHandle(token);
	}

	public async resolveBlob(token: HandleToken): Promise<ArrayBuffer> {
		const result = await this.getHandle(token).get();
		if (!(result instanceof ArrayBuffer)) {
			// If needed, a customizable Host policy could support Guest get() calls for Fluid-object handles.
			throw new UsageError(
				"Cannot resolve this handle in the Guest: only blob handles resolving to an ArrayBuffer are supported. Handles to Fluid objects are not supported.",
			);
		}
		return result;
	}

	public dispose(): void {
		this.disposed = true;
		this.handles.length = 0;
		this.tokens.clear();
	}
}

/**
 * Session-local proxy whose {@link GuestHandle.get} resolves blob content through the Host.
 * Caches one resolution promise, including failures, for concurrent and repeated calls.
 * Its {@link GuestHandle.absolutePath} provides session-local identity, not a Host URL. Only the Host performs Fluid attachment.
 */
class GuestHandle extends FluidHandleBase<ArrayBuffer> {
	public readonly isAttached = false;
	private promise: Promise<ArrayBuffer> | undefined;

	public constructor(
		public readonly absolutePath: string,
		private readonly resolve: () => Promise<ArrayBuffer>,
	) {
		super();
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async -- Preserve the cached promise's identity.
	public get(): Promise<ArrayBuffer> {
		// Cache failures too: retries require a new session.
		return (this.promise ??= this.resolve());
	}

	public attachGraph(): never {
		throw new UsageError("Guest handles cannot attach. Return them to the Host instead.");
	}
}

/**
 * Restores {@link GuestHandle} proxies and resolves blobs independently of tree synchronization.
 * Caches one proxy per {@link HandleToken} and permits sending only proxies created by this codec.
 * {@link GuestTransportCodec.dispose} rejects pending requests and clears the session's proxy tables.
 */
export class GuestTransportCodec extends TransportCodec {
	private readonly sessionId = uuid();
	private readonly handles = new Map<HandleToken, GuestHandle>();
	private readonly tokens = new Map<IFluidHandle, HandleToken>();
	private readonly pending = new Map<
		BlobRequestId,
		{ resolve: (value: ArrayBuffer) => void; reject: (error: Error) => void }
	>();
	private nextRequestId = 0;
	private disposed = false;

	public constructor(private readonly send: (message: BlobRequestMessage) => void) {
		super();
	}

	protected encodeHandle(handle: IFluidHandle): HandleToken {
		const token = this.tokens.get(handle);
		if (this.disposed || token === undefined) {
			throw new UsageError("Cannot send a foreign or disposed handle to the Host.");
		}
		return token;
	}

	protected decodeHandle(token: HandleToken): IFluidHandle {
		if (this.disposed) {
			throw new UsageError("The Guest handle session is disposed.");
		}
		let handle = this.handles.get(token);
		if (handle === undefined) {
			handle = new GuestHandle(`/sandbox/${this.sessionId}/${token}`, async () =>
				this.requestBlob(token),
			);
			this.handles.set(token, handle);
			this.tokens.set(handle, token);
		}
		return handle;
	}

	private async requestBlob(token: HandleToken): Promise<ArrayBuffer> {
		if (this.disposed) {
			throw new UsageError("The Guest handle session is disposed.");
		}
		if (this.nextRequestId > Number.MAX_SAFE_INTEGER) {
			throw new UsageError(
				"Sandbox blob request identifiers are exhausted. Recreate the Host and Guest.",
			);
		}
		const requestId = brand<BlobRequestId>(this.nextRequestId++);
		return new Promise<ArrayBuffer>((resolve, reject) => {
			this.pending.set(requestId, { resolve, reject });
			try {
				this.send({ type: "blobRequest", requestId, token });
			} catch (error) {
				this.pending.delete(requestId);
				reject(normalizeProtocolError(error));
			}
		});
	}

	public receiveBlobResponse(message: BlobResponseMessage): void {
		const pending = this.pending.get(message.requestId);
		if (pending === undefined) {
			throw new SandboxProtocolError("Unexpected sandbox blob response.");
		}
		this.pending.delete(message.requestId);
		if ("error" in message) {
			pending.reject(new Error(message.error));
		} else {
			pending.resolve(message.blob);
		}
	}

	public dispose(error: Error = new Error("The Guest handle session is disposed.")): void {
		this.disposed = true;
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
		this.handles.clear();
		this.tokens.clear();
	}
}
