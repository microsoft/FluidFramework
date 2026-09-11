/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { AttachState } from "@fluidframework/container-definitions";
import type { IRuntimeFactory } from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	waitContainerToCatchUp,
} from "@fluidframework/container-loader/internal";
import { loadContainerRuntime } from "@fluidframework/container-runtime/internal";
import type { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces/internal";
import { assert as fluidAssert } from "@fluidframework/core-utils/internal";
import { FluidDataStoreRuntime, FluidObjectHandle } from "@fluidframework/datastore/internal";
import type {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IDeltaHandler,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import { type ISharedMap, SharedMap } from "@fluidframework/map/internal";
import type {
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	IGarbageCollectionData,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { defaultTestOldestSupportedClient } from "@fluidframework/test-utils/internal";
import { createLoader } from "./utils.js";

const adversarialChannelType = "AdversarialChannel";
const adversarialChannelId = "adversary";
const lateChannelId = "lateDds";
const lateChannelKey = "lateValue";

const adversarialChannelAttributes: IChannelAttributes = {
	type: adversarialChannelType,
	snapshotFormatVersion: "0.1",
	packageVersion: "0.0.0",
};

/**
 * A channel that creates and binds another DDS while its GC data is generated.
 *
 * @remarks
 * This models real DDSes (and DDS wrappers) that synchronously create other DDSes as a side effect of
 * walking their own content. When that happens while a data store's attach message is being generated,
 * the new DDS becomes visible locally and starts sending ops. If it isn't part of the attach message,
 * remote clients receive ops for a channel they never learned about, which corrupts the document.
 */
class AdversarialChannel implements IChannel {
	public readonly attributes: IChannelAttributes = adversarialChannelAttributes;
	public readonly handle: IFluidHandle;

	public constructor(
		public readonly id: string,
		private readonly dataStoreRuntime: IFluidDataStoreRuntime,
		private readonly createDdsDuringGC: boolean,
	) {
		this.handle = new FluidObjectHandle(
			this as unknown as FluidObject,
			id,
			dataStoreRuntime.IFluidHandleContext,
		);
	}

	public get IFluidLoadable(): this {
		return this;
	}

	public getAttachSummary(): ISummaryTreeWithStats {
		return {
			stats: {
				treeNodeCount: 1,
				blobNodeCount: 0,
				handleNodeCount: 0,
				totalBlobSize: 0,
				unreferencedBlobSize: 0,
			},
			summary: { type: SummaryType.Tree, tree: {} },
		};
	}

	public async summarize(): Promise<ISummaryTreeWithStats> {
		return this.getAttachSummary();
	}

	public isAttached(): boolean {
		return this.dataStoreRuntime.attachState !== AttachState.Detached;
	}

	public connect(services: IChannelServices): void {
		// This channel never sends or receives ops, but the delta connection requires a handler.
		services.deltaConnection.attach({
			processMessages: () => {},
			setConnectionState: () => {},
			reSubmit: () => {},
			applyStashedOp: () => undefined,
		} satisfies IDeltaHandler);
	}

	public getGCData(fullGC?: boolean): IGarbageCollectionData {
		if (!this.createDdsDuringGC) {
			return { gcNodes: { "/": [] } };
		}

		const lateMap = SharedMap.create(this.dataStoreRuntime, lateChannelId);
		lateMap.bindToContext();
		return { gcNodes: { "/": [toFluidHandleInternal(lateMap.handle).absolutePath] } };
	}
}

class AdversarialChannelFactory implements IChannelFactory {
	public constructor(private readonly createDdsDuringGC: boolean) {}

	public get type(): string {
		return adversarialChannelType;
	}

	public get attributes(): IChannelAttributes {
		return adversarialChannelAttributes;
	}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
	): Promise<IChannel> {
		// Loaded instances never create the extra DDS - they only need to round trip.
		const channel = new AdversarialChannel(id, runtime, /* createDdsDuringGC */ false);
		channel.connect(services);
		return channel;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
		return new AdversarialChannel(id, runtime, this.createDdsDuringGC);
	}
}

/**
 * A child data store containing the adversarial channel.
 */
class ChildDataStore {
	public static create(runtime: IFluidDataStoreRuntime): ChildDataStore {
		const adversary = runtime.createChannel(adversarialChannelId, adversarialChannelType);
		runtime.bindChannel(adversary);
		return new ChildDataStore(runtime);
	}

	public static load(runtime: IFluidDataStoreRuntime): ChildDataStore {
		return new ChildDataStore(runtime);
	}

	private constructor(private readonly runtime: IFluidDataStoreRuntime) {}

	public get ChildDataStore(): ChildDataStore {
		return this;
	}

	public get handle(): IFluidHandle<FluidObject> {
		return this.runtime.entryPoint;
	}

	public async getLateMap(): Promise<ISharedMap> {
		return (await this.runtime.getChannel(lateChannelId)) as unknown as ISharedMap;
	}
}

class ChildDataStoreFactory implements IFluidDataStoreFactory {
	public readonly type = "ChildDataStore";
	private readonly sharedObjectRegistry: Map<string, IChannelFactory>;

	public constructor(createDdsDuringGC: boolean) {
		const mapFactory = SharedMap.getFactory();
		this.sharedObjectRegistry = new Map<string, IChannelFactory>([
			[mapFactory.type, mapFactory],
			[adversarialChannelType, new AdversarialChannelFactory(createDdsDuringGC)],
		]);
	}

	public get IFluidDataStoreFactory(): this {
		return this;
	}

	public async instantiateDataStore(
		context: IFluidDataStoreContext,
		existing: boolean,
	): Promise<IFluidDataStoreChannel> {
		const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
			context,
			this.sharedObjectRegistry,
			existing,
			async () => dataStore,
		);
		const dataStore = existing ? ChildDataStore.load(runtime) : ChildDataStore.create(runtime);
		return runtime;
	}

	public createDataStore(context: IFluidDataStoreContext): {
		runtime: IFluidDataStoreChannel;
		entrypoint: ChildDataStore;
	} {
		const runtime = new FluidDataStoreRuntime(
			context,
			this.sharedObjectRegistry,
			/* existing */ false,
			async () => entrypoint,
		);
		const entrypoint = ChildDataStore.create(runtime);
		return { runtime, entrypoint };
	}
}

class ParentDataObject extends DataObject {
	public get ParentDataObject(): ParentDataObject {
		return this;
	}

	public createChild(name: string, childFactory: ChildDataStoreFactory): ChildDataStore {
		fluidAssert(
			this.context.createChildDataStore !== undefined,
			"this.context.createChildDataStore",
		);
		const { entrypoint } = this.context.createChildDataStore(childFactory);
		// Binding the handle into the (attached) root makes the child data store visible, which sends
		// its attach message.
		this.root.set(name, entrypoint.handle);
		return entrypoint;
	}

	public getChild(name: string): IFluidHandle<ChildDataStore> | undefined {
		return this.root.get<IFluidHandle<ChildDataStore>>(name);
	}
}

function createRuntimeFactory(childFactory: ChildDataStoreFactory): IRuntimeFactory {
	const parentDataObjectFactory = new DataObjectFactory({
		type: "ParentDataObject",
		ctor: ParentDataObject,
		registryEntries: [[childFactory.type, childFactory]],
	});

	return {
		get IRuntimeFactory() {
			return this;
		},
		instantiateRuntime: async (context, existing) =>
			loadContainerRuntime({
				context,
				existing,
				oldestSupportedClient: defaultTestOldestSupportedClient,
				registryEntries: [
					[parentDataObjectFactory.type, Promise.resolve(parentDataObjectFactory)],
				],
				provideEntryPoint: async (rt) => {
					const maybeRoot = await rt.getAliasedDataStoreEntryPoint("default");
					if (maybeRoot === undefined) {
						const ds = await rt.createDataStore(parentDataObjectFactory.type);
						await ds.trySetAlias("default");
					}
					const root = await rt.getAliasedDataStoreEntryPoint("default");
					fluidAssert(root !== undefined, "default must exist");
					return root.get();
				},
			}),
	};
}

describe("Data store attach message completeness", () => {
	it("includes a DDS created while the attach message's GC data is generated", async () => {
		const childFactory = new ChildDataStoreFactory(/* createDdsDuringGC */ true);
		const deltaConnectionServer = LocalDeltaConnectionServer.create();
		const { loaderProps, codeDetails, urlResolver } = createLoader({
			deltaConnectionServer,
			runtimeFactory: createRuntimeFactory(childFactory),
		});

		const container = await createDetachedContainer({ ...loaderProps, codeDetails });
		await container.attach(urlResolver.createCreateNewRequest("attachCompleteness"));

		const entrypoint: FluidObject<ParentDataObject> = await container.getEntryPoint();
		fluidAssert(
			entrypoint.ParentDataObject !== undefined,
			"container entrypoint must be ParentDataObject",
		);

		// Creating the child in an attached container generates and sends its attach message. The
		// adversarial channel creates the "late" DDS while the attach GC data is generated.
		const child = entrypoint.ParentDataObject.createChild("child", childFactory);
		const lateMap = await child.getLateMap();
		lateMap.set(lateChannelKey, "hello");

		while (container.isDirty) {
			await new Promise<void>((resolve) => container.once("saved", () => resolve()));
		}

		const url = await container.getAbsoluteUrl("");
		fluidAssert(url !== undefined, "container must have url");
		container.dispose();

		const container2 = await loadExistingContainer({ ...loaderProps, request: { url } });
		await waitContainerToCatchUp(container2);
		const entrypoint2: FluidObject<ParentDataObject> = await container2.getEntryPoint();
		fluidAssert(
			entrypoint2.ParentDataObject !== undefined,
			"container2 entrypoint must be ParentDataObject",
		);

		const childHandle = entrypoint2.ParentDataObject.getChild("child");
		fluidAssert(childHandle !== undefined, "child handle must exist");
		const child2: FluidObject<ChildDataStore> = await childHandle.get();
		fluidAssert(child2.ChildDataStore !== undefined, "child must be a ChildDataStore");

		const lateMap2 = await child2.ChildDataStore.getLateMap();
		assert.strictEqual(
			lateMap2.get(lateChannelKey),
			"hello",
			"The DDS created during attach must round trip to remote clients",
		);

		container2.dispose();
	});
});
