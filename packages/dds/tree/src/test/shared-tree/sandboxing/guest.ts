/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";

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
	type HostInitializationMessage,
	makePromiseWithResolvers,
	parseHostGuestMessage,
	SandboxProtocolError,
	throwProtocolError,
} from "./common.js";
import { GuestTransportCodec } from "./guestTransport.js";
import { GuestSynchronization } from "./guestSynchronization.js";
import { SandboxSessionEndpoint } from "./session.js";
import { normalizeTransportData } from "./transport.js";

/**
 * An independent TreeView synchronized with a Host through a message protocol.
 *
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export class Guest<const TSchema extends ImplicitFieldSchema> {
	private readonly codec: GuestTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private synchronization: GuestSynchronization<TSchema> | undefined;
	private readonly initialized = makePromiseWithResolvers();
	private disposed = false;

	/** The independent view on the Guest. Available after {@link Guest.create} resolves. */
	public get view(): TreeViewAlpha<TSchema> {
		return this.synchronization?.view ?? fail("Guest accessed before initialization");
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
					`The Guest received ${message.type} before initialization.`,
				);
			}
			switch (message.type) {
				case "hostUpdate": {
					this.synchronization.receiveHostUpdate(message);
					break;
				}
				case "guestChangeAck": {
					this.synchronization.receiveChangeAck(message);
					break;
				}
				case "blobResponse": {
					this.codec.receiveBlobResponse(message);
					break;
				}
				case "blobRequest": {
					throw new SandboxProtocolError("The Guest cannot receive blob requests.");
				}
				case "guestChange":
				case "hostUpdateAck": {
					throw new SandboxProtocolError(`The Guest cannot receive ${message.type} messages.`);
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

	private constructor(
		private readonly config: TreeViewConfiguration<TSchema>,
		private readonly options: ForestOptions & ICodecOptions,
		private readonly idCompressor: IIdCompressor,
		/** The Guest endpoint of the Host and Guest message channel. */
		private readonly port: MessagePort,
		/** The Guest-scoped logger for diagnostic telemetry. */
		private readonly logger: TelemetryLoggerExt,
		// TODO: Replace this callback `Listenable` event API for session errors and closure.
		/** Reports terminal session failure asynchronously; the application must recreate the pair. */
		handleProtocolError: (error: Error) => void = throwProtocolError,
	) {
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
	 */
	public static async create<const TSchema extends ImplicitFieldSchema>(
		config: TreeViewConfiguration<TSchema>,
		options: ForestOptions & ICodecOptions,
		idCompressor: IIdCompressor,
		port: MessagePort,
		logger: TelemetryLoggerExt,
		handleProtocolError: (error: Error) => void = throwProtocolError,
	): Promise<Guest<TSchema>> {
		const guest = new Guest(config, options, idCompressor, port, logger, handleProtocolError);
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
		const hostView = independentInitializedView(this.config, this.options, content);
		this.synchronization = new GuestSynchronization(
			hostView,
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
		synchronization?.view.dispose();
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
