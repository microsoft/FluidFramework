/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidHandleBase } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import { brand } from "../../../util/index.js";

import {
	type BlobRequestId,
	type BlobRequestMessage,
	type BlobResponseMessage,
	type HandleToken,
	normalizeProtocolError,
	SandboxProtocolError,
} from "./common.js";
import { TransportCodec } from "./transport.js";

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
