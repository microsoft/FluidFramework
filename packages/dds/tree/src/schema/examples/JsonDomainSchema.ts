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
    TreeSchema,
    FieldKind,
    ValueSchema,
    FieldSchema,
    TreeSchemaIdentifier,
    LocalFieldKey,
    NamedTreeSchema,
} from "../Schema";
import {
    emptyField,
    emptyMap,
    emptySet,
} from "../Builders";

export const typeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();

const jsonTypes: Set<TreeSchemaIdentifier> = new Set();

const json: NamedTreeSchema[] = [];

const jsonObject: NamedTreeSchema = {
    name: "Json.Object" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

const jsonArray: NamedTreeSchema = {
    name: "Json.Array" as TreeSchemaIdentifier,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    localFields: new Map([
        [
            "items" as LocalFieldKey,
            { kind: FieldKind.Sequence, types: jsonTypes },
        ],
    ]),
    value: ValueSchema.Nothing,
};

const jsonNumber: NamedTreeSchema = {
    name: "Json.Number" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Number,
};

const jsonString: NamedTreeSchema = {
    name: "Json.String" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.String,
};

const jsonNull: NamedTreeSchema = {
    name: "Json.Null" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

const jsonBoolean: NamedTreeSchema = {
    name: "Json.Boolean" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Boolean,
};

json.push(jsonObject, jsonArray, jsonNumber, jsonString, jsonNull, jsonBoolean);
for (const named of json) {
    jsonTypes.add(named.name);
    typeSchema.set(named.name, named);
}

export const jsonRoot: FieldSchema = {
    kind: FieldKind.Value,
    types: jsonTypes,
};
