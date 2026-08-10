/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct/legacy";

import { ClaimsDataObjectFactory } from "./claimsDataObject/index.js";

/**
 * The container runtime factory for the claims example. It instantiates a single default data
 * store ({@link ClaimsDataObject}) hosting the Claims DDS and exposes it as the container's
 * entry point.
 */
export class ClaimsExampleContainerRuntimeFactory extends ContainerRuntimeFactoryWithDefaultDataStore {
	public constructor() {
		super({
			defaultFactory: ClaimsDataObjectFactory,
			registryEntries: [
				[ClaimsDataObjectFactory.type, Promise.resolve(ClaimsDataObjectFactory)],
			],
		});
	}
}
