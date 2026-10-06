/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidHandleBase } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { brand } from "../util/index.js";

import {
	type BlobRequestId,
	type GuestToHostMessage,
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
 * Manages Guest-side handle proxies and blob requests for one sandbox transport session.
 */
export class GuestTransportCodec extends TransportCodec {
	/**
	 * Guest handles indexed by their transport tokens.
	 */
	private readonly handles = new Map<HandleToken, GuestHandle>();

	/**
	 * Transport tokens indexed by their Guest handles.
	 */
	private readonly tokens = new Map<IFluidHandle, HandleToken>();

	/**
	 * Blob requests awaiting responses from the Host.
	 */
	private readonly pending = new Map<
		BlobRequestId,
		{ resolve: (value: ArrayBuffer) => void; reject: (error: Error) => void }
	>();

	/**
	 * Identifier to assign to the next blob request.
	 */
	private nextRequestId = 0;

	/**
	 * Whether this transport session has ended.
	 */
	private disposed = false;

	/**
	 * Sends protocol messages to the Host.
	 */
	private readonly send: (message: GuestToHostMessage) => void;

	/**
	 * Creates a codec for a Guest transport session.
	 *
	 * @param send - Sends a protocol message to the Host.
	 */
	public constructor(send: (message: GuestToHostMessage) => void) {
		super();
		this.send = send;
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
			handle = new GuestHandle(`/sandbox/${token}`, async () => this.requestBlob(token));
			this.handles.set(token, handle);
			this.tokens.set(handle, token);
		}
		return handle;
	}

	/**
	 * Requests the blob represented by a transport token.
	 *
	 * @param token - The token that identifies the blob.
	 * @returns The blob data returned by the Host.
	 */
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
				this.send({ blobRequest: { requestId, token } });
			} catch (error) {
				this.pending.delete(requestId);
				reject(normalizeProtocolError(error));
			}
		});
	}

	/**
	 * Completes a pending blob request with its response data.
	 *
	 * @param requestId - The identifier of the pending blob request.
	 * @param blob - The blob data returned by the Host.
	 * @throws A {@link SandboxProtocolError} if `requestId` does not identify a pending request.
	 */
	public receiveBlobResponse(requestId: BlobRequestId, blob: ArrayBuffer): void {
		this.takePendingBlobRequest(requestId).resolve(blob);
	}

	/**
	 * Rejects a pending blob request with an error from the Host.
	 *
	 * @param requestId - The identifier of the pending blob request.
	 * @param error - The error message returned by the Host.
	 * @throws A {@link SandboxProtocolError} if `requestId` does not identify a pending request.
	 */
	public receiveBlobResponseError(requestId: BlobRequestId, error: string): void {
		this.takePendingBlobRequest(requestId).reject(new Error(error));
	}

	/**
	 * Removes and returns a pending blob request.
	 *
	 * @param requestId - The identifier of the pending request.
	 * @returns The callbacks for completing the request.
	 */
	private takePendingBlobRequest(requestId: BlobRequestId): {
		resolve: (value: ArrayBuffer) => void;
		reject: (error: Error) => void;
	} {
		const pending = this.pending.get(requestId);
		if (pending === undefined) {
			throw new SandboxProtocolError("Unexpected sandbox blob response.");
		}
		this.pending.delete(requestId);
		return pending;
	}

	/**
	 * Ends the transport session and rejects all pending blob requests.
	 *
	 * @param error - The error used to reject pending requests.
	 */
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
