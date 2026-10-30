/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'assert';

import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils/internal';
import { SharedTree as NewSharedTree } from '@fluidframework/tree/legacy';

import {
	EagerCheckout,
	MigrationShimFactory,
	SharedTree,
	SharedTreeClass,
	SharedTreeFactory,
	Transaction,
} from '../index.js';
import { WriteFormat } from '../persisted-types/index.js';

import { runSummaryTests } from './Summary.tests.js';
import { runPendingLocalStateTests } from './utilities/PendingLocalStateTests.js';
import { runSharedTreeOperationsTests } from './utilities/SharedTreeTests.js';
import { runSharedTreeVersioningTests } from './utilities/SharedTreeVersioningTests.js';
import { runSummarySizeTests } from './utilities/SummarySizeTests.js';
import { setUpLocalServerTestSharedTree, setUpTestSharedTree } from './utilities/TestUtilities.js';

describe('SharedTree', () => {
	describe('factory object', () => {
		for (const writeFormat of [WriteFormat.v0_0_2, WriteFormat.v0_1_1]) {
			it(`uses the registered factory with write format ${writeFormat}`, () => {
				const runtime = new MockFluidDataStoreRuntime({
					registry: [new SharedTreeFactory(writeFormat)],
				});
				const tree = SharedTree.create(runtime, 'tree');

				assert.equal(tree.id, 'tree');
				assert.equal(tree.getRuntime(), runtime);
				assert.equal(tree.getWriteFormat(), writeFormat);
				assert.equal(tree.edits.length, 0);
				assert.equal(tree.connected, false);
			});
		}

		it('lets the runtime generate an ID when no ID is supplied', () => {
			const runtime = new MockFluidDataStoreRuntime({
				registry: [new SharedTreeFactory(WriteFormat.v0_1_1)],
			});

			const first = SharedTree.create(runtime);
			const second = SharedTree.create(runtime);

			assert.equal(typeof first.id, 'string');
			assert.notEqual(first.id, second.id);
		});

		it('provides a default factory with write format 0.1.1', () => {
			const factory = SharedTree.getFactory();
			const runtime = new MockFluidDataStoreRuntime({ registry: [factory] });
			const tree = SharedTree.create(runtime, 'tree');

			assert.equal(typeof SharedTree, 'object');
			assert.equal(tree.getWriteFormat(), WriteFormat.v0_1_1);
			assert.equal(tree.attributes.type, factory.type);
			assert(tree instanceof SharedTreeClass);
		});

		it('identifies trees by their channel type', () => {
			const runtime = new MockFluidDataStoreRuntime({ registry: [SharedTree.getFactory()] });
			const tree = SharedTree.create(runtime);
			const other = {
				IFluidLoadable: tree,
				handle: tree.handle,
				attributes: { type: 'other' },
			};

			assert(SharedTree.is(tree));
			assert(!SharedTree.is(other));
		});

		it('returns an interface that works with transactions and checkouts', () => {
			const runtime = new MockFluidDataStoreRuntime({ registry: [SharedTree.getFactory()] });
			const tree: SharedTree = SharedTree.create(runtime);
			const transaction = new Transaction(tree);
			const checkout = new EagerCheckout(tree);

			assert.equal(transaction.tree, tree);
			assert.equal(checkout.tree, tree);
			assert.equal(checkout.currentView, tree.currentView);
			transaction.closeAndCommit();
			checkout.dispose();
		});

		it('provides a factory that works with the migration shim', () => {
			const legacyFactory = SharedTree.getFactory();
			const factory = new MigrationShimFactory(legacyFactory, NewSharedTree.getFactory(), () =>
				assert.fail('Unexpected migration during tree creation')
			);
			const runtime = new MockFluidDataStoreRuntime({ registry: [factory] });
			const shim = factory.create(runtime, 'tree');

			assert.equal(factory.type, legacyFactory.type);
			assert.deepEqual(factory.attributes, legacyFactory.attributes);
			assert.equal(shim.currentTree.id, 'tree');
			assert(SharedTree.is(shim.currentTree));
		});

		it('retains the implementation constructor and protected overrides', () => {
			class CustomTree extends SharedTreeClass {
				public disconnectCount = 0;

				protected override onDisconnect(): void {
					super.onDisconnect();
					this.disconnectCount++;
				}

				public disconnectForTest(): void {
					this.onDisconnect();
				}
			}

			const tree = new CustomTree(new MockFluidDataStoreRuntime(), 'tree', WriteFormat.v0_1_1);
			tree.initializeLocal();
			tree.disconnectForTest();

			assert.equal(tree.disconnectCount, 1);
			assert(SharedTree.is(tree));
		});
	});

	describe('Operations', () => {
		runSharedTreeOperationsTests('using write format 0.0.2', WriteFormat.v0_0_2, setUpTestSharedTree);
		runSharedTreeOperationsTests('using write format 0.1.1', WriteFormat.v0_1_1, setUpTestSharedTree);
	});
	runSummaryTests('Summaries');
	runSummarySizeTests('Summary size', setUpLocalServerTestSharedTree);
	runPendingLocalStateTests('Stashed ops', setUpLocalServerTestSharedTree);
	runSharedTreeVersioningTests('Versioning', setUpTestSharedTree);
});
