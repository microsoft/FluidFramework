import { editsPerChunk } from './EditLog';
import { EditId } from './Identifiers';
import { Edit, EditWithoutId } from './PersistedTypes';
import { ErrorString, SharedTreeSummary, SharedTreeSummaryBase } from './Summary';

/** The summary format version that is read by SharedTree. */
export const readFormatVersion = '0.1.0';

/**
 * Legacy summary format currently still used for writing.
 * TODO:#49901: Remove export when this format is no longer written.
 */
export interface SharedTreeSummary_0_0_2 extends SharedTreeSummaryBase {
	/**
	 * A list of edits.
	 */
	readonly sequencedEdits: readonly Edit[];
}

/**
 * Deserializes a JSON object produced by `serialize()` and uses it to initialize the tree with the encoded state.
 * @returns A SharedTree summary or an ErrorString if the summary could not be interpreted.
 * */
export function deserialize(jsonSummary: string): SharedTreeSummaryBase | ErrorString {
	let summary: Partial<SharedTreeSummaryBase>;
	try {
		summary = JSON.parse(jsonSummary);
	} catch {
		return 'Json syntax error in Summary';
	}

	if (typeof summary !== 'object') {
		return 'Summary is not an object';
	}

	const { version, currentTree } = summary;

	if (version !== undefined && currentTree !== undefined) {
		return { version, currentTree, ...summary };
	}

	return 'Missing fields on summary';
}

/**
 * @returns SharedTreeSummary that can be used to initialize a SharedTree, or an ErrorString if the summary could not be converted.
 *
 */
export function convertSummaryToReadFormat(summary: SharedTreeSummaryBase): SharedTreeSummary | ErrorString {
	const { currentTree, version } = summary;

	if (version === readFormatVersion) {
		const { editHistory } = summary as SharedTreeSummary;

		if (editHistory !== undefined) {
			if (typeof editHistory !== 'object') {
				return 'Edit history is not an object';
			}

			const { editChunks, editIds } = editHistory;

			// TODO:#45414: Add more robust validation of the summary's fields. Even if they are present, they may be malformed.
			if (editChunks !== undefined && editIds !== undefined) {
				return { currentTree, editHistory, version };
			}
		}
	} else if (version === '0.0.2') {
		const { sequencedEdits } = summary as SharedTreeSummary_0_0_2;

		if (sequencedEdits !== undefined) {
			const editChunks: { key: number; chunk: EditWithoutId[] }[] = [];
			const editIds: EditId[] = [];

			let key = 0;
			sequencedEdits.forEach(({ changes, id }) => {
				editIds.push(id);
				const lastEditChunk = editChunks[editChunks.length - 1];
				if (lastEditChunk !== undefined && lastEditChunk.chunk.length < editsPerChunk) {
					lastEditChunk.chunk.push({ changes });
				} else {
					editChunks.push({ key, chunk: [{ changes }] });
					key = key + editsPerChunk;
				}
			});

			return {
				currentTree,
				editHistory: {
					editChunks,
					editIds,
				},
				version: readFormatVersion,
			};
		}
	} else {
		return 'Format version is not supported';
	}

	return 'Missing fields on summary';
}
