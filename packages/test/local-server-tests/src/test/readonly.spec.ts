/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	type ILoadExistingContainerProps,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { type FluidObject } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { SharedMap, ISharedMap } from "@fluidframework/map/internal";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { createLoader } from "../utils.js";

const mapFactory = SharedMap.getFactory();
const sharedObjectRegistry = new Map<string, IChannelFactory>([[mapFactory.type, mapFactory]]);

class DefaultDataStore {
	public static create(runtime: IFluidDataStoreRuntime) {
		const root = SharedMap.create(runtime, "root");
		root.bindToContext();
		return new DefaultDataStore(runtime, root);
	}

	public static async load(runtime: IFluidDataStoreRuntime) {
		const root = (await runtime.getChannel("root")) as unknown as ISharedMap;
		return new DefaultDataStore(runtime, root);
	}

	public readonlyEventCount = 0;

	private constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		sharedMap: SharedMap,
	) {
		this.runtime.on("readonly", () => this.readonlyEventCount++);
	}

	get DefaultDataStore() {
		return this;
	}
	get readonly() {
		return this.runtime.readonly;
	}

	get handle() {
		return this.runtime.entryPoint;
	}
}

class DefaultDataStoreFactory implements IFluidDataStoreFactory {
	static readonly instance = new DefaultDataStoreFactory();
	private constructor() {}

	get IFluidDataStoreFactory() {
		return this;
	}

	public readonly type = "DefaultDataStore";

	async instantiateDataStore(context, existing) {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			existing,
			async () => dataStore,
		);
		const dataStore = existing
			? DefaultDataStore.load(runtime)
			: DefaultDataStore.create(runtime);

		return runtime;
	}
}
// a simple container runtime factory with a single datastore aliased as default.
// the default datastore is also returned as the entrypoint
const runtimeFactory: IRuntimeFactory = {
	get IRuntimeFactory() {
		return this;
	},
	instantiateRuntime: async (context, existing) => {
		return loadContainerRuntime({
			context,
			existing,
			registryEntries: [
				[
					DefaultDataStoreFactory.instance.type,
					// the parent is still async in the container registry
					// this allows things like code splitting for dynamic loading
					Promise.resolve(DefaultDataStoreFactory.instance),
				],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(DefaultDataStoreFactory.instance.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get();
			},
		});
	},
};

async function createContainerAndGetLoadProps(): Promise<ILoadExistingContainerProps> {
	const deltaConnectionServer = LocalDeltaConnectionServer.create();

	const { loaderProps, codeDetails, urlResolver } = createLoader({
		deltaConnectionServer,
		runtimeFactory,
	});

	const container = await createDetachedContainer({ ...loaderProps, codeDetails });
	await container.getEntryPoint();

	await container.attach(urlResolver.createCreateNewRequest("test"));
	const url = await container.getAbsoluteUrl("");
	assert(url !== undefined, "container must have url");
	container.dispose();
	return { ...loaderProps, request: { url } };
}

describe("readonly", () => {
	it("Readonly is correct across container create", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});

		const container = await createDetachedContainer({ ...loaderProps, codeDetails });

		const entrypoint: FluidObject<DefaultDataStore> = await container.getEntryPoint();

		assert(
			entrypoint.DefaultDataStore !== undefined,
			"container entrypoint must be DefaultDataStore",
		);

		assert(entrypoint.DefaultDataStore.readonly === false, "shouldn't be readonly");
		assert(
			entrypoint.DefaultDataStore.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);

		await container.attach(urlResolver.createCreateNewRequest("test"));

		assert(entrypoint.DefaultDataStore.readonly === false, "shouldn't be readonly");
		assert(
			entrypoint.DefaultDataStore.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);
	});

	it("Readonly is correct after container load", async () => {
		const loadedContainer = await loadExistingContainer(
			await createContainerAndGetLoadProps(),
		);

		const entrypoint: FluidObject<DefaultDataStore> = await loadedContainer.getEntryPoint();

		assert(
			entrypoint.DefaultDataStore !== undefined,
			"container entrypoint must be DefaultDataStore",
		);

		assert(entrypoint.DefaultDataStore.readonly === false, "shouldn't be readonly");
		assert(
			entrypoint.DefaultDataStore.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);
	});

	it("Readonly is correct after datastore load and forceReadonly", async () => {
		const loadedContainer = await loadExistingContainer(
			await createContainerAndGetLoadProps(),
		);

		const entrypoint: FluidObject<DefaultDataStore> = await loadedContainer.getEntryPoint();

		assert(
			entrypoint.DefaultDataStore !== undefined,
			"container entrypoint must be DefaultDataStore",
		);

		loadedContainer.forceReadonly?.(true);

		assert(entrypoint.DefaultDataStore.readonly === true, "should be readonly");
		assert(
			entrypoint.DefaultDataStore.readonlyEventCount === 1,
			"should be any readonly events",
		);
	});

	it("Readonly is correct after forceReadonly before datastore load", async () => {
		const loadedContainer = await loadExistingContainer(
			await createContainerAndGetLoadProps(),
		);

		loadedContainer.forceReadonly?.(true);

		const entrypoint: FluidObject<DefaultDataStore> = await loadedContainer.getEntryPoint();

		assert(
			entrypoint.DefaultDataStore !== undefined,
			"container entrypoint must be DefaultDataStore",
		);

		assert(entrypoint.DefaultDataStore.readonly === true, "should be readonly");
		assert(
			entrypoint.DefaultDataStore.readonlyEventCount === 0,
			"shouldn't be any readonly events",
		);
	});
});
