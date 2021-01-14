import { ISerializedHandle } from '@fluidframework/core-interfaces';
import { assert } from './Common';
import { editsPerChunk } from './EditLog';
import { EditId } from './Identifiers';
import { Edit } from './PersistedTypes';
import { deserialize, ErrorString, SharedTreeSummary } from './Summary';

const readFormatVersion = '0.1.0';

export function transpileSummaryToReadFormat(summary: string): SharedTreeSummary | ErrorString {
	const parsedSummary = JSON.parse(summary);
	const { version } = parsedSummary;

	if (version === readFormatVersion) {
		return deserialize(summary);
	}

	if (version === '0.0.2') {
		const oldSummary = deserialize(summary);

		if (typeof oldSummary === 'string') {
			return oldSummary;
		}

		const { currentTree, sequencedEdits } = oldSummary;
		const editChunks: (ISerializedHandle | Edit[])[] = [];
		const editIds: EditId[] = [];

		sequencedEdits?.map(({ changes, id }) => {
			editIds.push(id);
			const lastEditChunk = editChunks[editChunks.length - 1];
			assert(Array.isArray(lastEditChunk));
			if (lastEditChunk.length < editsPerChunk) {
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

	return 'Format version is not supported';
}
