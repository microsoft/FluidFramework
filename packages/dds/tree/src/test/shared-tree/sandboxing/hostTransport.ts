/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import {
	type ISharedObjectHandle,
	isISharedObjectHandle,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { brand } from "../../../util/index.js";

import { type HandleToken, isHandleToken, SandboxProtocolError } from "./common.js";
import { TransportCodec, visitLocalHandles } from "./transport.js";

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
		visitLocalHandles(value, (handle) => handles.add(handle));
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
