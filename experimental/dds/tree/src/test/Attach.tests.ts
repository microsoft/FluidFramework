/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';
import {
	TestObjectProvider,
	type ITestObjectProvider,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	ITestFluidObject,
} from '@fluidframework/test-utils';
import { DefaultSummaryConfiguration } from '@fluidframework/container-runtime';
import { LocalServerTestDriver } from '@fluid-internal/test-drivers';
import { Loader } from '@fluidframework/container-loader';
import { SharedTree } from '../SharedTree';
import { BuildNode, Change, StablePlace } from '../ChangeTypes';
import { TraitLabel } from '../Identifiers';

describe('Attach Tests', () => {
	const TestDataStoreType = '@fluid-example/test-dataStore';
	const legacyTreeFactory = SharedTree.getFactory();

	// The 2nd runtime factory, V2 of the code
	const runtimeFactory = new TestContainerRuntimeFactory(
		TestDataStoreType,
		new TestFluidObjectFactory([['tree', legacyTreeFactory]]),
		{
			summaryOptions: {
				summaryConfigOverrides: {
					...DefaultSummaryConfiguration,
					...{
						minIdleTime: 1000, // Manually set idle times so some SharedTree tests don't timeout.
						maxIdleTime: 1000,
						maxTime: 1000 * 12,
						initialSummarizerDelayMs: 0,
					},
				},
			},
		}
	);

	let provider: ITestObjectProvider;
	it('Tree can be attached', async () => {
		const driver = new LocalServerTestDriver();
		provider = new TestObjectProvider(Loader, driver, () => runtimeFactory);
		const container = await provider.createContainer(runtimeFactory);
		const testObj = (await container.getEntryPoint()) as ITestFluidObject;
		const someNodeId = 'someNodeId' as TraitLabel;
		const tree = testObj.runtime.createChannel('abc', legacyTreeFactory.type) as SharedTree;
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
		// attaching with local changes assert 0x62e
		assert.doesNotThrow(() => testObj.root.set('any', tree.handle), "Can't attach tree");
		await provider.ensureSynchronized();
		provider.reset();
	});
});
