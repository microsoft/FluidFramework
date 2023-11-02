/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';
import {
	TestObjectProvider,
	type ITestObjectProvider,
	TestFluidObjectFactory,
	ITestFluidObject,
	createContainerRuntimeFactoryWithDefaultDataStore,
} from '@fluidframework/test-utils';
import { LocalServerTestDriver } from '@fluid-internal/test-drivers';
import { Loader } from '@fluidframework/container-loader';
import { FluidObject } from '@fluidframework/core-interfaces';
import { SharedTree } from '../SharedTree';
import { BuildNode, Change, StablePlace } from '../ChangeTypes';
import { TraitLabel } from '../Identifiers';

describe('Attach Tests', () => {
	const provideEntryPoint = async (containerRuntime: any): Promise<FluidObject> => {
		const handle = await containerRuntime.getAliasedDataStoreEntryPoint('default');
		if (handle === undefined) {
			throw new Error('Could not get default data store entry point');
		}
		return handle.get();
	};

	const treeFactory = SharedTree.getFactory();
	const dataObjectFactory = new TestFluidObjectFactory([['tree', treeFactory]]);
	const runtimeFactory = createContainerRuntimeFactoryWithDefaultDataStore(undefined, {
		defaultFactory: dataObjectFactory,
		registryEntries: [[dataObjectFactory.type, Promise.resolve(dataObjectFactory)]],
		provideEntryPoint,
	});

	let provider: ITestObjectProvider;
	it('Tree can be attached with local changes after the datastore is attached', async () => {
		const driver = new LocalServerTestDriver();
		provider = new TestObjectProvider(Loader, driver, () => runtimeFactory);
		const container = await provider.createContainer(runtimeFactory);
		const testObj = (await container.getEntryPoint()) as ITestFluidObject;
		const someNodeId = 'someNodeId' as TraitLabel;
		const tree = testObj.runtime.createChannel('abc', treeFactory.type) as SharedTree;
		const inventoryNode: BuildNode = {
			definition: someNodeId,
			traits: {
				quantity: {
					definition: 'quantity',
					payload: 5,
				},
			},
		};
		tree.applyEdit(
			Change.insertTree(
				inventoryNode,
				StablePlace.atStartOf({
					parent: tree.currentView.root,
					label: someNodeId,
				})
			)
		);
		assert.doesNotThrow(() => testObj.root.set('any', tree.handle), "Can't attach tree");
		await provider.ensureSynchronized();
		provider.reset();
	});
});
