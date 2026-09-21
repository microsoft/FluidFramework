/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
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
	IUrlResolver,
	ServiceClient,
	ServiceOptions,
} from "@fluidframework/driver-definitions/internal";
import {
	type ContainerRuntimeLoader,
	makeCodeLoader,
	rootDataStoreId,
	ServiceClientImplementation,
	ServiceContainerBase,
} from "@fluidframework/runtime-utils/internal";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";

import { SeaDriver } from "./documentService.js";
import { SeaSessionDriverClient, type SeaSessionFactory } from "./sessionClient.js";

/** Service configuration independent of WASM packaging and transport selection.
 * @internal
 */
export interface SeaServiceOptions extends ServiceOptions {
	/** Opens fresh memberships in the same caller-owned service, with matching compression settings. */
	readonly openSession: SeaSessionFactory;
}

/** Creates a Fluid service client over an injected local or remote SEA session factory.
 *
 * @remarks
 * The caller owns the underlying service; closing containers does not close that service.
 * Document IDs are hexadecimal SEA identities scoped to the injected service.
 * The standard Fluid runtime elects a summarizer, generates summaries automatically, and manages client-side garbage collection.
 * Sea retains backend content and history independently of client-side garbage collection.
 * Automatic reconnect, presence, and authentication are not supported by this adapter.
 * @internal
 */
export function createSeaServiceClient(options: SeaServiceOptions): ServiceClient {
	return new ServiceClientImplementation({ ...options }, SeaServiceContainer);
}

/** Loads the standard runtime and creates the registry-selected root for new containers. */
const loadRuntime: ContainerRuntimeLoader = async (parameters) => {
	const { runtime } = await ContainerRuntime.loadRuntime2({
		context: parameters.context,
		registry: parameters.registry,
		provideEntryPoint: parameters.provideEntryPoint,
		existing: parameters.existing,
		minVersionForCollab: parameters.minVersionForCollab,
		runtimeOptions: {
			enableRuntimeIdCompressor: "on",
		},
	});
	if (!parameters.existing) {
		assert(
			parameters.newContainerRootType !== undefined,
			"SEA container requires a root data store",
		);
		const root = await runtime.createDataStore(parameters.newContainerRootType);
		assert(
			(await root.trySetAlias(rootDataStoreId)) === "Success",
			"SEA root alias must be unique",
		);
	}
	return runtime;
};

/** Resolves service-scoped identities without encoding endpoint or certificate configuration in IDs. */
const urlResolver: IUrlResolver = {
	async resolve(request) {
		const id = request.url;
		if (
			!(id === "new" && request.headers?.createNew === true) &&
			!/^(?:[0-9a-f]{2})+$/u.test(id)
		) {
			throw new Error("Invalid SEA document identity");
		}
		return {
			type: "fluid",
			id,
			url: `fluid://sea/documents/${id}`,
			tokens: {},
			endpoints: {},
		};
	},
	async getAbsoluteUrl(resolvedUrl, relativeUrl) {
		return `${resolvedUrl.url}/${relativeUrl.replace(/^\/+/u, "")}`;
	},
};

/** Configures fresh driver clients and forces writable membership for interactive containers. */
function loaderOptions(options: SeaServiceOptions) {
	return {
		urlResolver,
		documentServiceFactory: new SeaDriver(
			async () => new SeaSessionDriverClient(options.openSession, "clientSelected"),
		),
		clientDetailsOverride: { capabilities: { interactive: true } },
		configProvider: wrapConfigProviderWithDefaults(undefined, {
			"Fluid.Container.ForceWriteConnection": true,
		}),
	};
}

/** Uses the shared ServiceClient lifecycle without owning the injected service. */
class SeaServiceContainer<Data> extends ServiceContainerBase<Data, SeaServiceOptions> {
	/** Creates a detached runtime without opening a SEA membership. */
	public static async createDetached<Data>(
		registry: DataStoreRegistry<Data>,
		options: SeaServiceOptions,
		root: DataStoreKind<Data>,
	): Promise<SeaServiceContainer<Data>> {
		const container = await createDetachedContainer({
			codeDetails: { package: "no-dynamic-package", config: {} },
			codeLoader: makeCodeLoader(registry, options.oldestSupportedClient, loadRuntime, root),
			...loaderOptions(options),
		});
		return SeaServiceContainer.wrap(registry, options, container, undefined);
	}

	/** Loads the root using the same registry and compatibility options as creation. */
	public static async load<Data>(
		registry: DataStoreRegistry<Data>,
		options: SeaServiceOptions,
		id: string,
	): Promise<SeaServiceContainer<Data> & FluidContainerAttached<Data>> {
		const container = await loadExistingContainer({
			request: { url: id },
			codeLoader: makeCodeLoader(registry, options.oldestSupportedClient, loadRuntime),
			...loaderOptions(options),
		});
		const result = await SeaServiceContainer.wrap(registry, options, container, id);
		return result as SeaServiceContainer<Data> & FluidContainerAttached<Data>;
	}

	/** Releases an allocated container if its root cannot be obtained. */
	private static async wrap<Data>(
		registry: DataStoreRegistry<Data>,
		options: SeaServiceOptions,
		container: IContainer,
		id: string | undefined,
	): Promise<SeaServiceContainer<Data>> {
		try {
			return new SeaServiceContainer(
				registry,
				options,
				container,
				(await container.getEntryPoint()) as Data,
				id,
			);
		} catch (error) {
			container.close();
			throw error;
		}
	}

	/** Requests a backend-assigned identity rather than a caller-selected document name. */
	protected createAttachRequest(): IRequest {
		return { url: "new", headers: { createNew: true } };
	}
}
