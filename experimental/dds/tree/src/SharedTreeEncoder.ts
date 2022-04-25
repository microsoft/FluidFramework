/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IsoBuffer } from '@fluidframework/common-utils';
import { assert, fail } from './Common';
import { EditLog } from './EditLog';
import { convertTreeNodes, newEdit } from './EditUtilities';
import { DetachedSequenceId, FinalNodeId, OpSpaceNodeId, TraitLabel } from './Identifiers';
import { initialTree } from './InitialTree';
import {
	ContextualizedNodeIdNormalizer,
	getNodeIdContext,
	NodeIdContext,
	NodeIdConverter,
	NodeIdGenerator,
	NodeIdNormalizer,
	scopeIdNormalizer,
	sequencedIdNormalizer,
} from './NodeIdUtilities';
import { getChangeNodeFromView, getChangeNode_0_0_2FromView } from './SerializationUtilities';
import {
	CompressedChangeInternal,
	ChangeInternal,
	SharedTreeSummary_0_0_2,
	WriteFormat,
	ChangeNode,
	Edit,
	SharedTreeEditOp,
	SharedTreeOpType,
	SharedTreeSummary,
	EditWithoutId,
	ChangeTypeInternal,
	ChangeInternal_0_0_2,
	SharedTreeEditOp_0_0_2,
	reservedIdCount,
	ChangeNode_0_0_2,
	EditChunkContents,
	EditLogSummary,
	EditChunkContents_0_1_1,
	FluidEditHandle,
	StablePlaceInternal,
	Side,
} from './persisted-types';
import { RevisionView } from './RevisionView';
import { MutableStringInterner, StringInterner } from './StringInterner';
import { SummaryContents } from './Summary';
import { InterningTreeCompressor } from './TreeCompressor';
import {
	createSessionId,
	hasOngoingSession,
	IdCompressor,
	IdCreationRange,
	SerializedIdCompressorWithNoSession,
} from './id-compressor';
import { ChangeCompressor, compressEdit, decompressEdit } from './ChangeCompression';
import { convertEditIds, convertNodeDataIds } from './IdConversion';

/**
 * Object capable of converting between the current internal representation for 0.1.1 edits and their wire format.
 * @internal
 */
export class SharedTreeEncoder_0_1_1 {
	private readonly treeCompressor = new InterningTreeCompressor<never>();
	private readonly changeCompressor = new ChangeCompressor(this.treeCompressor);

	public constructor(private readonly summarizeHistory: boolean) {}

	/**
	 * Encodes an edit op to be sent.
	 * @param edit - edit to encode.
	 * @param fluidSerialize - Callback which serializes Fluid handles contained in a JSON-serializable object, returning the result.
	 * Should be invoked on the edit contents at some point before op encoding is complete.
	 * This is because edit contents may have Payloads needing to be serialized.
	 */
	public encodeEditOp(
		edit: Edit<ChangeInternal>,
		fluidSerialize: (
			edit: Edit<CompressedChangeInternal<OpSpaceNodeId>>
		) => Edit<CompressedChangeInternal<OpSpaceNodeId>>,
		idRange: IdCreationRange,
		idNormalizer: NodeIdNormalizer<OpSpaceNodeId>,
		interner: StringInterner
	): SharedTreeEditOp {
		// IFluidHandles are not allowed in Ops.
		// Ops can contain Fluid's Serializable (for payloads) which allows IFluidHandles.
		// So replace the handles by encoding before sending:
		const semiSerialized = fluidSerialize(
			compressEdit(this.changeCompressor, interner, scopeIdNormalizer(idNormalizer, idRange.sessionId), edit)
		);

		return {
			type: SharedTreeOpType.Edit,
			edit: semiSerialized,
			version: WriteFormat.v0_1_1,
			idRange,
		};
	}

	/**
	 * Decodes an edit op encoded with `encodeEditOp`.
	 * @param op - op to decode.
	 * @param fluidDeserialize - Callback which deserializes Fluid handles contained in a JSON-serializable object.
	 * Should be invoked on the semi-serialized edit contents at some point before decoding is complete.
	 * This will rehydrate any serialized Fluid handles into usable IFluidHandle objects.
	 */
	public decodeEditOp(
		op: SharedTreeEditOp,
		fluidDeserialize: (
			semiSerializedEdit: Edit<CompressedChangeInternal<OpSpaceNodeId>>
		) => Edit<CompressedChangeInternal<OpSpaceNodeId>>,
		idNormalizer: NodeIdNormalizer<OpSpaceNodeId>,
		interner: StringInterner
	): Edit<ChangeInternal> {
		const { edit: semiSerializedEdit } = op;
		const parsedEdit = fluidDeserialize(semiSerializedEdit);
		return decompressEdit(
			this.changeCompressor,
			interner,
			scopeIdNormalizer(idNormalizer, op.idRange.sessionId),
			parsedEdit
		);
	}

	/**
	 * Encodes a summary.
	 */
	public encodeSummary(
		edits: EditLog<ChangeInternal>,
		currentView: RevisionView,
		idContext: NodeIdContext,
		idNormalizer: NodeIdNormalizer<OpSpaceNodeId>,
		interner: StringInterner,
		serializedIdCompressor: SerializedIdCompressorWithNoSession
	): SharedTreeSummary {
		if (this.summarizeHistory) {
			return this.fullHistorySummarizer(edits, currentView, idNormalizer, interner, serializedIdCompressor);
		} else {
			return this.noHistorySummarizer(
				edits,
				currentView,
				idContext,
				idNormalizer,
				interner,
				serializedIdCompressor
			);
		}
	}

	/**
	 * Decodes an encoded summary.
	 */
	public decodeSummary({
		editHistory,
		currentTree: compressedTree,
		internedStrings,
		idCompressor: serializedIdCompressor,
		version,
	}: SharedTreeSummary): SummaryContents {
		assert(version === WriteFormat.v0_1_1, `Invalid summary version to decode: ${version}, expected: 0.1.1`);
		assert(typeof editHistory === 'object', '0.1.1 summary encountered with non-object edit history.');

		const idCompressor = hasOngoingSession(serializedIdCompressor)
			? IdCompressor.deserialize(serializedIdCompressor)
			: IdCompressor.deserialize(serializedIdCompressor, createSessionId()); // TODO attribution

		const interner = new MutableStringInterner(internedStrings);
		const sequencedNormalizer = sequencedIdNormalizer(getNodeIdContext(idCompressor));
		const decompressedTree: ChangeNode | undefined =
			compressedTree !== undefined
				? this.treeCompressor.decompress(compressedTree, interner, sequencedNormalizer)
				: undefined;
		const { editChunks, editIds } = editHistory;
		assert(editChunks !== undefined, 'Missing editChunks on 0.1.1 summary.');
		assert(editIds !== undefined, 'Missing editIds on 0.1.1 summary.');

		const uncompressedChunks = editChunks.map(({ startRevision, chunk }) => ({
			startRevision,
			chunk: isEditHandle(chunk)
				? {
						get: async () => {
							const baseHandle = chunk;
							const contents: EditChunkContents = JSON.parse(
								IsoBuffer.from(await baseHandle.get()).toString()
							);
							// Note: any interned IDs referenced in chunks taken at the time of summarization must be included
							// in the summary. So this interner is sufficient.
							return this.decodeEditChunk(contents, sequencedNormalizer, interner);
						},
						baseHandle: chunk,
				  }
				: chunk.map((edit) => decompressEdit(this.changeCompressor, interner, sequencedNormalizer, edit)),
		}));
		return {
			currentTree: decompressedTree,
			editHistory: { editIds, editChunks: uncompressedChunks },
			idCompressor,
			interner,
		};
	}

	/**
	 * Does not preserve (persist) history at all.
	 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
	 * Writes summary format 0.1.1 which does not store the currentView for no history summaries.
	 */
	private noHistorySummarizer<TChange>(
		_edits: EditLog<TChange>,
		currentView: RevisionView,
		idContext: NodeIdContext,
		idNormalizer: NodeIdNormalizer<OpSpaceNodeId>,
		interner: StringInterner,
		serializedIdCompressor: SerializedIdCompressorWithNoSession
	): SharedTreeSummary {
		const currentTree = getChangeNodeFromView(currentView);
		const initialTreeId = idContext.convertToNodeId(initialTree.identifier);
		const changes: ChangeInternal[] = [];
		// Generate a set of changes to set the root node's children to that of the root in the currentTree
		Object.entries(currentTree.traits).forEach(([label, children]) => {
			const id = 0 as DetachedSequenceId;
			changes.push(
				ChangeInternal.build(children, id),
				ChangeInternal.insert(
					id,
					StablePlaceInternal.atStartOf({ parent: initialTreeId, label: label as TraitLabel })
				)
			);
		});

		if (currentTree.payload !== undefined) {
			changes.push(ChangeInternal.setPayload(initialTreeId, currentTree.payload));
		}

		assert(
			currentTree.identifier === initialTreeId && currentTree.definition === initialTree.definition,
			'root definition and identifier should be immutable.'
		);
		const edit = newEdit(changes);
		const compressedChanges = edit.changes.map((change) =>
			this.changeCompressor.compress(change, interner, sequencedIdNormalizer(idNormalizer))
		);
		return {
			editHistory: {
				editChunks: [{ startRevision: 0, chunk: [{ changes: compressedChanges }] }],
				editIds: [edit.id],
			},
			version: WriteFormat.v0_1_1,
			internedStrings: interner.getSerializable(),
			idCompressor: serializedIdCompressor,
		};
	}

	/**
	 * Generates a summary with format version 0.1.1. This will prefer handles over edits in edit chunks where possible,
	 * and string interning and tree compression will be applied.
	 */
	private fullHistorySummarizer(
		edits: EditLog<ChangeInternal>,
		currentView: RevisionView,
		idNormalizer: NodeIdNormalizer<OpSpaceNodeId>,
		interner: StringInterner,
		serializedIdCompressor: SerializedIdCompressorWithNoSession
	): SharedTreeSummary {
		const sequencedNormalizer = sequencedIdNormalizer(idNormalizer);
		const currentTree = this.treeCompressor.compress(
			getChangeNodeFromView(currentView),
			interner,
			sequencedNormalizer
		);

		return {
			currentTree,
			editHistory: edits.getEditLogSummary((edit) =>
				compressEdit(this.changeCompressor, interner, sequencedNormalizer, edit)
			),
			version: WriteFormat.v0_1_1,
			internedStrings: interner.getSerializable(),
			idCompressor: serializedIdCompressor,
		};
	}

	public encodeEditChunk(
		edits: readonly EditWithoutId<ChangeInternal>[],
		idNormalizer: ContextualizedNodeIdNormalizer<FinalNodeId>,
		interner: StringInterner
	): EditChunkContents_0_1_1 {
		const compressedEdits = edits.map((edit) => compressEdit(this.changeCompressor, interner, idNormalizer, edit));
		return {
			version: WriteFormat.v0_1_1,
			edits: compressedEdits,
		};
	}

	public decodeEditChunk(
		contents: EditChunkContents,
		idNormalizer: ContextualizedNodeIdNormalizer<FinalNodeId>,
		interner: StringInterner
	): EditWithoutId<ChangeInternal>[] {
		assert(
			contents.version === WriteFormat.v0_1_1,
			`Invalid editChunk to decode: ${contents.version}. Expected 0.1.1.`
		);
		return contents.edits.map((edit) => decompressEdit(this.changeCompressor, interner, idNormalizer, edit));
	}
}

/**
 * Object capable of converting between the current internal representation for 0.0.2 edits and their wire format.
 * @internal
 */
export class SharedTreeEncoder_0_0_2 {
	public constructor(private readonly summarizeHistory: boolean) {}

	/**
	 * Encodes an edit op to be sent.
	 * @param edit - edit to encode.
	 * @param fluidSerialize - Callback which serializes Fluid handles contained in a JSON-serializable object, returning the result.
	 * Should be invoked on the edit contents at some point before op encoding is complete.
	 * This is because edit contents may have Payloads needing to be serialized.
	 */
	public encodeEditOp(
		edit: Edit<ChangeInternal>,
		fluidSerialize: (edit: Edit<ChangeInternal_0_0_2>) => Edit<ChangeInternal_0_0_2>,
		idConverter: NodeIdConverter
	): SharedTreeEditOp_0_0_2 {
		// IFluidHandles are not allowed in Ops.
		// Ops can contain Fluid's Serializable (for payloads) which allows IFluidHandles.
		// So replace the handles by encoding before sending:
		const semiSerialized = fluidSerialize(convertEditIds(edit, (id) => idConverter.convertToStableNodeId(id)));

		return {
			type: SharedTreeOpType.Edit,
			edit: semiSerialized,
			version: WriteFormat.v0_0_2,
		};
	}

	/**
	 * Decodes an edit op encoded with `encodeEditOp`.
	 * @param op - op to decode.
	 * @param fluidDeserialize - Callback which deserializes Fluid handles contained in a JSON-serializable object.
	 * Should be invoked on the semi-serialized edit contents at some point before decoding is complete.
	 * This will rehydrate any serialized Fluid handles into usable IFluidHandle objects.
	 */
	public decodeEditOp(
		op: SharedTreeEditOp_0_0_2,
		fluidDeserialize: (semiSerializedEdit: Edit<ChangeInternal_0_0_2>) => Edit<ChangeInternal_0_0_2>,
		idGenerator: NodeIdGenerator
	): Edit<ChangeInternal> {
		const { edit: semiSerializedEdit } = op;
		const parsedEdit = fluidDeserialize(semiSerializedEdit);
		return convertEditIds(parsedEdit, (id) => idGenerator.generateNodeId(id));
	}

	/**
	 * Encodes a summary.
	 */
	public encodeSummary(
		edits: EditLog<ChangeInternal>,
		currentView: RevisionView,
		idConverter: NodeIdConverter
	): SharedTreeSummary_0_0_2 {
		if (this.summarizeHistory) {
			return this.fullHistorySummarizer(edits, currentView, idConverter);
		} else {
			return this.noHistorySummarizer(edits, currentView, idConverter);
		}
	}

	/**
	 * Decodes an encoded summary.
	 */
	public decodeSummary({ currentTree, sequencedEdits }: SharedTreeSummary_0_0_2): SummaryContents {
		assert(sequencedEdits !== undefined, '0.0.2 summary encountered with missing sequencedEdits field.');
		const idCompressor = new IdCompressor(createSessionId(), reservedIdCount);
		const idGenerator = getNodeIdContext(idCompressor);
		const generateId = (id) => idGenerator.generateNodeId(id);

		// This saves all of the edits in the summary as part of the first chunk.
		const temporaryLog = new EditLog<ChangeInternal>();
		sequencedEdits.forEach((edit) =>
			temporaryLog.addSequencedEdit(convertEditIds(edit, generateId), {
				sequenceNumber: 1,
				referenceSequenceNumber: 0,
			})
		);

		return {
			currentTree: convertTreeNodes<ChangeNode_0_0_2, ChangeNode>(currentTree, (node) =>
				convertNodeDataIds(node, generateId)
			),
			idCompressor,
			interner: new MutableStringInterner(),
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
		idConverter: NodeIdConverter
	): SharedTreeSummary_0_0_2 {
		const currentTree = getChangeNode_0_0_2FromView(currentView, idConverter);
		const changes: ChangeInternal_0_0_2[] = [];
		// Generate a set of changes to set the root node's children to that of the root in the currentTree
		Object.entries(currentTree.traits).forEach(([label, children]) => {
			const id = 0 as DetachedSequenceId;
			changes.push(
				{ type: ChangeTypeInternal.Build, source: children, destination: id },
				{
					type: ChangeTypeInternal.Insert,
					source: id,
					destination: {
						side: Side.After,
						referenceTrait: { label: label as TraitLabel, parent: initialTree.identifier },
					},
				}
			);
		});

		if (currentTree.payload !== undefined) {
			changes.push({
				type: ChangeTypeInternal.SetValue,
				nodeToModify: initialTree.identifier,
				payload: currentTree.payload,
			});
		}

		assert(
			currentTree.identifier === initialTree.identifier && currentTree.definition === initialTree.definition,
			'root definition and identifier should be immutable.'
		);
		const edit = newEdit(changes);

		return {
			currentTree,
			sequencedEdits: [
				{
					id: edit.id,
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
	): SharedTreeSummary_0_0_2 {
		const { editChunks, editIds } = edits.getEditLogSummary();

		const sequencedEdits: Edit<ChangeInternal_0_0_2>[] = [];
		let idIndex = 0;
		editChunks.forEach(({ chunk }) => {
			if (isEditHandle(chunk)) {
				fail('Cannot write handles to summary version 0.0.2');
			} else {
				chunk.forEach(({ changes }) => {
					sequencedEdits.push(
						convertEditIds(
							{
								changes,
								id: editIds[idIndex++] ?? fail('Number of edits should match number of edit IDs.'),
							},
							(id) => idConverter.convertToStableNodeId(id)
						)
					);
				});
			}
		});

		return {
			currentTree: getChangeNode_0_0_2FromView(currentView, idConverter),
			sequencedEdits,
			version: WriteFormat.v0_0_2,
		};
	}
}

function isEditHandle(chunk: FluidEditHandle | readonly EditWithoutId<unknown>[]): chunk is FluidEditHandle {
	return !Array.isArray(chunk);
}
