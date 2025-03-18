/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import {
	AttachState,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	waitContainerToCatchUp,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import { IFluidHandle, type FluidObject } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { FluidDataStoreRuntime } from "@fluidframework/datastore/internal";
import {
	IChannelFactory,
	type IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { ISharedMap, SharedMap } from "@fluidframework/map/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { createLoader } from "../utils.js";

const mapFactory = SharedMap.getFactory();
const sharedObjectRegistry = new Map<string, IChannelFactory>([[mapFactory.type, mapFactory]]);

/**
 * This is the child datastore that will be created synchronously
 */
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
		private readonly sharedMap: SharedMap,
	) {}

	get ChildDataStore() {
		return this;
	}

	public setProperty(key: string, value: string | number) {
		this.sharedMap.set(key, value);
	}

	public getProperty(key: string): string | number | undefined {
		return this.sharedMap.get(key);
	}

	get handle() {
		return this.runtime.entryPoint;
	}
}
/**
 * This is the child datastore factory. It must implement
 * createDataStore to support synchronous creation.
 * instantiateDataStore will continue to be used after creation
 * to load the datastore.
 */
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

/**
 * This is the parent DataObject, which is also a datastore. It has a
 * synchronous method to create child datastores, which could be called
 * in response to synchronous user input, like a key press.
 */
class ParentDataObject extends DataObject {
	get ParentDataObject() {
		return this;
	}
	protected override async initializingFirstTime(): Promise<void> {
		// create synchronously during initialization
		this.createChild("parentCreation");
	}

	createChild(name: string): ChildDataStore {
		assert(
			this.context.createChildDataStore !== undefined,
			"this.context.createChildDataStore",
		);
		const { entrypoint } = this.context.createChildDataStore(ChildDataStoreFactory.instance);
		const dir = this.root.createSubDirectory("children");
		dir.set(name, entrypoint.handle);
		entrypoint.setProperty("childValue", name);

		return entrypoint;
	}

	getChild(name: string): IFluidHandle<ChildDataStore> | undefined {
		const dir = this.root.getSubDirectory("children");
		return dir?.get<IFluidHandle<ChildDataStore>>(name);
	}
}

/**
 * This is the parent DataObjects factory. It specifies the child data stores
 * factory in a sub-registry. This is requires for synchronous creation of the child.
 */
const parentDataObjectFactory = new DataObjectFactory(
	"ParentDataObject",
	ParentDataObject,
	undefined,
	{},
	[[ChildDataStoreFactory.instance.type, ChildDataStoreFactory.instance]],
);

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
					parentDataObjectFactory.type,
					// the parent is still async in the container registry
					// this allows things like code splitting for dynamic loading
					Promise.resolve(parentDataObjectFactory),
				],
			],
			provideEntryPoint: async (rt) => {
				const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
				if (maybeRoot === undefined) {
					const ds = await rt.createDataStore(parentDataObjectFactory.type);
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

		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});

		const container = await createDetachedContainer({ ...loaderProps, codeDetails });

		{
			const entrypoint: FluidObject<ParentDataObject> = await container.getEntryPoint();

			assert(
				entrypoint.ParentDataObject !== undefined,
				"container entrypoint must be ParentDataStore",
			);

			// create a child while detached
			entrypoint.ParentDataObject.createChild("detachedChildInstance");

			const attachP = container.attach(urlResolver.createCreateNewRequest("test"));

			if (container.attachState === AttachState.Attached) {
				await new Promise<void>((resolve) => container.once("attaching", () => resolve()));
			}

			// create a child while attaching
			entrypoint.ParentDataObject.createChild("attachingChildInstance");

			await attachP;

			// create a child once attached
			entrypoint.ParentDataObject.createChild("attachedChildInstance");

			if (container.isDirty) {
				await new Promise<void>((resolve) => container.once("saved", () => resolve()));
			}
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "container must have url");
		container.dispose();

		{
			const container2 = await loadExistingContainer({ ...loaderProps, request: { url } });
			await waitContainerToCatchUp(container2);
			const entrypoint: FluidObject<ParentDataObject> = await container2.getEntryPoint();

			assert(
				entrypoint.ParentDataObject !== undefined,
				"container2 entrypoint must be ParentDataStore",
			);

			for (const childKey of [
				"parentCreation",
				"detachedChildInstance",
				"attachingChildInstance",
				"attachedChildInstance",
			]) {
				const childHandle = entrypoint.ParentDataObject.getChild(childKey);
				assert(childHandle !== undefined, `${childKey} must be defined`);
				assert(isFluidHandle(childHandle), `${childKey} should be a handle`);
				const child = (await childHandle.get()) as FluidObject<ChildDataStore>;
				assert(child.ChildDataStore !== undefined, `${childKey} must be ChildDataStore`);
				assert(
					child.ChildDataStore.getProperty("childValue") === childKey,
					"unexpected childValue",
				);
			}
			container2.dispose();
		}
	});
});
