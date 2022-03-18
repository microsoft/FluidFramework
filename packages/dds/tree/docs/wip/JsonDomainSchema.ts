/**
 * Example schema for a json domain.
 *
 * Note this is written using the "Example internal schema representation types":
 * this is not intended to show what authoring a schema would look like, but rather just show what data a schema needs to capture.
 */

import { Type, Multiplicity, Value, FieldContent } from "./Schema";

const json: Type[] = [];

const jsonObject: Type = {
    name: "Json.Object",
    fields: [],
    extraFields: { multiplicity: Multiplicity.Value, types: json },
    value: Value.Nothing,
};

const jsonArray: Type = {
    name: "Json.Array",
    fields: [
        {
            name: "children",
            content: { multiplicity: Multiplicity.Sequence, types: json },
        },
    ],
    value: Value.Nothing,
};

const jsonNumber: Type = {
    name: "Json.Number",
    fields: [],
    value: Value.Nothing,
};

const jsonString: Type = {
    name: "Json.String",
    fields: [],
    value: Value.Nothing,
};

const jsonNull: Type = {
    name: "Json.Null",
    fields: [],
    value: Value.Nothing,
};

const jsonBoolean: Type = {
    name: "Json.Boolean",
    fields: [],
    value: Value.Boolean,
};

json.push(jsonObject, jsonArray, jsonNumber, jsonString, jsonNull, jsonBoolean);
export const jsonRoot: FieldContent = {
    multiplicity: Multiplicity.Value,
    types: json,
};
