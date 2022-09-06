/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent } from '@fluidframework/common-definitions';
import { LoaderHeader } from '@fluidframework/container-definitions';
import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils';
import { expect } from 'chai';
import { StableRange, StablePlace, BuildNode, Change } from '../../ChangeTypes';
import { Mutable } from '../../Common';
import { EditLog } from '../../EditLog';
import { areRevisionViewsSemanticallyEqual } from '../../EditUtilities';
import { SharedTreeDiagnosticEvent } from '../../EventTypes';
import { NodeId, StableNodeId, TraitLabel } from '../../Identifiers';
import { SharedTreeOpType, SharedTreeUpdateOp, TreeNodeSequence, WriteFormat } from '../../persisted-types';
import { SharedTree } from '../../SharedTree';
import { TreeNodeHandle } from '../../TreeNodeHandle';
import { nilUuid } from '../../UuidUtilities';
import { applyTestEdits } from '../Summary.tests';
import { buildLeaf } from './TestNode';
import {
	applyNoop,
	setUpLocalServerTestSharedTree,
	setUpTestTree,
	SharedTreeTestingComponents,
	SharedTreeTestingOptions,
	spyOnSubmittedOps,
	testTrait,
	waitForSummary,
} from './TestUtilities';

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

		it('defaults to latest version if no version is specified when creating factory', () => {
			const sharedTree = SharedTree.getFactory().create(new MockFluidDataStoreRuntime(), 'SharedTree');
			const writeFormats = Object.values(WriteFormat);
			expect(sharedTree.getWriteFormat()).to.equal(writeFormats[writeFormats.length - 1]);
		});

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

		it('resubmits ops concurrent to an update op using the new format', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree(treeOptions);
			const { tree: newerTree } = setUpTestSharedTree({
				...treeOptions,
				containerRuntimeFactory,
				writeFormat: newVersion,
			});

			const testTree = setUpTestTree(tree);
			const rootStableId = testTree.stable.identifier;
			containerRuntimeFactory.processAllMessages();
			const summary = tree.saveSummary();
			const ops = spyOnSubmittedOps(containerRuntimeFactory);
			newerTree.loadSummary(summary);
			tree.applyEdit(...Change.move(StableRange.only(testTree.left), StablePlace.after(testTree.right)));
			containerRuntimeFactory.processAllMessages();

			// Verify even though one edit was applied, 2 edit ops were sent due to the version upgrade.
			expect(ops.length).to.equal(3);
			expect(ops.map((op) => op.type)).to.eql([
				SharedTreeOpType.Update,
				SharedTreeOpType.Edit,
				SharedTreeOpType.Edit,
			]);

			expect(ops[1].version).to.equal(oldVersion);
			expect(ops[2].version).to.equal(newVersion);

			// Verify both trees apply the updated op.
			const handle = new TreeNodeHandle(tree.currentView, tree.convertToNodeId(rootStableId));
			expect(handle.traits[testTree.left.traitLabel]).to.equal(undefined);
			expect(handle.traits[testTree.right.traitLabel].length).to.equal(2);
			const handle2 = new TreeNodeHandle(newerTree.currentView, newerTree.convertToNodeId(rootStableId));
			expect(handle2.traits[testTree.left.traitLabel]).to.equal(undefined);
			expect(handle2.traits[testTree.right.traitLabel].length).to.equal(2);
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
			expect(newerTree.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
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
			expect(newerTree.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			applyNoop(newerTree);

			expect(ops.length).to.equal(4);
			expect(ops.map((op) => op.type)).to.eql([
				SharedTreeOpType.Update,
				SharedTreeOpType.Edit,
				SharedTreeOpType.Edit,
				SharedTreeOpType.Edit,
			]);
			// Because the first op was submitted before the Update message was sequenced, it should use
			// the same write format as the loaded summary.
			expect(ops[1].version).to.equal(oldVersion);
			expect(ops[2].version).to.equal(newVersion);
			expect(ops[3].version).to.equal(newVersion);
		});

		it('Existing client can update to a write version higher than the initialized write version', () => {
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

			expect(tree.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			expect(newerTree.getWriteFormat()).to.equal(WriteFormat.v0_1_1);

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

		it('New client can update to a write version higher than the initialized version on summary load', () => {
			const { tree, containerRuntimeFactory } = setUpTestSharedTree({
				...treeOptions,
				writeFormat: newVersion,
			});
			const ops = spyOnSubmittedOps(containerRuntimeFactory);

			applyNoop(tree);
			containerRuntimeFactory.processAllMessages();
			const summary = tree.saveSummary();

			// Load the summary into a tree with older write version; it should recognize the document is already using
			// the new write version and use that instead.
			const { tree: olderTree } = setUpTestSharedTree({
				...treeOptions,
				containerRuntimeFactory,
				writeFormat: oldVersion,
			});

			olderTree.loadSummary(summary);
			applyNoop(olderTree);
			containerRuntimeFactory.processAllMessages();

			expect(ops.length).to.equal(2);
			expect(ops.map((op) => op.type)).to.eql([SharedTreeOpType.Edit, SharedTreeOpType.Edit]);
			expect(ops.map((op) => op.version)).to.eql([newVersion, newVersion]);
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
			expect(newTree.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			expect(() => newTree.currentView).to.not.throw();
		});

		it('upgrades properly when no edits are sent', async () => {
			// Starts in 0.0.2 (so no upgrade)
			const { testObjectProvider, tree: tree1 } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_0_2,
			});

			const { tree: tree2 } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_1_1,
				testObjectProvider,
			});

			expect(tree1.getWriteFormat()).to.equal(WriteFormat.v0_0_2);
			expect(tree2.getWriteFormat()).to.equal(WriteFormat.v0_0_2);

			await testObjectProvider.ensureSynchronized();

			expect(tree1.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			expect(tree1.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			expect(tree1.equals(tree2)).to.be.true;
		});

		it('generates unique IDs after upgrading from 0.0.2', async () => {
			const idCount = 100;

			const { testObjectProvider, tree: tree } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_0_2,
			});

			applyTestEdits(tree);

			const nodeIds = new Set<NodeId>();
			const stableIds = new Set<StableNodeId>();
			for (let i = 0; i < idCount; i++) {
				const id = tree.generateNodeId();
				nodeIds.add(id);
				stableIds.add(tree.convertToStableNodeId(id));
			}

			// New tree joins, causes an upgrade
			await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_1_1,
				testObjectProvider,
			});

			await testObjectProvider.ensureSynchronized();
			expect(tree.getWriteFormat()).to.equal(WriteFormat.v0_1_1);

			for (let i = 0; i < idCount; i++) {
				// No IDs should be generated that were already generated before the update
				const id = tree.generateNodeId();
				expect(nodeIds.has(id)).to.be.false;
				expect(stableIds.has(tree.convertToStableNodeId(id))).to.be.false;
			}
			expect(tree.equals(tree)).to.be.true;
		});

		it('converts IDs correctly after upgrading from 0.0.2', async () => {
			const { testObjectProvider, tree: tree1 } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_0_2,
			});

			const idCount = 10;
			const ids: [NodeId, StableNodeId][] = [];
			for (let i = 0; i < idCount; i++) {
				const id = tree1.generateNodeId();
				ids.push([id, tree1.convertToStableNodeId(id)]);
			}

			// Use some of the IDs in edits, but leave others unused.
			// They should all be valid and usable after upgrade.
			const builds: Mutable<TreeNodeSequence<BuildNode>> = [];
			for (let i = 1; i < ids.length; i += 2) {
				builds.push(buildLeaf(ids[i][0], i));
			}
			tree1.applyEdit(
				...Change.insertTree(
					builds,
					StablePlace.atEndOf({ parent: tree1.currentView.root, label: 'foo' as TraitLabel })
				)
			);

			const { tree: tree2 } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_1_1,
				testObjectProvider,
			});

			await testObjectProvider.ensureSynchronized();
			expect(tree1.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			expect(tree2.getWriteFormat()).to.equal(WriteFormat.v0_1_1);

			const view = tree1.currentView;
			for (let i = 0; i < ids.length; i++) {
				const [nodeIdBefore, stableIdBefore] = ids[i];
				expect(tree1.convertToStableNodeId(nodeIdBefore)).to.equal(stableIdBefore);
				if (i % 2 === 0) {
					expect(view.hasNode(nodeIdBefore)).to.be.false;
				} else {
					expect(view.hasNode(nodeIdBefore)).to.be.true;
					const node = view.getViewNode(nodeIdBefore);
					expect(node.payload).to.equal(i);
				}
			}
			expect(tree1.equals(tree2)).to.be.true;
		});

		it('interns strings correctly after upgrading from 0.0.2', async () => {
			const {
				testObjectProvider,
				tree: tree1,
				container,
			} = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_0_2,
				summarizeHistory: false,
			});

			const internedDefinition = 'internedDefinition';

			const id = tree1.generateNodeId();
			tree1.applyEdit(
				...Change.insertTree(
					{ definition: internedDefinition, identifier: id },
					StablePlace.atStartOf(testTrait(tree1.currentView))
				)
			);
			tree1.applyEdit(Change.delete(StableRange.only(id)));

			await testObjectProvider.ensureSynchronized();
			const summaryVersion = await waitForSummary(container);

			const { tree: tree2 } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_1_1,
				testObjectProvider,
				headers: { [LoaderHeader.version]: summaryVersion },
			});

			await testObjectProvider.ensureSynchronized();
			expect(tree1.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			expect(tree2.getWriteFormat()).to.equal(WriteFormat.v0_1_1);

			tree1.applyEdit(
				...Change.insertTree(
					{ definition: internedDefinition, identifier: tree1.generateNodeId() },
					StablePlace.atStartOf(testTrait(tree1.currentView))
				)
			);

			await testObjectProvider.ensureSynchronized();
			expect(areRevisionViewsSemanticallyEqual(tree1.currentView, tree1, tree2.currentView, tree2)).to.be.true;
		}).timeout(10000);

		it('attributes all pre-upgrade IDs to the nil UUID after upgrading from 0.0.2', async () => {
			const { testObjectProvider, tree: tree } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_0_2,
			});

			const attributionId = tree.attributionId;
			expect(attributionId).to.equal(nilUuid);
			const nodeId = tree.generateNodeId();
			const stableNodeId = tree.convertToStableNodeId(nodeId);

			tree.applyEdit(Change.insertTree(buildLeaf(nodeId), StablePlace.atStartOf(testTrait(tree.currentView))));

			// New tree joins, causes an upgrade
			const { tree: tree2 } = await setUpLocalServerTestSharedTree({
				writeFormat: WriteFormat.v0_1_1,
				testObjectProvider,
			});

			await testObjectProvider.ensureSynchronized();
			expect(tree.getWriteFormat()).to.equal(WriteFormat.v0_1_1);
			expect(tree.attributeNodeId(nodeId)).to.equal(attributionId);
			expect(tree2.attributeNodeId(tree2.convertToNodeId(stableNodeId))).to.equal(attributionId);
		});

		describe('telemetry', () => {
			const events: ITelemetryBaseEvent[] = [];
			const logger = { send: (event) => events.push(event) };
			beforeEach(() => {
				events.length = 0;
			});

			it('emits RequestVersionUpdate events', () => {
				const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions, logger });
				const { tree: newerTree } = setUpTestSharedTree({
					containerRuntimeFactory,
					...secondTreeOptions,
					logger,
				});

				newerTree.loadSummary(tree.saveSummary());
				expect(
					events.some(
						(event) =>
							event.eventName === 'SharedTree:RequestVersionUpdate' &&
							event.versionTo === newVersion &&
							event.versionFrom === oldVersion &&
							event.category === 'generic'
					)
				).to.equal(true);
			});

			it('emits VersionUpdate events', () => {
				const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions, logger });
				const { tree: newerTree } = setUpTestSharedTree({
					containerRuntimeFactory,
					...secondTreeOptions,
					logger,
				});

				newerTree.loadSummary(tree.saveSummary());
				const matchesVersionUpdate = (event: ITelemetryBaseEvent) =>
					event.eventName === 'SharedTree:VersionUpdate_end' &&
					event.version === newVersion &&
					event.category === 'performance' &&
					typeof event.duration === 'number';

				expect(events.some(matchesVersionUpdate)).to.equal(false);
				containerRuntimeFactory.processAllMessages();
				expect(events.some(matchesVersionUpdate)).to.equal(true);
			});

			it('emits error events on VersionUpdate failure', () => {
				const { tree, containerRuntimeFactory } = setUpTestSharedTree({ ...treeOptions, logger });
				const op: SharedTreeUpdateOp = {
					type: SharedTreeOpType.Update,
					version: newVersion,
				};
				containerRuntimeFactory.pushMessage({ contents: op });
				(tree.edits as EditLog).getLocalEdits = () => {
					throw new Error('Simulated issue in update');
				};
				const matchesFailedVersionUpdate = (event: ITelemetryBaseEvent) =>
					event.eventName === 'SharedTree:VersionUpdate_cancel' &&
					event.category === 'error' &&
					event.error === 'Simulated issue in update';

				expect(events.some(matchesFailedVersionUpdate)).to.equal(false);
				expect(() => containerRuntimeFactory.processAllMessages()).to.throw(/Simulated issue in update/);
				expect(events.some(matchesFailedVersionUpdate)).to.equal(true);
			});
		});
	});
}
