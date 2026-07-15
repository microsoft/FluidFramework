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
 * @privateRemarks
 * TODO: We should provide a way to extract (for potential serialization as test data) and load documents into this service.
 * This is needed to use this API surface for testing reference documents.
 * Ideally we would provide a service agnostic way to to the export, but likely only support loading them into the local service.
 * This can be done via a an API on FluidContainer (or a free function taking one) to do the export, then adding a service specific API to load from the export format and return the ID of the loaded document.
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
 * @alpha
 */
export async function closeEphemeralContainers(): Promise<void> {
	const toClose = containers;
	containers = [];
	for (const c of toClose) {
		c.container.close();
	}
	updateContainers();
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
			// scheduled send a chance to run first).
			if (await Promise.race([localServer.hasPendingWork(), deadline])) {
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
const localServer: ILocalDeltaConnectionServer =
	LocalDeltaConnectionServer.create(
		// new LocalSessionStorageDbFactory(),
	);

const urlResolver = new LocalResolver();
const documentServiceFactory = new LocalDocumentServiceFactory(localServer);
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
 * Data is stored in-memory and shared only within the same browser session via the module-level
 * {@link localServer}. All containers created by {@link createEphemeralServiceClient} share the
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
			documentServiceFactory,
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
			documentServiceFactory,
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

	protected createAttachRequest(): IRequest {
		const documentId = (documentIdCounter++).toString();
		return createLocalResolverCreateNewRequest(documentId);
	}
}
