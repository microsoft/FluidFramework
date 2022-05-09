/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as fs from 'fs';
import { join } from 'path';
import { IsoBuffer } from '@fluidframework/common-utils';
import { expect } from 'chai';
import { v5 } from 'uuid';
import { Change, StablePlace, StableRange } from '../ChangeTypes';
import { assert, RecursiveMutable } from '../Common';
import { areRevisionViewsSemanticallyEqual } from '../EditUtilities';
import { EditId, NodeId, SessionId, StableId, TraitLabel } from '../Identifiers';
import { initialTree } from '../InitialTree';
import {
	editsPerChunk,
	reservedIdCount,
	SharedTreeSummary,
	SharedTreeSummary_0_0_2,
	WriteFormat,
} from '../persisted-types';
import { getChangeNodeFromView } from '../SerializationUtilities';
import { SharedTree } from '../SharedTree';
import { deserialize, getSummaryStatistics, SummaryStatistics } from '../SummaryBackCompatibility';
import { getUploadedEditChunkContents, UploadedEditChunkContents } from '../SummaryTestUtilities';
import { IdCompressor } from '../id-compressor';
import { convertEditIds } from '../IdConversion';
import { MutableStringInterner } from '../StringInterner';
import { sequencedIdNormalizer } from '../NodeIdUtilities';
import { expectDefined } from './utilities/TestCommon';
import { TestFluidSerializer } from './utilities/TestSerializer';
import {
	getEditLogInternal,
	getIdNormalizerFromSharedTree,
	makeNodeIdContext,
	setUpLocalServerTestSharedTree,
	testDocumentsPathBase,
} from './utilities/TestUtilities';

const directory = join(testDocumentsPathBase, 'summary-tests');

/** Applies a smattering of interesting edits to the given shared tree in an attempt to cover a variety of use cases  */
export function applyTestEdits(sharedTree: SharedTree): void {
	const uuid = new DeterministicIdGenerator(sharedTree.getWriteFormat(), sharedTree);

	function applyEdit(changes: Change[]): void {
		const internalChanges = changes.map((c) => sharedTree.internalizeChange(c));
		sharedTree.applyEditInternal({ id: uuid.getNextEditId(), changes: internalChanges });
	}

	/*
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

	const cDetachedId = 0;
	const rootDetachedId = 1;
	const aId = uuid.getNextNodeId();
	const cId = uuid.getNextNodeId();
	const dId = uuid.getNextNodeId();

	applyEdit([
		Change.build(
			[
				{
					definition: 'C',
					identifier: cId,
					traits: {
						leaf: [
							{
								definition: 'E',
								identifier: uuid.getNextNodeId(),
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
					definition: 'Root',
					identifier: uuid.getNextNodeId(),
					traits: {
						left: [{ definition: 'A', identifier: aId }],
						right: [
							{ definition: 'B', identifier: uuid.getNextNodeId() },
							cDetachedId,
							{ definition: 'D', identifier: dId },
						],
					},
				},
			],
			rootDetachedId
		),
		Change.insert(
			rootDetachedId,
			StablePlace.atStartOf({
				label: 'root' as TraitLabel,
				parent: sharedTree.convertToNodeId(initialTree.identifier),
			})
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

	applyEdit([...Change.move(StableRange.only(cId), StablePlace.after(aId))]);
	applyEdit([Change.delete(StableRange.only(dId))]);
	for (let i = 0; i < 100; i++) {
		applyEdit([Change.setPayload(aId, i)]);
	}
}

export async function createSummaryTestTree(writeFormat: WriteFormat, summarizeHistory: boolean): Promise<SharedTree> {
	const { tree, testObjectProvider } = await setUpLocalServerTestSharedTree({
		writeFormat,
		summarizeHistory,
		uploadEditChunks: summarizeHistory,
	});

	if (writeFormat === WriteFormat.v0_1_1) {
		const idCompressor = new IdCompressor('968bee41-bcf7-46d2-8035-6eb163b76c4c' as SessionId, reservedIdCount);
		const interner = new MutableStringInterner([initialTree.definition]);
		const context = makeNodeIdContext(idCompressor);
		const normalizer = sequencedIdNormalizer(context);
		const sharedTreeSummaryWithConstantSessionId: SharedTreeSummary = {
			version: WriteFormat.v0_1_1,
			currentTree: summarizeHistory
				? [
						interner.getOrCreateInternedId(initialTree.definition),
						normalizer.normalizeToOpSpace(context.convertToNodeId(initialTree.identifier)),
				  ]
				: undefined,
			editHistory: {
				editIds: [],
				editChunks: [],
			},
			idCompressor: idCompressor.serialize(true),
			internedStrings: interner.getSerializable(),
		};

		tree.loadSummary(sharedTreeSummaryWithConstantSessionId);
	}

	applyTestEdits(tree);

	await testObjectProvider.ensureSynchronized();
	return tree;
}

export function runSummaryTests(title: string): void {
	describe(title, () => {
		// Note: this test serializer doesn't handle blobs properly (it just uses JSON.stringify/JSON.parse).
		const testSerializer = new TestFluidSerializer();

		const {
			summaryFileWithHistory_0_0_2,
			summaryFileNoHistory_0_0_2,
			summaryFileEmptyTraits_0_0_2,
			summaryFileWithHistory_0_1_1,
			summaryFileNoHistory_0_1_1,
			summaryFileUpgrade_0_1_1,
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
				const summary: RecursiveMutable<SharedTreeSummary_0_0_2> = JSON.parse(tree.saveSerializedSummary());
				const expectedSummary: SharedTreeSummary_0_0_2 = JSON.parse(summaryFileNoHistory_0_0_2);
				// The edit ID of the single "no history edit" is generated randomly. Replace it with the baseline edit for the sake of this test.
				summary.sequencedEdits[0].id = expectedSummary.sequencedEdits[0].id;
				expect(summary).to.deep.equal(expectedSummary);
			});

			it('writes 0.0.2 files with history', async () => {
				const tree = await setUp002SummaryTestTree(true);
				expect(JSON.parse(tree.saveSerializedSummary())).to.deep.equal(
					JSON.parse(summaryFileWithHistory_0_0_2)
				);
			});

			describe('reading the same version', () => {
				it('reads 0.0.2 files without history', async () => {
					const { tree } = await setUp002Tree({});
					tree.loadSerializedSummary(summaryFileNoHistory_0_0_2);
					// Tree should have exactly one edit, as all "no history" summaries do.
					expect(tree.edits.length).to.equal(1);
					// Load a baseline tree's own summary with no history to compare with
					const summaryNoHistory = (await setUp002SummaryTestTree(false)).saveSummary();
					const { tree: expectedTree } = await setUp002Tree({ summarizeHistory: false });
					expectedTree.loadSummary(summaryNoHistory);
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
				const summary: RecursiveMutable<SharedTreeSummary> = JSON.parse(tree.saveSerializedSummary());
				const expectedSummary: SharedTreeSummary = JSON.parse(summaryFileNoHistory_0_1_1);
				// The edit ID of the single "no history edit" is generated randomly. Replace it with the baseline edit for the sake of this test.
				expectDefined(summary.editHistory).editIds[0] = expectDefined(expectedSummary.editHistory?.editIds[0]);
				expect(summary).to.deep.equal(expectedSummary);
				expect(await getUploadedEditChunkContents(tree)).to.deep.equal([]);
			});

			it('writes 0.1.1 files with history', async () => {
				const tree = await setUp011SummaryTestTree(true);
				expect(JSON.parse(tree.saveSerializedSummary())).to.deep.equal(
					JSON.parse(summaryFileWithHistory_0_1_1)
				);
				expect(await getUploadedEditChunkContents(tree)).to.deep.equal(blobsParsed);
			});

			describe('reading the same version', () => {
				it('reads 0.1.1 files without history', async () => {
					const { tree } = await setUp011Tree({ blobs });
					tree.loadSerializedSummary(summaryFileNoHistory_0_1_1);
					// Tree should have exactly one edit, as all "no history" summaries do.
					expect(tree.edits.length).to.equal(1);
					// Load a baseline tree's own summary with no history to compare with
					const summaryNoHistory = (await setUp011SummaryTestTree(false)).saveSummary();
					const { tree: expectedTree } = await setUp011Tree({ summarizeHistory: false });
					expectedTree.loadSummary(summaryNoHistory);
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
					const expectedTree = await setUp011SummaryTestTree(true);
					const { tree } = await setUp011Tree({});
					tree.loadSerializedSummary(summaryFileWithHistory_0_0_2);
					await expectSharedTreesEqual(tree, expectedTree);
					expect(JSON.parse(tree.saveSerializedSummary())).to.deep.equal(
						JSON.parse(summaryFileWithHistory_0_0_2)
					);
				});

				it('upgrades 0.0.2', async () => {
					const { tree, testObjectProvider } = await setUp011Tree({});
					tree.loadSerializedSummary(summaryFileWithHistory_0_0_2);
					// Synchronize to give a chance for the update op to be sequenced.
					await testObjectProvider.ensureSynchronized();
					const expectedTree = await setUp011SummaryTestTree(true);
					await expectSharedTreesEqual(tree, expectedTree);
					expect(JSON.parse(tree.saveSerializedSummary())).to.deep.equal(
						JSON.parse(summaryFileUpgrade_0_1_1)
					);
				});

				it('upgrades 0.0.2 that has several stale ops that it resubmits', async () => {
					const { tree: resubmitTree, testObjectProvider } = await setUpLocalServerTestSharedTree({
						writeFormat: WriteFormat.v0_0_2,
					});
					applyTestEdits(resubmitTree);
					const { tree: tree } = await setUpLocalServerTestSharedTree({
						writeFormat: WriteFormat.v0_1_1,
						testObjectProvider,
					});
					await testObjectProvider.ensureSynchronized();
					await expectSharedTreesEqual(resubmitTree, tree);
					await expectSharedTreesEqual(tree, await createSummaryTestTree(WriteFormat.v0_1_1, true));
				});

				it('Normalizes a denormalized summary containing nodes with empty traits', async () => {
					const { tree } = await setUp011Tree({});
					tree.loadSerializedSummary(summaryFileEmptyTraits_0_0_2);

					const { tree: expectedTree } = await setUp011Tree({});
					expectedTree.loadSerializedSummary(summaryFileWithHistory_0_0_2);
					expect(
						areRevisionViewsSemanticallyEqual(
							tree.currentView,
							tree,
							expectedTree.currentView,
							expectedTree
						)
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
}

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

		const editA = roundTrip(
			convertEditIds(await getEditLogInternal(sharedTreeA).getEditAtIndex(i), (id) =>
				sharedTreeA.convertToStableNodeId(id)
			)
		);
		const editB = roundTrip(
			convertEditIds(await getEditLogInternal(sharedTreeB).getEditAtIndex(i), (id) =>
				sharedTreeB.convertToStableNodeId(id)
			)
		);
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
	summaryFileUpgrade_0_1_1: string;
	blobsFile: string;
} {
	const summaryFileWithHistory_0_0_2 = fs.readFileSync(join(directory, 'summary-0-0-2.json'), 'utf8');
	const summaryFileNoHistory_0_0_2 = fs.readFileSync(join(directory, 'summary-no-history-0-0-2.json'), 'utf8');
	const summaryFileEmptyTraits_0_0_2 = fs.readFileSync(join(directory, 'summary-empty-traits-0-0-2.json'), 'utf8');
	const summaryFileWithHistory_0_1_1 = fs.readFileSync(join(directory, 'summary-0-1-1.json'), 'utf8');
	const summaryFileNoHistory_0_1_1 = fs.readFileSync(join(directory, 'summary-no-history-0-1-1.json'), 'utf8');
	const summaryFileUpgrade_0_1_1 = fs.readFileSync(join(directory, 'summary-upgrade-0-1-1.json'), 'utf8');
	const blobsFile = fs.readFileSync(join(directory, 'blobs-0-1-1.json'), 'utf8');

	return {
		summaryFileWithHistory_0_0_2,
		summaryFileNoHistory_0_0_2,
		summaryFileEmptyTraits_0_0_2,
		summaryFileWithHistory_0_1_1,
		summaryFileNoHistory_0_1_1,
		summaryFileUpgrade_0_1_1,
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

	const { tree: upgradedTree, testObjectProvider } = await setUpLocalServerTestSharedTree({
		writeFormat: WriteFormat.v0_1_1,
		summarizeHistory: true,
	});
	upgradedTree.loadSummary(treeWithHistory_0_0_2.saveSummary());
	await testObjectProvider.ensureSynchronized();
	fs.writeFileSync(join(directory, `summary-upgrade-0-1-1.json`), upgradedTree.saveSerializedSummary());
}

/** Every instance of this class generates the same sequence of v5 UUIDs */
class DeterministicIdGenerator {
	public static readonly sessionId = '968bee41-bcf7-46d2-8035-6eb163b76c4c' as SessionId;
	private static readonly uuidNamespace = '44864298-500e-4cf8-9f44-a249e5b3a286';
	private editIdCount = 0;
	private readonly constantIdCompressor?: IdCompressor;

	public constructor(public readonly writeFormat: WriteFormat, private readonly sharedTree: SharedTree) {
		if (this.writeFormat === WriteFormat.v0_1_1) {
			assert(getIdNormalizerFromSharedTree(sharedTree).localSessionId === DeterministicIdGenerator.sessionId);
		} else {
			assert(getIdNormalizerFromSharedTree(sharedTree).localSessionId !== DeterministicIdGenerator.sessionId);
			this.constantIdCompressor = new IdCompressor(DeterministicIdGenerator.sessionId, reservedIdCount);
		}
	}

	public getNextEditId(): EditId {
		return v5((this.editIdCount++).toString(), DeterministicIdGenerator.uuidNamespace) as EditId;
	}

	public getNextNodeId(): NodeId {
		if (this.writeFormat === WriteFormat.v0_0_2) {
			return this.sharedTree.generateNodeId(this.getNextStableId());
		} else {
			return this.sharedTree.generateNodeId();
		}
	}

	private getNextStableId(): StableId {
		assert(this.constantIdCompressor !== undefined);
		return this.constantIdCompressor.decompress(this.constantIdCompressor.generateCompressedId()) as StableId;
	}
}
