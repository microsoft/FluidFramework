/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ConnectionState,
	type IContainer,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/internal";
import { ContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { IRequest } from "@fluidframework/core-interfaces";
import {
	ErasedTypeImplementation,
	type ErasedBaseType,
} from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import {
	featureVersion,
	type DataStoreKind,
	type DataStoreRegistry,
	type FluidContainerAttached,
	type FluidContainerWithService,
	type Registry,
	type ServiceClient,
	type ServiceOptions,
} from "@fluidframework/driver-definitions/internal";
import {
	type ContainerRuntimeLoader,
	type ContainerRuntimeLoaderParams,
	makeCodeLoader,
	rootDataStoreId,
	ServiceClientImplementation,
	ServiceContainerBase,
} from "@fluidframework/runtime-utils/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import type { ITestDbFactory } from "@fluidframework/server-test-utils";
import { UsageError } from "@fluidframework/driver-utils/internal";
import { v4 as uuid } from "uuid";

import { LocalDocumentServiceFactory } from "./localDocumentServiceFactory.js";
import { createLocalResolverCreateNewRequest, LocalResolver } from "./localResolver.js";
import { LocalSessionStorageDbFactory } from "./localSessionStorageDb.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * Starts and returns a new {@link EphemeralService}.
 * @param isDefault - Whether this service should saved as the default service for {@link cleanupEphemeralService} to cleanup.
 * Defaults to true.
 * @remarks
 * The returned service owns an in-memory server and holds the documents created through clients connected to it.
 * {@link cleanupEphemeralService} can be used to ensure the service is properly cleaned up (a no-op if stopped/closed already).
 *
 * As a service, it may start timers which may require an explicit `close` to fully free.
 * @alpha
 */
export function startEphemeralService(isDefault = true): EphemeralService {
	if (isDefault && defaultEphemeralService) {
		throw new UsageError("A default EphemeralService is already running");
	}

	const service = new LocalServiceImplementation();
	if (isDefault) {
		defaultEphemeralService = service;
	}
	return service;
}

/**
 * Gets the session-storage-backed local Fluid service for the current JavaScript realm, creating it on first use.
 *
 * @remarks
 * Attached documents remain available after a page reload within the same browser tab. Repeated calls return
 * the same service instance within the current JavaScript realm.
 *
 * This service is only available in browser environments that provide `sessionStorage`.
 * @returns A local service backed by browser session storage.
 * @alpha
 */
export function getSessionService(): SessionService {
	if (typeof sessionStorage === "undefined") {
		throw new UsageError("SessionService requires browser session storage");
	}
	return (sessionService ??= new LocalServiceImplementation(
		new LocalSessionStorageDbFactory(),
	));
}

/**
 * Cleans up the service passed in {@link startEphemeralService}, or the {@link getDefaultEphemeralService|default} if none is passed.
 * @remarks
 * This closes the service, and all its containers.
 * This is a good way to ensure the service and its containers leave no lingering timers
 * which could leak memory, trigger asynchronous work or prevent a clean process exit.
 * @alpha
 */
export async function cleanupEphemeralService(service?: EphemeralService): Promise<void> {
	const toCleanup = service ?? defaultEphemeralService;
	if (toCleanup) {
		// TODO: we may want to make closing of containers a separate operation which is done here.
		await toCleanup.close();
	}
	if (toCleanup === defaultEphemeralService) {
		defaultEphemeralService = undefined;
	}
}

/**
 * Get the default {@link EphemeralService} if one has been {@link startEphemeralService|started}.
 * @throws If no default service is running.
 * @alpha
 */
export function getDefaultEphemeralService(): EphemeralService {
	if (defaultEphemeralService) {
		return defaultEphemeralService;
	}
	throw new UsageError("No default EphemeralService is running");
}

/**
 * Internal options for creating a local service client, extending
 * {@link @fluidframework/driver-definitions#ServiceOptions} with the service the client should connect to.
 * @input
 * @internal
 */
export interface LocalServiceOptions<TService extends LocalService = LocalService>
	extends ServiceOptions {
	/**
	 * The service instance to connect to.
	 */
	readonly service: TService;
}

/**
 * Internal options for creating a {@link LocalServiceClient} connected to an {@link EphemeralService}.
 * @input
 * @internal
 */
export interface EphemeralServiceOptions extends LocalServiceOptions<EphemeralService> {}

/**
 * A local Fluid service with an explicitly managed lifecycle.
 * @remarks
 * There are two implementations of this interface with different document lifetimes:
 * {@link EphemeralService} and {@link SessionService}.
 *
 * @typeParam TClient - The type of client this service creates.
 * @alpha @sealed
 */
export interface LocalService<out TClient extends ServiceClient = LocalServiceClient>
	extends ErasedBaseType<readonly ["LocalService", TClient]> {
	/**
	 * Lists the IDs of documents currently stored by this service.
	 */
	listDocumentIds(): Promise<readonly string[]>;

	/**
	 * Deletes a stored document.
	 *
	 * @remarks
	 * Deletion is only allowed when this service has no open containers because resetting the local
	 * server invalidates all of its active connections. Content-addressed summary data shared with other
	 * documents may be retained until {@link LocalService.deleteAllDocuments} is called.
	 *
	 * @param id - The ID of the document to delete.
	 */
	deleteDocument(id: string): Promise<void>;

	/**
	 * Deletes all documents stored by this service.
	 *
	 * @remarks
	 * Deletion is only allowed when this service has no open containers because resetting the local
	 * server invalidates all of its active connections.
	 */
	deleteAllDocuments(): Promise<void>;

	/**
	 * Drives all containers connected to this service toward convergence, processing pending operations and
	 * waiting for all dirty containers to save.
	 *
	 * @param timeoutMilliseconds - The maximum time to wait for containers to quiesce, in milliseconds. Defaults to 30_000.
	 *
	 * @privateRemarks
	 * This is a best-effort implementation simplified from `LoaderContainerTracker.ensureSynchronized`.
	 * Currently it does not perform receiver-side sequence-number quiescence or wait for join/leave (audience) ops.
	 * See `LoaderContainerTracker.ensureSynchronized` for the fuller version this is based on.
	 */
	synchronize(timeoutMilliseconds?: number): Promise<void>;

	/**
	 * Creates a client connected to this service.
	 *
	 * @param options - Collaboration options for the client.
	 */
	newClient(options: ServiceOptions): TClient;

	/**
	 * A client connected to this service using the default options.
	 */
	readonly defaultClient: TClient;
}

/**
 * An in-memory Fluid service that can produce connected {@link LocalServiceClient}s.
 * @remarks
 * All documents created through clients connected to a given `EphemeralService` are held in-memory by that service.
 * Closing the service (via {@link EphemeralService.close} or {@link cleanupEphemeralService}) closes the connections
 * to any remaining open containers, and cleans up the service's timers.
 *
 * Create one with {@link startEphemeralService}.
 *
 * Most {@link @fluidframework/driver-definitions#ServiceClient} implementations would take in a URL and credentials to connect to a service,
 * but that is not needed for the ephemeral in-memory service.
 * Instead this object representing the actual service instance is provided.
 * @privateRemarks
 * This is separated out from the actual {@link @fluidframework/driver-definitions#ServiceClient} object so that it's possible to create multiple service clients
 * connected to the same service.
 * Doing so is rarely necessary, but would be needed to test multiple clients collaborating on the same
 * document with different `oldestSupportedClient` values.
 * This also exposes a place to put APIs for preloading and exporting document contents in the future.
 *
 * This is an erased type: its only implementation is the module-private `LocalServiceImplementation`, which holds
 * the mutable server and container state so it does not appear on this public type.
 *
 * TODO: formalize this lifecycle with an interface which documents these stages.
 * Lifecycle:
 * The intended lifecycle of an {@link EphemeralService} follows roughly the same pattern as containers:
 *
 * 1. Open: accepts connections from {@link LocalServiceClient}s, which can create and load containers.
 * Might have timers and event registrations which can trigger asynchronous work, and retain the object in memory.
 *
 * 2. Closing: asynchronous transition from open to closed. New use should behave as it closed, but may be cleaning up or saving resources asynchronously.
 * Timers and event registrations may still be active, but should be cleaned up by the time the transition to closed completes.
 *
 * 3. Closed: no longer accepts connections from {@link LocalServiceClient}s, and all containers connected to it are closed.
 * Should have no subscriptions to events or timers which could retain it in memory or trigger asynchronous work.
 * The object can still be used in a limited capacity (typically just to inspect its status (e.g. `isClosed`), and to view (but not edit) the final state of any containers which were connected to it before it closed.)
 *
 * Events or errors can cause an open to closing transition. Any nonfunctional state, including error states, should be considered as closed (or closing which will transition to closed),
 * and meet the requirements of closed with regards to timers and events.
 *
 * @alpha @sealed
 */
export interface EphemeralService extends LocalService<LocalServiceClient<EphemeralService>> {
	/**
	 * Closes all containers connected to this service and releases its active resources.
	 *
	 * @remarks
	 * Closing is idempotent. Closing an ephemeral service permanently discards all documents it holds,
	 * so their IDs can no longer be loaded.
	 */
	close(): Promise<void>;
}

/**
 * A browser-local Fluid service that persists documents in session storage.
 *
 * @remarks
 * Its attached documents remain available after a page reload within the same browser tab. The service is
 * shared within the current JavaScript realm and intentionally has no close operation: its active resources
 * live until the realm is unloaded.
 *
 * Session storage is shared more broadly than JavaScript module state. Separate same-origin realms, such as
 * same-origin frames, or applications that load separate copies of this package can access the same stored
 * documents while running independent local servers. Concurrently editing the same document from such realms
 * is unsupported and may produce inconsistent stored state.
 *
 * Create one with {@link getSessionService}.
 * @alpha @sealed
 */
export interface SessionService extends LocalService<LocalServiceClient<SessionService>> {}

/**
 * The {@link defaultEphemeralService} if one has been {@link startEphemeralService|started}.
 */
let defaultEphemeralService: LocalServiceImplementation | undefined;

/**
 * The lazily created session service for this JavaScript realm.
 */
let sessionService: LocalServiceImplementation | undefined;

/**
 * The concrete implementation of local services.
 * @remarks
 * Kept module-private so its mutable state and internal helpers are not part of the public API.
 * Narrow a {@link LocalService} to it with `LocalServiceImplementation.narrow`.
 */
class LocalServiceImplementation
	extends ErasedTypeImplementation<
		LocalService<LocalServiceClientImplementation<LocalServiceImplementation>>
	>
	implements LocalService<LocalServiceClientImplementation<LocalServiceImplementation>>
{
	// A single server is shared by all containers connected to this service so they can communicate with each other.
	private server: ILocalDeltaConnectionServer;
	private documentServiceFactory: LocalDocumentServiceFactory;
	private readonly databaseFactory: ITestDbFactory;
	private readonly containers = new Set<EphemeralServiceContainer<unknown>>();
	private closed = false;
	private maintenanceInProgress = false;

	public constructor(databaseFactory?: ITestDbFactory) {
		super();
		this.server = LocalDeltaConnectionServer.create(databaseFactory);
		this.databaseFactory = this.server.testDbFactory;
		this.documentServiceFactory = new LocalDocumentServiceFactory(this.server);
		this.defaultClient = this.newClient();
	}
	public newClient(
		options?: Partial<ServiceOptions>,
	): LocalServiceClientImplementation<LocalServiceImplementation> {
		const finalOptions: LocalServiceOptions<LocalServiceImplementation> = {
			oldestSupportedClient: options?.oldestSupportedClient ?? featureVersion(pkgVersion),
			service: this,
		};
		return new LocalServiceClientImplementation(finalOptions);
	}
	public readonly defaultClient: LocalServiceClientImplementation<LocalServiceImplementation>;

	public async listDocumentIds(): Promise<readonly string[]> {
		this.ensureAvailable();
		const documentCollection = await this.server.databaseManager.getDocumentCollection();
		const documents = await documentCollection.findAll();
		return documents.map((document) => document.documentId);
	}

	public async deleteDocument(id: string): Promise<void> {
		await this.deleteDocuments(id);
	}

	public async deleteAllDocuments(): Promise<void> {
		await this.deleteDocuments();
	}

	public async close(): Promise<void> {
		if (this.closed) {
			return;
		}
		this.closed = true;

		// Close every open container via the same public close() path a user would use.
		// We might want to remove this.
		const toClose = [...this.containers];
		this.containers.clear();
		for (const c of toClose) {
			c.close();
		}

		// Shut down the in-memory server. Its timers (e.g. the Deli read-client idle `setInterval`) belong to the
		// server rather than any container, so closing containers alone would leave them running.
		await this.server.close();
	}

	private ensureAvailable(): void {
		if (this.closed) {
			throw new UsageError("Local service is closed");
		}
		if (this.maintenanceInProgress) {
			throw new UsageError("Local service document maintenance is already in progress");
		}
	}

	private async deleteDocuments(id?: string): Promise<void> {
		this.ensureAvailable();
		if (this.containers.size > 0) {
			throw new UsageError("Close all containers before deleting local service documents");
		}

		this.maintenanceInProgress = true;
		let serverClosed = false;
		try {
			await this.server.close();
			serverClosed = true;
			const databaseManager = this.server.databaseManager;
			const filter = id === undefined ? {} : { documentId: id };
			const historianDatabase = this.databaseFactory.testDatabase;
			const documentCollection = await databaseManager.getDocumentCollection();
			const checkpointCollection = await databaseManager.getCheckpointCollection();
			const deltaCollection = await databaseManager.getDeltaCollection(undefined, id);
			const scribeDeltaCollection = await databaseManager.getScribeDeltaCollection(
				undefined,
				id,
			);
			const deletions = [
				documentCollection.deleteMany(filter),
				checkpointCollection.deleteMany(filter),
				deltaCollection.deleteMany(filter),
				scribeDeltaCollection.deleteMany(filter),
				historianDatabase
					.collection("refs")
					.deleteMany(id === undefined ? {} : { _id: `heads/${id}` }),
			];
			if (id === undefined) {
				const nodeCollection = await databaseManager.getNodeCollection();
				deletions.push(
					nodeCollection.deleteMany({}),
					historianDatabase.collection("blobs").deleteMany({}),
					historianDatabase.collection("commits").deleteMany({}),
					historianDatabase.collection("trees").deleteMany({}),
				);
			}
			await Promise.all(deletions);
		} finally {
			if (serverClosed) {
				this.server = LocalDeltaConnectionServer.create(this.databaseFactory);
				this.documentServiceFactory = new LocalDocumentServiceFactory(this.server);
			}
			this.maintenanceInProgress = false;
		}
	}

	public async synchronize(timeoutMilliseconds = 30_000): Promise<void> {
		// Timeout to allow for better errors in the case of hangs.
		let timedOut = false;
		let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
		const deadline = new Promise<true>((resolve) => {
			deadlineTimer = setTimeout(() => {
				timedOut = true;
				resolve(true);
			}, timeoutMilliseconds);
		});

		try {
			// Require two consecutive quiescent passes (no dirty containers and no pending server work),
			// each separated by a macrotask turn, to give late side effects a chance to surface.
			let clean = 0;
			while (clean < 2) {
				if (timedOut) {
					throw new UsageError(
						`EphemeralService.synchronize timed out after ${timeoutMilliseconds}ms waiting for local containers to quiesce.`,
					);
				}

				// Yield a macrotask turn *first*, so the local server's scheduled broadcast send and each
				// container's inbound op processing can run before we sample their state below. Sampling
				// hasPendingWork() in a tight `while (await ...)` loop instead would starve that scheduled
				// send (it is a macrotask, while the await resolves on the microtask queue) and could hang.
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 0);
				});

				// Prune any containers that have closed since the last pass.
				for (const container of [...this.containers]) {
					if (container.container.closed) {
						this.containers.delete(container);
					}
				}
				const containersToApply = [...this.containers].map((container) => container.container);

				// Ignore readonly/disconnected dirty containers: they can't send ops, so nothing can be done about them being dirty here.
				// Neither state is reachable through the ephemeral service API today, but the checks are cheap and keep this robust to future changes.
				const dirtyContainers = containersToApply.filter((c) => {
					const { deltaManager, isDirty, connectionState } = c;
					return (
						connectionState !== ConnectionState.Disconnected &&
						deltaManager.readOnlyInfo.readonly !== true &&
						isDirty
					);
				});
				if (dirtyContainers.length > 0) {
					// Bound this wait by the shared deadline: a container that never saves (and never
					// closes) must not block past the overall timeout, since the top-of-loop check can't
					// run while we are awaiting here.
					await Promise.race([
						Promise.all(
							dirtyContainers.map(async (c) =>
								Promise.race([
									new Promise((resolve) => c.once("saved", resolve)),
									new Promise((resolve) => c.once("closed", resolve)),
								]),
							),
						),
						deadline,
					]);

					clean = 0;
					continue;
				}

				// Sample pending server work once per pass (the macrotask yield above gave the broadcaster's
				// scheduled send a chance to run first).
				if (await Promise.race([this.server.hasPendingWork(), deadline])) {
					clean = 0;
					continue;
				}

				clean++;
			}
		} finally {
			clearTimeout(deadlineTimer);
		}
	}

	/**
	 * The document service factory for this service.
	 * @remarks Internal helper for {@link EphemeralServiceContainer}; not part of the public {@link EphemeralService} API.
	 */
	public getDocumentServiceFactory(): LocalDocumentServiceFactory {
		this.ensureAvailable();
		assert(
			!this.closed,
			0xd11 /* Cannot create or load containers on a closed EphemeralService */,
		);
		return this.documentServiceFactory;
	}

	/**
	 * Registers a newly created container as connected to this service.
	 * @remarks Internal helper for {@link EphemeralServiceContainer}; not part of the public {@link EphemeralService} API.
	 */
	public addContainer(container: EphemeralServiceContainer<unknown>): void {
		this.containers.add(container);
	}

	/**
	 * Removes a now-closed container from this service.
	 * @remarks Internal helper for {@link EphemeralServiceContainer}; not part of the public {@link EphemeralService} API.
	 */
	public removeContainer(container: EphemeralServiceContainer<unknown>): void {
		this.containers.delete(container);
	}
}

/**
 * A {@link @fluidframework/driver-definitions#ServiceClient} connected to a specific {@link LocalService}.
 *
 * @typeParam TService - The type of local service this client is connected to.
 * @alpha @sealed
 */
export interface LocalServiceClient<
	out TService extends LocalService<ServiceClient> = LocalService<ServiceClient>,
> extends ServiceClient {
	/**
	 * The service instance this client is connected to.
	 */
	readonly service: TService;
}

class LocalServiceClientImplementation<TService extends LocalService>
	extends ServiceClientImplementation<LocalServiceOptions<TService>>
	implements LocalServiceClient
{
	public readonly service: TService;

	public constructor(options: LocalServiceOptions<TService>) {
		super(options, EphemeralServiceContainer);
		this.service = options.service;
	}
}

const containerRuntimeLoader: ContainerRuntimeLoader = async (
	parameters: ContainerRuntimeLoaderParams,
) => {
	const { runtime } = await ContainerRuntime.loadRuntime2({
		context: parameters.context,
		registry: parameters.registry,
		provideEntryPoint: parameters.provideEntryPoint,
		existing: parameters.existing,
		minVersionForCollab: parameters.minVersionForCollab,
		runtimeOptions: { enableRuntimeIdCompressor: "on" },
	});
	if (!parameters.existing) {
		assert(
			parameters.newContainerRootType !== undefined,
			0xd12 /* Root data store kind must be provided for new containers */,
		);
		const dataStore = await runtime.createDataStore(parameters.newContainerRootType);
		const aliasResult = await dataStore.trySetAlias(rootDataStoreId);
		assert(
			aliasResult === "Success",
			0xd13 /* Should be able to set alias on new data store */,
		);
	}
	return runtime;
};

const urlResolver = new LocalResolver();
/**
 * Create a request to open an existing document.
 *
 * @param documentId - the existing document to open.
 * @privateRemarks
 * Like createLocalResolverCreateNewRequest, but without the option to create a new document.
 * TODO: At some point we should avoid specifying the URL in so many places, but the current APIs don't accommodate it yet.
 */
const createLoadExistingRequest = (documentId: string): IRequest => {
	return { url: `http://localhost:3000/${documentId}` };
};

/**
 * A Fluid container backed by an ephemeral (in-memory) local service, implementing
 * {@link @fluidframework/driver-definitions#FluidContainerWithService}.
 *
 * @remarks
 * Data is stored in-memory by the {@link EphemeralService} the container's client is connected to (see
 * {@link EphemeralServiceContainer.service}), enabling side-by-side collaboration testing without a real server.
 *
 * @internal
 */
export class EphemeralServiceContainer<TData>
	extends ServiceContainerBase<TData, LocalServiceOptions>
	implements FluidContainerWithService<TData>
{
	public readonly service: LocalService;

	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: LocalServiceOptions,
		root: DataStoreKind<T>,
	): Promise<EphemeralServiceContainer<T>> {
		LocalServiceImplementation.narrow(options.service);
		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: options.service.getDocumentServiceFactory(),
			codeLoader: makeCodeLoader(
				registry,
				options.oldestSupportedClient,
				containerRuntimeLoader,
				root,
			),
		});

		return new EphemeralServiceContainer<T>(
			registry,
			options,
			container,
			(await container.getEntryPoint()) as T,
			undefined,
		);
	}

	public static async load<T>(
		registry: DataStoreRegistry<T>,
		options: LocalServiceOptions,
		id: string,
	): Promise<EphemeralServiceContainer<T> & FluidContainerAttached<T>> {
		LocalServiceImplementation.narrow(options.service);
		const containerInner = await loadExistingContainer({
			request: createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory: options.service.getDocumentServiceFactory(),
			codeLoader: makeCodeLoader(
				registry,
				options.oldestSupportedClient,
				containerRuntimeLoader,
			),
		});

		const container = new EphemeralServiceContainer<T>(
			registry,
			options,
			containerInner,
			(await containerInner.getEntryPoint()) as T,
			id,
		);
		assert(
			container.id !== undefined,
			0xd14 /* id should be defined when loading a container */,
		);
		return container as typeof container & { id: string };
	}

	private constructor(
		registry: Registry<Promise<DataStoreKind<TData>>>,
		options: LocalServiceOptions,
		container: IContainer,
		data: TData,
		id: string | undefined,
	) {
		super(registry, options, container, data, id);
		this.service = options.service;
		LocalServiceImplementation.narrow(this.service);
		this.service.addContainer(this);
	}

	public override close(): void {
		super.close();
		// Remove this now-closed container from its service's set of open containers.
		LocalServiceImplementation.narrow(this.service);
		this.service.removeContainer(this);
	}

	protected createAttachRequest(): IRequest {
		return createLocalResolverCreateNewRequest(uuid());
	}
}
