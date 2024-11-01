/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import { waitContainerToCatchUp } from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { FluidObject } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import {
	IChannelFactory,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { ISharedMap, SharedMap } from "@fluidframework/map/internal";
import type {
	FluidDataStoreRegistryEntry,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IFluidDataStoreRegistry,
} from "@fluidframework/runtime-definitions/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { createLoader } from "../utils.js";

const mapFactory = SharedMap.getFactory();
const sharedObjectRegistry = new Map<string, IChannelFactory>([[mapFactory.type, mapFactory]]);

// a data store object which can create another instance of it self as synchronously as possible
class DataStoreWithSyncCreate {
	public static create(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
		const root = SharedMap.create(runtime, "root");
		root.bindToContext();
		return new DataStoreWithSyncCreate(context, runtime, root);
	}

	public static async load(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
		const root = (await runtime.getChannel("root")) as unknown as ISharedMap;
		return new DataStoreWithSyncCreate(context, runtime, root);
	}
	public static readonly type = "DataStoreWithSyncCreate";

	private constructor(
		private readonly context: IFluidDataStoreContext,
		private readonly runtime: IFluidDataStoreRuntime,
		public readonly sharedMap: ISharedMap,
	) {}

	get DataStoreWithSyncCreate() {
		return this;
	}
	get handle() {
		return this.runtime.entryPoint;
	}

	createAnother(): DataStoreWithSyncCreate {
		assert(
			this.context.tryCreateChildDataStoreSync !== undefined,
			"this.context.tryCreateChildDataStoreSync",
		);
		// creates a detached context with a factory who's package path is the same
		// as the current datastore, but with another copy of its own type.
		const created = this.context.tryCreateChildDataStoreSync(
			DataStoreWithSyncCreateFactory.instance,
		);

		return created.entrypoint;
	}
}

// a simple datastore factory that is also a registry so that it can create instances of itself
class DataStoreWithSyncCreateFactory
	implements IFluidDataStoreFactory, IFluidDataStoreRegistry
{
	static readonly instance = new DataStoreWithSyncCreateFactory();
	public readonly type = DataStoreWithSyncCreate.type;

	private constructor() {}

	get IFluidDataStoreRegistry() {
		return this;
	}
	get(name: string): FluidDataStoreRegistryEntry | undefined {
		// this factory is also a registry, which only supports creating itself
		if (name === this.type) {
			return this;
		}
	}

	get IFluidDataStoreFactory() {
		return this;
	}
	async instantiateDataStore(context, existing) {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			existing,
			async () => dataStore,
		);
		const dataStore = existing
			? DataStoreWithSyncCreate.load(context, runtime)
			: DataStoreWithSyncCreate.create(context, runtime);

		return runtime;
	}

	createDataStore(context: IFluidDataStoreContext): {
		runtime: IFluidDataStoreChannel;
		entrypoint: DataStoreWithSyncCreate;
	} {
		const runtime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			false,
			async () => entrypoint,
		);
		const entrypoint = DataStoreWithSyncCreate.create(context, runtime);
		return { runtime, entrypoint };
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
					DataStoreWithSyncCreateFactory.instance.type,
					Promise.resolve(DataStoreWithSyncCreateFactory.instance),
				],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(DataStoreWithSyncCreate.type);
					await ds.trySetAlias("default");
				}
				const root = await rt.getAliasedDataStoreEntryPoint("default");
				assert(root !== undefined, "default must exist");
				return root.get();
			},
		});
	},
};

describe("Scenario Test", () => {
	it("Synchronously create nested data store", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loader, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});

		const container = await loader.createDetachedContainer(codeDetails);

		await container.attach(urlResolver.createCreateNewRequest("test"));
		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "container must have url");
		{
			const entrypoint: FluidObject<DataStoreWithSyncCreate> = await container.getEntryPoint();

			assert(
				entrypoint.DataStoreWithSyncCreate !== undefined,
				"container entrypoint must be DataStoreWithSyncCreate",
			);

			const dataStore = entrypoint.DataStoreWithSyncCreate.createAnother();

			dataStore.sharedMap.set("childValue", "childValue");

			entrypoint.DataStoreWithSyncCreate.sharedMap.set("childInstance", dataStore.handle);
			if (container.isDirty) {
				await new Promise<void>((resolve) => container.once("saved", () => resolve()));
			}
			container.dispose();
		}

		{
			const container2 = await loader.resolve({ url });
			await waitContainerToCatchUp(container2);
			const entrypoint: FluidObject<DataStoreWithSyncCreate> =
				await container2.getEntryPoint();

			assert(
				entrypoint.DataStoreWithSyncCreate !== undefined,
				"container2 entrypoint must be DataStoreWithSyncCreate",
			);

			const childHandle = entrypoint.DataStoreWithSyncCreate.sharedMap.get("childInstance");
			assert(isFluidHandle(childHandle), "childInstance should be a handle");
			const child = (await childHandle.get()) as FluidObject<DataStoreWithSyncCreate>;
			assert(
				child.DataStoreWithSyncCreate !== undefined,
				"child must be DataStoreWithSyncCreate",
			);
			assert(
				child.DataStoreWithSyncCreate.sharedMap.get("childValue") === "childValue",
				"unexpected childValue",
			);
			container2.dispose();
		}
	});
});
