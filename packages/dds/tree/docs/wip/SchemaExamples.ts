/**
 * Misc example schema.
 *
 * Note this is written using the "Example internal schema representation types":
 * this is not intended to show what authoring a schema would look like, but rather just show what data a schema needs to capture.
 */

 import {
    TreeSchema,
    Multiplicity,
    ValueSchema,
    TreeSchemaIdentifier,
    emptyField,
    LocalFieldKey,
    emptyMap,
    emptySet,
    NamedTreeSchema,
} from "./Schema";

export const codePoint: NamedTreeSchema = {
    name: "Primitive.CodePoint" as TreeSchemaIdentifier,
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
            "children" as LocalFieldKey,
            { multiplicity: Multiplicity.Sequence, types: new Set([codePoint.name]) },
        ],
    ]),
    value: ValueSchema.Nothing,
};

