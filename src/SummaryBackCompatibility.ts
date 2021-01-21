import { editsPerChunk } from './EditLog';
import { EditId } from './Identifiers';
import { Edit, EditWithoutId } from './PersistedTypes';
import { ErrorString, SharedTreeSummary } from './Summary';

const readFormatVersion = '0.1.0';

/**
 * @returns SharedTreeSummary that can be used to initialize a SharedTree, or an ErrorString if the summary could not be transpiled.
 * */
export function transpileSummaryToReadFormat(summary: SharedTreeSummary): SharedTreeSummary | ErrorString {
	const { currentTree, version } = summary;

	if (version === readFormatVersion) {
		const { editHistory } = summary;

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
		const { sequencedEdits } = summary;

		if (sequencedEdits !== undefined) {
			const editChunks: EditWithoutId[][] = [];
			const editIds: EditId[] = [];

			sequencedEdits?.map(({ changes, id }) => {
				editIds.push(id);
				const lastEditChunk = editChunks[editChunks.length - 1];
				if (lastEditChunk !== undefined && lastEditChunk.length < editsPerChunk) {
					lastEditChunk.push({ changes });
				} else {
					editChunks.push([{ changes }]);
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
