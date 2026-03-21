/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FluidClientVersion, jsonableCodecTree } from "../../codec/index.js";
// eslint-disable-next-line import-x/no-internal-modules
import { getCodecTreeForSharedTreeFormat } from "../../shared-tree/sharedTree.js";
import { takeJsonSnapshot, useSnapshotDirectory } from "../snapshots/index.js";

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
