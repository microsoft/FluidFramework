// Copyright (C) Microsoft Corporation. All rights reserved.

// import { IsoBuffer } from '@fluidframework/common-utils';
import { DataObject } from '@fluidframework/aqueduct';
import { IContainerRuntimeOptions } from '@fluidframework/container-runtime';
import { Container } from '@fluidframework/container-loader';
import { IFluidDataStoreFactory } from '@fluidframework/runtime-definitions';
import { requestFluidObject } from '@fluidframework/runtime-utils';
import {
	ChannelFactoryRegistry,
	ITestFluidObject,
	LocalTestObjectProvider,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
} from '@fluidframework/test-utils';
// import { expect } from 'chai';
import { editsPerChunk } from '../EditLog';
import { newEdit, setTrait } from '../EditUtilities';
import { Edit } from '../PersistedTypes';
import { SharedTree } from '../SharedTree';
import { makeTestNode, testTrait } from './utilities/TestUtilities';
import { expect } from 'chai';
import { fullHistorySummarizer_0_1_0 } from '../Summary';

export class TestDataObject extends DataObject {
	public static readonly type = '@fluid-example/test-dataStore';
	public get _context() {
		return this.context;
	}
	public get _runtime() {
		return this.runtime;
	}
	public get _root() {
		return this.root;
	}
}

enum DataObjectFactoryType {
	Primed, // default
	Test,
}

interface ITestContainerConfig {
	// TestFluidDataObject instead of PrimedDataStore
	fluidDataObjectType?: DataObjectFactoryType;

	// And array of channel name and DDS factory pair to create on container creation time
	registry?: ChannelFactoryRegistry;

	// Container runtime options for the container instance
	runtimeOptions?: IContainerRuntimeOptions;
}

const createTestFluidDataStoreFactory = (registry: ChannelFactoryRegistry = []): IFluidDataStoreFactory => {
	return new TestFluidObjectFactory(registry);
};

describe('SharedTree history virtualization', () => {
	const runtimeFactory = (containerOptions?: ITestContainerConfig) =>
		new TestContainerRuntimeFactory(
			TestDataObject.type,
			createTestFluidDataStoreFactory(containerOptions?.registry),
			containerOptions?.runtimeOptions || { initialSummarizerDelayMs: 0 }
		);

	const localTestObjectProvider = new LocalTestObjectProvider(runtimeFactory);

	const treeId = 'test';
	const registry: ChannelFactoryRegistry = [[treeId, SharedTree.getFactory()]];
	const testContainerConfig: ITestContainerConfig = {
		fluidDataObjectType: DataObjectFactoryType.Test,
		registry,
	};

	let sharedTree1: SharedTree;

	beforeEach(async () => {
		const container1 = (await localTestObjectProvider.makeTestContainer(testContainerConfig)) as Container;
		const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, 'default');
		sharedTree1 = await dataObject1.getSharedObject<SharedTree>(treeId);
		sharedTree1.summarizer = fullHistorySummarizer_0_1_0;
	});

	it('can upload edit chunks and load chunks from handles', async () => {
		const expectedEdits: Edit[] = [];

		// Add some edits to create a chunk with.
		while (expectedEdits.length < editsPerChunk) {
			const edit = newEdit(setTrait(testTrait, [makeTestNode()]));
			expectedEdits.push(edit);
			sharedTree1.processLocalEdit(edit);
		}

		// Wait for the ops to to be submitted and processed across the containers.
		await localTestObjectProvider.opProcessingController.process();

		// Upload the edits
		await sharedTree1.initiateEditChunkUpload();

		// Wait for the handle op to be processed.
		await localTestObjectProvider.opProcessingController.process();

		const summary = sharedTree1.saveSummary();

		// Load a second tree using the summary
		const container2 = (await localTestObjectProvider.loadTestContainer(testContainerConfig)) as Container;
		const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, 'default');
		const sharedTree2 = await dataObject2.getSharedObject<SharedTree>(treeId);

		sharedTree2.loadSummary(summary);

		// Ensure chunked edit can be retrieved
		expect((await sharedTree2.edits.getAtIndex(2)).id).to.equal(expectedEdits[2].id);
	});
});
