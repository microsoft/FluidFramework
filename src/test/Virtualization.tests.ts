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
import { EditId } from '../Identifiers';
import { Edit } from '../PersistedTypes';
import { SharedTree } from '../SharedTree';
import { makeTestNode, testTrait } from './utilities/TestUtilities';
import { expect } from 'chai';
import { ISerializedHandle } from '@fluidframework/core-interfaces';
import { assertNotUndefined } from '../Common';

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

describe.skip('SharedTree history virtualization', () => {
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
	let sharedTree2: SharedTree;

	beforeEach(async () => {
		const container1 = (await localTestObjectProvider.makeTestContainer(testContainerConfig)) as Container;
		const dataObject1 = await requestFluidObject<ITestFluidObject>(container1, 'default');
		sharedTree1 = await dataObject1.getSharedObject<SharedTree>(treeId);
	});

	// TODO:#49901: Enable test when format version 0.1.0 is written.
	it.skip('test', async () => {
		const expectedEdits: Edit[] = [];
		const expectedEditIds: EditId[] = [];

		// Add enough edits to make up one chunk
		while (expectedEdits.length < editsPerChunk) {
			const [id, edit] = newEdit(setTrait(testTrait, [makeTestNode()]));
			expectedEditIds.push(id);
			expectedEdits.push(edit);
			sharedTree1.processLocalEdit(id, edit);
		}

		// Wait for the ops to to be submitted and processed across the containers.
		await localTestObjectProvider.opProcessingController.process();

		// Create summaries until the chunk handle is returned
		let handle: ISerializedHandle | undefined = undefined;

		while (handle === undefined) {
			const chunk = assertNotUndefined(assertNotUndefined(sharedTree1.saveSummary().editHistory).editChunks)[0];
			if (Array.isArray(chunk)) {
				continue;
			}

			handle = chunk;
		}

		// Load a second tree
		const container2 = (await localTestObjectProvider.loadTestContainer(testContainerConfig)) as Container;
		const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, 'default');
		sharedTree2 = await dataObject2.getSharedObject<SharedTree>(treeId);

		// Ensure chunked edit can be retrieved
		expect(sharedTree2.edits.getAtIndex(2)).to.equal(expectedEdits[2]);
	});
});
