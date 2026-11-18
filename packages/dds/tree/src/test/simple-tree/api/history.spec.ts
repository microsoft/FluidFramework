/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Listenable } from "@fluidframework/core-interfaces";
import type { SessionId } from "@fluidframework/id-compressor";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
import { asAlpha } from "../../../api.js";
import { FluidClientVersion, FormatValidatorNoOp } from "../../../codec/index.js";
import { rootFieldKey } from "../../../core/index.js";
import { fieldBatchCodecBuilder } from "../../../feature-libraries/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { DefaultTreeBranchHistory } from "../../../shared-tree/history.js";
// eslint-disable-next-line import-x/no-internal-modules
import { SharedTreeChangeFamily } from "../../../shared-tree/sharedTreeChangeFamily.js";
import {
	SharedTreeBranch,
	EditManager,
	type BranchTrimmingEvents,
} from "../../../shared-tree-core/index.js";
import { TreeViewConfiguration, type HistoryUpdate } from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { brand } from "../../../util/index.js";
import {
	chunkFromJsonableTrees,
	getView,
	mintRevisionTag,
	StringArray,
	TestTreeProviderLite,
	testIdCompressor,
	testRevisionTagCodec,
} from "../../utils.js";

const codecOptions = {
	jsonValidator: FormatValidatorNoOp,
	minVersionForCollab: FluidClientVersion.v2_0,
};

type BranchType = SharedTreeBranch<
	ReturnType<SharedTreeChangeFamily["buildEditor"]>,
	ReturnType<SharedTreeChangeFamily["compose"]>,
	unknown
>;

function createBranch(): BranchType;
function createBranch(branchTrimmer: Listenable<BranchTrimmingEvents>): BranchType;
function createBranch(branchTrimmer?: Listenable<BranchTrimmingEvents>): BranchType {
	const changeFamily = new SharedTreeChangeFamily(
		testRevisionTagCodec,
		fieldBatchCodecBuilder.build(codecOptions),
		codecOptions,
		undefined,
		testIdCompressor,
	);

	const branch = new SharedTreeBranch(
		{
			change: changeFamily.rebaser.compose([]),
			revision: "root",
			customMetadata: undefined,
			wasTrimmed: true,
		},
		changeFamily,
		mintRevisionTag,
		{ trimmedCommitCount: 0 },
	);
	branch.trimmer = branchTrimmer;
	return branch;
}

function setRootValue(branch: BranchType, value: number): void {
	const content = chunkFromJsonableTrees([{ type: brand("TestValue"), value }]);
	branch.editor.valueField({ parent: undefined, field: rootFieldKey }).set(content);
}

function createEditManager(): EditManager<
	ReturnType<SharedTreeChangeFamily["buildEditor"]>,
	ReturnType<SharedTreeChangeFamily["compose"]>,
	unknown
> {
	return new EditManager(
		createBranch().changeFamily,
		testIdCompressor.localSessionId,
		mintRevisionTag,
	);
}

function sequenceCommits(
	manager: ReturnType<typeof createEditManager>,
	startSequenceNumber: number = 1,
): void {
	for (
		let sequenceNumber = startSequenceNumber;
		sequenceNumber < startSequenceNumber + 3;
		sequenceNumber++
	) {
		manager.addSequencedChanges(
			[
				{
					change: manager.changeFamily.rebaser.compose([]),
					revision: mintRevisionTag(),
					customMetadata: undefined,
				},
			],
			"peer" as SessionId,
			brand(sequenceNumber),
			brand(sequenceNumber - 1),
			"main",
		);
	}
}

describe("TreeBranchHistoryImpl", () => {
	it("commitCount reflects the number of commits in the branch", () => {
		const branch = createBranch();
		const history = new DefaultTreeBranchHistory(branch, testIdCompressor, () => undefined);
		assert.equal(history.length, 0);

		setRootValue(branch, 3);
		setRootValue(branch, 4);
		assert.equal(history.length, 2);
	});

	it("updates when rebasing the tracked branch triggers ancestry trimming", () => {
		const manager = createEditManager();
		const baseBranch = manager.getLocalBranch("main");
		const trackedBranch = baseBranch.fork();
		const history = new DefaultTreeBranchHistory(
			trackedBranch,
			testIdCompressor,
			() => undefined,
		);

		// Initialize the lazy count before the branch catches up.
		assert.equal(history.length, 0);
		sequenceCommits(manager);
		manager.advanceMinimumSequenceNumber(brand(3));
		assert.equal(baseBranch.getCommitCount(), 3);

		// The rebase releases the old history, so the edit manager trims it during its afterChange listener.
		trackedBranch.rebaseOnto(baseBranch);

		assert.equal(history.length, 1);
		trackedBranch.dispose();
	});

	for (const initializeBeforeTrim of [false, true]) {
		it(`reads another branch's history during trimming (initialized: ${initializeBeforeTrim})`, () => {
			const manager = createEditManager();
			sequenceCommits(manager);
			const main = manager.getLocalBranch("main");
			const fork = main.fork();
			const history = new DefaultTreeBranchHistory(fork, testIdCompressor, () => undefined);
			if (initializeBeforeTrim) {
				assert.equal(history.length, 3);
			}
			main.events.on("ancestryTrimmed", () => {
				assert.equal(history.length, 1);
			});

			manager.advanceMinimumSequenceNumber(brand(3));

			assert.equal(history.length, 1);
		});
	}

	it("updates a history reader initialized before loading a summary without recounting", () => {
		const writer = createEditManager();
		sequenceCommits(writer);
		const reader = createEditManager();
		let parentReads = 0;
		Object.defineProperty(reader.getTrunkHead("main"), "parent", {
			get: () => {
				parentReads++;
				return undefined;
			},
		});
		const history = new DefaultTreeBranchHistory(
			reader.getLocalBranch("main"),
			testIdCompressor,
			() => undefined,
		);
		assert.equal(history.length, 0);
		const initialReads = parentReads;

		reader.loadSummaryData(writer.getSummaryData());
		assert.equal(history.length, 3);
		assert.equal(parentReads, initialReads);
		reader.advanceMinimumSequenceNumber(brand(3));
		assert.equal(history.length, 0);
	});

	it("loads named branch histories from their saved bases rather than main's head", () => {
		const writer = createEditManager();
		sequenceCommits(writer);
		const emptyBranchId = testIdCompressor.generateCompressedId();
		const editedBranchId = testIdCompressor.generateCompressedId();
		writer.addNewBranch(emptyBranchId);
		writer.addNewBranch(editedBranchId);
		for (const sequenceNumber of [4, 5]) {
			writer.addSequencedChanges(
				[
					{
						change: writer.changeFamily.rebaser.compose([]),
						revision: mintRevisionTag(),
						customMetadata: undefined,
					},
				],
				"peer" as SessionId,
				brand(sequenceNumber),
				brand(sequenceNumber - 1),
				editedBranchId,
			);
		}
		sequenceCommits(writer, 6);
		const reader = createEditManager();
		reader.loadSummaryData(writer.getSummaryData());

		const histories = (["main", emptyBranchId, editedBranchId] as const).map(
			(id) =>
				new DefaultTreeBranchHistory(
					reader.getLocalBranch(id),
					testIdCompressor,
					() => undefined,
				),
		);
		assert.deepEqual(
			histories.map((history) => history.length),
			[6, 3, 5],
		);

		reader.advanceMinimumSequenceNumber(brand(8));
		assert.deepEqual(
			histories.map((history) => history.length),
			[4, 1, 3],
		);
	});

	it("keeps child history accurate after the parent is disposed", () => {
		const manager = createEditManager();
		sequenceCommits(manager);
		const fork = manager.getLocalBranch("main").fork();
		const history = new DefaultTreeBranchHistory(fork, testIdCompressor, () => undefined);
		assert.equal(history.length, 3);

		manager.advanceMinimumSequenceNumber(brand(3));

		assert.equal(history.length, 1);
		const child = fork.fork();
		const childHistory = new DefaultTreeBranchHistory(
			child,
			testIdCompressor,
			() => undefined,
		);
		assert.equal(childHistory.length, 1);

		fork.dispose();
		sequenceCommits(manager, 4);
		manager.advanceMinimumSequenceNumber(brand(6));
		child.rebaseOnto(manager.getLocalBranch("main"));
		assert.equal(childHistory.length, 1);
		assert.throws(() => history.length, validateAssertionError("Branch is disposed"));
		child.dispose();
	});

	describe("historyChanged", () => {
		const config = new TreeViewConfiguration({ schema: StringArray });

		function createConnectedViews(retainHistory: boolean | number = true) {
			const provider = new TestTreeProviderLite(
				2,
				configuredSharedTree({ retainHistory }).getFactory(),
			);
			const views = provider.trees.map((tree) => asAlpha(tree.viewWith(config)));
			views[0].initialize([]);
			provider.synchronizeMessages();
			return { provider, views };
		}

		it("reports added counts after a local edit and supports unsubscribing", () => {
			// Setup: subscribe after initialization so only the next edit is observed.
			const view = asAlpha(getView(config));
			view.initialize([]);
			const lengthBefore = view.branchHistory.length;
			const updates: HistoryUpdate[] = [];
			const unsubscribe = view.events.on("historyChanged", (update) => {
				// Verify: callbacks observe the completed document and history update.
				assert.equal(update.lengthAfter, view.branchHistory.length);
				assert.deepEqual([...view.root], ["a"]);
				updates.push(update);
			});

			// Action: append one local edit.
			view.root.insertAtEnd("a");

			// Verify: one notification reports one added entry and no removals.
			assert.deepEqual(updates, [
				{
					lengthBefore,
					lengthAfter: lengthBefore + 1,
					changes: [{ reason: "append", removedCount: 0, addedCount: 1 }],
				},
			]);
			// Action: stop listening before another edit.
			unsubscribe();
			view.root.insertAtEnd("b");

			// Verify: unsubscribing prevents further notifications.
			assert.equal(updates.length, 1);
		});

		it("reports received counts without counting local acknowledgements twice", () => {
			// Setup: subscribe on two synchronized clients with history retention enabled.
			const { provider, views } = createConnectedViews();
			const [sender, receiver] = views;
			const lengthBefore = receiver.branchHistory.length;
			const sent: HistoryUpdate[] = [];
			const received: HistoryUpdate[] = [];
			sender.events.on("historyChanged", (update) => sent.push(update));
			receiver.events.on("historyChanged", (update) => received.push(update));

			// Action: edit locally without delivering the op to the other client yet.
			sender.root.insertAtEnd("remote");

			// Verify: only the sender has observed the new history entry.
			assert.equal(sent.length, 1);
			assert.equal(received.length, 0);

			// Action: deliver the remote op and the sender's acknowledgement.
			provider.synchronizeMessages();

			// Verify: the receiver adds one entry through rebase; acknowledgement does not add it again.
			assert.equal(sent.length, 1);
			assert.deepEqual(received, [
				{
					lengthBefore,
					lengthAfter: lengthBefore + 1,
					changes: [{ reason: "rebase", removedCount: 0, addedCount: 1 }],
				},
			]);
		});

		it("reports removed counts when rewinding a fork", () => {
			// Setup: save the fork's initial revision, then add two commits before subscribing.
			const view = asAlpha(getView(config));
			view.initialize([]);
			const fork = view.fork();
			const revision = fork.branchHistory.getHead()?.revision;
			assert(revision !== undefined);
			fork.root.insertAtEnd("a");
			fork.root.insertAtEnd("b");
			const lengthBefore = fork.branchHistory.length;
			const updates: HistoryUpdate[] = [];
			fork.events.on("historyChanged", (update) => {
				// Verify: the callback sees the length of the replacement branch.
				assert.equal(update.lengthAfter, fork.branchHistory.length);
				updates.push(update);
			});

			// Action: return the fork to its saved revision.
			fork.rewindTo(revision);

			// Verify: rewind removes two entries, adds none, and restores the original content.
			assert.deepEqual(updates, [
				{
					lengthBefore,
					lengthAfter: lengthBefore - 2,
					changes: [{ reason: "rollback", removedCount: 2, addedCount: 0 }],
				},
			]);
			assert.deepEqual([...fork.root], []);
			fork.dispose();
		});

		for (const append of [false, true]) {
			it(`reports trim counts in one completed update (append: ${append})`, () => {
				// Setup: a fork pins older history despite the retention limit of one.
				const { provider, views } = createConnectedViews(1);
				const [view, peer] = views;
				const fork = view.fork();
				for (const value of ["a", "b", "c"]) {
					view.root.insertAtEnd(value);
					provider.synchronizeMessages();
				}
				// Edits from both clients advance collaboration bounds while the fork still prevents trimming.
				peer.root.insertAtEnd("peer");
				provider.synchronizeMessages();
				view.root.insertAtEnd("latest");
				provider.synchronizeMessages();
				const lengthBefore = view.branchHistory.length;
				const updates: HistoryUpdate[] = [];
				view.events.on("historyChanged", (update) => {
					// Verify: notification waits until any nested trimming has completed.
					assert.equal(update.lengthAfter, view.branchHistory.length);
					updates.push(update);
				});

				// Action: release the fork either on its own or inside a new edit's changed callback.
				if (append) {
					const unsubscribe = view.events.on("changed", () => fork.dispose());
					view.root.insertAtEnd("appended");
					unsubscribe();
				} else {
					fork.dispose();
				}

				// Verify: one notification includes every change in order, even when append triggers trimming.
				assert.equal(updates.length, 1);
				const [emittedUpdate] = updates;
				// Collaboration may retain extra entries, so compare counts with the actual final history length.
				const removedCount = lengthBefore + Number(append) - view.branchHistory.length;
				assert(removedCount > 0);
				assert.deepEqual(emittedUpdate, {
					lengthBefore,
					lengthAfter: view.branchHistory.length,
					changes: [
						...(append ? [{ reason: "append", removedCount: 0, addedCount: 1 }] : []),
						{ reason: "trim", removedCount, addedCount: 0 },
					],
				});
			});
		}
	});

	describe("getHeadCommit", () => {
		it("returns metadata for the current head commit", () => {
			const branch = createBranch();
			const history = new DefaultTreeBranchHistory(branch, testIdCompressor, () => undefined);

			const beforeInit = history.getHead();
			assert.equal(beforeInit, undefined);

			setRootValue(branch, 3);

			const afterInit = history.getHead();
			assert.notEqual(afterInit, undefined);

			setRootValue(branch, 4);

			const afterEdit = history.getHead();
			assert.notEqual(afterEdit, undefined);
			assert.notEqual(afterEdit?.revision, afterInit?.revision);
		});

		it("reflects independent heads on forked branches", () => {
			const branchA = createBranch();
			setRootValue(branchA, 3);
			const branchB = branchA.fork();

			const historyA = new DefaultTreeBranchHistory(
				branchA,
				testIdCompressor,
				() => undefined,
			);
			const historyB = new DefaultTreeBranchHistory(
				branchB,
				testIdCompressor,
				() => undefined,
			);

			const headA = historyA.getHead();
			const headB = historyB.getHead();
			assert(headA !== undefined);
			assert(headB !== undefined);
			assert.equal(headA.revision, headB.revision);

			setRootValue(branchA, 4);
			const nextHeadA = historyA.getHead();
			const nextHeadB = historyB.getHead();
			assert(nextHeadA !== undefined);
			assert(nextHeadB !== undefined);
			assert.notEqual(nextHeadA.revision, nextHeadB.revision);
		});

		it("exposes ancestor commits via the parent field", () => {
			const branch = createBranch();
			const history = new DefaultTreeBranchHistory(branch, testIdCompressor, () => undefined);
			setRootValue(branch, 3);
			const afterInit = history.getHead();
			assert(afterInit !== undefined);

			setRootValue(branch, 4);
			setRootValue(branch, 5);

			const head = history.getHead();
			assert(head !== undefined);
			assert.notEqual(head.revision, afterInit.revision);

			const parent = head.getParent();
			assert(parent !== undefined);
			assert.notEqual(parent.revision, head.revision);

			const grandparent = parent.getParent();
			assert(grandparent !== undefined);
			assert.equal(grandparent.revision, afterInit.revision);

			// The oldest commit's parent is the root commit, which has no metadata.
			assert.equal(grandparent.getParent(), undefined);
		});
	});
});
