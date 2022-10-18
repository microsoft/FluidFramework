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

import { emptyField, FieldKinds } from "../../feature-libraries";
import {
    ValueSchema,
    FieldSchema,
    TreeSchemaIdentifier,
    NamedTreeSchema,
    fieldSchema,
    namedTreeSchema,
    SchemaData,
} from "../../schema-stored";
import { EmptyKey } from "../../tree";
import { brand } from "../../util";

const jsonTypeSchema: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();

export const jsonSchemaData: SchemaData = {
    treeSchema: jsonTypeSchema,
    globalFieldSchema: new Map(),
};

const jsonTypes: Set<TreeSchemaIdentifier> = new Set();

const json: NamedTreeSchema[] = [];

export const jsonObject: NamedTreeSchema = namedTreeSchema({
    name: brand("Json.Object"),
    extraLocalFields: emptyField,
});

export const jsonArray: NamedTreeSchema = namedTreeSchema({
    name: brand("Json.Array"),
    extraLocalFields: emptyField,
    localFields: { [EmptyKey]: fieldSchema(FieldKinds.sequence, jsonTypes) },
});

export const jsonNumber: NamedTreeSchema = namedTreeSchema({
    name: brand("Json.Number"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

export const jsonString: NamedTreeSchema = namedTreeSchema({
    name: brand("Json.String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});

export const jsonNull: NamedTreeSchema = namedTreeSchema({
    name: brand("Json.Null"),
    extraLocalFields: emptyField,
    value: ValueSchema.Nothing,
});

export const jsonBoolean: NamedTreeSchema = namedTreeSchema({
    name: brand("Json.Boolean"),
    extraLocalFields: emptyField,
    value: ValueSchema.Boolean,
});

json.push(jsonObject, jsonArray, jsonNumber, jsonString, jsonNull, jsonBoolean);
for (const named of json) {
    jsonTypes.add(named.name);
    jsonTypeSchema.set(named.name, named);
}

export const jsonRoot: FieldSchema = fieldSchema(FieldKinds.value, jsonTypes);
