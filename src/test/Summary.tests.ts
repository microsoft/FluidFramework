/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as fs from 'fs';
import { join } from 'path';
import { IsoBuffer } from '@fluidframework/common-utils';
import { expect } from 'chai';
import { v5 } from 'uuid';
import { Change, Delete, Move, StablePlace, StableRange } from '../ChangeTypes';
import { assert, RecursiveMutable } from '../Common';
import { areRevisionViewsSemanticallyEqual } from '../EditUtilities';
import { Definition, DetachedSequenceId, EditId, NodeId, TraitLabel } from '../Identifiers';
import { initialTree } from '../InitialTree';
import {
	ChangeInternal,
	editsPerChunk,
	SharedTreeSummary,
	SharedTreeSummary_0_0_2,
	WriteFormat,
} from '../persisted-types';
import { getChangeNodeFromView } from '../SerializationUtilities';
import { SharedTree } from '../SharedTree';
import { deserialize, getSummaryStatistics, SummaryStatistics } from '../SummaryBackCompatibility';
import { getUploadedEditChunkContents, UploadedEditChunkContents } from '../SummaryTestUtilities';
import { expectDefined } from './utilities/TestCommon';
import { TestFluidSerializer } from './utilities/TestSerializer';
import { setUpLocalServerTestSharedTree, testDocumentsPathBase } from './utilities/TestUtilities';

const directory = join(testDocumentsPathBase, 'summary-tests');

export async function createSummaryTestTree(writeFormat: WriteFormat, summarizeHistory: boolean): Promise<SharedTree> {
	const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({ writeFormat, summarizeHistory });
	const uuid = new DeterministicUuidGenerator();

	function applyEdit(changes: Change[]): void {
		const internalChanges = changes.map((c) => tree.internalizeChange(c));
		tree.applyEditInternal({ id: uuid.getNextUuid<EditId>(), changes: internalChanges });
	}

	/**
	 * Build a tree that looks like the following:
	 *
	 *          ROOT
	 *            |   'root'
	 *         [root]
	 * 'left'  /    \  'right'
	 *       [A]    [B, C, D]
	 *                  | 'leaf'
	 *                 [E('payload')]
	 */

	const cDetachedId = 0 as DetachedSequenceId;
	const rootDetachedId = 1 as DetachedSequenceId;
	const aId = uuid.getNextUuid<NodeId>();
	const cId = uuid.getNextUuid<NodeId>();
	const dId = uuid.getNextUuid<NodeId>();

	applyEdit([
		Change.build(
			[
				{
					definition: 'C' as Definition,
					identifier: cId,
					traits: {
						leaf: [
							{
								definition: 'E' as Definition,
								identifier: uuid.getNextUuid<NodeId>(),
								traits: {},
								payload: 'payload',
							},
						],
					},
				},
			],
			cDetachedId
		),
		Change.build(
			[
				{
					definition: 'Root' as Definition,
					identifier: uuid.getNextUuid<NodeId>(),
					traits: {
						left: [{ definition: 'A' as Definition, identifier: aId, traits: {} }],
						right: [
							{ definition: 'B' as Definition, identifier: uuid.getNextUuid<NodeId>(), traits: {} },
							cDetachedId,
							{ definition: 'D' as Definition, identifier: dId, traits: {} },
						],
					},
				},
			],
			rootDetachedId
		),
		Change.insert(
			rootDetachedId,
			StablePlace.atStartOf({ label: 'root' as TraitLabel, parent: initialTree.identifier })
		),
	]);

	/**
	 * Edit the tree
	 *
	 * 1. Move C after A
	 * 2. Delete D
	 * 3.
	 * ...
	 * 102. Set the payload of A to _i_ for all _i_ in 0...100
	 */

	applyEdit([...Move.create(StableRange.only(cId), StablePlace.after(aId))]);
	applyEdit([Delete.create(StableRange.only(dId))]);
	for (let i = 0; i < 100; i++) {
		applyEdit([Change.setPayload(aId, i)]);
	}

	await testObjectProvider.ensureSynchronized();
	return tree;
}

describe('SharedTree summaries', () => {
	// Note: this test serializer doesn't handle blobs properly (it just uses JSON.stringify/JSON.parse).
	const testSerializer = new TestFluidSerializer();

	const {
		summaryFileWithHistory_0_0_2,
		summaryFileNoHistory_0_0_2,
		summaryFileEmptyTraits_0_0_2,
		summaryFileWithHistory_0_1_1,
		summaryFileNoHistory_0_1_1,
		blobsFile,
	} = loadSummaryTestFiles();

	// Note: Fluid setup gives stable `absolutePath`s for these blobs across sessions. If that were not the case,
	// this test suite would need to build some kind of map from the blob info saved on disk to the `IFluidHandle`
	// list returned by uploading these blobs.
	const blobsParsed: UploadedEditChunkContents[] = JSON.parse(blobsFile);
	const blobs: ArrayBufferLike[] = blobsParsed.map((blob) =>
		IsoBuffer.from(JSON.stringify(blob.chunkContents), 'utf8')
	);

	// Re-enable this test for an easy way to write the test summary files to disk
	it.skip('save files to disk', async () => {
		await makeSummaryTestFiles();
	});

	describe('0.0.2 write format', () => {
		const setUp002Tree: typeof setUpLocalServerTestSharedTree = async (options) =>
			setUpLocalServerTestSharedTree({ writeFormat: WriteFormat.v0_0_2, ...options });

		const setUp002SummaryTestTree = async (summarizeHistory: boolean): Promise<SharedTree> =>
			createSummaryTestTree(WriteFormat.v0_0_2, summarizeHistory);

		it('Normalizes a denormalized summary containing nodes with empty traits', async () => {
			const { tree } = await setUp002Tree({});
			tree.loadSerializedSummary(summaryFileEmptyTraits_0_0_2);

			const { tree: expectedTree } = await setUp002Tree({});
			expectedTree.loadSerializedSummary(summaryFileWithHistory_0_0_2);
			expect(getChangeNodeFromView(tree.currentView)).deep.equals(
				getChangeNodeFromView(expectedTree.currentView)
			);
		});

		it('writes 0.0.2 files without history', async () => {
			const tree = await setUp002SummaryTestTree(false);
			const summary: RecursiveMutable<SharedTreeSummary_0_0_2<ChangeInternal>> = JSON.parse(
				tree.saveSerializedSummary()
			);
			const expectedSummary: SharedTreeSummary_0_0_2<ChangeInternal> = JSON.parse(summaryFileNoHistory_0_0_2);
			// The edit ID of the single "no history edit" is generated randomly. Replace it with the baseline edit for the sake of this test.
			summary.sequencedEdits[0].id = expectedSummary.sequencedEdits[0].id;
			expect(summary).to.deep.equal(expectedSummary);
		});

		it('writes 0.0.2 files with history', async () => {
			const tree = await setUp002SummaryTestTree(true);
			expect(JSON.parse(tree.saveSerializedSummary())).to.deep.equal(JSON.parse(summaryFileWithHistory_0_0_2));
		});

		describe('reading previous versions', () => {
			// No previous versions.
		});

		describe('reading the same version', () => {
			it('reads 0.0.2 files without history', async () => {
				const { tree } = await setUp002Tree({});
				tree.loadSerializedSummary(summaryFileNoHistory_0_0_2);
				// Tree should have exactly one edit, as all "no history" summaries do.
				expect(tree.edits.length).to.equal(1);
				// Load a baseline tree's own summary with no history to compare with
				const expectedTree = await setUp002SummaryTestTree(false);
				expectedTree.loadSummary(expectedTree.saveSummary());
				await expectSharedTreesEqual(tree, expectedTree, false);
			});

			it('reads 0.0.2 files with history', async () => {
				const { tree } = await setUp002Tree({});
				tree.loadSerializedSummary(summaryFileWithHistory_0_0_2);
				const expectedTree = await setUp002SummaryTestTree(true);
				await expectSharedTreesEqual(tree, expectedTree);
			});
		});

		describe('reading next version', () => {
			it('reads 0.1.1', async () => {
				const { tree } = await setUp002Tree({});
				tree.loadSerializedSummary(summaryFileWithHistory_0_1_1);
				// TODO: There may need to be a testObjectProvider synchronization here to upload
				// blobs from this summary.
				// We should also look at how this test asserts behavior w.r.t blobs.
				const newSummary = JSON.parse(tree.saveSerializedSummary());
				const expectedSummary = JSON.parse(summaryFileWithHistory_0_1_1);
				expect(newSummary).to.deep.equal(expectedSummary);
			});
		});

		it('gives correct SummaryStatistics', async () => {
			const { tree } = await setUp002Tree({});
			tree.loadSerializedSummary(summaryFileWithHistory_0_0_2);
			const editCount = tree.edits.length;
			const summary = deserialize(summaryFileWithHistory_0_0_2, testSerializer);
			const telemetryInfo = getSummaryStatistics(summary);
			const expectedTelemetryInfo: SummaryStatistics = {
				formatVersion: WriteFormat.v0_0_2,
				historySize: editCount,
			};
			expect(telemetryInfo).to.deep.equals(expectedTelemetryInfo);
		});
	});

	describe('0.1.1 write format', () => {
		const setUp011Tree: typeof setUpLocalServerTestSharedTree = async (options) =>
			setUpLocalServerTestSharedTree({ writeFormat: WriteFormat.v0_1_1, ...options });

		const setUp011SummaryTestTree = async (summarizeHistory: boolean): Promise<SharedTree> =>
			createSummaryTestTree(WriteFormat.v0_1_1, summarizeHistory);

		it('writes 0.1.1 files without history', async () => {
			const tree = await setUp011SummaryTestTree(false);
			const summary: RecursiveMutable<SharedTreeSummary<ChangeInternal>> = JSON.parse(
				tree.saveSerializedSummary()
			);
			const expectedSummary: SharedTreeSummary<ChangeInternal> = JSON.parse(summaryFileNoHistory_0_1_1);
			// The edit ID of the single "no history edit" is generated randomly. Replace it with the baseline edit for the sake of this test.
			expectDefined(summary.editHistory).editIds[0] = expectDefined(expectedSummary.editHistory?.editIds[0]);
			expect(summary).to.deep.equal(expectedSummary);
			expect(await getUploadedEditChunkContents(tree)).to.deep.equal(blobsParsed);
		});

		it('writes 0.1.1 files with history', async () => {
			const tree = await setUp011SummaryTestTree(true);
			expect(JSON.parse(tree.saveSerializedSummary())).to.deep.equal(JSON.parse(summaryFileWithHistory_0_1_1));
			expect(await getUploadedEditChunkContents(tree)).to.deep.equal(blobsParsed);
		});

		describe('reading the same version', () => {
			it('reads 0.1.1 files without history', async () => {
				const { tree } = await setUp011Tree({ blobs });
				tree.loadSerializedSummary(summaryFileNoHistory_0_1_1);
				// Tree should have exactly one edit, as all "no history" summaries do.
				expect(tree.edits.length).to.equal(1);
				// Load a baseline tree's own summary with no history to compare with
				const expectedTree = await setUp011SummaryTestTree(false);
				expectedTree.loadSummary(expectedTree.saveSummary());
				await expectSharedTreesEqual(tree, expectedTree, false);
			});

			it('reads 0.1.1 files with history', async () => {
				const { tree } = await setUp011Tree({ blobs });
				tree.loadSerializedSummary(summaryFileWithHistory_0_1_1);
				const expectedTree = await setUp011SummaryTestTree(false);
				await expectSharedTreesEqual(tree, expectedTree);
			});
		});

		describe('reading previous versions', () => {
			it('reads 0.0.2', async () => {
				const { tree, testObjectProvider } = await setUp011Tree({});
				tree.loadSerializedSummary(summaryFileWithHistory_0_0_2);
				// Synchronize to give a chance for the update op to be sequenced.
				await testObjectProvider.ensureSynchronized();

				const { tree: roundTripped011Tree } = await setUp011Tree({ blobs });
				roundTripped011Tree.loadSerializedSummary(tree.saveSerializedSummary());

				const { tree: original011Tree } = await setUp011Tree({ blobs });
				original011Tree.loadSerializedSummary(summaryFileWithHistory_0_1_1);
				await expectSharedTreesEqual(tree, roundTripped011Tree);
				await expectSharedTreesEqual(tree, original011Tree);
			});

			it('Normalizes a denormalized summary containing nodes with empty traits', async () => {
				const { tree } = await setUp011Tree({});
				tree.loadSerializedSummary(summaryFileEmptyTraits_0_0_2);

				const { tree: expectedTree } = await setUp011Tree({});
				expectedTree.loadSerializedSummary(summaryFileWithHistory_0_1_1);
				expect(getChangeNodeFromView(tree.currentView)).deep.equals(
					getChangeNodeFromView(expectedTree.currentView)
				);
			});
		});

		it('gives correct SummaryStatistics', async () => {
			const { tree } = await setUp011Tree({});
			tree.loadSerializedSummary(summaryFileWithHistory_0_1_1);
			const editCount = tree.edits.length;
			const summary = deserialize(summaryFileWithHistory_0_1_1, testSerializer);
			const telemetryInfo = getSummaryStatistics(summary);
			const totalChunks = Math.ceil(editCount / editsPerChunk);
			const expectedTelemetryInfo: SummaryStatistics = {
				formatVersion: WriteFormat.v0_1_1,
				historySize: editCount,
				totalNumberOfChunks: totalChunks,
				uploadedChunks:
					// If the last chunk is bigger than the number of edits per chunk, it has also been uploaded
					editCount - Math.floor(editCount / editsPerChunk) * editsPerChunk < editsPerChunk &&
					totalChunks !== 0
						? totalChunks - 1
						: totalChunks,
			};
			expect(telemetryInfo).to.deep.equals(expectedTelemetryInfo);
		});
	});
});

export function expectAssert(condition: unknown, message?: string): asserts condition {
	expect(condition, message);
}

async function expectSharedTreesEqual(
	sharedTreeA: SharedTree,
	sharedTreeB: SharedTree,
	compareEditIds = true
): Promise<void> {
	if (
		!areRevisionViewsSemanticallyEqual(sharedTreeA.currentView, sharedTreeA, sharedTreeB.currentView, sharedTreeB)
	) {
		expect.fail('trees have different current views');
	}

	if (sharedTreeA.edits.length !== sharedTreeB.edits.length) {
		expect.fail('trees have different amounts of edits');
	}

	for (let i = 0; i < sharedTreeA.edits.length; i++) {
		const roundTrip = <T>(obj: T): T => JSON.parse(JSON.stringify(obj)) as T;

		const editA = roundTrip(await sharedTreeA.edits.getEditAtIndex(i));
		const editB = roundTrip(await sharedTreeB.edits.getEditAtIndex(i));
		if (compareEditIds) {
			expect(editA).to.deep.equal(editB, `trees have different edits (index ${i})`);
		} else {
			expect(editA.changes).to.deep.equal(editB.changes, `edits have different changes (index ${i})`);
		}
	}
}

function loadSummaryTestFiles(): {
	summaryFileWithHistory_0_0_2: string;
	summaryFileNoHistory_0_0_2: string;
	summaryFileEmptyTraits_0_0_2: string;
	summaryFileWithHistory_0_1_1: string;
	summaryFileNoHistory_0_1_1: string;
	blobsFile: string;
} {
	const summaryFileWithHistory_0_0_2 = fs.readFileSync(join(directory, 'summary-0-0-2.json'), 'utf8');
	const summaryFileNoHistory_0_0_2 = fs.readFileSync(join(directory, 'summary-no-history-0-0-2.json'), 'utf8');
	const summaryFileEmptyTraits_0_0_2 = fs.readFileSync(join(directory, 'summary-empty-traits-0-0-2.json'), 'utf8');
	const summaryFileWithHistory_0_1_1 = fs.readFileSync(join(directory, 'summary-0-1-1.json'), 'utf8');
	const summaryFileNoHistory_0_1_1 = fs.readFileSync(join(directory, 'summary-no-history-0-1-1.json'), 'utf8');
	const blobsFile = fs.readFileSync(join(directory, 'blobs-0-1-1.json'), 'utf8');

	return {
		summaryFileWithHistory_0_0_2,
		summaryFileNoHistory_0_0_2,
		summaryFileEmptyTraits_0_0_2,
		summaryFileWithHistory_0_1_1,
		summaryFileNoHistory_0_1_1,
		blobsFile,
	};
}

async function makeSummaryTestFiles(): Promise<void> {
	try {
		fs.accessSync(directory);
	} catch {
		fs.mkdirSync(directory);
	}

	const treeWithHistory_0_0_2 = await createSummaryTestTree(WriteFormat.v0_0_2, true);
	const treeNoHistory_0_0_2 = await createSummaryTestTree(WriteFormat.v0_0_2, false);
	const treeWithHistory_0_1_1 = await createSummaryTestTree(WriteFormat.v0_1_1, true);
	const treeNoHistory_0_1_1 = await createSummaryTestTree(WriteFormat.v0_1_1, false);

	fs.writeFileSync(join(directory, `summary-0-0-2.json`), treeWithHistory_0_0_2.saveSerializedSummary());
	fs.writeFileSync(join(directory, `summary-no-history-0-0-2.json`), treeNoHistory_0_0_2.saveSerializedSummary());
	fs.writeFileSync(join(directory, `summary-0-1-1.json`), treeWithHistory_0_1_1.saveSerializedSummary());
	fs.writeFileSync(join(directory, `summary-no-history-0-1-1.json`), treeNoHistory_0_1_1.saveSerializedSummary());

	const blobs = await getUploadedEditChunkContents(treeWithHistory_0_1_1);
	assert(blobs.length > 0);
	fs.writeFileSync(join(directory, `blobs-0-1-1.json`), JSON.stringify(blobs));
}

/** Every instance of this class generates the same sequence of v5 UUIDs */
class DeterministicUuidGenerator {
	private static readonly uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';
	public count = 0;
	public getNextUuid<T extends EditId | NodeId>(): T {
		return v5((this.count++).toString(), DeterministicUuidGenerator.uuidNamespace) as unknown as T;
	}
}
