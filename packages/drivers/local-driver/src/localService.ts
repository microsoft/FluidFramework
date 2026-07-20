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
import type {
	DataStoreKind,
	DataStoreRegistry,
	FluidContainerAttached,
	FluidContainerWithService,
	Registry,
	ServiceClient,
	ServiceOptions,
} from "@fluidframework/driver-definitions/internal";
import { featureVersion } from "@fluidframework/driver-definitions/internal";
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
import { UsageError } from "@fluidframework/driver-utils/internal";

import { LocalDocumentServiceFactory } from "./localDocumentServiceFactory.js";
import { createLocalResolverCreateNewRequest, LocalResolver } from "./localResolver.js";
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

	const service = new EphemeralServiceImplementation();
	if (isDefault) {
		defaultEphemeralService = service;
	}
	return service;
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
 * Internal Options for creating an {@link EphemeralServiceClient}, extending {@link @fluidframework/driver-definitions#ServiceOptions}
 * with the {@link EphemeralService} the client should connect to.
 * @input
 * @internal
 */
export interface EphemeralServiceOptions extends ServiceOptions {
	/**
	 * The service instance to connect to.
	 */
	readonly service: EphemeralService;
}

/**
 * An in-memory Fluid service that can produce connected {@link EphemeralServiceClient}s.
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
 * document with different minVersionForCollaboration values.
 * This also exposes a place to put APIs for preloading and exporting document contents in the future.
 *
 * This is an erased type: its only implementation is the module-private {@link EphemeralServiceImplementation}, which holds
 * the mutable server and container state so it does not appear on this public type.
 *
 * TODO: formalize this lifecycle with an interface which documents these stages.
 * Lifecycle:
 * The intended lifecycle of an {@link EphemeralService} follows roughly the same pattern as containers:
 *
 * 1. Open: accepts connections from {@link EphemeralServiceClient}s, which can create and load containers.
 * Might have timers and event registrations which can trigger asynchronous work, and retain the object in memory.
 *
 * 2. Closing: asynchronous transition from open to closed. New use should behave as it closed, but may be cleaning up or saving resources asynchronously.
 * Timers and event registrations may still be active, but should be cleaned up by the time the transition to closed completes.
 *
 * 3. Closed: no longer accepts connections from {@link EphemeralServiceClient}s, and all containers connected to it are closed.
 * Should have no subscriptions to events or timers which could retain it in memory or trigger asynchronous work.
 * The object can still be used in a limited capacity (typically just to inspect its status (e.g. `isClosed`), and to view (but not edit) the final state of any containers which were connected to it before it closed.)
 *
 * Events or errors can cause an open to closing transition. Any nonfunctional state, including error states, should be considered as closed (or closing which will transition to closed),
 * and meet the requirements of closed with regards to timers and events.
 *
 * @alpha @sealed
 */
export interface EphemeralService extends ErasedBaseType<readonly ["EphemeralService"]> {
	/**
	 * Close this service, which closes all containers connected to it and releases its resources.
	 * @remarks
	 * All documents held by this service are discarded, and any timers it (or its containers) were keeping alive
	 * are cleaned up.
	 * The returned promise resolves once all asynchronous cleanup (including shutting down the in-memory server)
	 * has completed.
	 * Closing is idempotent: calling it again after the service is closed resolves without doing anything.
	 */
	close(): Promise<void>;

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
	 * For the currently exposed API surface, this should be sufficient,
	 * but users down casting to internal types might run into some limitations.
	 */
	synchronize(timeoutMilliseconds?: number): Promise<void>;

	/**
	 * Creates and returns a {@link EphemeralServiceClient} for an in-memory, ephemeral Fluid service.
	 *
	 * @param options - Options for the client. `minVersionForCollaboration` may be omitted (since all collaborators
	 * are in the same process, it defaults to the current version). `service` may be omitted to allocate a new
	 * {@link EphemeralService} dedicated to this client, or provided to connect the client to an existing service instance.
	 *
	 * @remarks
	 * The service is ephemeral and in-memory: all documents are held by the {@link EphemeralService} the client is
	 * connected to, and live for as long as that service is open — independent of whether any container for them is open.
	 * A document created and attached (obtaining an `id`) can be loaded by `id` for as long as its service remains open,
	 * even after every container for it has been closed.
	 * Closing the service (via {@link EphemeralService.close} or {@link cleanupEphemeralService}) discards all of its
	 * documents and releases its resources; afterwards those `id`s can no longer be loaded.
	 *
	 * When no `service` is provided, a new one is allocated for this client (accessible via {@link EphemeralServiceClient.service}).
	 * Provide the same {@link EphemeralService} to multiple clients (via `options.service`) to have them collaborate on the
	 * same documents, and control that service's lifetime explicitly.
	 *
	 * Since a service holds timers while open, tests should close the services they use (e.g. via
	 * {@link cleanupEphemeralService} in an `afterEach`) to avoid lingering timers that can hang test runners.
	 *
	 * @privateRemarks
	 * TODO: We should provide a way to extract (for potential serialization as test data) and load documents into a service.
	 * This is needed to use this API surface for testing reference documents.
	 * Ideally we would provide a service agnostic way to do the export, but likely only support loading them into the local service.
	 * This can be done via an API on FluidContainer (or a free function taking one) to do the export, then adding a
	 * service specific API (on {@link EphemeralService}) to load from the export format and return the ID of the loaded document.
	 */
	newClient(options: ServiceOptions): EphemeralServiceClient;

	/**
	 * A client connected to this service using the default options.
	 */
	readonly defaultClient: EphemeralServiceClient;
}

/**
 * The {@link defaultEphemeralService} if one has been {@link startEphemeralService|started}.
 */
let defaultEphemeralService: EphemeralServiceImplementation | undefined;

/**
 * The concrete implementation of {@link EphemeralService}.
 * @remarks
 * Kept module-private so its mutable state and internal helpers are not part of the public API.
 * Narrow an {@link EphemeralService} to it with `EphemeralServiceImplementation.narrow`.
 */
class EphemeralServiceImplementation
	extends ErasedTypeImplementation<EphemeralService>
	implements EphemeralService
{
	// A single server is shared by all containers connected to this service so they can communicate with each other.
	private readonly server: ILocalDeltaConnectionServer =
		LocalDeltaConnectionServer.create(
			// new LocalSessionStorageDbFactory(),
		);
	private readonly documentServiceFactory = new LocalDocumentServiceFactory(this.server);
	private readonly containers = new Set<EphemeralServiceContainer<unknown>>();
	private closed = false;

	public constructor() {
		super();
		this.defaultClient = this.newClient();
	}
	public newClient(options?: Partial<ServiceOptions>): EphemeralServiceClient {
		const finalOptions: EphemeralServiceOptions = {
			minVersionForCollaboration:
				options?.minVersionForCollaboration ?? featureVersion(pkgVersion),
			service: this,
		};
		return new EphemeralServiceClientImplementation(finalOptions);
	}
	public readonly defaultClient: EphemeralServiceClient;

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
		assert(!this.closed, "Cannot create or load containers on a closed EphemeralService");
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
 * A {@link @fluidframework/driver-definitions#ServiceClient} connected to a specific {@link EphemeralService}.
 * @alpha @sealed
 */
export interface EphemeralServiceClient extends ServiceClient {
	/**
	 * The service instance this client is connected to.
	 */
	readonly service: EphemeralService;
}

class EphemeralServiceClientImplementation
	extends ServiceClientImplementation<EphemeralServiceOptions>
	implements EphemeralServiceClient
{
	public readonly service: EphemeralService;

	public constructor(options: EphemeralServiceOptions) {
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
			"Root data store kind must be provided for new containers",
		);
		const dataStore = await runtime.createDataStore(parameters.newContainerRootType);
		const aliasResult = await dataStore.trySetAlias(rootDataStoreId);
		assert(aliasResult === "Success", "Should be able to set alias on new data store");
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

let documentIdCounter = 0;

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
	extends ServiceContainerBase<TData, EphemeralServiceOptions>
	implements FluidContainerWithService<TData>
{
	public readonly service: EphemeralService;

	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: EphemeralServiceOptions,
		root: DataStoreKind<T>,
	): Promise<EphemeralServiceContainer<T>> {
		EphemeralServiceImplementation.narrow(options.service);
		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: options.service.getDocumentServiceFactory(),
			codeLoader: makeCodeLoader(
				registry,
				options.minVersionForCollaboration,
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
		options: EphemeralServiceOptions,
		id: string,
	): Promise<EphemeralServiceContainer<T> & FluidContainerAttached<T>> {
		EphemeralServiceImplementation.narrow(options.service);
		const containerInner = await loadExistingContainer({
			request: createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory: options.service.getDocumentServiceFactory(),
			codeLoader: makeCodeLoader(
				registry,
				options.minVersionForCollaboration,
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
		assert(container.id !== undefined, "id should be defined when loading a container");
		return container as typeof container & { id: string };
	}

	private constructor(
		registry: Registry<Promise<DataStoreKind<TData>>>,
		options: EphemeralServiceOptions,
		container: IContainer,
		data: TData,
		id: string | undefined,
	) {
		super(registry, options, container, data, id);
		this.service = options.service;
		EphemeralServiceImplementation.narrow(this.service);
		this.service.addContainer(this);
	}

	public override close(): void {
		super.close();
		// Remove this now-closed container from its service's set of open containers.
		EphemeralServiceImplementation.narrow(this.service);
		this.service.removeContainer(this);
	}

	protected createAttachRequest(): IRequest {
		const documentId = (documentIdCounter++).toString();
		return createLocalResolverCreateNewRequest(documentId);
	}
}
