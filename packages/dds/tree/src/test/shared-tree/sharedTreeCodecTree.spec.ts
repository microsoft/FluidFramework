/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	SharedTreeFormatVersion,
	getCodecTreeForSharedTreeFormat,
} from "../../shared-tree/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../snapshots/index.js";
import { jsonableCodecTree } from "../../codec/index.js";

describe("SharedTree Codec Tree", () => {
	useSnapshotDirectory(`codec-tree`);
	for (const formatVersionKey of Object.keys(SharedTreeFormatVersion)) {
		it(`SharedTreeFormatVersion.${formatVersionKey}`, () => {
			const version =
				SharedTreeFormatVersion[formatVersionKey as keyof typeof SharedTreeFormatVersion];
			const tree = getCodecTreeForSharedTreeFormat(version);
			const jsonable = jsonableCodecTree(tree);
			takeJsonSnapshot(jsonable);
		});
	}
});
