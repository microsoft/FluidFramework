/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from '@fluidframework/protocol-definitions';
import type { MockContainerRuntimeFactory } from '@fluidframework/test-runtime-utils';
import { expect } from 'chai';
import { EditLog } from '../../EditLog';
import { SharedTreeDiagnosticEvent } from '../../EventTypes';
import { SharedTreeOp, SharedTreeOpType, WriteFormat } from '../../persisted-types';
import { SharedTree } from '../../SharedTree';
import { applyNoop, SharedTreeTestingComponents, SharedTreeTestingOptions } from './TestUtilities';

/**
 * Spies on all future ops submitted to `containerRuntimeFactory`. When ops are submitted
 * @param containerRuntimeFactory
 * @returns
 */
function spyOnSubmittedOps(containerRuntimeFactory: MockContainerRuntimeFactory): SharedTreeOp[] {
	const ops: SharedTreeOp[] = [];
	const originalPush = containerRuntimeFactory.pushMessage.bind(containerRuntimeFactory);
	containerRuntimeFactory.pushMessage = (message: Partial<ISequencedDocumentMessage>) => {
		const { contents } = message;
		ops.push(contents as SharedTreeOp);
		originalPush(message);
	};
	return ops;
}

function spyOnVersionChanges(tree: SharedTree): WriteFormat[] {
	const versions: WriteFormat[] = [];
	tree.on(SharedTreeDiagnosticEvent.WriteVersionChanged, (version) => versions.push(version));
	return versions;
}
/**
 * Runs a test suite for operations on `SharedTree` that depend on correct versioning.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSharedTreeVersioningTests(
	title: string,
	setUpTestSharedTree: (options?: SharedTreeTestingOptions) => SharedTreeTestingComponents
) {
	describe(title, () => {
		const oldVersion = WriteFormat.v0_0_2;
		const newVersion = WriteFormat.v0_1_1;
		const treeOptions = { localMode: false, writeFormat: oldVersion };
		const secondTreeOptions = {
			id: 'secondTestSharedTree',
			localMode: false,
			writeFormat: newVersion,
		};

		it('only processes edit ops if they have the same version', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: newerTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			expect(tree.edits.length).to.equal(0);
			expect(newerTree.edits.length).to.equal(0);

			// Process an edit
			applyNoop(tree);
			containerRuntimeFactory.processAllMessages();

			// The newer tree should have ignored the first edit
			expect(tree.edits.length).to.equal(1);
			expect(newerTree.edits.length).to.equal(0);
		});

		it('throws if an edit op with a newer version than the write version is received', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: newerTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });

			expect(tree.edits.length).to.equal(0);
			expect(newerTree.edits.length).to.equal(0);

			// Process an edit and expect it to throw
			applyNoop(newerTree);
			expect(() => containerRuntimeFactory.processAllMessages()).to.throw(
				'Newer op version received by a client that has yet to be updated.'
			);
		});

		it('ignores duplicate update ops', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			// Process an edit
			applyNoop(tree);
			containerRuntimeFactory.processAllMessages();

			const summary = tree.saveSummary();

			// Load the summary into multiple newer trees to trigger version update ops
			const { tree: newerTree, containerRuntimeFactory: newerContainerRuntimeFactory } =
				setUpTestSharedTree(secondTreeOptions);
			const { tree: newerTree2 } = setUpTestSharedTree({
				containerRuntimeFactory: newerContainerRuntimeFactory,
				...secondTreeOptions,
			});
			const { tree: newerTree3 } = setUpTestSharedTree({
				containerRuntimeFactory: newerContainerRuntimeFactory,
				...secondTreeOptions,
			});

			const versions = spyOnVersionChanges(newerTree);
			const versions2 = spyOnVersionChanges(newerTree2);
			const versions3 = spyOnVersionChanges(newerTree3);

			newerTree.loadSummary(summary);
			newerTree2.loadSummary(summary);
			newerTree3.loadSummary(summary);
			newerContainerRuntimeFactory.processAllMessages();

			// Each tree should have processed a version update once
			expect(versions).to.deep.equal([oldVersion, newVersion]);
			expect(versions2).to.deep.equal([oldVersion, newVersion]);
			expect(versions3).to.deep.equal([oldVersion, newVersion]);
		});

		it('maintains custom EditLog and LogViewer callbacks when updating', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			containerRuntimeFactory.processAllMessages();

			const summary = tree.saveSummary();

			let editAdded = 0;

			// Load the summary into multiple newer trees to trigger version update ops
			const { tree: newerTree, containerRuntimeFactory: newerContainerRuntimeFactory } =
				setUpTestSharedTree(secondTreeOptions);

			const versions = spyOnVersionChanges(newerTree);

			newerTree.loadSummary(summary);
			(newerTree.edits as EditLog).registerEditAddedHandler(() => editAdded++);

			expect(versions).to.have.length(1);
			expect(versions[0]).to.equal(oldVersion);

			// Update occurs after the handler is added to the old edit log
			newerContainerRuntimeFactory.processAllMessages();
			expect(versions).to.have.length(2);
			expect(versions[1]).to.equal(newVersion);

			const additionalEdits = 5;
			for (let i = 0; i < additionalEdits; i++) {
				applyNoop(newerTree);
			}
			newerContainerRuntimeFactory.processAllMessages();

			// The edit added handler should run twice for each additional edit (once when applying locally and once when applying the sequenced edit)
			expect(editAdded).to.equal(additionalEdits * 2);
		});

		it('begins writing the new version only after updating', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			// Process an edit
			applyNoop(tree);
			containerRuntimeFactory.processAllMessages();

			const summary = tree.saveSummary();

			// Load the summary into a newer tree to trigger a version update op
			const { tree: newerTree, containerRuntimeFactory: newerContainerRuntimeFactory } =
				setUpTestSharedTree(secondTreeOptions);

			const ops = spyOnSubmittedOps(newerContainerRuntimeFactory);

			newerTree.loadSummary(summary);
			applyNoop(newerTree);
			newerContainerRuntimeFactory.processAllMessages();
			applyNoop(newerTree);

			expect(ops.length).to.equal(3);
			expect(ops.map((op) => op.type)).to.eql([
				SharedTreeOpType.Update,
				SharedTreeOpType.Edit,
				SharedTreeOpType.Edit,
			]);
			// Because the first op was submitted before the Update message was sequenced, it should use
			// the same write format as the loaded summary.
			expect(ops[1].version).to.equal(oldVersion);
			expect(ops[2].version).to.equal(newVersion);
		});

		it('can update to a write version higher than the initialized write version', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const versions = spyOnVersionChanges(tree);
			const ops = spyOnSubmittedOps(containerRuntimeFactory);

			// Process an edit
			applyNoop(tree);
			containerRuntimeFactory.processAllMessages();
			const summary = tree.saveSummary();

			// Load the summary into a newer tree to trigger a version update op
			const { tree: newerTree } = setUpTestSharedTree({ containerRuntimeFactory, ...secondTreeOptions });
			newerTree.loadSummary(summary);
			containerRuntimeFactory.processAllMessages();

			// Apply another arbitrary edit to the initial tree, which should now be using the new write version.
			applyNoop(tree);

			expect(versions).to.eql([newVersion]);
			expect(ops.length).to.equal(3);
			expect(ops.map((op) => op.type)).to.eql([
				SharedTreeOpType.Edit,
				SharedTreeOpType.Update,
				SharedTreeOpType.Edit,
			]);

			expect(ops[0].version).to.equal(oldVersion);
			expect(ops[2].version).to.equal(newVersion);
		});

		it('can load a 0.1.1 summary and access the current view', () => {
			// This is a regression test for the logic initializing SharedTree's EditLog from a summary.
			// The 0.1.1 format omits `currentTree`, but EditLog should still tolerate synchronous access
			// of the first edit in the session (which is a single insert containing that tree).
			const options: SharedTreeTestingOptions = {
				writeFormat: WriteFormat.v0_1_1,
				summarizeHistory: false,
				localMode: false,
			};
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(options);
			applyNoop(tree);
			containerRuntimeFactory.processAllMessages();
			const summary = tree.saveSummary();
			const { tree: newTree } = setUpTestSharedTree({ containerRuntimeFactory, ...options });
			newTree.loadSummary(summary);
			expect(() => newTree.currentView).to.not.throw();
		});
	});
}
