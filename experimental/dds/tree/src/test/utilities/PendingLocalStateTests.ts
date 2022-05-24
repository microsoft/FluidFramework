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
import {
	getEditLogInternal,
	LocalServerSharedTreeTestingComponents,
	LocalServerSharedTreeTestingOptions,
	setUpTestTree,
	stabilizeEdit,
} from './TestUtilities';

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
		/* TODO: Enable when stashed ops are supported: WriteFormat.v0_1_1 */
		[WriteFormat.v0_0_2].forEach((writeFormat) => {
			it(`is applied to all connected containers (v${writeFormat})`, async () => {
				const { container, tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
					id: documentId,
					writeFormat,
				});
				const testTree = setUpTestTree(tree);
				const { tree: tree2 } = await setUpLocalServerTestSharedTree({
					id: documentId,
					testObjectProvider,
					writeFormat,
				});
				const url = (await container.getAbsoluteUrl('/')) ?? fail('Container unable to resolve "/".');
				await testObjectProvider.ensureSynchronized();
				const initialEditLogLength = tree.edits.length;

				const { pendingLocalState, actionReturn: edit } = await withContainerOffline(
					testObjectProvider,
					container,
					() => tree.applyEdit(...Change.insertTree(testTree.buildLeaf(), StablePlace.after(testTree.left)))
				);
				await testObjectProvider.ensureSynchronized();
				const leftTraitAfterOfflineClose = tree2.currentView.getTrait(
					testTree.left.traitLocation.translate(tree2)
				);
				const loader = testObjectProvider.makeTestLoader();

				// Simulate reconnect of user 1; a new container will be created which passes the stashed local state in its
				// load request.
				const container3 = await loader.resolve({ url }, pendingLocalState);
				const dataObject3 = await requestFluidObject<ITestFluidObject>(container3, '/');
				const tree3 = await dataObject3.getSharedObject<SharedTree>(documentId);
				expect((tree3.edits as unknown as EditLog<ChangeInternal>).isLocalEdit(edit.id)).to.be.true; // Kludge

				await testObjectProvider.ensureSynchronized();

				expect(leftTraitAfterOfflineClose.length).to.equal(
					1,
					'Second tree should not receive edits made by first tree after it went offline.'
				);
				expect(tree3.currentView.getTrait(testTree.left.traitLocation.translate(tree3)).length).to.equal(
					2,
					'Tree which loaded with stashed pending edits should apply them.'
				);
				expect(tree2.currentView.getTrait(testTree.left.traitLocation.translate(tree2)).length).to.equal(
					2,
					'Tree collaborating with a client that applies stashed pending edits should see them.'
				);

				const stableEdit = stabilizeEdit(tree, edit as unknown as Edit<ChangeInternal>);
				expect(
					stabilizeEdit(tree2, (await getEditLogInternal(tree2).tryGetEdit(edit.id)) ?? fail())
				).to.deep.equal(stableEdit);
				expect(
					stabilizeEdit(tree3, (await getEditLogInternal(tree3).tryGetEdit(edit.id)) ?? fail())
				).to.deep.equal(stableEdit);
				expect(tree2.edits.length).to.equal(initialEditLogLength + 1);
				expect(tree3.edits.length).to.equal(initialEditLogLength + 1);
			});
		});

		it('Deals with stashed handle ops gracefully', async () => {
			// Setup
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
	});
}
