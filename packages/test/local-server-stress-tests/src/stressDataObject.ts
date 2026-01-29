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
	ContainerRuntime,
	loadContainerRuntime,
	type IContainerRuntimeOptionsInternal,
} from "@fluidframework/container-runtime/internal";
// eslint-disable-next-line import-x/no-deprecated
import type { IContainerRuntimeWithResolveHandle_Deprecated } from "@fluidframework/container-runtime-definitions/internal";
import type {
	IFluidHandle,
	FluidObject,
	IFluidLoadable,
} from "@fluidframework/core-interfaces";
import { assert, LazyPromise, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
// Valid export as per package.json export map
// eslint-disable-next-line import-x/no-internal-modules
import { modifyClusterSize } from "@fluidframework/id-compressor/internal/test-utils";
import type { StageControlsAlpha } from "@fluidframework/runtime-definitions/internal";
import {
	RuntimeHeaders,
	asLegacyAlpha,
	toFluidHandleInternal,
} from "@fluidframework/runtime-utils/internal";
import { timeoutAwait } from "@fluidframework/test-utils/internal";

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
	commit: boolean;
}

export type StressDataObjectOperations =
	| UploadBlob
	| CreateDataStore
	| CreateChannel
	| EnterStagingMode
	| ExitStagingMode;

export class StressDataObject extends DataObject {
	public static readonly factory: DataObjectFactory<StressDataObject> = new DataObjectFactory({
		type: "StressDataObject",
		ctor: StressDataObject,
		sharedObjects: [...ddsModelMap.values()].map((v) => v.factory),
		registryEntries: [
			["StressDataObject", new LazyPromise(async () => StressDataObject.factory)],
		],
		policies: {
			readonlyInStagingMode: false,
		},
	});

	get StressDataObject(): StressDataObject {
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

	protected async initializingFirstTime(props?: any): Promise<void> {
		// No DDS-backed tracking needed - harness manages channel tracking in-memory
	}

	/**
	 * Gets channels by trying to resolve each channel tag from the provided list.
	 * Channels that don't exist or aren't attached will be silently skipped.
	 * @param channelTags - List of channel tags to try to resolve
	 */
	public async getChannels(channelTags: string[]): Promise<IChannel[]> {
		const channels: IChannel[] = [];
		for (const name of channelTags) {
			// Channels may not be attached yet, so getting them can fail.
			// We need to try each one and skip those that aren't available.
			const channel = await timeoutAwait(this.runtime.getChannel(name), {
				errorMsg: `Timed out waiting for channel: ${name}`,
			}).catch(() => undefined);
			if (channel !== undefined) {
				channels.push(channel);
			}
		}
		return channels;
	}

	protected async hasInitialized(): Promise<void> {
		this.defaultStressObject = await this.getDefaultStressDataObject();
	}

	public get attached(): boolean {
		return this.runtime.attachState !== AttachState.Detached;
	}

	public async uploadBlob(tag: `blob-${number}`, contents: string): Promise<void> {
		const handle = await this.runtime.uploadBlob(stringToBuffer(contents, "utf-8"));
		this.defaultStressObject.registerLocallyCreatedObject({
			type: "newBlob",
			handle,
			tag,
		});
	}

	public createChannel(tag: `channel-${number}`, type: string): void {
		this.runtime.createChannel(tag, type);
		// Channel tracking is managed by the harness in-memory, not here
	}

	/**
	 * Creates a new datastore and returns its absolute URL for tracking.
	 */
	public async createDataStore(
		tag: `datastore-${number}`,
		asChild: boolean,
	): Promise<{ absoluteUrl: string }> {
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

		const absoluteUrl = toFluidHandleInternal(dataStore.entryPoint).absolutePath;
		return { absoluteUrl };
	}

	public orderSequentially(act: () => void): void {
		this.context.containerRuntime.orderSequentially(act);
	}

	public get isDirty(): boolean | undefined {
		return asLegacyAlpha(this.runtime).isDirty;
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

	public get DefaultStressDataObject(): this {
		return this;
	}

	/**
	 * Objects created in memory by this instance of the datastore.
	 * These may be detached and only accessible to this instance.
	 */
	private readonly _locallyCreatedObjects: ContainerObjects[] = [];

	/**
	 * Gets container objects by combining locally created objects with objects
	 * resolved from the provided URL map (managed by harness).
	 * @param containerUrls - Map of absolutePath → {tag, type} from harness tracking
	 */
	public async getContainerObjects(
		containerUrls: Map<string, { tag: string; type: string }>,
	): Promise<readonly Readonly<ContainerObjects>[]> {
		const containerObjects: Readonly<ContainerObjects>[] = [...this._locallyCreatedObjects];
		const containerRuntime = // eslint-disable-next-line import-x/no-deprecated
			this.context.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;

		for (const [url, entry] of containerUrls.entries()) {
			// Objects may not be attached yet, so they may not be available to remote clients.
			// We need to try to resolve each one and skip those that aren't available.
			const resp = await timeoutAwait(
				containerRuntime.resolveHandle({
					url,
					headers: { [RuntimeHeaders.wait]: false },
				}),
				{
					errorMsg: `Timed out waiting for client to resolveHandle: ${url}`,
				},
			);
			if (resp.status === 200) {
				const maybe: FluidObject<IFluidLoadable & StressDataObject> | undefined = resp.value;
				const handle = maybe?.IFluidLoadable?.handle;
				if (handle !== undefined) {
					const type = entry?.type;
					switch (type) {
						case "newBlob":
							containerObjects.push({
								type: "newBlob",
								tag: entry.tag as `blob-${number}`,
								handle,
							});
							break;
						case "stressDataObject":
							assert(maybe?.StressDataObject !== undefined, "must be stressDataObject");
							containerObjects.push({
								type: "stressDataObject",
								tag: entry.tag as `datastore-${number}`,
								handle,
								stressDataObject: maybe.StressDataObject,
							});
							break;
						default:
							unreachableCase(type as never, `${type}`);
					}
				}
			}
		}
		return containerObjects;
	}

	protected override async getDefaultStressDataObject(): Promise<DefaultStressDataObject> {
		return this;
	}

	protected async initializingFirstTime(props?: any): Promise<void> {
		await super.initializingFirstTime(props);
		// Register the default datastore as a locally created object
		this.registerLocallyCreatedObject({
			type: "stressDataObject",
			handle: this.handle,
			tag: `datastore-0`,
			stressDataObject: this,
		});
	}

	/**
	 * Registers an object as locally created. Container object tracking
	 * is managed by the harness in-memory, not via DDS.
	 */
	public registerLocallyCreatedObject(obj: ContainerObjects): void {
		this._locallyCreatedObjects.push(obj);
	}

	private stageControls: StageControlsAlpha | undefined;
	private readonly containerRuntimeExp = asLegacyAlpha(this.context.containerRuntime);
	public enterStagingMode(): void {
		assert(
			this.containerRuntimeExp.enterStagingMode !== undefined,
			"enterStagingMode must be defined",
		);
		this.stageControls = this.containerRuntimeExp.enterStagingMode();
	}

	public inStagingMode(): boolean {
		assert(
			this.containerRuntimeExp.inStagingMode !== undefined,
			"inStagingMode must be defined",
		);
		return this.containerRuntimeExp.inStagingMode;
	}

	public exitStagingMode(commit: boolean): void {
		assert(this.stageControls !== undefined, "must have staging mode controls");
		if (commit) {
			this.stageControls.commitChanges();
		} else {
			this.stageControls.discardChanges();
		}
		this.stageControls = undefined;
	}
}

export const createRuntimeFactory = (): IRuntimeFactory => {
	const defaultStressDataObjectFactory = new DataObjectFactory({
		type: "DefaultStressDataObject",
		ctor: DefaultStressDataObject,
		sharedObjects: [...ddsModelMap.values()].map((v) => v.factory),

		registryEntries: [[StressDataObject.factory.type, StressDataObject.factory]],
	});

	const runtimeOptions: IContainerRuntimeOptionsInternal = {
		summaryOptions: {
			summaryConfigOverrides: {
				maxOps: 3,
				initialSummarizerDelayMs: 0,
			} as any,
		},
		enableRuntimeIdCompressor: "on",
		createBlobPayloadPending: true,
		explicitSchemaControl: true,
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
			// id compressor isn't made available via the interface right now.
			// We could revisit exposing the safe part of its API (IIdCompressor, not IIdCompressorCore) in a way
			// that would avoid this instanceof check, but most customers shouldn't really have a need for it.
			assert(runtime instanceof ContainerRuntime, "Expected to create a ContainerRuntime");
			assert(
				runtime.idCompressor !== undefined,
				"IdCompressor should be enabled by stress test options.",
			);
			// Forcing the cluster size to a low value makes it more likely to generate staging mode scenarios with more
			// interesting interleaving of id allocation ops and normal ops.
			modifyClusterSize(runtime.idCompressor, 2);

			if (!existing) {
				const ds = await runtime.createDataStore(defaultStressDataObjectFactory.type);
				await ds.trySetAlias(DefaultStressDataObject.alias);
			}

			return runtime;
		},
	};
};
