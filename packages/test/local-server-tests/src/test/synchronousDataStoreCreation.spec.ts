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

class IAmFooBar {
	public static create(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
		const root = SharedMap.create(runtime, "root");
		root.bindToContext();
		return new IAmFooBar(context, runtime, root);
	}

	public static async load(context: IFluidDataStoreContext, runtime: IFluidDataStoreRuntime) {
		const root = (await runtime.getChannel("root")) as unknown as ISharedMap;
		return new IAmFooBar(context, runtime, root);
	}

	private constructor(
		public readonly context: IFluidDataStoreContext,
		public readonly runtime: IFluidDataStoreRuntime,
		public readonly sharedMap: ISharedMap,
	) {}

	get IAmFooBar() {
		return this;
	}

	createAnother() {
		const context = this.context.containerRuntime.createDetachedDataStore(["foo", "foo"]);
		const { runtime, fooBar } = factory.createDataStoreSync(context);

		const bindP = context.attachRuntime(factory, runtime);

		return { fooBar, bindP };
	}
}

const mapFactory = SharedMap.getFactory();
const sharedObjectRegistry = new Map<string, IChannelFactory>([[mapFactory.type, mapFactory]]);

class Factory implements IFluidDataStoreFactory, IFluidDataStoreRegistry {
	get IFluidDataStoreFactory() {
		return this;
	}
	get IFluidDataStoreRegistry() {
		return this;
	}
	async get(name: string): Promise<FluidDataStoreRegistryEntry | undefined> {
		if (name === this.type) {
			return this;
		}
	}

	public readonly type = "foo";

	createDataStoreSync(context: IFluidDataStoreContext): {
		runtime: IFluidDataStoreChannel;
		fooBar: IAmFooBar;
	} {
		const runtime = new FluidDataStoreRuntime(
			context,
			sharedObjectRegistry,
			false,
			async () => fooBar,
		);
		const fooBar = IAmFooBar.create(context, runtime);

		return {
			fooBar,
			runtime,
		};
	}
	async instantiateDataStore(context, existing) {
		if (existing) {
			return new FluidDataStoreRuntime(context, sharedObjectRegistry, true, async (rt) =>
				IAmFooBar.load(context, rt),
			);
		}
		return this.createDataStoreSync(context).runtime;
	}
}
const factory = new Factory();

describe("Scenario Test", () => {
	it("Synchronously create nested data store", async () => {
		const deltaConnectionServer = LocalDeltaConnectionServer.create();

		const runtimeFactory: IRuntimeFactory = {
			get IRuntimeFactory() {
				return this;
			},
			instantiateRuntime: async (context, existing) => {
				return loadContainerRuntime({
					context,
					existing,
					registryEntries: [[factory.type, Promise.resolve(factory)]],
					provideEntryPoint: async (rt) => {
						const maybeRoot = await rt.getAliasedDataStoreEntryPoint("root");
						if (maybeRoot === undefined) {
							const ds = await rt.createDataStore("foo");

							const alias = await ds.trySetAlias("root");
							assert(alias === "Success", "asd");
						}
						const root = await rt.getAliasedDataStoreEntryPoint("root");
						assert(root !== undefined, "asd");
						return root.get();
					},
				});
			},
		};

		const { loader, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory,
		});

		const container = await loader.createDetachedContainer(codeDetails);

		await container.attach(urlResolver.createCreateNewRequest("test"));
		{
			const entrypoint: FluidObject<IAmFooBar> = await container.getEntryPoint();

			assert(entrypoint.IAmFooBar !== undefined, "blah");

			const { bindP, fooBar } = entrypoint.IAmFooBar.createAnother();

			fooBar.sharedMap.set("child", "me");

			// can we make this synchronous
			await bindP;

			entrypoint.IAmFooBar.sharedMap.set("child", fooBar.runtime.entryPoint);
			await new Promise<void>((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		assert(url !== undefined, "asd");
		{
			const container2 = await loader.resolve({ url });
			await waitContainerToCatchUp(container2);
			const entrypoint: FluidObject<IAmFooBar> = await container2.getEntryPoint();

			assert(entrypoint.IAmFooBar !== undefined, "blah");

			const childHandle = entrypoint.IAmFooBar.sharedMap.get("child");
			assert(isFluidHandle(childHandle), "blah");
			const child = (await childHandle.get()) as FluidObject<IAmFooBar>;
			assert(child.IAmFooBar !== undefined, "asdsad");
			assert(child.IAmFooBar.sharedMap.get("child") === "me", "me");
		}
	});
});
