/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { SharedTreeDiagnosticEvent, SharedTreeSummaryWriteFormat } from '../..';
import { SharedTree } from '../../default-edits';
import { EditLog } from '../../EditLog';
import { applyNoop, SharedTreeTestingComponents, SharedTreeTestingOptions } from './TestUtilities';

/**
 * Runs a test suite for operations on `SharedTree` that depend on correct versioning.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runSharedTreeVersioningTests<TSharedTree extends SharedTree>(
	title: string,
	setUpTestSharedTree: (options?: SharedTreeTestingOptions) => SharedTreeTestingComponents<TSharedTree>
) {
	describe(title, () => {
		const treeOptions = { localMode: false, writeSummaryFormat: SharedTreeSummaryWriteFormat.Format_0_0_2 };
		const secondTreeOptions = {
			id: 'secondTestSharedTree',
			localMode: false,
			writeSummaryFormat: SharedTreeSummaryWriteFormat.Format_0_1_1,
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

		it('throws if an edit op with a newer version is received', () => {
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

			let processedUpdates = 0;
			let processedUpdates2 = 0;
			let processedUpdates3 = 0;

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
			newerTree.on(SharedTreeDiagnosticEvent.VersionUpdated, () => {
				processedUpdates++;
			});
			newerTree2.on(SharedTreeDiagnosticEvent.VersionUpdated, () => {
				processedUpdates2++;
			});
			newerTree3.on(SharedTreeDiagnosticEvent.VersionUpdated, () => {
				processedUpdates3++;
			});
			newerTree.loadSummary(summary);
			newerTree2.loadSummary(summary);
			newerTree3.loadSummary(summary);
			newerContainerRuntimeFactory.processAllMessages();

			// Each tree should have processed a version update once
			expect(processedUpdates).to.equal(1);
			expect(processedUpdates2).to.equal(1);
			expect(processedUpdates3).to.equal(1);
		});

		it('maintains custom EditLog and LogViewer callbacks when updating', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			containerRuntimeFactory.processAllMessages();

			const summary = tree.saveSummary();

			let editAdded = 0;
			let updateProcessed = 0;

			// Load the summary into multiple newer trees to trigger version update ops
			const { tree: newerTree, containerRuntimeFactory: newerContainerRuntimeFactory } =
				setUpTestSharedTree(secondTreeOptions);

			newerTree.on(SharedTreeDiagnosticEvent.VersionUpdated, () => updateProcessed++);

			newerTree.loadSummary(summary);
			(newerTree.edits as EditLog).registerEditAddedHandler(() => editAdded++);

			expect(updateProcessed).to.equal(0);
			// Update occurs after the handler is added to the old edit log
			newerContainerRuntimeFactory.processAllMessages();
			expect(updateProcessed).to.equal(1);

			const additionalEdits = 5;
			for (let i = 0; i < additionalEdits; i++) {
				applyNoop(newerTree);
			}
			newerContainerRuntimeFactory.processAllMessages();

			// The edit added handler should run twice for each additional edit (once when applying locally and once when applying the sequenced edit)
			expect(editAdded).to.equal(additionalEdits * 2);
		});
	});
}
