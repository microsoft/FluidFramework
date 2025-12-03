/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainer } from '@fluidframework/container-definitions/internal';
import { TestObjectProvider } from '@fluidframework/test-utils/internal';
import { expect } from 'chai';

import { Change, StablePlace } from '../../ChangeTypes.js';
import { fail } from '../../Common.js';
import type { EditLog } from '../../EditLog.js';
import { EditId, NodeId, TraitLabel } from '../../Identifiers.js';
import { SharedTree } from '../../SharedTree.js';
import { TreeView } from '../../TreeView.js';
import { ChangeInternal, Edit, WriteFormat } from '../../persisted-types/index.js';

import { SimpleTestTree } from './TestNode.js';
import {
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	applyNoop,
	getEditLogInternal,
	setUpTestTree,
	stabilizeEdit,
	withContainerOffline,
} from './TestUtilities.js';

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

		it('applies and submits ops from 0.0.2 in 0.0.2', async () =>
			applyStashedOp(WriteFormat.v0_0_2, WriteFormat.v0_0_2));
		// TODO:#5357: Re-enable stashed ops tests
		it.skip('applies and submits ops from 0.0.2 in 0.1.1', async () =>
			applyStashedOp(WriteFormat.v0_0_2, WriteFormat.v0_1_1));
		// TODO:#5357: Re-enable stashed ops tests
		it.skip('applies and submits ops from 0.1.1 in 0.0.2 (via upgrade)', async () => {
			const testObjectProvider = await applyStashedOp(WriteFormat.v0_1_1, WriteFormat.v0_0_2);

			// https://dev.azure.com/fluidframework/internal/_workitems/edit/3347
			const events = testObjectProvider.tracker.reportAndClearTrackedEvents();
			expect(events.unexpectedErrors.length).to.equal(1);
			expect(events.unexpectedErrors[0].eventName).to.equal(
				'fluid:telemetry:ContainerRuntime:Outbox:ReferenceSequenceNumberMismatch'
			);
		});
		// TODO:#5357: Re-enable stashed ops tests
		it.skip('applies and submits ops from 0.1.1 in 0.1.1', async () =>
			applyStashedOp(WriteFormat.v0_1_1, WriteFormat.v0_1_1));

		async function applyStashedOp(treeVersion: WriteFormat, opVersion: WriteFormat): Promise<TestObjectProvider> {
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

			// Simulate reconnect of user 1; a new container will be created which passes the stashed local state in its
			// load request.
			const { tree: stashingTree2 } = await setUpLocalServerTestSharedTree({
				testObjectProvider,
				pendingLocalState,
				id: documentId,
				writeFormat: treeVersion,
			});

			expect((stashingTree2.edits as unknown as EditLog<ChangeInternal>).isLocalEdit(edit.id)).to.be.true; // Kludge

			await testObjectProvider.ensureSynchronized();
			await testObjectProvider.ensureSynchronized(); // Synchronize twice in case stashed ops caused an upgrade round-trip

			function tryGetInsertedLeafId(view: TreeView): NodeId | undefined {
				const rootNode = view.getViewNode(view.getTrait({ parent: view.root, label: SimpleTestTree.traitLabel })[0]);
				const leftTrait = view.getTrait({
					parent: rootNode.identifier,
					label: SimpleTestTree.leftTraitLabel,
				});
				if (leftTrait.length !== 2) {
					return undefined;
				}
				const insertedParent = view.tryGetViewNode(leftTrait[1]);
				if (insertedParent === undefined) {
					return undefined;
				}
				return view.getTrait({
					parent: insertedParent.identifier,
					label: insertedLeafLabel,
				})[0];
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
				stabilizeEdit(observerTree, getEditLogInternal(observerTree).tryGetEditFromId(edit.id) ?? fail())
			).to.deep.equal(stableEdit);

			expect(
				stabilizeEdit(stashingTree2, getEditLogInternal(stashingTree2).tryGetEditFromId(edit.id) ?? fail())
			).to.deep.equal(stableEdit);

			expect(observerTree.edits.length).to.equal(initialEditLogLength + 1);
			expect(stashingTree2.edits.length).to.equal(initialEditLogLength + 1);

			return testObjectProvider;
		}

		it('works across summaries', async () => {
			const smallTreeTraitLabel = '3b9e2dd8-def4-45fb-88bc-0df48df62314' as TraitLabel;

			// 1. Create a client
			const { testObjectProvider, tree: tree0 } = await setUpLocalServerTestSharedTree({
				id: documentId,
				writeFormat: WriteFormat.v0_0_2,
			});

			// 2. A second client joins
			let tree: SharedTree;
			let container: IContainer;
			({ container, tree } = await setUpLocalServerTestSharedTree({
				id: documentId,
				testObjectProvider,
				writeFormat: WriteFormat.v0_0_2,
				// To be removed ADO:5463
				featureGates: {
					'Fluid.Container.ForceWriteConnection': true,
				},
			}));

			expect(countSmallTrees(tree0)).to.equal(0);
			expect(countSmallTrees(tree)).to.equal(0);

			// 3. The second client creates stashed ops and rejoins after a summary
			await waitForSummary(container);
			({ tree, container } = await stash(container, () => insertSmallTree(tree)));
			await testObjectProvider.ensureSynchronized();

			expect(countSmallTrees(tree0)).to.equal(1);
			expect(countSmallTrees(tree)).to.equal(1);

			// 4. A third client joins, stashes and rejoins
			const { container: container2, tree: tree2 } = await setUpLocalServerTestSharedTree({
				id: documentId,
				testObjectProvider,
				writeFormat: WriteFormat.v0_0_2,
			});

			await stash(container2, () => insertSmallTree(tree2));
			await testObjectProvider.ensureSynchronized();

			expect(countSmallTrees(tree0)).to.equal(2);
			expect(countSmallTrees(tree)).to.equal(2);
			expect(countSmallTrees(tree2)).to.equal(2);

			/** Go offline, do something, then rejoin with pending local state */
			async function stash(
				container: IContainer,
				action: () => void
			): Promise<{ tree: SharedTree; container: IContainer }> {
				const { pendingLocalState } = await withContainerOffline(testObjectProvider, container, () => {
					action();
				});
				return setUpLocalServerTestSharedTree({
					id: documentId,
					testObjectProvider,
					writeFormat: WriteFormat.v0_0_2,
					pendingLocalState,
				});
			}

			async function waitForSummary(container: IContainer): Promise<void> {
				return new Promise((resolve, reject) => {
					let summarized = false;
					container.on('op', (op) => {
						if (op.type === 'summarize') {
							summarized = true;
						} else if (summarized && op.type === 'summaryAck') {
							resolve();
						} else if (op.type === 'summaryNack') {
							reject(new Error('summaryNack'));
						}
					});
				});
			}

			/** Insert some arbitrary data */
			function insertSmallTree(tree: SharedTree): EditId {
				return tree.applyEdit(
					Change.insertTree(
						[
							{
								definition: '7335ea74-c92f-47f4-8f00-376a306796f4',
								traits: {
									'e0901ba4-14c4-48e4-91a7-22a3068dc274': [
										{
											definition: '7335ea74-c92f-47f4-8f00-376a306796f4',
											traits: {
												'e0901ba4-14c4-48e4-91a7-22a3068dc274': [
													{
														definition: '7335ea74-c92f-47f4-8f00-376a306796f4',
													},
												],
											},
										},
									],
								},
							},
							{
								definition: '7335ea74-c92f-47f4-8f00-376a306796f4',
								traits: {
									'e0901ba4-14c4-48e4-91a7-22a3068dc274': [
										{
											definition: '7335ea74-c92f-47f4-8f00-376a306796f4',
											traits: {
												'e0901ba4-14c4-48e4-91a7-22a3068dc274': [
													{
														definition: '7335ea74-c92f-47f4-8f00-376a306796f4',
													},
												],
											},
										},
									],
								},
							},
						],
						StablePlace.atEndOf({
							label: smallTreeTraitLabel,
							parent: tree.currentView.root,
						})
					)
				).id;
			}

			/** Counts the number of trees that were inserted by `insertSmallTree` */
			function countSmallTrees(tree: SharedTree): number {
				return (
					tree.currentView.getTrait({
						label: smallTreeTraitLabel,
						parent: tree.currentView.root,
					}).length / 2
				);
			}
		});

		it('cleans up temporary translation state', async () => {
			// Glass box test to ensure that SharedTree doesn't hold on to temporary stashed op
			// translation state for longer than necessary
			function clearedTemporaryStashState(tree: SharedTree): boolean {
				return (tree as unknown as { stashedIdCompressor?: unknown }).stashedIdCompressor === null;
			}

			const { container: stashingContainer, tree, testObjectProvider } = await setUpLocalServerTestSharedTree({});
			await testObjectProvider.ensureSynchronized();

			const { pendingLocalState } = await withContainerOffline(testObjectProvider, stashingContainer, () =>
				applyNoop(tree)
			);
			await testObjectProvider.ensureSynchronized();

			const { tree: tree2 } = await setUpLocalServerTestSharedTree({
				testObjectProvider,
				pendingLocalState,
			});

			expect(clearedTemporaryStashState(tree2)).to.be.true;
		});
	});
}
