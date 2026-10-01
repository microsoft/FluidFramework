/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, unreachableCase } from "@fluidframework/core-utils/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";
import {
	deserializeIdCompressor,
	SerializationVersion,
} from "@fluidframework/id-compressor/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export interface GuestOptions<TSchema extends ImplicitFieldSchema>
	extends SandboxEndpointOptions {
	/** The schema configuration for the Guest's tree view. */
	readonly config: TreeViewConfiguration<TSchema>;
	/** The forest and codec options used to initialize the Guest's tree view. */
	readonly treeOptions: ForestOptions & ICodecOptions;
}

/**
 * An independent TreeView synchronized with a Host through a message protocol.
 *
 * @remarks
 * The Guest owns the port, protocol routing, and session lifetime.
 * During initialization it passes the child ID space shard to {@link GuestSynchronization},
 * which owns the shard, hidden Host branch, and synchronization.
 * GuestSynchronization disposes the authoring view during orderly close.
 * On failure before orderly close, the view remains available for inspection
 * if it is still usable, until application-managed cleanup.
 *
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export class Guest<const TSchema extends ImplicitFieldSchema> {
	private readonly codec: GuestTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private readonly config: TreeViewConfiguration<TSchema>;
	private readonly treeOptions: ForestOptions & ICodecOptions;
	private readonly port: MessagePort;
	private readonly logger: TelemetryLoggerExt;
	private synchronization: GuestSynchronization<TSchema> | undefined;
	private readonly initialized = makePromiseWithResolvers();
	/** Set when close starts, to reject another close and complete the acknowledgment handshake. */
	private closeInProgress: ReturnType<typeof makePromiseWithResolvers> | undefined;
	/** Whether the Guest has sent its disposal token and can accept the Host's close acknowledgment. */
	private closeSent = false;
	/** Closed can follow failure without disposing the view; only orderly close sets this flag. */
	private authoringViewDisposedOnClose = false;
	private disposed = false;

	/**
	 * The Guest's authoring view, available after {@link Guest.create} resolves.
	 *
	 * @remarks
	 * A failure does not dispose the view, so it can be inspected before application-managed cleanup
	 * if it is still usable. Do not edit it after a failure.
	 * Orderly close and {@link Guest.dispose} dispose the view.
	 */
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
			if (message.type === "guestCloseAck") {
				if (this.closeInProgress === undefined || !this.closeSent) {
					throw new SandboxProtocolError("Unexpected Guest close acknowledgment.");
				}
				// The Host has reclaimed the ID space shard. Final disposal can now release
				// the hidden Host branch.
				this.closeInProgress.resolver();
				this.dispose();
				return;
			}
			if (this.synchronization === undefined) {
				throw new SandboxProtocolError(
					`Guest received a message with type ${JSON.stringify(message.type)} before initialization.`,
				);
			}
			switch (message.type) {
				case "hostUpdate": {
					// The authoring view is disposed during close. The Host will discard its
					// outstanding updates when it processes the Guest's close message.
					if (this.closeInProgress !== undefined) {
						return;
					}
					return this.synchronization.receiveHostUpdate(message);
				}
				case "hostIdRange": {
					if (this.closeInProgress !== undefined) {
						return;
					}
					return this.synchronization.receiveHostIdRange(message);
				}
				case "guestChangeAck": {
					return this.synchronization.receiveChangeAck(message);
				}
				case "blobResponse": {
					return this.codec.receiveBlobResponse(message);
				}
				case "blobRequest":
				case "guestChange":
				case "guestClose":
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
		config,
		treeOptions,
		port,
		logger,
		handleProtocolError = throwProtocolError,
	}: GuestOptions<TSchema>) {
		this.config = config;
		this.treeOptions = treeOptions;
		this.port = port;
		this.logger = logger;
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				// A failure can occur during a tree event. Do not dispose the views in this callback.
				// Guest.dispose() releases them when the application cleans up.
				this.synchronization?.closeForError(error);
				this.codec.dispose(error);
				this.initialized.rejecter(error);
				this.closeInProgress?.rejecter(error);
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
	 * @param options - The tree configuration and session options for the Guest.
	 * @returns The initialized Guest.
	 */
	public static async create<const TSchema extends ImplicitFieldSchema>(
		options: GuestOptions<TSchema>,
	): Promise<Guest<TSchema>> {
		const guest = new Guest(options);
		await guest.initialized.promise;
		return guest;
	}

	private initialize(message: HostInitializationMessage): void {
		if (this.synchronization !== undefined) {
			throw new SandboxProtocolError("The Guest received duplicate initialization.");
		}
		let idCompressor: ReturnType<typeof deserializeIdCompressor>;
		try {
			idCompressor = deserializeIdCompressor(message.idCompressor, SerializationVersion.V3);
			// A second root with the same session ID would allocate colliding IDs.
			if (idCompressor.getShardSyncToken() === undefined) {
				throw new SandboxProtocolError(
					"Guest initialization requires a child ID space shard.",
				);
			}
		} catch (error) {
			throw new SandboxProtocolError("Invalid serialized sandbox ID compressor.", {
				cause: error,
			});
		}
		const content: ViewContent = {
			tree: message.tree as ViewContent["tree"],
			schema: message.schema as ViewContent["schema"],
			idCompressor,
		};
		const hostView = independentInitializedView(this.config, this.treeOptions, content);
		this.synchronization = new GuestSynchronization(
			hostView,
			{
				baseRevision: message.baseRevision,
				mainRevision: message.mainRevision,
				trunkRevision: message.trunkRevision,
				commits: message.commits,
			},
			idCompressor,
			(protocolMessage) => this.postMessage(protocolMessage),
			(action) => this.session.run(action),
			(error) => this.session.fail(error),
			this.logger,
		);
		this.initialized.resolver();
	}

	/**
	 * Stops the Guest, then waits for the Host to reclaim its ID space shard.
	 *
	 * @remarks
	 * New edits stop immediately, and the tree view is disposed.
	 * Changes already sent to the Host must be acknowledged before the Guest sends
	 * its disposal token. The Guest disposes its session after the Host acknowledges
	 * shard reclamation. A subsequent call throws, including while close is in progress.
	 * Use {@link Guest.dispose} to abort locally if the channel fails or a close
	 * acknowledgment never arrives. Without a valid disposal token, the Host keeps
	 * the shard reserved.
	 *
	 * @returns A promise that resolves when the Host confirms the shard was reclaimed.
	 * @throws {@link UsageError} if close has already started or the Guest is disposed.
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async -- Invalid calls must throw and the view must be disposed synchronously.
	public close(): Promise<void> {
		if (this.disposed) {
			throw new UsageError("Cannot close a disposed Guest.");
		}
		if (this.closeInProgress !== undefined) {
			throw new UsageError("Guest is already closing.");
		}
		this.session.breaker.use();
		const synchronization = this.synchronization ?? fail("Guest closed before initialization");
		const completion = makePromiseWithResolvers();
		this.closeInProgress = completion;
		this.session.run(() => {
			const token = synchronization.close();
			this.authoringViewDisposedOnClose = true;
			token.then(
				(idSpaceShardToken) =>
					this.session.run(() => {
						// The Host reclaims the shard only after it receives this token.
						this.postMessage({ type: "guestClose", idSpaceShardToken });
						this.closeSent = true;
					}),
				(error: unknown) => this.session.fail(error),
			);
		});
		return completion.promise;
	}

	/**
	 * Disposes the Guest's session resources without reclaiming its child ID space shard.
	 *
	 * @remarks
	 * An orderly {@link Guest.close} disposes the Guest after the Host acknowledges
	 * shard reclamation. Calling this method earlier aborts the local session and
	 * rejects pending work. It does not send a disposal token: the Host keeps the
	 * shard reserved unless it already received a valid token from a close attempt.
	 * After a failure, the application can inspect the authoring view, if it is still
	 * usable, before calling this method to dispose it and the hidden Host branch.
	 * Repeated calls have no effect.
	 */
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

		// On failure or abort, synchronization leaves the view available.
		// Future cleanup could save or inspect unsaved changes before disposing it.
		if (!this.authoringViewDisposedOnClose) {
			synchronization?.view.dispose();
		}
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
