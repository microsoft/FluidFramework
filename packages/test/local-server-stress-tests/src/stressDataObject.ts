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
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, LazyPromise } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
// Valid export as per package.json export map
// eslint-disable-next-line import-x/no-internal-modules
import { modifyClusterSize } from "@fluidframework/id-compressor/internal/test-utils";
import type { StageControlsAlpha } from "@fluidframework/runtime-definitions/internal";
import { asLegacyAlpha } from "@fluidframework/runtime-utils/internal";
import { timeoutAwait } from "@fluidframework/test-utils/internal";

import { ddsModelMap } from "./ddsModels.js";

export interface UploadBlob {
	type: "uploadBlob";
	tag: `blob-${number}`;
}
export interface CreateDataStore {
	type: "createDataStore";
	asChild: boolean;
	tag: `datastore-${number}`;
	/** Whether to store handle in the current datastore's root, increasing likelihood of collaborative reachability */
	storeHandle: boolean;
}

export interface CreateChannel {
	type: "createChannel";
	channelType: string;
	tag: `channel-${number}`;
	/** Whether to store handle in the current datastore's root, increasing likelihood of collaborative reachability */
	storeHandle: boolean;
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
	public static readonly alias = "default";

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

	/**
	 * Exposes the container runtime for handle resolution by the state tracker.
	 */
	// eslint-disable-next-line import-x/no-deprecated
	get containerRuntimeForTest(): IContainerRuntimeWithResolveHandle_Deprecated {
		// eslint-disable-next-line import-x/no-deprecated
		return this.context.containerRuntime as IContainerRuntimeWithResolveHandle_Deprecated;
	}

	/**
	 * Resolves a single channel by name from this datastore's runtime.
	 * Returns undefined if the channel is not yet attached or available.
	 */
	public async getChannel(name: string): Promise<IChannel | undefined> {
		return timeoutAwait(this.runtime.getChannel(name), {
			errorMsg: `Timed out waiting for channel: ${name}`,
		}).catch(() => undefined);
	}

	public get attached(): boolean {
		return this.runtime.attachState !== AttachState.Detached;
	}

	public async uploadBlob(tag: `blob-${number}`, contents: string): Promise<IFluidHandle> {
		return this.runtime.uploadBlob(stringToBuffer(contents, "utf-8"));
	}

	public createChannel(tag: `channel-${number}`, type: string): IFluidHandle {
		const channel = this.runtime.createChannel(tag, type);
		return channel.handle;
	}

	public async createDataStore(
		tag: `datastore-${number}`,
		asChild: boolean,
	): Promise<{ handle: IFluidHandle }> {
		const dataStore = await this.context.containerRuntime.createDataStore(
			asChild
				? [...this.context.packagePath, StressDataObject.factory.type]
				: StressDataObject.factory.type,
		);

		return { handle: dataStore.entryPoint };
	}

	public orderSequentially(act: () => void): void {
		this.context.containerRuntime.orderSequentially(act);
	}

	/**
	 * Stores a handle in this datastore's root directory, increasing the
	 * likelihood that the target is collaboratively reachable by other clients.
	 */
	public storeHandleInRoot(key: string, handle: IFluidHandle): void {
		this.root.set(key, handle);
	}

	public get isDirty(): boolean | undefined {
		return asLegacyAlpha(this.runtime).isDirty;
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
					[StressDataObject.factory.type, Promise.resolve(StressDataObject.factory)],
				],
				provideEntryPoint: async (rt) => {
					const aliasedDefault = await rt.getAliasedDataStoreEntryPoint(
						StressDataObject.alias,
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
				const ds = await runtime.createDataStore(StressDataObject.factory.type);
				await ds.trySetAlias(StressDataObject.alias);
			}

			return runtime;
		},
	};
};
