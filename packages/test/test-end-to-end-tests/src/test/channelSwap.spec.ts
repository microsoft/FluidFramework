/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { describeNoCompat } from "@fluid-internal/test-version-utils";
import { IContainer, LoaderHeader } from "@fluidframework/container-definitions";
import {
	ITestObjectProvider,
	createSummarizerFromFactory,
	summarizeNow,
} from "@fluidframework/test-utils";
import {
	DataObjectTypes,
	DataObject,
	IDataObjectProps,
	DataObjectFactory,
	ContainerRuntimeFactoryWithDefaultDataStore,
} from "@fluidframework/aqueduct";
import { IChannel, IChannelFactory } from "@fluidframework/datastore-definitions";
import { ISharedDirectory } from "@fluidframework/map";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { SharedTree } from "@fluid-experimental/tree";
import {
	SharedTreeFactory as NewSharedTreeFactory,
	ISharedTree as ISharedTree2,
} from "@fluid-experimental/tree2";
import { IContainerRuntimeOptions, ContainerRuntime } from "@fluidframework/container-runtime";
import { HotSwapFluidDataStoreRuntime } from "@fluid-experimental/datastore-hot-swap";

export class MigratorDataObject<I extends DataObjectTypes = DataObjectTypes> extends DataObject<I> {
	private readonly hotSwapRuntime: HotSwapFluidDataStoreRuntime;

	public get _root(): ISharedDirectory {
		return this.root;
	}

	public get containerRuntime() {
		return this.context.containerRuntime as ContainerRuntime;
	}

	public get _runtime() {
		return this.runtime;
	}

	public constructor(props: IDataObjectProps<I>) {
		super(props);
		assert((props.runtime as any).replaceChannel !== undefined, "expected migrator runtime");
		this.hotSwapRuntime = props.runtime as HotSwapFluidDataStoreRuntime;
	}

	// Deleting DDSes is dangerous it's best just to replace
	public replaceChannel(channel: IChannel, factory: IChannelFactory) {
		return this.hotSwapRuntime.replaceChannel(channel.id, factory);
	}

	public reAttachChannel(channel: IChannel) {
		this.hotSwapRuntime.reAttachChannel(channel);
	}

	protected async initializingFirstTime(): Promise<void> {
		const tree = SharedTree.create(this.runtime);
		const handle: IFluidHandle<IChannel> = tree.handle as IFluidHandle<SharedTree>;
		this.root.set("handle", handle);
	}
}

describeNoCompat("Summarizer closes instead of refreshing", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	const runtimeOptions: IContainerRuntimeOptions = {
		summaryOptions: {
			summaryConfigOverrides: { state: "disabled" },
		},
	};

	const dataObjectFactory = new DataObjectFactory(
		"testDataObject",
		MigratorDataObject,
		[SharedTree.getFactory()],
		[],
		undefined,
		HotSwapFluidDataStoreRuntime,
	);

	const dataObjectFactoryV2 = new DataObjectFactory(
		"testDataObject",
		MigratorDataObject,
		[new NewSharedTreeFactory()],
		[],
		undefined,
		HotSwapFluidDataStoreRuntime,
	);

	const runtimeFactory = new ContainerRuntimeFactoryWithDefaultDataStore(
		dataObjectFactory,
		[[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
		undefined,
		undefined,
		runtimeOptions,
	);

	const runtimeFactoryV2 = new ContainerRuntimeFactoryWithDefaultDataStore(
		dataObjectFactoryV2,
		[[dataObjectFactoryV2.type, Promise.resolve(dataObjectFactoryV2)]],
		undefined,
		undefined,
		runtimeOptions,
	);

	const createContainer = async (): Promise<IContainer> => {
		return provider.createContainer(runtimeFactory);
	};

	const loadContainerV2 = async (summaryVersion: string): Promise<IContainer> => {
		return provider.loadContainer(runtimeFactoryV2, undefined, {
			[LoaderHeader.version]: summaryVersion,
		});
	};

	beforeEach(async () => {
		provider = getTestObjectProvider({ syncSummarizer: true });
	});

	it("Can swap channels", async () => {
		const container = await createContainer();
		const dataObject = await requestFluidObject<MigratorDataObject>(container, "/");
		const handle = dataObject._root.get("handle") as IFluidHandle<IChannel>;
		const channel = await handle.get();
		const tree2 = dataObject.replaceChannel(channel, new NewSharedTreeFactory());

		assert(channel.attributes.snapshotFormatVersion === "0.1", "Should be old shared tree");
		assert(tree2.attributes.snapshotFormatVersion === "0.0.0", "Should be new shared tree");
	});

	it("Swap can be summarized", async () => {
		const container0 = await createContainer();
		container0.close();
		await provider.ensureSynchronized();
		const { summarizer, container: container1 } = await createSummarizerFromFactory(
			provider,
			container0,
			dataObjectFactory,
		);
		const dataObject1 = await requestFluidObject<MigratorDataObject>(container1, "/");
		const handle1 = dataObject1._root.get("handle") as IFluidHandle<IChannel>;
		const channel1 = await handle1.get();
		const newChannel1 = dataObject1.replaceChannel(
			channel1,
			new NewSharedTreeFactory(),
		) as ISharedTree2;

		dataObject1.reAttachChannel(newChannel1);
		// Note, any channel1 handles will still reference channel1.
		await provider.ensureSynchronized();

		const { summaryVersion } = await summarizeNow(summarizer);

		const container2 = await loadContainerV2(summaryVersion);
		const dataObject2 = await requestFluidObject<MigratorDataObject>(container2, "/");
		const handle2 = dataObject2._root.get("handle") as IFluidHandle<IChannel>;
		const tree2 = await handle2.get();

		assert(tree2.attributes.type === "SharedTree", "Should be a shared tree");
		assert(tree2.attributes.snapshotFormatVersion === "0.0.0", "Should be new shared tree");
	});

	it("Can attach swapped channel without sending ops", async () => {
		const container = await createContainer();
		const dataObject = await requestFluidObject<MigratorDataObject>(container, "/");
		const handle = dataObject._root.get("handle") as IFluidHandle<IChannel>;
		const channel = await handle.get();
		const newChannel = dataObject.replaceChannel(
			channel,
			new NewSharedTreeFactory(),
		) as ISharedTree2;

		// instead of storing the handle, we just call handle.attachGraph() which is equivalent.
		await provider.ensureSynchronized();
		const preAttachSequenceNumber = dataObject.containerRuntime.deltaManager.lastSequenceNumber;
		dataObject.reAttachChannel(newChannel);
		// Note, any channel handles will still reference the old channel.
		await provider.ensureSynchronized();
		const postAttachSequenceNumber =
			dataObject.containerRuntime.deltaManager.lastSequenceNumber;
		assert(
			preAttachSequenceNumber === postAttachSequenceNumber,
			"sequence number should not have changed",
		);

		assert(newChannel.attributes.type === "SharedTree", "Should be a shared tree");
		assert(
			newChannel.attributes.snapshotFormatVersion === "0.0.0",
			"Should be new shared tree",
		);
	});

	it("Can't freely re-attach any channel", async () => {
		const container = await createContainer();
		const dataObject = await requestFluidObject<MigratorDataObject>(container, "/");
		const handle = dataObject._root.get("handle") as IFluidHandle<IChannel>;
		const channel = await handle.get();
		const newChannel = dataObject.replaceChannel(
			channel,
			new NewSharedTreeFactory(),
		) as ISharedTree2;

		dataObject.reAttachChannel(newChannel);
		assert.throws(
			() => dataObject.reAttachChannel(newChannel),
			(error: Error) => {
				return error.message === "The replaced channel context should have been replaced!";
			},
			"Expected an assert",
		);
	});
});
