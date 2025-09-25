/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	ServiceOptions,
	ServiceClient,
	FluidContainerAttached,
	DataStoreKind,
	Registry,
	FluidContainerWithService,
} from "@fluidframework/runtime-definitions/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * Creates and returns a document service for local use.
 *
 * @remarks
 * Since all collaborators are in the same process, minVersionForCollab can be omitted and will default to the current version.
 *
 * @alpha
 */
export function createEphemeralServiceClient(
	options: ServiceOptions = { minVersionForCollab: pkgVersion },
): ServiceClient {
	return new EphemeralServiceClient(options);
}

/**
 * Ephemeral service client for local use.
 *
 * TODO: Implement:
 * Maybe this can be layered on-top of `IDocumentService`?
 * If so, a base class could be written in terms of `IDocumentService`,
 * then the service specific derived class could use {@link createLocalDocumentService} to get it.
 */
class EphemeralServiceClient implements ServiceClient {
	public constructor(public readonly options: ServiceOptions) {}

	public createContainer<T>(root: DataStoreKind<T>): FluidContainerWithService<T> {
		return EphemeralServiceContainer.createDetached(normalizeRegistry(root), this, root);
	}

	public async loadContainer<T>(
		id: string,
		root: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerAttached<T>> {
		return EphemeralServiceContainer.load(normalizeRegistry(root), this, id);
	}
}

class EphemeralServiceContainer<T> implements FluidContainerWithService<T> {
	public id: string | undefined;
	public readonly data: T;

	public static createDetached<T>(
		registry: Registry<Promise<DataStoreKind<T>>>,
		service: EphemeralServiceClient,
		root: DataStoreKind<T>,
	): EphemeralServiceContainer<T> {
		return new EphemeralServiceContainer<T>(registry, service, root);
	}

	public static async load<T>(
		registry: Registry<Promise<DataStoreKind<T>>>,
		service: EphemeralServiceClient,
		id: string,
	): Promise<EphemeralServiceContainer<T> & FluidContainerAttached<T>> {
		const container = new EphemeralServiceContainer<T>(registry, service, id);
		assert(container.id !== undefined, "id should be defined when loading a container");
		return container as typeof container & { id: string };
	}

	private constructor(
		public readonly registry: Registry<Promise<DataStoreKind<T>>>,
		public readonly service: EphemeralServiceClient,
		/**
		 * For new detached containers, the root DataStoreKind.
		 * For loaded containers, the ID of the container.
		 * @remarks
		 */
		rootOrId: DataStoreKind<T> | string,
	) {
		throw new Error("TODO: Not implemented: EphemeralServiceContainer constructor");
	}

	public async attach(): Promise<FluidContainerAttached<T>> {
		throw new Error("TODO: Not implemented: EphemeralServiceContainer.attach");
	}
}

function normalizeRegistry<T>(
	input: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
): Registry<Promise<DataStoreKind<T>>> {
	// TODO: its possible one might use a constructor as a DataStoreKind, which would break this. A better check might be needed.
	if (typeof input === "function") {
		return input;
	}
	return async () => input;
}
