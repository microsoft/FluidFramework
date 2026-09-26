/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { fail } from "@fluidframework/core-utils/internal";

// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Host requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type { ImplicitFieldSchema } from "../../../simple-tree/index.js";

import {
	type BlobRequestMessage,
	type BlobResponseMessage,
	type HostGuestMessage,
	normalizeProtocolError,
	parseHostGuestMessage,
	SandboxProtocolError,
	throwProtocolError,
} from "./common.js";
import { HostTransportCodec } from "./hostTransport.js";
import { HostSynchronization } from "./hostSynchronization.js";
import { SandboxSessionEndpoint } from "./session.js";
import { normalizeTransportData } from "./transport.js";

/**
 * The SharedTree that connects to Fluid services on behalf of a Guest.
 *
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export class Host<const TSchema extends ImplicitFieldSchema> {
	public readonly codec: HostTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private readonly synchronization: HostSynchronization<TSchema>;
	private disposed = false;
	/** Borrowed application view, updated by peer changes. Session teardown does not dispose it. */
	public readonly main: TreeViewAlpha<TSchema>;

	/** Receives and routes protocol messages from the Guest. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		this.session.run(() => {
			const message = parseHostGuestMessage(this.codec.decode(event.data));
			switch (message.type) {
				case "dataChange": {
					this.synchronization.receiveChangeFromGuest(message.change);
					break;
				}
				case "acknowledgment": {
					this.synchronization.receiveAckFromGuest();
					break;
				}
				case "blobRequest": {
					this.receiveBlobRequest(message).catch((error: unknown) => {
						this.session.fail(error);
					});
					break;
				}
				case "blobResponse": {
					throw new SandboxProtocolError("The Host cannot receive blob responses.");
				}
				case "sessionFailure": {
					this.session.fail(new Error(message.error), false);
					break;
				}
				default: {
					fail("Unexpected Host and Guest message type");
				}
			}
		});
	};

	/** Reports a protocol message that the platform cannot deserialize. */
	private readonly onMessageError = (): void => {
		this.session.fail(
			new SandboxProtocolError("The Host could not deserialize a protocol message."),
		);
	};

	public constructor(
		main: TreeViewAlpha<TSchema>,
		/** The Host endpoint of the Host and Guest message channel. */
		private readonly port: MessagePort,
		/** The SharedTree handle to which restored handles are bound. */
		bindingHandle: IFluidHandle,
		/** Reports terminal session failure asynchronously; the application must recreate the pair. */
		handleProtocolError: (error: Error) => void = throwProtocolError,
		/** Receives diagnostic messages from the synchronization algorithm. */
		logger: (message: string) => void = () => {},
	) {
		this.codec = new HostTransportCodec(bindingHandle);
		this.main = main;
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				this.synchronization.stop(error);
				this.codec.dispose();
			},
			handleProtocolError,
		);
		this.synchronization = new HostSynchronization(
			main,
			(message) => this.postMessage(message),
			(change) => this.codec.bindHandles(change),
			(action) => this.session.run(action),
			(error) => this.session.fail(error),
			logger,
		);
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.session.dispose();
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.synchronization.dispose();
	}

	/** Terminal failure requiring application-managed Host/Guest recreation, if this session failed. */
	public get error(): Error | undefined {
		return this.session.error;
	}

	private async receiveBlobRequest(message: BlobRequestMessage): Promise<void> {
		this.codec.assertAuthorizedToken(message.token);
		let response: BlobResponseMessage;
		try {
			const blob = await this.codec.resolveBlob(message.token);
			response = { type: "blobResponse", requestId: message.requestId, blob };
		} catch (error) {
			response = {
				type: "blobResponse",
				requestId: message.requestId,
				error: normalizeProtocolError(error).message,
			};
		}
		if (this.session.active) {
			// Do not transfer: detaching the Host's buffer could break other consumers.
			this.postMessage(response);
		}
	}

	private postMessage(message: HostGuestMessage): void {
		const normalized = normalizeTransportData(message);
		parseHostGuestMessage(normalized);
		this.port.postMessage(this.codec.encode(normalized));
	}

	/**
	 * Returns a promise that resolves when all changes known to the Host are reflected in the Guest,
	 * or undefined if all such changes are already reflected in the Guest.
	 *
	 * If new changes arrive while a promise is in progress, the existing promise resolves only
	 * after the new changes are also reflected in the Guest.
	 * A caller does not need to get the promise again after new changes arrive while it is pending.
	 * Pending promises reject on failure or disposal. Access after failure throws.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		this.session.breaker.use();
		return this.synchronization.updateGuestPromise;
	}

	/**
	 * The Host branch that reflects the Guest's acknowledged state.
	 */
	public get local(): TreeViewAlpha<TSchema> {
		return this.synchronization.local;
	}
}
