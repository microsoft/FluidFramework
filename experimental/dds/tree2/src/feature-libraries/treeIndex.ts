/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangeAtomId, ChangesetLocalId, FieldKey, RevisionTag } from "../core";
import { SizedNestedMap, brand } from "../util";

/**
 * The tree index records detached field ids and associates them with a change atom ID.
 */
export class TreeIndex {
	private readonly detachedFields = new SizedNestedMap<
		RevisionTag | undefined,
		ChangesetLocalId,
		FieldKey
	>();

	public constructor(private readonly name: string) {}

	/**
	 * Returns a field key for the given ID. Should be unique for this index.
	 * This does not save the field key on the index. To do so, call {@link setFieldKey}.
	 */
	public getFieldKey(id: string): FieldKey {
		return brand(`${this.name}-${id}`);
	}

	/**
	 * Associates the change atom ID with the field key on this index.
	 */
	public setFieldKey(changeAtomId: ChangeAtomId, fieldKey: FieldKey): void {
		const { revision, localId } = changeAtomId;
		this.detachedFields.set(revision, localId, fieldKey);
	}
}
