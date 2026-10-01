/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	deserializeIdCompressor,
	SerializationVersion,
	type SerializedIdCompressorWithOngoingSession,
} from "@fluidframework/id-compressor/internal";
import {
	createChildLogger,
	UsageError,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import type { ICodecOptions } from "../../../codec/index.js";
import type { ForestOptions, ViewContent } from "../../../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Guest requires its independent tree's checkout.
import { createIndependentTreeCheckout } from "../../../shared-tree/independentView.js";
import type {
	ImplicitFieldSchema,
	TreeView,
	TreeViewAlpha,
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
 * An {@link ViewableTree} synchronized with a Host through a `MessagePort`.
 * @remarks
 * Create using {@link createGuest}.
 * Initialization gives the Guest a serialized child ID space shard, not the Host's live compressor.
 * @sealed
 */
export interface Guest {
	/**
	 * The independent tree synchronized with the Host.
	 * @remarks Available after {@link createGuest} resolves.
	 */
	readonly tree: ViewableTree;

	/**
	 * The terminal failure that requires application-managed Host and Guest recreation,
	 * if this session failed.
	 */
	readonly error: Error | undefined;

	/**
	 * A promise for Host acknowledgment of all pending Guest changes, or `undefined`
	 * if there are no pending changes.
	 *
	 * @remarks
	 * If the Guest makes more changes while the promise is pending, the same promise
	 * waits for those changes too. The promise rejects on failure or disposal.
	 * Access after failure throws.
	 */
	readonly updateHostPromise: Promise<void> | undefined;

	/**
	 * Stops Guest edits and waits for the Host to reclaim the child ID space shard.
	 *
	 * @remarks
	 * Use this method for normal teardown. It stops new edits and disposes the authoring
	 * checkout immediately. After the Host acknowledges earlier Guest changes, the Guest
	 * sends a disposal token. The Guest releases its remaining resources when the Host
	 * confirms shard reclamation. A second call throws, even while close is in progress.
	 * If the connection fails or the acknowledgment never arrives, call {@link Guest.dispose}
	 * to release local resources. The Host might keep the child ID space shard reserved.
	 *
	 * @returns A promise that resolves when the Host confirms shard reclamation.
	 * @throws {@link UsageError} if close has already started or the Guest is disposed.
	 */
	close(): Promise<void>;

	/**
	 * Releases the Guest's local resources without waiting for the Host.
	 *
	 * @remarks
	 * Use {@link Guest.close} for normal teardown: it lets the Host reclaim the child ID
	 * space shard and then disposes the Guest. Calling this method after a successful close
	 * has no effect, so it is also safe for unconditional cleanup after attempting close.
	 *
	 * If the session fails, the connection is lost, or close cannot complete, call this
	 * method to release local resources. When called before close completes, it stops the
	 * session without sending a shard disposal token. The Host keeps the child ID space
	 * shard reserved unless it already received a valid close token.
	 *
	 * Calling this method before `close` completes rejects pending work.
	 * After a failure, the application can inspect the authoring view, if it is usable,
	 * before calling this method to release both checkouts.
	 *
	 * Repeated calls have no effect.
	 */
	dispose(): void;
}

/**
 * Creates and connects a {@link Guest} to a {@link Host} using the provided options.
 *
 * @param options - The options for creating the Guest, including tree and codec options.
 *
 * @returns A promise that resolves to the created Guest instance.
 */
export async function createGuest(options: GuestOptions): Promise<Guest> {
	return GuestImplementation.create(options);
}

/**
 * The Guest's local lifecycle and the promise for an orderly close.
 * @remarks
 * `closing` waits for earlier Guest changes before sending the shard disposal token.
 * `awaitingCloseAck` means the token was sent, so the Guest can accept the `guestCloseAck` message from the Host.
 *
 * A failure rejects the close promise but leaves the Guest in its current phase
 * until the application calls {@link Guest.dispose} to release local resources.
 * `disposed` does not imply that the Host reclaimed the shard.
 */
type GuestState =
	| { readonly phase: "active" }
	| {
			readonly phase: "closing";
			readonly completion: ReturnType<typeof makePromiseWithResolvers>;
	  }
	| {
			readonly phase: "awaitingCloseAck";
			readonly completion: ReturnType<typeof makePromiseWithResolvers>;
	  }
	| { readonly phase: "disposed" };

/**
 * Implementation of {@link Guest}.
 */
export class GuestImplementation implements Guest {
	private readonly codec: GuestTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private readonly treeOptions: ForestOptions & ICodecOptions;
	private readonly port: MessagePort;
	private readonly logger: TelemetryLoggerExt;
	#synchronization: GuestSynchronization | undefined;
	private viewableTree: ViewableTree | undefined;
	private readonly initialized = makePromiseWithResolvers();

	private state: GuestState = { phase: "active" };

	/** Internal synchronization state exposed for testing. */
	public get synchronization(): GuestSynchronization {
		return this.#synchronization ?? fail("Guest accessed before initialization");
	}

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
			if (message.type === "guestCloseAck") {
				if (this.state.phase !== "awaitingCloseAck") {
					throw new SandboxProtocolError("Unexpected Guest close acknowledgment.");
				}
				// The Host has reclaimed the ID space shard. Final disposal can now release
				// the hidden Host branch.
				this.state.completion.resolver();
				this.dispose();
				return;
			}
			if (this.#synchronization === undefined) {
				throw new SandboxProtocolError(
					`Guest received a message with type ${JSON.stringify(message.type)} before initialization.`,
				);
			}
			switch (message.type) {
				case "hostUpdate": {
					// The authoring view is disposed during close. The Host will discard its
					// outstanding updates when it processes the Guest's close message.
					if (this.state.phase !== "active") {
						return;
					}
					return this.#synchronization.receiveHostUpdate(message);
				}
				case "hostIdRange": {
					if (this.state.phase !== "active") {
						return;
					}
					return this.#synchronization.receiveHostIdRange(message);
				}
				case "guestChangeAck": {
					return this.#synchronization.receiveChangeAck(message);
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
		treeOptions,
		port,
		logger,
		handleProtocolError = throwProtocolError,
	}: GuestOptions) {
		this.treeOptions = treeOptions;
		this.port = port;
		this.logger = logger ?? createChildLogger({ namespace: "Guest" });
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				// A failure can occur during a tree event. Do not dispose the views in this callback.
				// Guest.dispose() releases them when the application cleans up.
				this.#synchronization?.closeForError(error);
				this.codec.dispose(error);
				this.initialized.rejecter(error);
				if (this.state.phase === "closing" || this.state.phase === "awaitingCloseAck") {
					this.state.completion.rejecter(error);
				}
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
	public static async create(options: GuestOptions): Promise<GuestImplementation> {
		const guest = new GuestImplementation(options);
		await guest.initialized.promise;
		return guest;
	}

	private initialize(message: HostInitializationMessage): void {
		if (this.#synchronization !== undefined) {
			throw new SandboxProtocolError("The Guest received duplicate initialization.");
		}
		let idCompressor: ReturnType<typeof deserializeIdCompressor>;
		try {
			// The envelope only checks for a string. Deserialization validates its format.
			idCompressor = deserializeIdCompressor(
				message.idCompressor as SerializedIdCompressorWithOngoingSession,
				SerializationVersion.V3,
			);
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
			idCompressor,
			(protocolMessage) => this.postMessage(protocolMessage),
			(action) => this.session.run(action),
			(error) => this.session.fail(error),
			this.logger,
		);
		this.#synchronization = synchronization;
		this.viewableTree = {
			viewWith<TRoot extends ImplicitFieldSchema>(
				config: TreeViewConfiguration<TRoot>,
			): TreeView<TRoot> {
				const view: TreeViewAlpha<TRoot> = synchronization.checkout.viewWithInternal(
					config,
					false,
				);
				return view as TreeView<TRoot>;
			},
		};
		this.initialized.resolver();
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async -- Invalid calls must throw and the view must be disposed synchronously.
	public close(): Promise<void> {
		if (this.state.phase === "disposed") {
			throw new UsageError("Cannot close a disposed Guest.");
		}
		if (this.state.phase !== "active") {
			throw new UsageError("Guest is already closing.");
		}
		this.session.breaker.use();
		const synchronization =
			this.#synchronization ?? fail("Guest closed before initialization");
		const completion = makePromiseWithResolvers();
		this.state = { phase: "closing", completion };
		this.session.run(() => {
			const token = synchronization.close();
			token.then(
				(idSpaceShardToken) =>
					this.session.run(() => {
						assert(idSpaceShardToken.disposed, "Guest close requires a disposal token");
						// The Host reclaims the shard only after it receives this token.
						this.postMessage({
							type: "guestClose",
							idSpaceShardToken: { ...idSpaceShardToken, disposed: true },
						});
						this.state = { phase: "awaitingCloseAck", completion };
					}),
				(error: unknown) => this.session.fail(error),
			);
		});
		return completion.promise;
	}

	public dispose(): void {
		if (this.state.phase === "disposed") {
			return;
		}
		this.session.dispose();
		this.state = { phase: "disposed" };
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.#synchronization?.dispose();
	}

	public get error(): Error | undefined {
		return this.session.error;
	}

	private postMessage(message: HostGuestMessage): void {
		const normalized = normalizeTransportData(message);
		parseHostGuestMessage(normalized);
		this.port.postMessage(this.codec.encode(normalized));
	}

	public get updateHostPromise(): Promise<void> | undefined {
		this.session.breaker.use();
		return this.#synchronization?.updateHostPromise;
	}
}
