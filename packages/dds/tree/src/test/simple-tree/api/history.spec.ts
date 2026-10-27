/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { Listenable } from "@fluidframework/core-interfaces";
import type { SessionId } from "@fluidframework/id-compressor";
import { validateAssertionError } from "@fluidframework/test-runtime-utils/internal";
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
import { brand } from "../../../util/index.js";
import {
	chunkFromJsonableTrees,
	mintRevisionTag,
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
