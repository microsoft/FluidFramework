/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { getFromChangeAtomIdMap, type ChangeAtomIdBTree } from "../changeAtomIdBTree.js";
import type { NodeChangeset, NodeId } from "./modularChangeTypes.js";

export function nodeChangeFromId(
	nodes: ChangeAtomIdBTree<NodeChangeset>,
	id: NodeId,
): NodeChangeset {
	const node = getFromChangeAtomIdMap(nodes, id);
	assert(node !== undefined, 0x9ca /* Unknown node ID */);
	return node;
}
