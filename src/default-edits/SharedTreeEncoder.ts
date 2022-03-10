/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { StringInterner } from '../StringInterner';
import type { EditCompressor } from '../Compression';
import {
	ChangeNode,
	Edit,
	EditLogSummarizer,
	fullHistorySummarizer,
	fullHistorySummarizer_0_1_1,
	newEdit,
	NodeIdConverter,
	RevisionView,
	SharedTreeEditOp,
	SharedTreeEncoder,
	SharedTreeOpType,
	SharedTreeSummary,
	SharedTreeSummary_0_0_2,
	SharedTreeSummaryBase,
	SharedTreeSummaryWriteFormat,
	SummaryContents,
	TreeCompressor_0_1_1,
} from '../generic';
import { assert, fail } from '../Common';
import { DetachedSequenceId, EditId, TraitLabel } from '../Identifiers';
import { initialTree } from '../InitialTree';
import { getChangeNode_0_0_2FromView } from '../SerializationUtilities';
import { EditLog } from '../EditLog';
import { makeEditCompressor } from './EditCompression';
import {
	CompressedChangeInternal,
	CompressedBuildNode,
	ChangeInternal,
	StablePlaceInternal_0_0_2,
} from './persisted-types';
import { setTraitInternal } from './EditUtilities';

class SharedTreeEncoder_0_1_1 implements SharedTreeEncoder<ChangeInternal> {
	private readonly treeCompressor = new TreeCompressor_0_1_1<never>();
	private readonly editCompressor: EditCompressor<ChangeInternal, Edit<CompressedChangeInternal>> =
		makeEditCompressor<CompressedBuildNode>(this.treeCompressor);

	public constructor(private readonly noHistoryIdGenerator: NoHistoryIdGenerator) {}

	public encodeEditOp(
		edit: Edit<ChangeInternal>,
		fluidSerialize: (edit: Edit<unknown>) => any
	): SharedTreeEditOp<CompressedChangeInternal> {
		const interner = new StringInterner();
		const compressedEdit = this.editCompressor.compress(edit, interner);

		// IFluidHandles are not allowed in Ops.
		// Ops can contain Fluid's Serializable (for payloads) which allows IFluidHandles.
		// So replace the handles by encoding before sending:
		const semiSerialized = fluidSerialize(compressedEdit);

		return {
			type: SharedTreeOpType.Edit,
			edit: semiSerialized,
			version: SharedTreeSummaryWriteFormat.Format_0_1_1,
			internedStrings: interner.getSerializable(),
		};
	}

	public decodeEditOp(
		op: SharedTreeEditOp<CompressedChangeInternal>,
		fluidDeserialize: (semiSerializedEdit: Edit<unknown>) => Edit<unknown>
	): Edit<ChangeInternal> {
		const { edit: semiSerializedEdit, internedStrings } = op;
		const parsedEdit = fluidDeserialize(semiSerializedEdit);
		const stringInterner = new StringInterner(internedStrings);
		return this.editCompressor.decompress(parsedEdit as Edit<CompressedChangeInternal>, stringInterner);
	}

	public encodeSummary(
		summarizeLog: EditLogSummarizer,
		currentView: RevisionView,
		idConverter: NodeIdConverter,
		summarizeHistory: boolean
	): SharedTreeSummaryBase {
		if (summarizeHistory) {
			return fullHistorySummarizer_0_1_1(summarizeLog, currentView, idConverter);
		} else {
			return noHistorySummarizer_0_1_1(summarizeLog, currentView, idConverter, this.noHistoryIdGenerator);
		}
	}

	public decodeSummary(summary: SharedTreeSummaryBase): SummaryContents<ChangeInternal> {
		assert(
			summary.version === SharedTreeSummaryWriteFormat.Format_0_1_1,
			`Invalid summary version to decode: ${summary.version}, expected: 0.1.1`
		);
		const {
			editHistory,
			currentTree: compressedTree,
			internedStrings,
		} = summary as SharedTreeSummary<ChangeInternal>;
		assert(typeof editHistory === 'object', '0.1.1 summary encountered with non-object edit history.');

		const stringInterner = new StringInterner(internedStrings);
		const decompressedTree: ChangeNode | undefined =
			compressedTree !== undefined ? this.treeCompressor.decompress(compressedTree, stringInterner) : undefined;
		const { editChunks, editIds } = editHistory;

		assert(editChunks !== undefined, 'Missing editChunks on 0.1.1 summary.');
		assert(editIds !== undefined, 'Missing editIds on 0.1.1 summary.');
		return { currentTree: decompressedTree, editHistory };
	}
}

class SharedTreeEncoder_0_0_2 implements SharedTreeEncoder<ChangeInternal> {
	public constructor(private readonly noHistoryIdGenerator: NoHistoryIdGenerator) {}

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
			version: SharedTreeSummaryWriteFormat.Format_0_0_2,
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
		summarizeLog: EditLogSummarizer,
		currentView: RevisionView,
		idConverter: NodeIdConverter,
		summarizeHistory: boolean
	): SharedTreeSummaryBase {
		if (summarizeHistory) {
			return fullHistorySummarizer(summarizeLog, currentView, idConverter);
		} else {
			return noHistorySummarizer(summarizeLog, currentView, idConverter, this.noHistoryIdGenerator);
		}
	}

	public decodeSummary(summary: SharedTreeSummaryBase): SummaryContents<ChangeInternal> {
		const { currentTree, sequencedEdits } = summary as SharedTreeSummary_0_0_2<ChangeInternal>;
		assert(sequencedEdits !== undefined, '0.0.2 summary encountered with missing sequencedEdits field.');

		/**
		 * The number of edits that can safely fit in a blob upload.
		 */
		const maxChunkSize = 1000;

		// This saves all of the edits in the summary as part of the first chunk.
		const temporaryLog = new EditLog<ChangeInternal>(undefined, undefined, undefined, maxChunkSize);
		sequencedEdits.forEach((edit) =>
			temporaryLog.addSequencedEdit(edit, { sequenceNumber: 1, referenceSequenceNumber: 0 })
		);

		return {
			currentTree,
			editHistory: temporaryLog.getEditLogSummary(),
		};
	}
}

const encoders: {
	[version: string]: new (noHistoryIdGenerator: NoHistoryIdGenerator) => SharedTreeEncoder<ChangeInternal>;
} = {
	[SharedTreeSummaryWriteFormat.Format_0_0_2]: SharedTreeEncoder_0_0_2,
	[SharedTreeSummaryWriteFormat.Format_0_1_1]: SharedTreeEncoder_0_1_1,
};

type NoHistoryIdGenerator = (edit: Edit<unknown>) => EditId;

/**
 * @param writeSummaryFormat
 * @param noHistoryIdGenerator - Encoding of no-history summaries requires generation of a synthetic edit.
 * By default, the id of the syntehtic edit is generated using the v4 uuid strategy.
 * This argument can be provided to make it more stable, if desired (e.g. in tests).
 * @returns
 */
export function getSharedTreeEncoder(
	writeSummaryFormat: SharedTreeSummaryWriteFormat,
	noHistoryIdGenerator: NoHistoryIdGenerator = (edit) => edit.id
): SharedTreeEncoder<ChangeInternal> {
	const Encoder =
		encoders[writeSummaryFormat] ?? fail(`Unable to find op interpreter for format: ${writeSummaryFormat}`);
	return new Encoder(noHistoryIdGenerator);
}

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
 * @param stable - Generates the single edit with a stable edit ID. False by default, used for testing.
 */
function noHistorySummarizer(
	_summarizeLog: EditLogSummarizer,
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
		version: SharedTreeSummaryWriteFormat.Format_0_0_2,
	};
}

/**
 * Does not preserve (persist) history at all.
 * Instead, the history returned in the summary will contain a single edit that creates a revision identical to the supplied view.
 * Writes summary format 0.1.1 which does not store the currentView for no history summaries.
 */
function noHistorySummarizer_0_1_1(
	_summarizeLog: EditLogSummarizer,
	currentView: RevisionView,
	idConverter: NodeIdConverter,
	idGenerator: NoHistoryIdGenerator
): SharedTreeSummary<ChangeInternal> {
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
	const edit = newEdit(changes);

	return {
		editHistory: {
			editChunks: [{ startRevision: 0, chunk: [{ changes: edit.changes }] }],
			editIds: [idGenerator(edit)],
		},
		version: SharedTreeSummaryWriteFormat.Format_0_1_1,
	};
}
