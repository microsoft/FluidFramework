/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeAtomId, FieldKey } from "../core";
import { brand } from "../util";

/**
 * The tree index records detached field ids and associates them with a change atom ID.
 */
export class TreeIndex {
	private readonly detachedFields = new Map<ChangeAtomId, FieldKey>();

	public constructor(private readonly name: string) {}

	/**
	 * Returns a field key for the given change atom ID and ID. Should be unique for
	 * this index.
	 */
	public getFieldKey(changeAtomId: ChangeAtomId, id: string): FieldKey {
		assert(!this.detachedFields.has(changeAtomId), "Detached field already exists");
		return brand(`${this.name}-${id}`);
	}

	/**
	 * Associates the change atom ID with the field key on this index.
	 */
	public setFieldKey(changeAtomId: ChangeAtomId, fieldKey: FieldKey): void {
		this.detachedFields.set(changeAtomId, fieldKey);
	}
}
