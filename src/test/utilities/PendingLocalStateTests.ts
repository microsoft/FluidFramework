/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { IContainer } from '@fluidframework/container-definitions';
import { requestFluidObject } from '@fluidframework/runtime-utils';
import { ITestFluidObject, ITestObjectProvider } from '@fluidframework/test-utils';
import { Change, EditCommittedEventArguments, Insert, newEdit, SharedTree, SharedTreeEvent, StablePlace } from '../..';
import { fail } from '../../Common';
import type { SharedTreeWithAnchors } from '../../anchored-edits';
import { SharedTreeOp, SharedTreeOpType } from '../../generic/PersistedTypes';
import type { EditLog } from '../../EditLog';
import {
	left,
	leftTraitLocation,
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	makeEmptyNode,
	SharedTreeTestingComponents,
	SharedTreeTestingOptions,
	simpleTestTree,
} from './TestUtilities';

type WithApplyStashedOp<T> = T & { applyStashedOp(op: SharedTreeOp): void };

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
export function runPendingLocalStateTests<TSharedTree extends SharedTree | SharedTreeWithAnchors>(
	title: string,
	setUpTestSharedTree: (options?: SharedTreeTestingOptions) => SharedTreeTestingComponents<TSharedTree>,
	setUpLocalServerTestSharedTree: (
		options: LocalServerSharedTreeTestingOptions
	) => Promise<LocalServerSharedTreeTestingComponents<TSharedTree>>
) {
	describe(title, () => {
		const documentId = 'documentId';

		describe('applyStashedOp', () => {
			function makeTree(): WithApplyStashedOp<TSharedTree> {
				// Unit testing the contract of applyStashedOp without normal public access point through fluid services
				// requires access violation (as it is protected on SharedTree).
				const { tree } = setUpTestSharedTree({ initialTree: simpleTestTree });
				return tree as unknown as WithApplyStashedOp<TSharedTree>;
			}

			it('applies edit ops locally', async () => {
				const tree = makeTree();
				const editCommittedLog: EditCommittedEventArguments<TSharedTree>[] = [];
				tree.on(SharedTreeEvent.EditCommitted, (args) => {
					editCommittedLog.push(args);
				});
				const initialEditLogLength = tree.edits.length;
				const edit = newEdit(Insert.create([makeEmptyNode()], StablePlace.atEndOf(leftTraitLocation)));

				const op = { type: SharedTreeOpType.Edit, edit };
				tree.applyStashedOp(op);

				expect(tree.edits.length).to.equal(initialEditLogLength + 1);
				expect(await tree.edits.tryGetEdit(edit.id)).to.deep.equal(edit);
				expect(editCommittedLog.length).to.equal(1);
				expect(editCommittedLog[0].editId).to.equal(edit.id);
				expect(editCommittedLog[0].local).to.equal(true);
			});

			it('applies NoOps without error', () => {
				const tree = makeTree();
				tree.applyStashedOp({ type: SharedTreeOpType.NoOp });
			});

			// Note: No test for handle ops in this suite as they rely on blob support, which is unsupported by fluid test mocks.
		});

		it('is applied to all connected containers', async () => {
			// Setup
			const { container, tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
				id: documentId,
				initialTree: simpleTestTree,
			});
			const { tree: tree2 } = await setUpLocalServerTestSharedTree({ id: documentId, testObjectProvider });
			const url = (await container.getAbsoluteUrl('/')) ?? fail('Container unable to resolve "/".');
			await testObjectProvider.ensureSynchronized();

			// Act
			const { pendingLocalState, actionReturn: editId } = await withContainerOffline(
				testObjectProvider,
				container,
				() => tree.applyEdit(...Insert.create([makeEmptyNode()], StablePlace.after(left)))
			);
			await testObjectProvider.ensureSynchronized();
			const leftTraitAfterOfflineClose = tree2.currentView.getTrait(leftTraitLocation);
			const loader = testObjectProvider.makeTestLoader();

			// Simulate reconnect of user 1; a new container will be created which passes the stashed local state in its
			// load request.
			const container3 = await loader.resolve({ url }, pendingLocalState);
			const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, 'default');
			const tree3 = await dataObject3.getSharedObject<SharedTree>(documentId);
			await testObjectProvider.ensureSynchronized();

			// Assert
			expect(leftTraitAfterOfflineClose.length).to.equal(
				1,
				'Second tree should not receive edits made by first tree after it went offline.'
			);
			expect(tree3.currentView.getTrait(leftTraitLocation).length).to.equal(
				2,
				'Tree which loaded with stashed pending edits should apply them.'
			);
			expect(tree2.currentView.getTrait(leftTraitLocation).length).to.equal(
				2,
				'Tree collaborating with a client that applies stashed pending edits should see them.'
			);

			expect(await tree2.edits.tryGetEdit(editId)).to.not.be.undefined;
			expect(await tree3.edits.tryGetEdit(editId)).to.not.be.undefined;
		});

		it('Deals with stashed handle ops gracefully', async () => {
			// Setup
			const { container, tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
				id: documentId,
				initialTree: simpleTestTree,
			});
			await setUpLocalServerTestSharedTree({ id: documentId, testObjectProvider });

			const url = (await container.getAbsoluteUrl('/')) ?? fail('Container unable to resolve "/".');

			await testObjectProvider.ensureSynchronized();
			await testObjectProvider.opProcessingController.pauseProcessing();
			// Generate enough edits to cause a chunk upload.
			for (let i = 0; i < (tree.edits as EditLog<Change>).editsPerChunk; i++) {
				tree.applyEdit(...Insert.create([makeEmptyNode()], StablePlace.atEndOf(leftTraitLocation)));
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
			const dataObject2 = await requestFluidObject<ITestFluidObject>(container2, 'default');
			const tree2 = await dataObject2.getSharedObject<SharedTree>(documentId);
			await testObjectProvider.ensureSynchronized();

			const editLog = tree2.edits as EditLog<Change>;
			const unuploadedEditChunks = Array.from(editLog.getEditChunksReadyForUpload());
			expect(unuploadedEditChunks.length).to.equal(0);
			expect(editLog.getEditLogSummary().editChunks.length).to.equal(2);
		});
	});
}
