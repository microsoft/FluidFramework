/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../../core/index.js";
import { brand, brandConst, newTupleBTree, type Mutable } from "../../util/index.js";
import type { ChangeAtomIdBTree } from "./modularChangeTypes.js";

export interface RevisionReplacer {
	/**
	 * Predicate to determine if a revision needs replacing.
	 * @param revision - The revision that may need replacing.
	 * @returns true iff the given `revision` needs replacing.
	 */
	isOldRevision(revision: RevisionTag | undefined): boolean;
	/**
	 * Returns the updated ID for the given ID.
	 * @param id - The ID to update.
	 * @returns an updated ID iff the given `id` needs updating, otherwise returns the given `id`.
	 */
	getUpdatedAtomId<T extends ChangeAtomId>(id: T): T;
}

export class DefaultRevisionReplacer implements RevisionReplacer {
	private readonly newRevisionMap: ChangeAtomIdBTree<ChangesetLocalId>;
	private readonly localIds: Set<ChangesetLocalId> = new Set();
	private maxSeen: ChangesetLocalId = brandConst(-1)();

	public constructor(
		private readonly newRevision: RevisionTag | undefined,
		private readonly oldRevisions: Set<RevisionTag | undefined>,
	) {
		// Map to keep track of the replaced (revision tag, old id) to the new id.
		this.newRevisionMap = newTupleBTree();
	}

	public isOldRevision(revision: RevisionTag | undefined): boolean {
		return this.oldRevisions.has(revision);
	}
	public getUpdatedAtomId<T extends ChangeAtomId>(id: T): T {
		if (this.isOldRevision(id.revision)) {
			const updated: Mutable<T> = { ...id, revision: this.newRevision };
			if (updated.revision === undefined) {
				delete updated.revision;
			}
			const prior: ChangesetLocalId | undefined = this.newRevisionMap.get([
				id.revision,
				id.localId,
			]);
			if (prior !== undefined) {
				updated.localId = prior;
			} else {
				let localId: ChangesetLocalId;
				if (this.localIds.has(id.localId)) {
					this.maxSeen = brand(this.maxSeen + 1);
					localId = this.maxSeen;
				} else {
					// This change atom ID uses a local ID that has not yet been used in the new revision.
					// We reuse it as is to minimize the number of IDs that need to be updated.
					localId = id.localId;
					this.maxSeen = brand(Math.max(this.maxSeen, localId));
					this.localIds.add(id.localId);
				}
				this.newRevisionMap.set([id.revision, id.localId], localId);
				updated.localId = localId;
			}
			return updated;
		}
		return id;
	}
}
