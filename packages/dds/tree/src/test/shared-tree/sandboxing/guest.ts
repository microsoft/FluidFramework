/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, unreachableCase } from "@fluidframework/core-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

import type { ICodecOptions } from "../../../codec/index.js";
import type { ForestOptions, ViewContent } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Guest requires its independent tree's checkout.
import { createIndependentTreeCheckout } from "../../../shared-tree/independentView.js";
import type {
	ImplicitFieldSchema,
	TreeView,
	TreeViewConfiguration,
	ViewableTree,
} from "../../../simple-tree/index.js";

import {
	type HostGuestMessage,
	type HostInitializationMessage,
	makePromiseWithResolvers,
	parseHostGuestMessage,
	type SandboxEndpointOptions,
	SandboxProtocolError,
	throwProtocolError,
} from "./common.js";
import { GuestTransportCodec } from "./guestTransport.js";
import { GuestSynchronization } from "./guestSynchronization.js";
import { SandboxSessionEndpoint } from "./session.js";
import { normalizeTransportData } from "./transport.js";

/**
 * Options for creating a Guest.
 */
export interface GuestOptions extends SandboxEndpointOptions {
	/** The forest and codec options used to initialize the Guest's tree. */
	readonly treeOptions: ForestOptions & ICodecOptions;
}

/**
 * An independent tree synchronized with a Host through a message protocol.
 */
export class Guest {
	private readonly codec: GuestTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private readonly treeOptions: ForestOptions & ICodecOptions;
	private readonly idCompressor: IIdCompressor;
	private readonly port: MessagePort;
	private readonly logger: TelemetryLoggerExt;
	private synchronization: GuestSynchronization | undefined;
	private viewableTree: ViewableTree | undefined;
	private readonly initialized = makePromiseWithResolvers();
	private disposed = false;

	/** The independent tree on the Guest. Available after {@link Guest.create} resolves. */
	public get tree(): ViewableTree {
		return this.viewableTree ?? fail("Guest accessed before initialization");
	}

	/** Receives and routes protocol messages from the Host. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		this.session.run(() => {
			const message = parseHostGuestMessage(this.codec.decode(event.data));
			if (message.type === "hostInitialization") {
				this.initialize(message);
				return;
			}
			if (message.type === "sessionFailure") {
				this.session.fail(new Error(message.error), false);
				return;
			}
			if (this.synchronization === undefined) {
				throw new SandboxProtocolError(
					`Guest received a message with type ${JSON.stringify(message.type)} before initialization.`,
				);
			}
			switch (message.type) {
				case "hostUpdate": {
					return this.synchronization.receiveHostUpdate(message);
				}
				case "guestChangeAck": {
					return this.synchronization.receiveChangeAck(message);
				}
				case "blobResponse": {
					return this.codec.receiveBlobResponse(message);
				}
				case "blobRequest":
				case "guestChange":
				case "hostUpdateAck": {
					throw new SandboxProtocolError(
						`Guest received a message with type ${JSON.stringify(message.type)}.`,
					);
				}
				default: {
					unreachableCase(message);
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

	private constructor({
		treeOptions,
		idCompressor,
		port,
		logger,
		handleProtocolError = throwProtocolError,
	}: GuestOptions) {
		this.treeOptions = treeOptions;
		this.idCompressor = idCompressor;
		this.port = port;
		this.logger = logger;
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				this.synchronization?.stop(error);
				this.codec.dispose(error);
				this.initialized.rejecter(error);
			},
			handleProtocolError,
		);
		this.codec = new GuestTransportCodec((message) =>
			this.session.run(() => this.postMessage(message)),
		);
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
	}

	/**
	 * Creates a Guest after receiving its initial Host state through the message port.
	 *
	 * @param options - The tree and session options for the Guest.
	 * @returns The initialized Guest.
	 */
	public static async create(options: GuestOptions): Promise<Guest> {
		const guest = new Guest(options);
		await guest.initialized.promise;
		return guest;
	}

	private initialize(message: HostInitializationMessage): void {
		if (this.synchronization !== undefined) {
			throw new SandboxProtocolError("The Guest received duplicate initialization.");
		}
		const content: ViewContent = {
			tree: message.tree as ViewContent["tree"],
			schema: message.schema as ViewContent["schema"],
			idCompressor: this.idCompressor,
		};
		const hostTree = createIndependentTreeCheckout({
			...this.treeOptions,
			content,
		});
		const synchronization = new GuestSynchronization(
			hostTree,
			{
				baseRevision: message.baseRevision,
				mainRevision: message.mainRevision,
				trunkRevision: message.trunkRevision,
				commits: message.commits,
			},
			(protocolMessage) => this.postMessage(protocolMessage),
			(action) => this.session.run(action),
			(error) => this.session.fail(error),
			this.logger,
		);
		this.synchronization = synchronization;
		this.viewableTree = {
			viewWith<TRoot extends ImplicitFieldSchema>(
				config: TreeViewConfiguration<TRoot>,
			): TreeView<TRoot> {
				return synchronization.checkout.viewWithRetainedCheckout(config);
			},
		};
		this.initialized.resolver();
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.session.dispose();
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		const synchronization = this.synchronization;
		synchronization?.dispose();

		// TODO: Support cleanup of already-broken views and invalidation of retained node references.

		// The synchronization leaves the tree alive, making it possible to save or stash unsaved changes.
		// Currently we do no such thing and just dispose of it, but that could change in the future.
		synchronization?.checkout.dispose();
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
		return this.synchronization?.updateHostPromise;
	}
}
