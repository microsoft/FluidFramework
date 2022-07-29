/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Misc example schema.
 *
 * Note this is written using the "Example internal schema representation types":
 * this is not intended to show what authoring a schema would look like,
 * but rather just show what data a schema needs to capture.
 */

 import {
    TreeSchema,
    FieldKind,
    ValueSchema,
    TreeSchemaIdentifier,
    NamedTreeSchema,
    emptyField,
    emptyMap,
    emptySet,
} from "../../../schema";
import { brand } from "../../../util";

export const codePoint: NamedTreeSchema = {
    name: brand("Primitive.CodePoint"),
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Number,
};

/**
 * String made of unicode code points, allowing for sequence editing of a string.
 */
export const string: TreeSchema = {
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    localFields: new Map([
        [
            brand("children"),
            { kind: FieldKind.Sequence, types: new Set([codePoint.name]) },
        ],
    ]),
    value: ValueSchema.Nothing,
};
