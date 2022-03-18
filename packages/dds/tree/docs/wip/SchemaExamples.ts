/**
 * Misc example schema.
 *
 * Note this is written using the "Example internal schema representation types":
 * this is not intended to show what authoring a schema would look like, but rather just show what data a schema needs to capture.
 */

import { FieldContent, Multiplicity, Type, Value } from "./Schema";

const anyField: FieldContent = { multiplicity: Multiplicity.Sequence };
export function makeAnyType(name: string): Type {
    return {
        name,
        fields: [],
        extraFields: anyField,
        value: Value.Serializable,
    };
}

export const codePoint: Type = {
    name: "CodePoint",
    fields: [],
    value: Value.Number,
};

/**
 * String made of unicode code points, allowing for sequence editing of a string.
 */
export const string: Type = {
    name: "string",
    fields: [
        {
            name: "content",
            content: {
                multiplicity: Multiplicity.Sequence,
                types: [codePoint],
            },
        },
    ],
    value: Value.Nothing,
};
