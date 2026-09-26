/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

import type { ICodecOptions } from "../../../codec/index.js";
import {
	independentInitializedView,
	type ForestOptions,
	type ViewContent,
} from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Guest requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type {
	ImplicitFieldSchema,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";

import {
	type HostGuestMessage,
	parseHostGuestMessage,
	SandboxProtocolError,
	throwProtocolError,
	validateTreePayloadVocabulary,
} from "./common.js";
import { GuestSynchronization } from "./guestSynchronization.js";
import { GuestTransportCodec, normalizeTransportData } from "./transport.js";
import { SandboxSessionEndpoint } from "./session.js";

/**
 * An independent TreeView synchronized with a Host through a message protocol.
 *
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export class Guest<const TSchema extends ImplicitFieldSchema> {
	private readonly codec: GuestTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private readonly synchronization: GuestSynchronization<TSchema>;
	private disposed = false;
	/** The independent view on the Guest. */
	public readonly view: TreeViewAlpha<TSchema>;

	/** Receives and routes protocol messages from the Host. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		this.session.run(() => {
			const message = parseHostGuestMessage(this.codec.decode(event.data));
			switch (message.type) {
				case "dataChange": {
					this.synchronization.receiveChangeFromHost(message.change);
					break;
				}
				case "acknowledgment": {
					this.synchronization.receiveAckFromHost();
					break;
				}
				case "blobResponse": {
					this.codec.receiveBlobResponse(message);
					break;
				}
				case "blobRequest": {
					throw new SandboxProtocolError("The Guest cannot receive blob requests.");
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
			new SandboxProtocolError("The Guest could not deserialize a protocol message."),
		);
	};

	public constructor(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		content: ViewContent,
		/** The Guest endpoint of the Host and Guest message channel. */
		private readonly port: MessagePort,
		/** Reports terminal session failure asynchronously; the application must recreate the pair. */
		handleProtocolError: (error: Error) => void = throwProtocolError,
		/** Receives diagnostic messages from the synchronization algorithm. */
		logger: (message: string) => void = () => {},
	) {
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				this.synchronization.stop(error);
				this.codec.dispose(error);
			},
			handleProtocolError,
		);
		this.codec = new GuestTransportCodec((message) =>
			this.session.run(() => this.postMessage(message)),
		);
		const tree = this.codec.decode(content.tree);
		validateTreePayloadVocabulary(tree);
		this.view = independentInitializedView(config, options, {
			...content,
			tree: tree as ViewContent["tree"],
		});
		this.synchronization = new GuestSynchronization(
			this.view,
			(message) => this.postMessage(message),
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
		// TODO: Support cleanup of already-broken views and invalidation of retained node references.
		this.view.dispose();
	}

	/** Terminal failure requiring application-managed Host/Guest recreation, if this session failed. */
	public get error(): Error | undefined {
		return this.session.error;
	}

	private postMessage(message: HostGuestMessage): void {
		const normalized = normalizeTransportData(message);
		parseHostGuestMessage(normalized);
		this.port.postMessage(this.codec.encode(normalized));
	}

	/**
	 * Returns a promise that resolves when the Host acknowledges all changes made on the Guest,
	 * or undefined if no such changes are in flight.
	 *
	 * If new local changes are made while a promise is in progress, the existing promise resolves
	 * only after the Host acknowledges the new changes too.
	 * A caller does not need to get the promise again after making new changes while it is pending.
	 * Pending promises reject on failure or disposal. Access after failure throws.
	 */
	public get updateHostPromise(): Promise<void> | undefined {
		this.session.breaker.use();
		return this.synchronization.updateHostPromise;
	}
}
