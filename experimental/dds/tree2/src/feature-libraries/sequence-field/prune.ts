/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Changeset } from "./types";
import { MarkListFactory } from "./markListFactory";
import { omitMarkEffect, withNodeChange } from "./utils";

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
		if (mark.type === "Placeholder") {
			mark = omitMarkEffect(mark);
		}
		pruned.push(mark);
	}
	return pruned.list;
}
