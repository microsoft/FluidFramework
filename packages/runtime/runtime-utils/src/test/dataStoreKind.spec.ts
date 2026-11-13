/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { AttachState, type IContainer } from "@fluidframework/container-definitions/internal";
import type {
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";

import {
	dataStoreKindFromFactory,
	DataStoreKindImplementation,
	fluidContainerFromLegacy,
} from "../serviceClientBase.js";
import { convertRegistry } from "../serviceClientUtils.js";

describe("fluidContainerFromLegacy", () => {
	it("uses the service reload ID rather than the resolved URL hash", () => {
		let closed = false;
		const container: Partial<IContainer> = {
			attachState: AttachState.Attached,
			resolvedUrl: {
				type: "fluid",
				id: "hashed-document-id",
				url: "https://example.com/hashed-document-id",
				tokens: {},
				endpoints: {},
			},
			close: () => {
				closed = true;
			},
		};
		const data = { value: 42 };
		const adopted = fluidContainerFromLegacy(
			container as IContainer,
			data,
			async () => {
				throw new Error("No factory lookup expected");
			},
			"service-item-id",
		);
		assert.equal(adopted.id, "service-item-id");
		assert.equal(adopted.data, data);
		assert.equal(container.resolvedUrl?.id, "hashed-document-id");
		adopted.close();
		assert(closed);
	});

	for (const attachState of [AttachState.Detached, AttachState.Attaching]) {
		it(`rejects ${attachState} containers even when a reload ID is supplied`, () => {
			const container: Partial<IContainer> = { attachState };
			assert.throws(
				() =>
					fluidContainerFromLegacy(
						container as IContainer,
						undefined,
						async () => {
							throw new Error("No factory lookup expected");
						},
						"service-item-id",
					),
				/The legacy container must be attached/,
			);
		});
	}
});

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

	it("preserves registry getters and creation receivers", async () => {
		let readCount = 0;
		const registry: IFluidDataStoreRegistry = {
			get IFluidDataStoreRegistry() {
				return this;
			},
			async get() {
				return undefined;
			},
		};
		const context: Partial<IFluidDataStoreContext> = {};
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
			async instantiateDataStore(actualContext, existing): Promise<never> {
				assert.equal(this, factory);
				assert.equal(actualContext, context);
				assert.equal(existing, true);
				throw new Error("Asynchronous creation invoked");
			},
		};
		const kind = dataStoreKindFromFactory(factory);
		DataStoreKindImplementation.narrowGeneric(kind);
		assert.equal(kind.IFluidDataStoreRegistry, registry);
		assert.equal(kind.IFluidDataStoreRegistry, registry);
		assert.equal(readCount, 2);
		const entry = await convertRegistry(async () => kind).get(factory.type);
		assert.equal(entry?.IFluidDataStoreRegistry, registry);
		const create = kind.createDataStore;
		assert(create !== undefined);
		assert.throws(() => Reflect.apply(create, undefined, []), /Synchronous creation invoked/);
		await assert.rejects(
			kind.instantiateDataStore(context as IFluidDataStoreContext, true),
			/Asynchronous creation invoked/,
		);
	});
});
