/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type {
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";

import {
	dataStoreKindFromFactory,
	DataStoreKindImplementation,
} from "../serviceClientBase.js";
import { convertRegistry } from "../serviceClientUtils.js";

describe("dataStoreKindFromFactory", () => {
	function makeFactory(type = "legacy"): IFluidDataStoreFactory {
		return {
			type,
			get IFluidDataStoreFactory() {
				return this;
			},
			async instantiateDataStore() {
				throw new Error("Instantiation is not used by this test");
			},
		};
	}

	it("caches the kind by factory identity", async () => {
		const factory = makeFactory();
		const kind = dataStoreKindFromFactory(factory);
		assert.equal(dataStoreKindFromFactory(factory), kind);
		assert.equal(await kind.adapt(Promise.resolve(kind)), kind);
		const registry = convertRegistry(async () => kind);
		const entry = await registry.get(factory.type);
		assert.equal(entry?.IFluidDataStoreFactory, factory);
	});

	it("rejects conflicting factory identities and types", async () => {
		const kind = dataStoreKindFromFactory(makeFactory());
		await assert.rejects(
			kind.adapt(Promise.resolve(dataStoreKindFromFactory(makeFactory()))),
			/Conflicting DataStoreKinds/,
		);
		await assert.rejects(
			kind.adapt(Promise.resolve(dataStoreKindFromFactory(makeFactory("other")))),
			/Mismatched DataStoreKind type/,
		);
	});

	it("preserves registry getters and synchronous creation receivers", () => {
		let readCount = 0;
		const registry: IFluidDataStoreRegistry = {
			get IFluidDataStoreRegistry() {
				return this;
			},
			async get() {
				return undefined;
			},
		};
		const factory: IFluidDataStoreFactory & {
			readonly IFluidDataStoreRegistry: IFluidDataStoreRegistry;
		} = {
			...makeFactory(),
			get IFluidDataStoreFactory() {
				return this;
			},
			get IFluidDataStoreRegistry() {
				readCount++;
				return registry;
			},
			createDataStore(): never {
				assert.equal(this, factory);
				throw new Error("Synchronous creation invoked");
			},
		};
		const kind = dataStoreKindFromFactory(factory);
		DataStoreKindImplementation.narrowGeneric(kind);
		assert.equal(kind.IFluidDataStoreRegistry, registry);
		assert.equal(kind.IFluidDataStoreRegistry, registry);
		assert.equal(readCount, 2);
		const create = kind.createDataStore;
		assert(create !== undefined);
		assert.throws(() => Reflect.apply(create, undefined, []), /Synchronous creation invoked/);
	});
});
