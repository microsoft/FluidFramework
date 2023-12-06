/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Changeset } from "./types";
import { MarkListFactory } from "./markListFactory";
import { withNodeChange } from "./utils";

export type NodeChangePruner<TNodeChange> = (change: TNodeChange) => TNodeChange | undefined;

export function prune<TNodeChange>(
	changeset: Changeset<TNodeChange>,
	pruneNode: NodeChangePruner<TNodeChange>,
): Changeset<TNodeChange> {
	const pruned = new MarkListFactory<TNodeChange>();
	for (const mark of changeset) {
		if (mark.changes !== undefined) {
			pruned.push(withNodeChange(mark, pruneNode(mark.changes)));
		} else {
			pruned.push(mark);
		}
	}
	return pruned.list;
}
