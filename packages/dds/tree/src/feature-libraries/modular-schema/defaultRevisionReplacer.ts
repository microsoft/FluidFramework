/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ChangeAtomId,
	ChangesetLocalId,
	RevisionReplacer,
	RevisionTag,
} from "../../core/index.js";
import { brand, brandConst, newTupleBTree, type Mutable } from "../../util/index.js";
import {
	getFromChangeAtomIdMap,
	setInChangeAtomIdMap,
	type ChangeAtomIdBTree,
} from "../changeAtomIdBTree.js";

export class DefaultRevisionReplacer implements RevisionReplacer {
	/**
	 * Mapping from (obsolete revision tag, original local id) to the updated local id.
	 */
	private readonly updatedLocalIds: ChangeAtomIdBTree<ChangesetLocalId> = newTupleBTree();
	/**
	 * The set of local IDs already used in the scope of the updated revision.
	 */
	private readonly localIds: Set<ChangesetLocalId> = new Set();
	/**
	 * The maximum local ID seen so far in the scope of the updated revision.
	 */
	private maxSeen: ChangesetLocalId = brandConst(-1)();

	public constructor(
		public readonly updatedRevision: RevisionTag,
		private readonly obsoleteRevisions: Set<RevisionTag | undefined>,
	) {}

	public isObsolete(revision: RevisionTag | undefined): boolean {
		return this.obsoleteRevisions.has(revision);
	}

	public getUpdatedAtomId<T extends ChangeAtomId>(id: T): T {
		if (this.isObsolete(id.revision)) {
			const updated: Mutable<T> = { ...id, revision: this.updatedRevision };
			const prior: ChangesetLocalId | undefined = getFromChangeAtomIdMap(
				this.updatedLocalIds,
				id,
			);
			if (prior !== undefined) {
				updated.localId = prior;
			} else {
				let localId: ChangesetLocalId;
				if (this.localIds.has(id.localId)) {
					this.maxSeen = brand(this.maxSeen + 1);
					localId = this.maxSeen;
				} else {
					// This change atom ID uses a local ID that has not yet been used in the scope of the updated revision.
					// We reuse it as is to minimize the number of IDs that need to be updated.
					localId = id.localId;
					this.maxSeen = brand(Math.max(this.maxSeen, localId));
					this.localIds.add(id.localId);
				}
				setInChangeAtomIdMap(this.updatedLocalIds, id, localId);
				updated.localId = localId;
			}
			return updated;
		}
		return id;
	}
}
