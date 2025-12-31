/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import type {
	ChangeAtomId,
	ChangesetLocalId,
	RevisionReplacer,
	RevisionTag,
} from "../../core/index.js";
import { brand, brandConst, newTupleBTree, type Mutable } from "../../util/index.js";
import type { ChangeAtomIdBTree } from "./modularChangeTypes.js";

export class DefaultRevisionReplacer implements RevisionReplacer {
	private readonly newRevisionMap: ChangeAtomIdBTree<ChangesetLocalId>;
	private readonly localIds: Set<ChangesetLocalId> = new Set();
	private readonly ignoredRevisions: Set<RevisionTag | undefined> = new Set();
	private maxSeen: ChangesetLocalId = brandConst(-1)();

	public constructor(
		private readonly newRevision: RevisionTag,
		private readonly oldRevisions: Set<RevisionTag | undefined>,
	) {
		// Map to keep track of the replaced (revision tag, old id) to the new id.
		this.newRevisionMap = newTupleBTree();
	}

	public addOldRevision(revision: RevisionTag | undefined): void {
		assert(
			this.ignoredRevisions.has(revision) === false,
			"Added revision was already encountered",
		);
		this.oldRevisions.add(revision);
	}

	public isOldRevision(revision: RevisionTag | undefined): boolean {
		const isOld = this.oldRevisions.has(revision);
		if (!isOld) {
			this.ignoredRevisions.add(revision);
		}
		return isOld;
	}

	public getUpdatedAtomId<T extends ChangeAtomId>(id: T): T {
		if (this.isOldRevision(id.revision)) {
			const updated: Mutable<T> = { ...id, revision: this.newRevision };
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
