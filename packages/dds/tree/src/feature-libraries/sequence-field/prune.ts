/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MarkListFactory } from "./markListFactory.js";
import { Changeset } from "./types.js";
import { withNodeChange } from "./utils.js";

export type NodeChangePruner<TNodeChange> = (change: TNodeChange) => TNodeChange | undefined;

export function prune<TNodeChange>(
	changeset: Changeset<TNodeChange>,
	pruneNode: NodeChangePruner<TNodeChange>,
): Changeset<TNodeChange> {
	const pruned = new MarkListFactory<TNodeChange>();
	for (let mark of changeset) {
		if (mark.changes !== undefined) {
			mark = withNodeChange(mark, pruneNode(mark.changes));
		}
		pruned.push(mark);
	}
	return pruned.list;
}
