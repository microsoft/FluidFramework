/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import {
	deserializeIdCompressor,
	SerializationVersion,
	type SerializedIdCompressorWithOngoingSession,
} from "@fluidframework/id-compressor/internal";
import {
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { DiscriminatedUnionDispatcher, type ICodecOptions } from "../codec/index.js";
import type { ForestOptions, ViewContent } from "../shared-tree/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Guest requires its independent tree's checkout.
import { createIndependentTreeCheckout } from "../shared-tree/independentView.js";
import type {
	ImplicitFieldSchema,
	TreeView,
	TreeViewAlpha,
	TreeViewConfiguration,
	ViewableTree,
} from "../simple-tree/index.js";

import {
	type GuestToHostMessage,
	getTransportBuffer,
	guestToHostMessageValidator,
	type HostInitializationMessage,
	hostToGuestMessageValidator,
	makePromiseWithResolvers,
	SandboxProtocolError,
	throwProtocolError,
	type ValidatedHostToGuestMessage,
} from "./common.js";
import { GuestTransportCodec } from "./guestTransport.js";
import { GuestSynchronization } from "./guestSynchronization.js";
import type { Sandboxing } from "./sandboxing.js";
import { SandboxSessionEndpoint } from "./session.js";
import { normalizeTransportData } from "./transport.js";

/**
 * Implementation of {@link Sandboxing.Guest}.
 */
export class GuestImplementation implements Sandboxing.Guest {
	private readonly codec: GuestTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private readonly treeOptions: ForestOptions & ICodecOptions;

	/**
	 * The port connecting this Guest to the Host.
	 *
	 * @privateRemarks
	 * The odd typing here is intentional and important.
	 * Without it, we take an implicit dependency on DOM types, which may not be available in all environments.
	 */
	private readonly port: InstanceType<typeof MessagePort>;

	private readonly logger: TelemetryLoggerExt;
	#synchronization: GuestSynchronization | undefined;
	private viewableTree: ViewableTree | undefined;
	private readonly initialized = makePromiseWithResolvers();
	private disposed = false;

	private readonly messageDispatcher = new DiscriminatedUnionDispatcher<
		ValidatedHostToGuestMessage,
		[],
		void
	>({
		hostInitialization: (message) => {
			this.initialize(message);
		},
		hostUpdate: (message) => {
			this.getSynchronizationForMessage("Host update").receiveHostUpdate(message);
		},
		hostIdRange: (message) => {
			this.getSynchronizationForMessage("Host ID range").receiveHostIdRange(message);
		},
		guestChangeAck: (message) => {
			this.getSynchronizationForMessage("change acknowledgment").receiveChangeAck(message);
		},
		blobResponse: (message) => {
			this.getSynchronizationForMessage("blob response");
			const blob = getTransportBuffer(message.blob);
			assert(blob !== undefined, "Validated blob placeholder must have a registered buffer");
			const response: object = Object.create(null);
			this.codec.receiveBlobResponse(
				Object.assign(response, { requestId: message.requestId, blob }),
			);
		},
		blobResponseError: (message) => {
			this.getSynchronizationForMessage("blob response error");
			this.codec.receiveBlobResponse(message);
		},
		sessionFailure: (message) => {
			this.session.fail(new Error(message.error), false);
		},
	});

	/** Internal synchronization state exposed for testing. */
	public get synchronization(): GuestSynchronization {
		return this.#synchronization ?? fail(0xd59 /* Guest accessed before initialization */);
	}

	public get tree(): ViewableTree {
		return this.viewableTree ?? fail(0xd5a /* Guest accessed before initialization */);
	}

	/** Receives and routes protocol messages from the Host. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		this.session.run(() => {
			const normalized = this.codec.decode(event.data);
			if (!hostToGuestMessageValidator.check(normalized)) {
				throw new SandboxProtocolError("Invalid Host and Guest protocol message.");
			}
			this.messageDispatcher.dispatch(normalized);
		});
	};

	private getSynchronizationForMessage(messageName: string): GuestSynchronization {
		if (this.#synchronization === undefined) {
			throw new SandboxProtocolError(
				`The Guest received a ${messageName} before initialization.`,
			);
		}
		return this.#synchronization;
	}

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
	}: Sandboxing.GuestOptions) {
		this.treeOptions = treeOptions;
		this.port = port;
		this.logger = createChildLogger({ logger, namespace: "Guest" });
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
	public static async create(options: Sandboxing.GuestOptions): Promise<GuestImplementation> {
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
		try {
			this.session.dispose();
		} finally {
			// Even if stopping pending work fails, remove the listeners and release both
			// checkouts before propagating the error.
			this.port.removeEventListener("message", this.onMessage);
			this.port.removeEventListener("messageerror", this.onMessageError);
			this.#synchronization?.dispose();
		}
	}

	public get error(): Error | undefined {
		return this.session.error;
	}

	private postMessage(message: GuestToHostMessage): void {
		const normalized = normalizeTransportData(message);
		if (!guestToHostMessageValidator.check(normalized)) {
			throw new SandboxProtocolError("Invalid Host and Guest protocol message.");
		}
		this.port.postMessage(this.codec.encode(normalized));
	}

	public get updateHostPromise(): Promise<void> | undefined {
		this.session.breaker.use();
		return this.#synchronization?.updateHostPromise;
	}
}
