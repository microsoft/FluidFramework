/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { oob } from "@fluidframework/core-utils/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { brand } from "../util/index.js";

import { type HandleToken, isHandleToken, SandboxProtocolError } from "./common.js";
import { TransportCodec } from "./transport.js";

/**
 * Owns the handles authorized for one Guest. Entries live until {@link HostTransportCodec.dispose}.
 * Equivalent handle paths share a token; returned tokens restore the original Host handles.
 */
export class HostTransportCodec extends TransportCodec {
	/** Host handles indexed by the token that authorizes Guest access. */
	private readonly handles: IFluidHandle[] = [];
	/** Maps each authorized handle path to its stable session-local token. */
	private readonly tokens = new Map<string, HandleToken>();
	/** Whether this codec has released its session-local handle tables. */
	private disposed = false;

	/**
	 * Authorizes a Host handle for the Guest and returns its session-local token.
	 * Handles with the same absolute path share a token.
	 */
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

	/** Restores the Host handle authorized by a session-local token. */
	protected decodeHandle(token: HandleToken): IFluidHandle {
		return this.getHandle(token);
	}

	/** Throws if this codec has been disposed. */
	private checkActive(): void {
		if (this.disposed) {
			throw new UsageError("The Host handle session is disposed.");
		}
	}

	/** Returns the Host handle authorized by a valid token in this session. */
	private getHandle(token: HandleToken): IFluidHandle {
		this.checkActive();
		if (!isHandleToken(token) || token >= this.handles.length) {
			throw new SandboxProtocolError("Unknown sandbox handle token.");
		}
		return this.handles[token] ?? oob();
	}

	/**
	 * Checks authorization before resolution errors are converted into nonfatal blob responses.
	 */
	public assertAuthorizedToken(token: HandleToken): void {
		this.getHandle(token);
	}

	/**
	 * Resolves an authorized handle to blob content for the Guest.
	 * Fluid-object handles are not supported.
	 */
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

	/** Disables this codec and releases its session-local handle tables. */
	public dispose(): void {
		this.disposed = true;
		this.handles.length = 0;
		this.tokens.clear();
	}
}
