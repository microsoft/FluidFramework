/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ServiceOptions,
	ServiceClient,
	FluidContainer,
	FluidContainerAttached,
	DataStoreKind,
	Registry,
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

	public async attachContainer<T>(
		detached: FluidContainer<T>,
	): Promise<FluidContainerAttached<T>> {
		throw new Error("TODO: Not implemented: attachContainer");
	}

	public async loadContainer<T>(
		id: string,
		root: DataStoreKind<T> | Registry<Promise<DataStoreKind<T>>>,
	): Promise<FluidContainerAttached<T>> {
		throw new Error("TODO: Not implemented: loadContainer");
	}
}
