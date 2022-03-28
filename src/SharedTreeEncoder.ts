/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from '@fluidframework/common-utils';
import { assert, fail } from './Common';
import { ChangeCompressor } from './Compression';
import { compressEdit, decompressEdit, makeChangeCompressor } from './ChangeCompression';
import { EditLog } from './EditLog';
import { newEdit, setTraitInternal } from './EditUtilities';
import { DetachedSequenceId, EditId, TraitLabel } from './Identifiers';
import { initialTree } from './InitialTree';
import { NodeIdConverter } from './NodeIdUtilities';
import { getChangeNode_0_0_2FromView } from './SerializationUtilities';
import {
	CompressedChangeInternal,
	CompressedBuildNode,
	ChangeInternal,
	SharedTreeSummary_0_0_2,
	StablePlaceInternal_0_0_2,
	WriteFormat,
	ChangeNode,
	Edit,
	SharedTreeEditOp,
	SharedTreeOpType,
	SharedTreeSummary,
	SharedTreeSummaryBase,
	FluidEditHandle,
	EditWithoutId,
	EditChunkContents,
	EditChunkContents_0_1_1,
	EditLogSummary,
} from './persisted-types';
import { RevisionView } from './RevisionView';
import { StringInterner } from './StringInterner';
import { SummaryContents } from './Summary';
import { TreeCompressor_0_1_1 } from './TreeCompressor';

/**
 * Object capable of converting between the current internal representation for edits and some versioned format used
 * for ops and summaries.
 * @internal
 */
export interface SharedTreeEncoder<TChangeInternal> {
	/**
	 * Encodes an edit op to be sent.
	 * @param edit - edit to encode.
	 * @param fluidSerialize - Callback which serializes fluid handles contained in a JSON-serializable object, returning the result.
	 * Should be invoked on the edit contents at some point before op encoding is complete.
	 * This is because edit contents may have Payloads needing to be serialized.
	 */
	encodeEditOp(
		edit: Edit<TChangeInternal>,
		fluidSerialize: (edit: Edit<unknown>) => Edit<unknown>
	): SharedTreeEditOp<unknown>;

	/**
	 * Decodes an edit op encoded with `encodeEditOp`.
	 * @param op - op to decode.
	 * @param fluidDeserialize - Callback which deserializes fluid handles contained in a JSON-serializable object.
	 * Should be invoked on the semi-serialized edit contents at some point before decoding is complete.
	 * This will rehydrate any serialized fluid handles into usable IFluidHandle objects.
	 */
	decodeEditOp(
		op: SharedTreeEditOp<unknown>,
		fluidDeserialize: (semiSerializedEdit: Edit<unknown>) => Edit<unknown>
	): Edit<TChangeInternal>;

	/**
	 * Encodes a summary.
	 */
	encodeSummary(
		edits: EditLog<TChangeInternal>,
		currentView: RevisionView,
		idConverter: NodeIdConverter
	): SharedTreeSummaryBase;

	/**
	 * Decodes an encoded summary.
	 */
	decodeSummary(summary: SharedTreeSummaryBase): SummaryContents<TChangeInternal>;

	/**
	 * Encodes a chunk of edits.
	 */
	encodeEditChunk(edits: readonly EditWithoutId<TChangeInternal>[]): EditChunkContents;

	/**
	 * Decodes the contents of a FluidEditHandle
	 */
	decodeEditChunk(contents: EditChunkContents): EditWithoutId<TChangeInternal>[];
}

class SharedTreeEncoder_0_1_1 implements SharedTreeEncoder<ChangeInternal> {
	private readonly treeCompressor = new TreeCompressor_0_1_1<never>();
	private readonly changeCompressor: ChangeCompressor<ChangeInternal, CompressedChangeInternal> =
		makeChangeCompressor<CompressedBuildNode>(this.treeCompressor);

	public constructor(
		private readonly noHistoryIdGenerator: NoHistoryIdGenerator,
		private readonly summarizeHistory: boolean
	) {}

	public encodeEditOp(
		edit: Edit<ChangeInternal>,
		fluidSerialize: (edit: Edit<unknown>) => any
	): SharedTreeEditOp<CompressedChangeInternal> {
		const interner = new StringInterner();
		const compressedEdit = compressEdit(this.changeCompressor, interner, edit);

		// IFluidHandles are not allowed in Ops.
		// Ops can contain Fluid's Serializable (for payloads) which allows IFluidHandles.
		// So replace the handles by encoding before sending:
		const semiSerialized = fluidSerialize(compressedEdit);

		return {
			type: SharedTreeOpType.Edit,
			edit: semiSerialized,
			version: WriteFormat.v0_1_1,
			internedStrings: interner.getSerializable(),
		};
	}

	public decodeEditOp(
		op: SharedTreeEditOp<CompressedChangeInternal>,
		fluidDeserialize: (semiSerializedEdit: Edit<unknown>) => Edit<unknown>
	): Edit<ChangeInternal> {
		const { edit: semiSerializedEdit, internedStrings } = op;
		const parsedEdit = fluidDeserialize(semiSerializedEdit) as Edit<CompressedChangeInternal>;
		const interner = new StringInterner(internedStrings);
		return decompressEdit(this.changeCompressor, interner, parsedEdit);
	}

	public encodeSummary(
		edits: EditLog<ChangeInternal>,
		currentView: RevisionView,
		idConverter: NodeIdConverter
	): SharedTreeSummary<CompressedChangeInternal> {
		if (this.summarizeHistory) {
			return this.fullHistorySummarizer(edits, currentView, idConverter);
		} else {
			return this.noHistorySummarizer(edits, currentView, idConverter);
		}
	}

	public decodeSummary(summary: SharedTreeSummaryBase): SummaryContents<ChangeInternal> {
		assert(
			summary.version === WriteFormat.v0_1_1,
			`Invalid summary version to decode: ${summary.version}, expected: 0.1.1`
		);
		const {
			editHistory,
			currentTree: compressedTree,
			internedStrings,
		} = summary as SharedTreeSummary<CompressedChangeInternal>;
		assert(typeof editHistory === 'object', '0.1.1 summary encountered with non-object edit history.');

		const interner = new StringInterner(internedStrings);
		const decompressedTree: ChangeNode | undefined =
			compressedTree !== undefined ? this.treeCompressor.decompress(compressedTree, interner) : undefined;
		const { editChunks, editIds } = editHistory;

		const uncompressedChunks = editChunks.map(({ startRevision, chunk }) => ({
			startRevision,
			chunk: isEditHandle(chunk)
				? {
						get: async () => {
							const baseHandle = chunk;
							const contents: EditChunkContents = JSON.parse(
								IsoBuffer.from(await baseHandle.get()).toString()
							);
							return this.decodeEditChunk(contents);
						},
						baseHandle: chunk,
				  }
				: chunk.map((edit) => decompressEdit(this.changeCompressor, interner, edit)),
		}));
		assert(editChunks !== undefined, 'Missing editChunks on 0.1.1 summary.');
		assert(editIds !== undefined, 'Missing editIds on 0.1.1 summary.');
		return { currentTree: decompressedTree, editHistory: { editIds, editChunks: uncompressedChunks } };
	}

	/**
	 * Does not preserve (persist) history at all.
	 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
	 * Writes summary format 0.1.1 which does not store the currentView for no history summaries.
	 */
	private noHistorySummarizer<TChange>(
		_edits: EditLog<TChange>,
		currentView: RevisionView,
		idConverter: NodeIdConverter
	): SharedTreeSummary<CompressedChangeInternal> {
		const currentTree = getChangeNode_0_0_2FromView(currentView, idConverter);
		const rootId = currentTree.identifier;
		const changes: ChangeInternal[] = [];
		// Generate a set of changes to set the root node's children to that of the root in the currentTree
		Object.entries(currentTree.traits).forEach(([label, children]) => {
			changes.push(...setTraitInternal({ parent: rootId, label: label as TraitLabel }, children));
		});
		assert(currentTree.payload === undefined, 'setValue not yet supported.');
		assert(
			currentTree.identifier === initialTree.identifier && currentTree.definition === initialTree.definition,
			'root definition and identifier should be immutable.'
		);
		const interner = new StringInterner();
		const edit = newEdit(changes);
		const compressedEdit = compressEdit(this.changeCompressor, interner, edit);
		return {
			editHistory: {
				editChunks: [{ startRevision: 0, chunk: [{ changes: compressedEdit.changes }] }],
				editIds: [this.noHistoryIdGenerator(edit)],
			},
			version: WriteFormat.v0_1_1,
			internedStrings: interner.getSerializable(),
		};
	}

	/**
	 * Generates a summary with format version 0.1.1. This will prefer handles over edits in edit chunks where possible,
	 * and string interning and tree compression will be applied.
	 */
	private fullHistorySummarizer(
		edits: EditLog<ChangeInternal>,
		currentView: RevisionView,
		idConverter: NodeIdConverter
	): SharedTreeSummary<CompressedChangeInternal> {
		const interner = new StringInterner();
		const currentTree = this.treeCompressor.compress(
			getChangeNode_0_0_2FromView(currentView, idConverter),
			interner
		);

		return {
			currentTree,
			editHistory: edits.getEditLogSummary(true, { compressor: this.changeCompressor, interner }),
			version: WriteFormat.v0_1_1,
			internedStrings: interner.getSerializable(),
		};
	}

	public encodeEditChunk(edits: readonly EditWithoutId<ChangeInternal>[]): EditChunkContents_0_1_1 {
		const interner = new StringInterner();
		const compressedEdits = edits.map((edit) => compressEdit(this.changeCompressor, interner, edit));
		return {
			version: WriteFormat.v0_1_1,
			edits: compressedEdits,
			internedStrings: interner.getSerializable(),
		};
	}

	public decodeEditChunk(contents: EditChunkContents): EditWithoutId<ChangeInternal>[] {
		assert(
			contents.version === WriteFormat.v0_1_1,
			`Invalid editChunk to decode: ${contents.version}. Expected 0.1.1.`
		);
		const interner = new StringInterner(contents.internedStrings);
		return contents.edits.map((edit) => decompressEdit(this.changeCompressor, interner, edit));
	}
}

function isEditHandle(chunk: FluidEditHandle | readonly EditWithoutId<unknown>[]): chunk is FluidEditHandle {
	return !Array.isArray(chunk);
}

class SharedTreeEncoder_0_0_2 implements SharedTreeEncoder<ChangeInternal> {
	public constructor(
		private readonly noHistoryIdGenerator: NoHistoryIdGenerator,
		private readonly summarizeHistory: boolean
	) {}

	public encodeEditOp(
		edit: Edit<ChangeInternal>,
		fluidSerialize: (edit: Edit<unknown>) => any
	): SharedTreeEditOp<ChangeInternal> {
		// IFluidHandles are not allowed in Ops.
		// Ops can contain Fluid's Serializable (for payloads) which allows IFluidHandles.
		// So replace the handles by encoding before sending:
		const semiSerialized = fluidSerialize(edit);

		return {
			type: SharedTreeOpType.Edit,
			edit: semiSerialized,
			version: WriteFormat.v0_0_2,
		};
	}

	public decodeEditOp(
		op: SharedTreeEditOp<ChangeInternal>,
		fluidDeserialize: (semiSerializedEdit: Edit<unknown>) => Edit<unknown>
	): Edit<ChangeInternal> {
		const { edit: semiSerializedEdit } = op;
		const parsedEdit = fluidDeserialize(semiSerializedEdit);
		return parsedEdit as Edit<ChangeInternal>;
	}

	public encodeSummary(
		edits: EditLog<ChangeInternal>,
		currentView: RevisionView,
		idConverter: NodeIdConverter
	): SharedTreeSummary_0_0_2<ChangeInternal> | SharedTreeSummary<CompressedChangeInternal> {
		if (this.summarizeHistory) {
			return this.fullHistorySummarizer(edits, currentView, idConverter);
		} else {
			return this.noHistorySummarizer(edits, currentView, idConverter, this.noHistoryIdGenerator);
		}
	}

	public decodeSummary(summary: SharedTreeSummaryBase): SummaryContents<ChangeInternal> {
		const { currentTree, sequencedEdits } = summary as SharedTreeSummary_0_0_2<ChangeInternal>;
		assert(sequencedEdits !== undefined, '0.0.2 summary encountered with missing sequencedEdits field.');

		// This saves all of the edits in the summary as part of the first chunk.
		const temporaryLog = new EditLog<ChangeInternal>();
		sequencedEdits.forEach((edit) =>
			temporaryLog.addSequencedEdit(edit, { sequenceNumber: 1, referenceSequenceNumber: 0 })
		);

		return {
			currentTree,
			// This cast is valid because we just constructed this log and gave it only in-session edits.
			editHistory: temporaryLog.getEditLogSummary() as EditLogSummary<ChangeInternal, never>,
		};
	}

	/**
	 * Does not preserve (persist) history at all.
	 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
	 * @param stable - Generates the single edit with a stable edit ID. False by default, used for testing.
	 */
	private noHistorySummarizer<TChange>(
		_edits: EditLog<TChange>,
		currentView: RevisionView,
		idConverter: NodeIdConverter,
		idGenerator: NoHistoryIdGenerator
	): SharedTreeSummary_0_0_2<ChangeInternal> {
		const currentTree = getChangeNode_0_0_2FromView(currentView, idConverter);
		const rootId = currentTree.identifier;
		const changes: ChangeInternal[] = [];
		// Generate a set of changes to set the root node's children to that of the root in the currentTree
		Object.entries(currentTree.traits).forEach(([label, children]) => {
			const id = 0 as DetachedSequenceId;
			changes.push(
				ChangeInternal.build(children, id),
				ChangeInternal.insert(
					id,
					StablePlaceInternal_0_0_2.atStartOf({ parent: rootId, label: label as TraitLabel })
				)
			);
		});
		assert(currentTree.payload === undefined, 'setValue not yet supported.');
		assert(
			currentTree.identifier === initialTree.identifier && currentTree.definition === initialTree.definition,
			'root definition and identifier should be immutable.'
		);
		const edit = newEdit(changes);

		return {
			currentTree,
			sequencedEdits: [
				{
					id: idGenerator(edit),
					changes: edit.changes,
				},
			],
			version: WriteFormat.v0_0_2,
		};
	}
	/**
	 * Preserves the full history in the generated summary.
	 */
	private fullHistorySummarizer(
		edits: EditLog<ChangeInternal>,
		currentView: RevisionView,
		idConverter: NodeIdConverter
	): SharedTreeSummary_0_0_2<ChangeInternal> | SharedTreeSummary<CompressedChangeInternal> {
		const { editChunks, editIds } = edits.getEditLogSummary();

		const sequencedEdits: Edit<ChangeInternal>[] = [];
		let idIndex = 0;
		let includesHandles = false;
		editChunks.forEach(({ chunk }) => {
			if (Array.isArray(chunk)) {
				chunk.forEach(({ changes }) => {
					sequencedEdits.push({
						changes,
						id: editIds[idIndex++] ?? fail('Number of edits should match number of edit IDs.'),
					});
				});
			} else {
				includesHandles = true;
			}
		});

		// If the edit log includes handles without associated edits, we must write a summary version that supports handles.
		if (includesHandles) {
			const encoder = new SharedTreeEncoder_0_1_1(this.noHistoryIdGenerator, this.summarizeHistory);
			return encoder.encodeSummary(edits, currentView, idConverter);
		}

		return {
			currentTree: getChangeNode_0_0_2FromView(currentView, idConverter),
			sequencedEdits,
			version: WriteFormat.v0_0_2,
		};
	}

	public encodeEditChunk(): never {
		fail('encodeEditChunk should not be invoked for 0.0.2.');
	}

	public decodeEditChunk(): never {
		fail('decodeEditChunk should not be invoked for 0.0.2.');
	}
}

const encoders: {
	[version: string]: new (
		noHistoryIdGenerator: NoHistoryIdGenerator,
		summarizeHistory: boolean
	) => SharedTreeEncoder<ChangeInternal>;
} = {
	[WriteFormat.v0_0_2]: SharedTreeEncoder_0_0_2,
	[WriteFormat.v0_1_1]: SharedTreeEncoder_0_1_1,
};

type NoHistoryIdGenerator = (edit: Edit<unknown>) => EditId;

/**
 * @param writeSummaryFormat
 * @param summarizeHistory - whether to include history in the summary.
 * @param noHistoryIdGenerator - Encoding of no-history summaries requires generation of a synthetic edit.
 * By default, the id of the syntehtic edit is generated using the v4 uuid strategy.
 * This argument can be provided to make it more stable, if desired (e.g. in tests).
 * @returns
 */
export function getSharedTreeEncoder(
	writeSummaryFormat: WriteFormat,
	summarizeHistory: boolean,
	noHistoryIdGenerator: NoHistoryIdGenerator = (edit) => edit.id
): SharedTreeEncoder<ChangeInternal> {
	const Encoder =
		encoders[writeSummaryFormat] ?? fail(`Unable to find op interpreter for format: ${writeSummaryFormat}`);
	return new Encoder(noHistoryIdGenerator, summarizeHistory);
}
