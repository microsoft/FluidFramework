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
	ErasedType,
} from "@fluidframework/core-interfaces";
import { assert, LazyPromise, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { ISharedMap, SharedMap } from "@fluidframework/map/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";

import { ddsModelMap } from "./ddsModels.js";
import { makeUnreachableCodePathProxy } from "./utils.js";

export interface UploadBlob {
	type: "uploadBlob";
	tag: `blob-${number}`;
}
export interface CreateDataStore {
	type: "createDataStore";
	asChild: boolean;
	tag: `datastore-${number}`;
}

export interface CreateChannel {
	type: "createChannel";
	channelType: string;
	tag: `channel-${number}`;
}

export interface EnterStagingMode {
	type: "enterStagingMode";
}
export interface ExitStagingMode {
	type: "exitStagingMode";
	accept: boolean;
}

export type StressDataObjectOperations =
	| UploadBlob
	| CreateDataStore
	| CreateChannel
	| EnterStagingMode
	| ExitStagingMode;

export class StressDataObject extends DataObject {
	public static readonly factory: DataObjectFactory<StressDataObject> = new DataObjectFactory(
		"StressDataObject",
		StressDataObject,
		[...ddsModelMap.values()].map((v) => v.factory),
		{},
		[["StressDataObject", new LazyPromise(async () => StressDataObject.factory)]],
	);

	get StressDataObject() {
		return this;
	}

	private defaultStressObject: DefaultStressDataObject = makeUnreachableCodePathProxy(
		"defaultStressDataObject",
	);
	protected async getDefaultStressDataObject(): Promise<DefaultStressDataObject> {
		const defaultDataStore =
			await this.context.containerRuntime.getAliasedDataStoreEntryPoint("default");
		assert(defaultDataStore !== undefined, "default must exist");

		const maybe: FluidObject<DefaultStressDataObject> | undefined =
			await defaultDataStore.get();
		assert(maybe.DefaultStressDataObject !== undefined, "must be DefaultStressDataObject");
		return maybe.DefaultStressDataObject;
	}

	/**
	 * this map is special, and doesn't participate in stress. it hold data
	 * about the name of channels which have been created. these created channel
	 * may or may not be attached and be available
	 */
	private channelNameMap: ISharedMap = makeUnreachableCodePathProxy("channelNameMap");
	protected async initializingFirstTime(props?: any): Promise<void> {
		this.channelNameMap = SharedMap.create(this.runtime, "channelNameMap");
		this.channelNameMap.bindToContext();
		this.channelNameMap.set("root", this.root.attributes.type);
	}

	public async getChannels() {
		const channels: IChannel[] = [];
		for (const [name] of this.channelNameMap.entries()) {
			// similar to container objects, the entries in this map
			// can appear before the underlying channel is attached,
			// so getting the channel can fail, and we need to try
			// to get all channel each time, as we have no way to
			// observer when a channel moves from detached to attached,
			// especially on remove clients/
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

	public async uploadBlob(tag: `blob-${number}`, contents: string) {
		const handle = await this.runtime.uploadBlob(stringToBuffer(contents, "utf-8"));
		this.defaultStressObject.registerLocallyCreatedObject({
			type: "newBlob",
			handle,
			tag,
		});
	}

	public createChannel(tag: `channel-${number}`, type: string) {
		this.runtime.createChannel(tag, type);
		this.channelNameMap.set(tag, type);
	}

	public async createDataStore(tag: `datastore-${number}`, asChild: boolean) {
		const dataStore = await this.context.containerRuntime.createDataStore(
			asChild
				? [...this.context.packagePath, StressDataObject.factory.type]
				: StressDataObject.factory.type,
		);

		const maybe: FluidObject<StressDataObject> | undefined = await dataStore.entryPoint.get();
		assert(maybe?.StressDataObject !== undefined, "must be stressDataObject");
		this.defaultStressObject.registerLocallyCreatedObject({
			type: "stressDataObject",
			handle: dataStore.entryPoint,
			tag,
			stressDataObject: maybe.StressDataObject,
		});
	}
}
export type ContainerObjects =
	| { type: "newBlob"; handle: IFluidHandle; tag: `blob-${number}` }
	| {
			type: "stressDataObject";
			tag: `datastore-${number}`;
			handle: IFluidHandle;
			stressDataObject: StressDataObject;
	  };

export class DefaultStressDataObject extends StressDataObject {
	public static readonly alias = "default";

	public get DefaultStressDataObject() {
		return this;
	}

	/**
	 * these are object created in memory by this instance of the datastore, they
	 * will also be in  these the containerObjectMap, but are not necessarily usable
	 * as they could be detached, in which can only this instance can access them.
	 */
	private readonly _locallyCreatedObjects: ContainerObjects[] = [];
	public async getContainerObjects(): Promise<readonly Readonly<ContainerObjects>[]> {
		const containerObjects: Readonly<ContainerObjects>[] = [...this._locallyCreatedObjects];
		const containerRuntime = // eslint-disable-next-line import/no-deprecated
			this.context.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;
		for (const [url, entry] of this.containerObjectMap as any as [
			string,
			ContainerObjects,
		][]) {
			// the container objects map will see things before they are attached,
			// so they may not be available to remote clients yet.
			// Additionally, there is no way to observe when an
			// object goes from detached to attached.
			// Due to the both the above, we need to always try
			// to resolve each object, and just ignore those which can't
			// be found.
			const resp = await containerRuntime.resolveHandle({
				url,
				headers: { [RuntimeHeaders.wait]: false },
			});
			if (resp.status === 200) {
				const maybe: FluidObject<IFluidLoadable & StressDataObject> | undefined = resp.value;
				const handle = maybe?.IFluidLoadable?.handle;
				if (handle !== undefined) {
					const type = entry?.type;
					switch (type) {
						case "newBlob":
							containerObjects.push({
								...entry,
								handle,
							});
							break;
						case "stressDataObject":
							assert(maybe?.StressDataObject !== undefined, "must be stressDataObject");

							containerObjects.push({
								type: "stressDataObject",
								tag: entry.tag,
								handle,
								stressDataObject: maybe.StressDataObject,
							});
							break;
						default:
							unreachableCase(type, `${type}`);
					}
				}
			}
		}
		return containerObjects;
	}

	protected override async getDefaultStressDataObject(): Promise<DefaultStressDataObject> {
		return this;
	}

	/**
	 * this map is special, and doesn't participate in stress. it holds data
	 * about the name of container objects which have been created. these created objects
	 * may or may not be attached and be available
	 */
	private containerObjectMap: ISharedMap = makeUnreachableCodePathProxy("containerObjectMap");
	protected async initializingFirstTime(props?: any): Promise<void> {
		await super.initializingFirstTime(props);
		this.containerObjectMap = SharedMap.create(this.runtime, "containerObjectMap");
		this.containerObjectMap.bindToContext();

		this.registerLocallyCreatedObject({
			type: "stressDataObject",
			handle: this.handle,
			tag: `datastore-0`,
			stressDataObject: this,
		});
	}

	protected async initializingFromExisting(): Promise<void> {
		this.containerObjectMap = (await this.runtime.getChannel(
			"containerObjectMap",
		)) as any as ISharedMap;
	}

	public registerLocallyCreatedObject(obj: ContainerObjects) {
		if (obj.handle !== undefined) {
			const handle = toFluidHandleInternal(obj.handle);
			if (this.containerObjectMap.get(handle.absolutePath) === undefined) {
				this.containerObjectMap.set(handle.absolutePath, { tag: obj.tag, type: obj.type });
			}
		}
		this._locallyCreatedObjects.push(obj);
	}

	private stageControls: ErasedType<"StagingModeHandle"> | undefined;
	public enterStagingMode() {
		this.stageControls = this.context.containerRuntime.enterStagingMode();
	}

	public inStagingMode(): boolean {
		return this.context.containerRuntime.inStagingMode;
	}

	public exitStagingMode(accept: boolean) {
		this.context.containerRuntime.exitStagingMode(
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.stageControls!,
			accept ? { type: "accept" } : { type: "reject" },
		);
	}
}

export const createRuntimeFactory = (): IRuntimeFactory => {
	const defaultStressDataObjectFactory = new DataObjectFactory(
		"DefaultStressDataObject",
		DefaultStressDataObject,
		[...ddsModelMap.values()].map((v) => v.factory),
		{},
		[[StressDataObject.factory.type, StressDataObject.factory]],
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
			const runtime = await loadContainerRuntime({
				context,
				existing,
				runtimeOptions,
				registryEntries: [
					[
						defaultStressDataObjectFactory.type,
						Promise.resolve(defaultStressDataObjectFactory),
					],
					[StressDataObject.factory.type, Promise.resolve(StressDataObject.factory)],
				],
				provideEntryPoint: async (rt) => {
					const aliasedDefault = await rt.getAliasedDataStoreEntryPoint(
						DefaultStressDataObject.alias,
					);
					assert(aliasedDefault !== undefined, "default must exist");

					return aliasedDefault.get();
				},
			});

			if (!existing) {
				const ds = await runtime.createDataStore(defaultStressDataObjectFactory.type);
				await ds.trySetAlias(DefaultStressDataObject.alias);
			}

			return runtime;
		},
	};
};
