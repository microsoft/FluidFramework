/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeChunk } from "../chunked-forest/index.js";

export function makeDummyChunk(chunk: TreeChunk): TreeChunk {
	return {
		topLevelLength: chunk.topLevelLength,
		cursor: throws,
		referenceAdded: throws,
		referenceRemoved: throws,
		isShared: throws,
	};
}

const throws = (): never => {
	throw new Error("Unexpected call inside dummy chunk");
};
