/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ChangeAtomId, FieldKey } from "../core";
import { brand } from "../util";

export class TreeIndex {
	private readonly detachedFields = new Map<ChangeAtomId, FieldKey>();

	public constructor(private readonly name: string) {}

	public getFieldKey(changeAtomId: ChangeAtomId, id: string): FieldKey {
		assert(!this.detachedFields.has(changeAtomId), "Detached field already exists");
		return brand(`${this.name}-${id}`);
	}

	public setFieldKey(changeAtomId: ChangeAtomId, fieldKey: FieldKey): void {
		assert(!this.detachedFields.has(changeAtomId), "Detached field already exists");
		this.detachedFields.set(changeAtomId, fieldKey);
	}
}
