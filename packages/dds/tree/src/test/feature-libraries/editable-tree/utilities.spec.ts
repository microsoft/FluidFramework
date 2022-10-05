/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { emptyField, FieldKinds, Multiplicity } from "../../../feature-libraries";
import {
    isPrimitiveValue,
    isPrimitive,
    getPrimaryField,
    getArrayOwnKeys,
    getFieldKind,
    getFieldSchema,
    // eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/editable-tree/utilities";
import {
    namedTreeSchema,
    ValueSchema,
    fieldSchema,
    LocalFieldKey,
    FieldSchema,
} from "../../../schema-stored";
import { EmptyKey } from "../../../tree";
import { brand } from "../../../util";

const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});

const int32Schema = namedTreeSchema({
    name: brand("Int32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

const arraySchema = namedTreeSchema({
    name: brand("Test:Array-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [stringSchema.name, int32Schema.name]),
    },
    extraLocalFields: emptyField,
});

const mapStringSchema = namedTreeSchema({
    name: brand("Map<String>"),
    extraLocalFields: fieldSchema(FieldKinds.value, [stringSchema.name]),
    value: ValueSchema.Serializable,
});

const optionalChildSchema = namedTreeSchema({
    name: brand("Test:OptionalChild-1.0.0"),
    localFields: {
        child: fieldSchema(FieldKinds.optional),
    },
    value: ValueSchema.Serializable,
    extraLocalFields: emptyField,
});

describe("editable-tree utilities", () => {
    it("isPrimitive", () => {
        assert(isPrimitive(int32Schema));
        assert(isPrimitive(stringSchema));
        assert(isPrimitive(mapStringSchema));
        assert(!isPrimitive(optionalChildSchema));
    });

    it("isPrimitiveValue", () => {
        assert(isPrimitiveValue(0));
        assert(isPrimitiveValue(0.001));
        assert(isPrimitiveValue(NaN));
        assert(isPrimitiveValue(true));
        assert(isPrimitiveValue(false));
        assert(isPrimitiveValue(""));
        assert(!isPrimitiveValue({}));
        assert(!isPrimitiveValue(undefined));
        assert(!isPrimitiveValue(null));
        assert(!isPrimitiveValue([]));
    });

    it("field utils", () => {
        const schema = fieldSchema(FieldKinds.sequence, [stringSchema.name, int32Schema.name]);
        const expectedPrimary: { key: LocalFieldKey; schema: FieldSchema } = {
            key: EmptyKey,
            schema,
        };
        const primary = getPrimaryField(arraySchema);
        assert(primary !== undefined);
        assert.deepEqual(getFieldSchema(arraySchema, primary.key), schema);
        assert.equal(
            getFieldKind(getFieldSchema(arraySchema, primary.key)).multiplicity,
            Multiplicity.Sequence,
        );
        assert.deepEqual(primary, expectedPrimary);
        assert(getPrimaryField(optionalChildSchema) === undefined);
        assert(getPrimaryField(mapStringSchema) === undefined);
    });

    it("get array-like keys", () => {
        assert.deepEqual(getArrayOwnKeys(1), Object.getOwnPropertyNames([""]));
        assert.deepEqual(getArrayOwnKeys(0), Object.getOwnPropertyNames([]));
        // TODO: make sure "length" is not configurable/enumerable when implementing proxy for arrayed fields
        assert.deepEqual(getArrayOwnKeys(1), [...Object.keys([""]), "length"]);
        assert.deepEqual(getArrayOwnKeys(0), [...Object.keys([]), "length"]);
    });
});
