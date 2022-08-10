/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Example schema for a json domain.
 *
 * Note this is written using the "Example internal schema representation types":
 * this is not intended to show what authoring a schema would look like,
 * but rather just show what data a schema needs to capture.
 */

import {
    FieldKind,
    ValueSchema,
    FieldSchema,
    TreeSchemaIdentifier,
    NamedTreeSchema,
    emptyField,
    emptyMap,
    emptySet,
} from "../../schema-stored";
import { brand } from "../../util";

export const jsonTypeSchema: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();

const jsonTypes: Set<TreeSchemaIdentifier> = new Set();

const json: NamedTreeSchema[] = [];

export const jsonObject: NamedTreeSchema = {
    name: brand("Json.Object"),
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

export const jsonArray: NamedTreeSchema = {
    name: brand("Json.Array"),
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    localFields: new Map([
        [
            brand("items"),
            { kind: FieldKind.Sequence, types: jsonTypes },
        ],
    ]),
    value: ValueSchema.Nothing,
};

export const jsonNumber: NamedTreeSchema = {
    name: brand("Json.Number"),
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Number,
};

export const jsonString: NamedTreeSchema = {
    name: brand("Json.String"),
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.String,
};

export const jsonNull: NamedTreeSchema = {
    name: brand("Json.Null"),
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

export const jsonBoolean: NamedTreeSchema = {
    name: brand("Json.Boolean"),
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Boolean,
};

json.push(jsonObject, jsonArray, jsonNumber, jsonString, jsonNull, jsonBoolean);
for (const named of json) {
    jsonTypes.add(named.name);
    jsonTypeSchema.set(named.name, named);
}

export const jsonRoot: FieldSchema = {
    kind: FieldKind.Value,
    types: jsonTypes,
};
