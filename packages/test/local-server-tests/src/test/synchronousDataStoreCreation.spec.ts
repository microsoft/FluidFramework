/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AttachState,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
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

class ChildDataStore {
	public static create(runtime: IFluidDataStoreRuntime) {
		const root = SharedMap.create(runtime, "root");
		root.bindToContext();
		return new ChildDataStore(runtime, root);
	}

	public static async load(runtime: IFluidDataStoreRuntime) {
		const root = (await runtime.getChannel("root")) as unknown as ISharedMap;
		return new ChildDataStore(runtime, root);
	}

	private constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		public readonly sharedMap: ISharedMap,
	) {}

	get ChildDataStore() {
		return this;
	}
	get handle() {
		return this.runtime.entryPoint;
	}
}

class ChildDataStoreFactory implements IFluidDataStoreFactory {
	static readonly instance = new ChildDataStoreFactory();

	private constructor() {}

	get IFluidDataStoreFactory() {
		return this;
	}
	public readonly type = "ChildDataStore";

	async instantiateDataStore(context, existing) {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			existing,
			async () => dataStore,
		);
		const dataStore = existing ? ChildDataStore.load(runtime) : ChildDataStore.create(runtime);

		return runtime;
	}

	createDataStore(context: IFluidDataStoreContext): {
		runtime: IFluidDataStoreChannel;
		entrypoint: ChildDataStore;
	} {
		const runtime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			false,
			async () => entrypoint,
		);
		const entrypoint = ChildDataStore.create(runtime);
		return { runtime, entrypoint };
	}
}

class ParentDataStore {
	public static create(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
		const root = SharedMap.create(runtime, "root");
		root.bindToContext();
		const parent = new ParentDataStore(context, runtime, root);
		root.set("parentCreation", parent.createChild().handle);
		return parent;
	}

	public static async load(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
		const root = (await runtime.getChannel("root")) as unknown as ISharedMap;
		return new ParentDataStore(context, runtime, root);
	}

	private constructor(
		private readonly context: IFluidDataStoreContext,
		private readonly runtime: IFluidDataStoreRuntime,
		public readonly sharedMap: ISharedMap,
	) {}

	get ParentDataStore() {
		return this;
	}

	get handle() {
		return this.runtime.entryPoint;
	}

	createChild(): ChildDataStore {
		assert(
			this.context.createChildDataStoreSync !== undefined,
			"this.context.createChildDataStoreSync",
		);
		// creates a detached context with a factory who's package path is the same
		// as the current datastore, but with another copy of its own type.
		const { entrypoint } = this.context.createChildDataStoreSync(
			ChildDataStoreFactory.instance,
		);

		entrypoint.sharedMap.set("childValue", "childValue");

		return entrypoint;
	}
}

class ParentDataStoreFactory implements IFluidDataStoreFactory, IFluidDataStoreRegistry {
	static readonly instance = new ParentDataStoreFactory();

	private constructor() {}

	get IFluidDataStoreRegistry() {
		return this;
	}
	get(name: string): FluidDataStoreRegistryEntry | undefined {
		// this factory is also a registry, which only supports creating itself
		if (name === ChildDataStoreFactory.instance.type) {
			return ChildDataStoreFactory.instance;
		}
	}

	get IFluidDataStoreFactory() {
		return this;
	}
	public readonly type = "ParentDataStore";

	async instantiateDataStore(context, existing) {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			existing,
			async () => dataStore,
		);
		const dataStore = existing
			? ParentDataStore.load(context, runtime)
			: ParentDataStore.create(context, runtime);

		return runtime;
	}
}

// a simple datastore factory that is also a registry so that it can create instances of itself

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
					ParentDataStoreFactory.instance.type,
					// the parent is still async in the container registry
					// this allows things like code splitting for dynamic loading
					Promise.resolve(ParentDataStoreFactory.instance),
				],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(ParentDataStoreFactory.instance.type);
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
	it("Synchronously create child data store", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const { loader, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});

		const container = await loader.createDetachedContainer(codeDetails);

		{
			const entrypoint: FluidObject<ParentDataStore> = await container.getEntryPoint();

			assert(
				entrypoint.ParentDataStore !== undefined,
				"container entrypoint must be ParentDataStore",
			);

			// create a child while detached
			entrypoint.ParentDataStore.sharedMap.set(
				"detachedChildInstance",
				entrypoint.ParentDataStore.createChild().handle,
			);

			const attachP = container.attach(urlResolver.createCreateNewRequest("test"));

			if (container.attachState === AttachState.Attached) {
				await new Promise<void>((resolve) => container.once("attaching", () => resolve()));
			}

			// create a child while attaching
			entrypoint.ParentDataStore.sharedMap.set(
				"attachingChildInstance",
				entrypoint.ParentDataStore.createChild().handle,
			);

			await attachP;

			// create a child once attached
			entrypoint.ParentDataStore.sharedMap.set(
				"attachedChildInstance",
				entrypoint.ParentDataStore.createChild().handle,
			);

			if (container.isDirty) {
				await new Promise<void>((resolve) => container.once("saved", () => resolve()));
			}
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "container must have url");
		container.dispose();

		{
			const container2 = await loader.resolve({ url });
			await waitContainerToCatchUp(container2);
			const entrypoint: FluidObject<ParentDataStore> = await container2.getEntryPoint();

			assert(
				entrypoint.ParentDataStore !== undefined,
				"container2 entrypoint must be ParentDataStore",
			);

			for (const childKey of [
				"parentCreation",
				"detachedChildInstance",
				"attachingChildInstance",
				"attachedChildInstance",
			]) {
				const childHandle = entrypoint.ParentDataStore.sharedMap.get(childKey);
				assert(isFluidHandle(childHandle), `${childKey} should be a handle`);
				const child = (await childHandle.get()) as FluidObject<ChildDataStore>;
				assert(child.ChildDataStore !== undefined, `${childKey} must be ChildDataStore`);
				assert(
					child.ChildDataStore.sharedMap.get("childValue") === "childValue",
					"unexpected childValue",
				);
			}
			container2.dispose();
		}
	});
});
