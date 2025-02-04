/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import {
	AttachState,
	type IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import {
	loadContainerRuntime,
	RuntimeHeaders,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
// eslint-disable-next-line import/no-deprecated
import type { IContainerRuntimeWithResolveHandle_Deprecated } from "@fluidframework/container-runtime-definitions/internal";
import type {
	IFluidHandle,
	FluidObject,
	IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { assert, Lazy, LazyPromise } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { ISharedMap, SharedMap } from "@fluidframework/map/internal";
import type { IDataStore } from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";

import { ddsModelMap } from "./ddsModels";
import { makeUnreachableCodePathProxy } from "./localServerStressHarness";

export class StressDataObject extends DataObject {
	public static readonly factory = new Lazy(() => {
		const factory = new DataObjectFactory(
			"StressDataObject",
			StressDataObject,
			[...ddsModelMap.values()].map((v) => v.factory),
			{},
			[["StressDataObject", new LazyPromise(() => factory)]],
		);
		return factory;
	});

	get StressDataObject() {
		return this;
	}

	private defaultStressObject: DefaultStressDataObject = makeUnreachableCodePathProxy(
		"defaultStressDataObject",
	);
	public async globalObjects() {
		return this.defaultStressObject.globalObjects();
	}
	protected async getDefaultStressDataObject(): Promise<DefaultStressDataObject> {
		const defaultDataStore =
			await this.context.containerRuntime.getAliasedDataStoreEntryPoint("default");
		assert(defaultDataStore !== undefined, "default must exist");

		const maybe: FluidObject<DefaultStressDataObject> | undefined =
			await defaultDataStore.get();
		assert(maybe.DefaultStressDataObject !== undefined, "must be DefaultStressDataObject");
		return maybe.DefaultStressDataObject;
	}

	private channelNameMap: ISharedMap = makeUnreachableCodePathProxy("channelNameMap");
	protected async initializingFirstTime(props?: any): Promise<void> {
		this.channelNameMap = SharedMap.create(this.runtime, "channelNameMap");
		this.channelNameMap.bindToContext();
		this.channelNameMap.set("root", this.root.attributes.type);
	}

	public async channels() {
		const channels: IChannel[] = [];
		for (const [name] of this.channelNameMap.entries()) {
			const channel = await this.runtime.getChannel(name).catch(() => undefined);
			if (channel !== undefined) {
				channels.push(channel);
			}
		}
		return channels;
	}

	protected async hasInitialized(): Promise<void> {
		this.defaultStressObject = await this.getDefaultStressDataObject();

		this.channelNameMap = (await this.runtime.getChannel(
			"channelNameMap",
		)) as any as ISharedMap;
	}

	public get attached() {
		return this.runtime.attachState === AttachState.Attached;
	}

	public uploadBlob(id: `blob-${number}`, contents: string) {
		void this.runtime.uploadBlob(stringToBuffer(contents, "utf-8")).then((handle) =>
			this.defaultStressObject.registerObject({
				type: "newBlob",
				handle,
				id,
			}),
		);
	}

	public createChannel(id: `channel-${number}`, type: string) {
		this.runtime.createChannel(id, type);
		this.channelNameMap.set(id, type);
	}

	public createDataStore(id: `datastore-${number}`, asChild: boolean) {
		void this.context.containerRuntime
			.createDataStore(
				asChild
					? [...this.context.packagePath, StressDataObject.factory.value.type]
					: StressDataObject.factory.value.type,
			)
			.then(async (dataStore) => {
				this.defaultStressObject.registerObject({
					type: "stressDataObject",
					dataStore,
					handle: dataStore.entryPoint,
					id,
					stressDataObject: new LazyPromise(async () => {
						const maybe: FluidObject<StressDataObject> | undefined =
							await dataStore.entryPoint.get();
						assert(maybe?.StressDataObject !== undefined, "must be stressDataObject");
						return maybe.StressDataObject;
					}),
				});
			});
	}
}
export type ContainerObjects =
	| { type: "newBlob"; handle: IFluidHandle; id: `blob-${number}` }
	| {
			type: "stressDataObject";
			id: `datastore-${number}`;
			dataStore: IDataStore | undefined;
			handle: IFluidHandle;
			stressDataObject: LazyPromise<StressDataObject>;
	  }
	| { type: "newAlias"; id: `alias-${number}`; handle: undefined };

class DefaultStressDataObject extends StressDataObject {
	public static readonly alias = "default";

	public get DefaultStressDataObject() {
		return this;
	}

	private readonly _globalObjects: Record<string, ContainerObjects> = {};
	public async globalObjects(): Promise<Readonly<Record<string, Readonly<ContainerObjects>>>> {
		const globalObjects: Record<string, Readonly<ContainerObjects>> = {
			...this._globalObjects,
		};
		const containerRuntime = // eslint-disable-next-line import/no-deprecated
			this.context.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;
		for (const url of this.map.keys()) {
			const resp = await containerRuntime.resolveHandle({
				url,
				headers: { [RuntimeHeaders.wait]: false },
			});
			if (resp.status === 200) {
				const maybeHandle: FluidObject<IFluidLoadable> | undefined = resp.value;
				const handle = maybeHandle?.IFluidLoadable?.handle;
				if (handle !== undefined) {
					const entry = this.map.get<ContainerObjects>(url);
					switch (entry?.type) {
						case "newAlias":
							globalObjects[entry.id] = {
								...entry,
								handle: undefined,
							};
							break;
						case "newBlob":
							globalObjects[entry.id] = {
								...entry,
								handle,
							};
							break;
						case "stressDataObject":
							globalObjects[entry.id] = {
								type: "stressDataObject",
								id: entry.id,
								dataStore: undefined,
								handle,
								stressDataObject: new LazyPromise(async () => {
									const maybe = (await handle.get()) as
										| FluidObject<StressDataObject>
										| undefined;
									assert(maybe?.StressDataObject !== undefined, "must be stressDataObject");
									return maybe.StressDataObject;
								}),
							};
							break;
						default:
					}
				}
			}
		}
		return globalObjects;
	}

	protected override async getDefaultStressDataObject(): Promise<DefaultStressDataObject> {
		return this;
	}

	private map: ISharedMap = makeUnreachableCodePathProxy("map");
	protected async initializingFirstTime(props?: any): Promise<void> {
		await super.initializingFirstTime(props);
		this.map = SharedMap.create(this.runtime, "privateRoot");
		this.map.bindToContext();

		this.registerObject({
			type: "stressDataObject",
			handle: this.handle,
			id: `datastore-0`,
			dataStore: undefined,
			stressDataObject: new LazyPromise(async () => this),
		});
	}

	protected async initializingFromExisting(): Promise<void> {
		this.map = (await this.runtime.getChannel("privateRoot")) as any as ISharedMap;
	}

	public registerObject(obj: ContainerObjects) {
		if (obj.handle) {
			const handle = toFluidHandleInternal(obj.handle);
			if (this.map.get(handle.absolutePath) === undefined) {
				this.map.set(handle.absolutePath, { id: obj.id, type: obj.type });
			}
		}
		this._globalObjects[obj.id] = obj;
	}
}

export const createRuntimeFactory = (): IRuntimeFactory => {
	const defaultStressDataObjectFactory = new DataObjectFactory(
		"DefaultStressDataObject",
		DefaultStressDataObject,
		[...ddsModelMap.values()].map((v) => v.factory),
		{},
		[[StressDataObject.factory.value.type, StressDataObject.factory.value]],
	);

	const runtimeOptions: IContainerRuntimeOptionsInternal = {
		summaryOptions: {
			summaryConfigOverrides: {
				maxOps: 3,
				initialSummarizerDelayMs: 0,
			} as any,
		},
	};

	return {
		get IRuntimeFactory() {
			return this;
		},
		instantiateRuntime: async (context, existing) => {
			return loadContainerRuntime({
				context,
				existing,
				runtimeOptions,
				registryEntries: [
					[
						defaultStressDataObjectFactory.type,
						Promise.resolve(defaultStressDataObjectFactory),
					],
					[
						StressDataObject.factory.value.type,
						Promise.resolve(StressDataObject.factory.value),
					],
				],
				provideEntryPoint: async (rt) => {
					const maybeDefault = await rt.getAliasedDataStoreEntryPoint(
						DefaultStressDataObject.alias,
					);
					if (maybeDefault === undefined) {
						const ds = await rt.createDataStore(defaultStressDataObjectFactory.type);
						await ds.trySetAlias(DefaultStressDataObject.alias);
					}
					const aliasedDefault = await rt.getAliasedDataStoreEntryPoint(
						DefaultStressDataObject.alias,
					);
					assert(aliasedDefault !== undefined, "default must exist");

					const maybe: FluidObject<StressDataObject> | undefined = await aliasedDefault.get();
					return maybe;
				},
			});
		},
	};
};
