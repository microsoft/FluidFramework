/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail, unreachableCase } from "@fluidframework/core-utils/internal";
import {
	deserializeIdCompressor,
	SerializationVersion,
	type SerializedIdCompressorWithOngoingSession,
} from "@fluidframework/id-compressor/internal";
import {
	createChildLogger,
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

	/** Terminal failure requiring application-managed Host and Guest recreation, if this session failed. */
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
	 * Stops Guest edits and releases local resources synchronously.
	 *
	 * @remarks
	 * Pending change acknowledgments reject, even if the Host later applies previously sent changes.
	 * Changes that were never sent may be lost.
	 *
	 * After a failure, the application can inspect the authoring view, if usable,
	 * before calling this method.
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
	private disposed = false;

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
			if (this.#synchronization === undefined) {
				throw new SandboxProtocolError(
					`Guest received a message with type ${JSON.stringify(message.type)} before initialization.`,
				);
			}
			switch (message.type) {
				case "hostUpdate": {
					return this.#synchronization.receiveHostUpdate(message);
				}
				case "hostIdRange": {
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
				this.#synchronization?.stop(error);
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

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.#synchronization?.dispose();
		this.session.dispose();
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
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
