/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeChangePruner } from "../modular-schema/index.js";
import { MarkListFactory } from "./markListFactory.js";
import type { Changeset } from "./types.js";
import { withNodeChange } from "./utils.js";

export function prune(changeset: Changeset, pruneNode: NodeChangePruner): Changeset {
	const pruned = new MarkListFactory();
	for (let mark of changeset) {
		if (mark.changes !== undefined) {
			mark = withNodeChange(mark, pruneNode(mark.changes));
		}
		pruned.push(mark);
	}
	return pruned.list;
}
