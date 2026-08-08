/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";

import {
	adaptLegacyDataStoreFactory,
	DataStoreKindImplementation,
	type ServiceClientLegacyDataStoreFactory,
} from "../serviceClientBase.js";

describe("adaptLegacyDataStoreFactory", () => {
	it("delegates factory behavior and preserves its nested registry", async () => {
		const channel = Object.create(null) as IFluidDataStoreChannel;
		const context = Object.create(null) as IFluidDataStoreContext;
		const registry = {
			IFluidDataStoreRegistry: undefined as unknown as IFluidDataStoreRegistry,
			get: async () => undefined,
		} satisfies IFluidDataStoreRegistry;
		registry.IFluidDataStoreRegistry = registry;

		let instantiateExisting: boolean | undefined;
		const factory: ServiceClientLegacyDataStoreFactory & {
			readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry;
		} = {
			type: "legacy-factory",
			IFluidDataStoreRegistry: registry,
			get IFluidDataStoreFactory() {
				return this;
			},
			instantiateDataStore: async (_context, existing) => {
				instantiateExisting = existing;
				return channel;
			},
			createDataStore: () => ({ runtime: channel }),
		};

		const kind = adaptLegacyDataStoreFactory<unknown>(factory);
		DataStoreKindImplementation.narrowGeneric(kind);

		assert.equal(kind.type, factory.type);
		assert.equal(kind.IFluidDataStoreRegistry, registry);
		assert.equal(await kind.instantiateDataStore(context, true), channel);
		assert.equal(instantiateExisting, true);
		assert.equal(kind.createDataStore?.(context).runtime, channel);
	});
});
