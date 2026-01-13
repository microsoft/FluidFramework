/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getCodecTreeForSharedTreeFormat } from "../../shared-tree/index.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../snapshots/index.js";
import { FluidClientVersion, jsonableCodecTree } from "../../codec/index.js";

describe("SharedTree Codec Tree", () => {
	useSnapshotDirectory(`codec-tree`);
	for (const clientVersion of Object.keys(FluidClientVersion)) {
		it(`MinVersionForCollab.${clientVersion}`, () => {
			const version = FluidClientVersion[clientVersion as keyof typeof FluidClientVersion];
			const tree = getCodecTreeForSharedTreeFormat(version);
			const jsonable = jsonableCodecTree(tree);
			takeJsonSnapshot(jsonable);
		});
	}
});
