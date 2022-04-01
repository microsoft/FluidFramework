/**
 * Example schema for a json domain.
 *
 * Note this is written using the "Example internal schema representation types":
 * this is not intended to show what authoring a schema would look like, but rather just show what data a schema needs to capture.
 */

import {
    TreeSchema,
    Multiplicity,
    ValueSchema,
    FieldSchema,
    TreeSchemaIdentifier,
    emptyField,
    LocalFieldKey,
} from "./Schema";

interface Named extends TreeSchema {
    name: TreeSchemaIdentifier;
}

export const typeSchema: Map<TreeSchemaIdentifier, TreeSchema> = new Map();

const jsonTypes: Set<TreeSchemaIdentifier> = new Set();

const emptySet: ReadonlySet<never> = new Set();
const emptyMap: ReadonlyMap<any, never> = new Map<any, never>();

const json: Named[] = [];

const jsonObject: Named = {
    name: "Json.Object" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

const jsonArray: Named = {
    name: "Json.Array" as TreeSchemaIdentifier,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    localFields: new Map([
        [
            "children" as LocalFieldKey,
            { multiplicity: Multiplicity.Sequence, types: jsonTypes },
        ],
    ]),
    value: ValueSchema.Nothing,
};

const jsonNumber: Named = {
    name: "Json.Number" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Number,
};

const jsonString: Named = {
    name: "Json.String" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.String,
};

const jsonNull: Named = {
    name: "Json.Null" as TreeSchemaIdentifier,
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: emptyField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

const jsonBoolean: Named = {
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
    multiplicity: Multiplicity.Value,
    types: jsonTypes,
};
