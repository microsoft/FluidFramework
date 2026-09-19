/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	generation,
	LayerCompatibilityPolicyWindowMonths,
	type ILayerCompatDetails,
	type ILayerCompatSupportRequirements,
} from "@fluid-internal/client-utils";
import type { IEventTransformer, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { ISummaryTree } from "@fluidframework/driver-definitions";
import type {
	ConnectionMode,
	IClient,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentServiceFactory,
	IResolvedUrl,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import { SeaDeltaConnection, SeaDeltaStorage } from "./delta.js";
import {
	documentId,
	bytesToHex,
	encoder,
	Events,
	externalClientId,
	projectOperation,
	remoteClientId,
	type DeltaConnectionLifecycle,
} from "./lifecycleHelpers.js";
import { SeaDocumentStorage } from "./storage.js";
import type { SeaDriverClient } from "./wasmClient.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * SEA's supported features and generation at the Fluid loader boundary.
 * @internal
 */
export const seaDriverCompatDetailsForLoader: ILayerCompatDetails = {
	pkgVersion,
	generation,
	supportedFeatures: new Set<string>(),
};

/**
 * Requirements the loader validates on SEA's behalf before creating a document service.
 * @internal
 */
export const seaDriverCompatRequirementsForLoader: ILayerCompatSupportRequirements = {
	minSupportedGeneration: Math.max(
		0,
		generation - LayerCompatibilityPolicyWindowMonths.NewDriverOldLoader,
	),
	requiredFeatures: [],
};

/**
 * Creates a generated or injected protocol client for one logical Fluid client.
 * @internal
 */
export type WasmClientFactory = (
	resolvedUrl: IResolvedUrl,
	clientId: string,
) => Promise<SeaDriverClient>;

/**
 * Optional observability hooks for the minimal driver harness.
 * @internal
 */
export interface MinimalWasmDriverOptions {
	/** Receives projected-subscription failures before Fluid is disconnected. */
	readonly onSynchronizationError?: (error: unknown) => void;
	/** Receives each explicit or subscription-driven projected message batch. */
	readonly onSynchronized?: (
		clientId: string,
		messages: readonly ISequencedDocumentMessage[],
	) => void;
	/** Receives each opened delta connection for lifecycle probes. */
	readonly onDeltaConnection?: (connection: SeaDeltaConnection) => void;
	/** Maximum operations delivered in one projected-subscription event. */
	readonly subscriptionBatchMaxOperations?: number;
	/** Maximum aggregate operation payload bytes delivered in one subscription event. */
	readonly subscriptionBatchMaxPayloadBytes?: number;
}

/**
 * Document-scoped Fluid service sharing one generated client and lifecycle.
 * @internal
 */
export class SeaDocumentService extends Events implements IDocumentService {
	/** Registers a Fluid document-service event listener. */
	public readonly on = this.addListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	/** Registers a one-shot Fluid document-service event listener. */
	public readonly once = this.onceListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	/** Removes a Fluid document-service event listener. */
	public readonly off = this.removeListener as unknown as IEventTransformer<
		this,
		IDocumentServiceEvents
	>;
	/** Requests protocol-tree summarization from Fluid's runtime. */
	public readonly policies = { summarizeProtocolTree: true };
	/** Resolved generated client after successful creation. */
	private client: SeaDriverClient | undefined;
	/** In-flight or completed generated client creation. */
	private clientPromise: Promise<SeaDriverClient> | undefined;
	/** Lifecycle state shared by read and write delta connections. */
	private deltaLifecycle: DeltaConnectionLifecycle | undefined;
	/** Whether the shared generated client has archive-bound session authority. */
	private sessionOpened = false;
	/** Ordered session replacements; logical-stream operations remain independently concurrent. */
	private sessionTransition: Promise<void> = Promise.resolve();
	/** Stable author identity for storage access before a Fluid delta connection opens. */
	private readonly storageAuthor = encoder.encode(`storage-${crypto.randomUUID()}`);
	/** Fresh session identity for pre-delta storage access. */
	private readonly storageSession = encoder.encode(`storage-session-${crypto.randomUUID()}`);

	/** Creates a document service whose Fluid interfaces share one generated client. */
	public constructor(
		public resolvedUrl: IResolvedUrl,
		private readonly clientFactory: WasmClientFactory,
		private readonly options: MinimalWasmDriverOptions,
	) {
		super();
	}

	/** Connects the content-addressed storage adapter. */
	public async connectToStorage(): Promise<SeaDocumentStorage> {
		const client = await this.getClient("storage");
		await this.ensureStorageSession(client);
		return new SeaDocumentStorage(client);
	}

	/** Connects bounded projected-operation history. */
	public async connectToDeltaStorage(): Promise<SeaDeltaStorage> {
		const client = await this.getClient("history");
		await this.ensureStorageSession(client);
		const lifecycle = this.getDeltaLifecycle("read");
		return new SeaDeltaStorage(client, (operation) => projectOperation(lifecycle, operation));
	}

	/** Opens a delta connection, preserving lifecycle across read-to-write replacement. */
	public async connectToDeltaStream(client: IClient): Promise<SeaDeltaConnection> {
		const mode = client.mode ?? "write";
		const lifecycle = this.getDeltaLifecycle(mode);
		const logicalClientId = lifecycle.clientId;
		let clientId = mode === "read" ? `client-${crypto.randomUUID()}` : logicalClientId;
		const wasm = await this.getClient(clientId);
		if (wasm.announceMembership !== undefined) clientId = `client-${crypto.randomUUID()}`;
		const session = encoder.encode(
			wasm.announceMembership === undefined
				? `${clientId}-session-${crypto.randomUUID()}`
				: clientId,
		);
		const connection = new SeaDeltaConnection(
			clientId,
			lifecycle,
			session,
			documentId(this.resolvedUrl),
			wasm,
			client,
			mode,
			[{ clientId, client }],
			this.options.onSynchronizationError,
			this.options.onSynchronized,
			this.options.subscriptionBatchMaxOperations,
			this.options.subscriptionBatchMaxPayloadBytes,
		);
		await this.transitionSession(async () => {
			await wasm.openSession(
				documentId(this.resolvedUrl),
				lifecycle.writer,
				session,
				lifecycle.cursor,
			);
			await connection.open(true);
		});
		this.options.onDeltaConnection?.(connection);
		return connection;
	}

	/** Disconnects the shared generated client. */
	public dispose(): void {
		this.client?.disconnect();
	}

	/** Creates this service's document before initial summary upload. */
	public async createDocument(): Promise<void> {
		const client = await this.getClient("create");
		const document = await client.create();
		const id = bytesToHex(document);
		const url = new URL(this.resolvedUrl.url);
		const segments = url.pathname.split("/");
		segments[segments.length - 1] = id;
		url.pathname = segments.join("/");
		this.resolvedUrl = { ...this.resolvedUrl, id, url: url.toString() };
		await this.ensureStorageSession(client);
	}

	/** Lazily creates the one generated client shared by this service. */
	private getClient(clientId: string): Promise<SeaDriverClient> {
		this.clientPromise ??= this.clientFactory(this.resolvedUrl, clientId).then((client) => {
			this.client = client;
			return client;
		});
		return this.clientPromise;
	}

	/** Establishes temporary session authority for storage before delta connection creation. */
	private async ensureStorageSession(client: SeaDriverClient): Promise<void> {
		await this.transitionSession(async () => {
			if (!this.sessionOpened) {
				await client.openSession(
					documentId(this.resolvedUrl),
					this.storageAuthor,
					this.storageSession,
				);
			}
		});
	}

	/** Runs one session replacement after earlier storage or delta transitions settle. */
	private async transitionSession(operation: () => Promise<void>): Promise<void> {
		const result = this.sessionTransition.then(operation, operation);
		this.sessionTransition = result.then(
			() => {},
			() => {},
		);
		await result;
		this.sessionOpened = true;
	}

	/** Retains a service-unique SEA author across delta connections, independent of projected client labels. */
	private getDeltaLifecycle(mode: ConnectionMode): DeltaConnectionLifecycle {
		if (this.deltaLifecycle === undefined) {
			const clientId = mode === "read" ? remoteClientId : `client-${crypto.randomUUID()}`;
			this.deltaLifecycle = {
				clientId,
				remoteClientId: clientId === remoteClientId ? externalClientId : remoteClientId,
				writer: encoder.encode(mode === "read" ? `reader-${crypto.randomUUID()}` : clientId),
				cursor: undefined,
				lastPosition: undefined,
				remoteClientSequenceNumber: 0,
				remoteSequenceNumbers: new Map(),
			};
		}
		return this.deltaLifecycle;
	}
}

/**
 * Fluid document-service factory backed by generated or injected WASM clients.
 * @internal
 */
export class SeaDriver implements IDocumentServiceFactory {
	/** SEA's declaration for loader-to-driver compatibility validation. */
	public readonly ILayerCompatDetails = seaDriverCompatDetailsForLoader;
	/** Loader requirements validated by the loader on this driver's behalf. */
	public readonly ILayerCompatSupportRequirements = seaDriverCompatRequirementsForLoader;

	/** Creates a factory with optional lifecycle observability hooks. */
	public constructor(
		private readonly clientFactory: WasmClientFactory,
		private readonly options: MinimalWasmDriverOptions = {},
	) {}

	/** Creates a document and uploads its optional initial full summary. */
	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		resolvedUrl: IResolvedUrl,
		_logger?: ITelemetryBaseLogger,
		_clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		const service = new SeaDocumentService(resolvedUrl, this.clientFactory, this.options);
		try {
			await service.createDocument();
			const storage = await service.connectToStorage();
			if (createNewSummary !== undefined) {
				await storage.uploadInitialSummary(createNewSummary);
			}
			return service;
		} catch (error) {
			service.dispose();
			throw error;
		}
	}

	/** Creates a service for an existing resolved document URL. */
	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		_logger?: ITelemetryBaseLogger,
		_clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return new SeaDocumentService(resolvedUrl, this.clientFactory, this.options);
	}
}
