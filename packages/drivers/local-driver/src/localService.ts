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
	makeServiceClientImpl,
	rootDataStoreId,
	ServiceContainerBase,
} from "@fluidframework/runtime-utils/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import { LocalDocumentServiceFactory } from "./localDocumentServiceFactory.js";
import { createLocalResolverCreateNewRequest, LocalResolver } from "./localResolver.js";
import { pkgVersion } from "./packageVersion.js";

const defaultServiceOptions: ServiceOptions = {
	minVersionForCollaboration: featureVersion(pkgVersion),
};

/**
 * Creates and returns a document service for local use.
 *
 * @remarks
 * Since all collaborators are in the same process, minVersionForCollab can be omitted and will default to the current version.
 *
 * The service is ephemeral and in-memory: all documents are held by a single shared in-memory service that
 * exists only while at least one container is open.
 * As long as any container remains open (even one for a different `id`), every document created in this session is
 * retained and can be loaded by `id` — including documents that currently have no open container.
 * Once all containers are closed, the shared service and all of its documents are discarded, so those `id`s can no
 * longer be loaded (a subsequent {@link @fluidframework/driver-definitions#ServiceClient.loadContainer} would not
 * find them).
 * This is shared across all clients from this and any other call to {@link createEphemeralServiceClient}, since they
 * all use the same single static in-memory service instance.
 * @privateRemarks
 * TODO: We should provide a way to extract (for potential serialization as test data) and load documents into this service.
 * This is needed to use this API surface for testing reference documents.
 * Ideally we would provide a service agnostic way to to the export, but likely only support loading them into the local service.
 * This can be done via a an API on FluidContainer (or a free function taking one) to do the export, then adding a service specific API to load from the export format and return the ID of the loaded document.
 *
 * TODO: The document lifetime policy (all documents live only while at least one container is open) is currently
 * fixed because all clients share a single static in-memory service instance.
 * This is probably a bad design as it causes surprising coupling between different clients.
 * As there does not seem to be a clean way to manage document lifetime without a larger API surface,
 * this is being left for now, but should probably be replaced with something better, likely involving an explicit server object whose lifetime can be managed.
 * Having that server have a singleton default which is reset by
 * In the future we could make this configurable, and support the save/load of documents described above, by
 * exposing an `EphemeralService` type which owns the in-memory service and can create {@link @fluidframework/driver-definitions#ServiceClient}
 * instances connected to it, along with a factory for creating such an `EphemeralService`.
 * That would be offered as an alternative to this static {@link createEphemeralServiceClient} (and its static
 * shared service instance): a caller-owned `EphemeralService` could keep documents alive independent of open
 * containers, control the lifetime policy explicitly, and be disposed to release its resources.
 *
 * @alpha
 */
export function createEphemeralServiceClient(
	options: ServiceOptions = defaultServiceOptions,
): ServiceClient {
	return makeServiceClientImpl(options, EphemeralServiceContainer);
}

/**
 * Closes any open ephemeral service containers.
 *
 * @remarks
 * This can be used to cleanup lingering timers from containers created using a client from {@link createEphemeralServiceClient}.
 * Such timers are a common case of hangs on exist (often worked around using Mocha's `--exit` flag).
 *
 * This behaves just like calling {@link @fluidframework/driver-definitions#FluidContainer.close} on every open container:
 * closing the last one also disposes the shared in-memory server (see the note on server timers in the implementation).
 * @alpha
 */
export async function closeEphemeralContainers(): Promise<void> {
	// Close every open container via the same public close() path a user would use. Closing the last
	// container disposes the shared server (see updateContainers), so this is equivalent to a user
	// closing each open container individually.
	for (const c of [...containers]) {
		c.close();
	}
	// Join the server shutdown (triggered by closing the last container) so callers can await full cleanup.
	await serverClosePromise;
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

let containers: EphemeralServiceContainer<unknown>[] = [];

function updateContainers(): void {
	containers = containers.filter((c) => !c.container.closed);
	if (containers.length === 0) {
		// No containers remain, so the shared in-memory server is no longer needed. Dispose it so its
		// timers (e.g. the Deli read-client idle `setInterval`, which belongs to the server rather than
		// any container and so cannot be cleared by `container.close()`) do not keep the Node.js event
		// loop alive. A fresh server is created lazily if another container is created later.
		disposeLocalServer();
	}
}

/**
 * Synchronizes all ephemeral clients.
 *
 * @param timeoutMilliseconds - The maximum time to wait for local containers to quiesce, in milliseconds. Defaults to 30_000.
 *
 * @remarks
 * See {@link createEphemeralServiceClient} for details on the ephemeral service.
 *
 * This drives all in-process ephemeral containers toward convergence,
 * processing all pending operations and waiting for all dirty containers to save.
 *
 * @privateRemarks
 * This is a Best-effort implementation simplified from `LoaderContainerTracker.ensureSynchronized`.
 * Currently it does not perform receiver-side sequence-number quiescence or wait for join/leave (audience) ops.
 * See `LoaderContainerTracker.ensureSynchronized` for the fuller version this is based on.
 * For the currently exposed API surface, this should be sufficient,
 * but users down casting to internal types might run into some limitations.
 * @alpha
 */
export async function synchronizeEphemeralClients(
	timeoutMilliseconds = 30_000,
): Promise<void> {
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
				throw new Error(
					`synchronizeEphemeralClients timed out after ${timeoutMilliseconds}ms waiting for local containers to quiesce.`,
				);
			}

			// Yield a macrotask turn *first*, so the local server's scheduled broadcast send and each
			// container's inbound op processing can run before we sample their state below. Sampling
			// hasPendingWork() in a tight `while (await ...)` loop instead would starve that scheduled
			// send (it is a macrotask, while the await resolves on the microtask queue) and could hang.
			await new Promise<void>((resolve) => {
				setTimeout(resolve, 0);
			});

			updateContainers();
			const containersToApply = containers.map((c) => c.container);

			// Ignore readonly/disconnected dirty containers: they can't send ops, so nothing can be done about them being dirty here.
			// Neither state is reachable through createEphemeralServiceClient today, but the checks are cheap and keep this robust to future changes.
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
			// scheduled send a chance to run first). If the server has already been disposed (no containers
			// remain) there is nothing pending, and we must not recreate it here.
			const pendingServerWork =
				localServerInstance !== undefined &&
				(await Promise.race([localServerInstance.hasPendingWork(), deadline]));
			if (pendingServerWork) {
				clean = 0;
				continue;
			}

			clean++;
		}
	} finally {
		clearTimeout(deadlineTimer);
	}
}

// A single localServer should be shared by all instances of a local driver so they can communicate
// with each other.
// It is created lazily and disposed once no containers remain (see updateContainers) so its timers
// can be cleaned up.
let localServerInstance: ILocalDeltaConnectionServer | undefined;
let documentServiceFactoryInstance: LocalDocumentServiceFactory | undefined;
// Tracks the in-flight close of a disposed server so awaiting callers (closeEphemeralContainers) can join it.
let serverClosePromise: Promise<void> | undefined;

function getLocalServer(): ILocalDeltaConnectionServer {
	localServerInstance ??=
		LocalDeltaConnectionServer.create(
			// new LocalSessionStorageDbFactory(),
		);
	return localServerInstance;
}

function getDocumentServiceFactory(): LocalDocumentServiceFactory {
	documentServiceFactoryInstance ??= new LocalDocumentServiceFactory(getLocalServer());
	return documentServiceFactoryInstance;
}

function disposeLocalServer(): void {
	if (localServerInstance !== undefined) {
		const serverToClose = localServerInstance;
		localServerInstance = undefined;
		documentServiceFactoryInstance = undefined;
		// `close` is async, but the public container close() that drives this is synchronous, so start
		// the shutdown and track its promise for closeEphemeralContainers to await.
		serverClosePromise = serverToClose.close();
	}
}

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
 * Data is stored in-memory and shared only within the same browser session via a module-level
 * shared server. All containers created by {@link createEphemeralServiceClient} share the
 * same server instance, enabling side-by-side collaboration testing without a real server.
 *
 * @internal
 */
export class EphemeralServiceContainer<TData>
	extends ServiceContainerBase<TData, ServiceOptions>
	implements FluidContainerWithService<TData>
{
	public static async createDetached<T>(
		registry: DataStoreRegistry<T>,
		options: ServiceOptions,
		root: DataStoreKind<T>,
	): Promise<EphemeralServiceContainer<T>> {
		const container: IContainer = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory: getDocumentServiceFactory(),
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
		options: ServiceOptions,
		id: string,
	): Promise<EphemeralServiceContainer<T> & FluidContainerAttached<T>> {
		const containerInner = await loadExistingContainer({
			request: createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory: getDocumentServiceFactory(),
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
		options: ServiceOptions,
		container: IContainer,
		data: TData,
		id: string | undefined,
	) {
		super(registry, options, container, data, id);
		containers.push(this);
		updateContainers();
	}

	public override close(): void {
		super.close();
		// Prune this now-closed container and, if it was the last one open, dispose the shared server.
		updateContainers();
	}

	protected createAttachRequest(): IRequest {
		const documentId = (documentIdCounter++).toString();
		return createLocalResolverCreateNewRequest(documentId);
	}
}
