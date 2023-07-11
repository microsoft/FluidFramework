/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { FieldKey } from "../core";
import { brand } from "../util";
import { ChangeAtomId } from "./modular-schema";

export class TreeIndex {
    private readonly detachedFields = new Map<ChangeAtomId, FieldKey>();

    public constructor(private readonly name: string) {}

    public getFieldKey(changeAtomId: ChangeAtomId, id: string): FieldKey {
        assert(!this.detachedFields.has(changeAtomId), "Detached field already exists");

        const fieldKey: FieldKey = brand(`${this.name  }-${  id}`);
        this.detachedFields.set(changeAtomId, fieldKey);
        return fieldKey;
    }
}