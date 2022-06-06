/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { IContainer } from '@fluidframework/container-definitions';
import { requestFluidObject } from '@fluidframework/runtime-utils';
import { ITestFluidObject, ITestObjectProvider } from '@fluidframework/test-utils';
import { fail } from '../../Common';
import { ChangeInternal, Edit, WriteFormat } from '../../persisted-types';
import type { EditLog } from '../../EditLog';
import { SharedTree } from '../../SharedTree';
import { Change, StablePlace } from '../../ChangeTypes';
import { TreeView } from '../../TreeView';
import { NodeId, TraitLabel } from '../../Identifiers';
import {
	getEditLogInternal,
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	setUpTestTree,
	stabilizeEdit,
} from './TestUtilities';
import { SimpleTestTree } from './TestNode';

async function withContainerOffline<TReturn>(
	provider: ITestObjectProvider,
	container: IContainer,
	action: () => TReturn
): Promise<{ actionReturn: TReturn; pendingLocalState: string }> {
	await provider.ensureSynchronized();
	await provider.opProcessingController.pauseProcessing(container);
	const actionReturn = action();
	const pendingLocalState = container.closeAndGetPendingLocalState();
	provider.opProcessingController.resumeProcessing(container);
	return { actionReturn, pendingLocalState };
}

/**
 * Runs a test suite for SharedTree's ability to apply pending local state stashed by the host.
 * See documentation on `applyStashedOp`.
 * This suite can be used to test other implementations that aim to fulfill `SharedTree`'s contract.
 */
export function runPendingLocalStateTests(
	title: string,
	setUpLocalServerTestSharedTree: (
		options: LocalServerSharedTreeTestingOptions
	) => Promise<LocalServerSharedTreeTestingComponents>
) {
	describe(title, () => {
		const documentId = 'documentId';

		it('deals with stashed handle ops gracefully', async () => {
			const { container, tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
				id: documentId,
				writeFormat: WriteFormat.v0_1_1,
			});
			const testTree = setUpTestTree(tree);
			await setUpLocalServerTestSharedTree({
				id: documentId,
				testObjectProvider,
				writeFormat: WriteFormat.v0_1_1,
			});

			const url = (await container.getAbsoluteUrl('/')) ?? fail('Container unable to resolve "/".');

			await testObjectProvider.ensureSynchronized();
			await testObjectProvider.opProcessingController.pauseProcessing();
			// Generate enough edits to cause a chunk upload.
			for (let i = 0; i < (tree.edits as EditLog).editsPerChunk; i++) {
				tree.applyEdit(
					...Change.insertTree(testTree.buildLeaf(), StablePlace.atEndOf(testTree.left.traitLocation))
				);
			}
			// Process all of those messages, sequencing them but without informing the container that they have been sequenced.
			await testObjectProvider.opProcessingController.processOutgoing(container);
			// Inform the container that all of the edits it generated above have been sequenced, thereby filling an edit chunk
			// whose responsibility to upload is on the container.
			await testObjectProvider.opProcessingController.processIncoming(container);
			// Process outgoing/incoming once more to handle the blob attach op.
			await testObjectProvider.opProcessingController.processOutgoing(container);
			await testObjectProvider.opProcessingController.processIncoming(container);

			const pendingLocalState = container.closeAndGetPendingLocalState();
			const loader = testObjectProvider.makeTestLoader();

			const container2 = await loader.resolve({ url }, pendingLocalState);
			const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, '/');
			const tree2 = await dataObject2.getSharedObject<SharedTree>(documentId);
			await testObjectProvider.ensureSynchronized();

			const editLog = tree2.edits as EditLog;
			const unuploadedEditChunks = Array.from(editLog.getEditChunksReadyForUpload());
			expect(unuploadedEditChunks.length).to.equal(0);
			expect(editLog.getEditLogSummary().editChunks.length).to.equal(2);
		});

		it('applies and submits ops from 0.0.2 in 0.0.2', async () =>
			applyStashedOp(WriteFormat.v0_0_2, WriteFormat.v0_0_2));
		it('applies and submits ops from 0.0.2 in 0.1.1', async () =>
			applyStashedOp(WriteFormat.v0_0_2, WriteFormat.v0_1_1));
		it('applies and submits ops from 0.1.1 in 0.0.2 (via upgrade)', async () =>
			applyStashedOp(WriteFormat.v0_1_1, WriteFormat.v0_0_2));
		it('applies and submits ops from 0.1.1 in 0.1.1', async () =>
			applyStashedOp(WriteFormat.v0_1_1, WriteFormat.v0_1_1));

		async function applyStashedOp(treeVersion: WriteFormat, opVersion: WriteFormat): Promise<void> {
			const {
				container: stashingContainer,
				tree: stashingTree,
				testObjectProvider,
			} = await setUpLocalServerTestSharedTree({
				id: documentId,
				writeFormat: opVersion,
			});
			const stashingTestTree = setUpTestTree(stashingTree);
			const { tree: observerTree } = await setUpLocalServerTestSharedTree({
				id: documentId,
				testObjectProvider,
				writeFormat: treeVersion,
			});
			const url = (await stashingContainer.getAbsoluteUrl('/')) ?? fail('Container unable to resolve "/".');
			await testObjectProvider.ensureSynchronized();
			const initialEditLogLength = stashingTree.edits.length;

			const insertedLeafLabel = 'leaf' as TraitLabel;
			const insertedLeafNodeId = stashingTestTree.generateNodeId('insertedLeafId');
			const insertedLeafStableId = stashingTestTree.convertToStableNodeId(insertedLeafNodeId);
			const { pendingLocalState, actionReturn: edit } = await withContainerOffline(
				testObjectProvider,
				stashingContainer,
				() =>
					stashingTree.applyEdit(
						...Change.insertTree(
							{
								...stashingTestTree.buildLeaf(),
								traits: {
									[insertedLeafLabel]: stashingTestTree.buildLeaf(insertedLeafNodeId),
								},
							},
							StablePlace.after(stashingTestTree.left)
						)
					)
			);
			await testObjectProvider.ensureSynchronized();
			const observerAfterStash = observerTree.currentView;
			const loader = testObjectProvider.makeTestLoader();

			// Simulate reconnect of user 1; a new container will be created which passes the stashed local state in its
			// load request.
			const stashingContainer2 = await loader.resolve({ url }, pendingLocalState);
			const dataObject2 = await requestFluidObject<ITestFluidObject>(stashingContainer2, '/');
			const stashingTree2 = await dataObject2.getSharedObject<SharedTree>(documentId);
			expect((stashingTree2.edits as unknown as EditLog<ChangeInternal>).isLocalEdit(edit.id)).to.be.true; // Kludge

			await testObjectProvider.ensureSynchronized();
			await testObjectProvider.ensureSynchronized(); // Synchronize twice in case stashed ops caused an upgrade round-trip

			function tryGetInsertedLeafId(view: TreeView): NodeId | undefined {
				const rootNode = view.getViewNode(
					view.getTrait({ parent: view.root, label: SimpleTestTree.traitLabel })[0]
				);
				const leftTrait = view.getTrait({ parent: rootNode.identifier, label: SimpleTestTree.leftTraitLabel });
				if (leftTrait.length !== 2) {
					return undefined;
				}
				const insertedParent = view.tryGetViewNode(leftTrait[1]);
				if (insertedParent === undefined) {
					return undefined;
				}
				return view.getTrait({ parent: insertedParent.identifier, label: insertedLeafLabel })[0];
			}

			expect(tryGetInsertedLeafId(observerAfterStash)).to.equal(
				undefined,
				'Observing tree should not receive edits made by the stashing tree after it went offline.'
			);
			expect(tryGetInsertedLeafId(stashingTree2.currentView)).to.equal(
				stashingTree2.convertToNodeId(insertedLeafStableId),
				'Tree which loaded with stashed pending edits should apply them correctly.'
			);
			expect(tryGetInsertedLeafId(stashingTree.currentView)).to.equal(
				stashingTree.convertToNodeId(insertedLeafStableId),
				'Tree collaborating with a client that applies stashed pending edits should also apply them.'
			);

			const stableEdit = stabilizeEdit(stashingTree, edit as unknown as Edit<ChangeInternal>);
			expect(
				stabilizeEdit(observerTree, (await getEditLogInternal(observerTree).tryGetEdit(edit.id)) ?? fail())
			).to.deep.equal(stableEdit);

			expect(
				stabilizeEdit(stashingTree2, (await getEditLogInternal(stashingTree2).tryGetEdit(edit.id)) ?? fail())
			).to.deep.equal(stableEdit);

			expect(observerTree.edits.length).to.equal(initialEditLogLength + 1);
			expect(stashingTree2.edits.length).to.equal(initialEditLogLength + 1);
		}
	});
}
