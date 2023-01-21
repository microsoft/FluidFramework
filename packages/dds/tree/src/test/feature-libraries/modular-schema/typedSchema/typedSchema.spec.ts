/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/ban-types */

import {
    typedTreeSchema,
    typedFieldSchema,
    FieldInfo,
    TypeInfo,
    typedTreeSchemaFromInfo,
    TreeInfoFromBuilder,
    emptyField,
    typedFieldSchemaFromInfo,
    // Allow importing from this specific file which is being tested:
    /* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/typedSchema";

import { TreeSchemaIdentifier, ValueSchema } from "../../../../core";
import { brand, requireTrue, requireAssignableTo } from "../../../../util";
import { FieldKinds } from "../../../../feature-libraries";
/* eslint-disable-next-line import/no-internal-modules */
import { MapToken } from "../../../../feature-libraries/modular-schema/typedSchema/outputTypes";

// These tests currently just cover the type checking, so its all compile time.

const lk1 = "localKey1Name";

export const lk2 = "localKey2Name";

export const testTypeIdentifier = "testType";

const testField = typedFieldSchema(FieldKinds.value, [testTypeIdentifier]);

{
    const testTreeSchemaFromInfo = typedTreeSchemaFromInfo({
        name: brand("testTreeSchema"),
        local: { localKey1Name: testField },
        extraLocalFields: testField,
        extraGlobalFields: true,
        global: {},
        value: ValueSchema.Serializable,
    });

    const testTreeSchema = typedTreeSchema({
        name: "testTreeSchema",
        local: { localKey1Name: testField },
        extraLocalFields: testField,
        extraGlobalFields: true,
        value: ValueSchema.Serializable,
    });

    type check_ = requireAssignableTo<typeof testTreeSchemaFromInfo, typeof testTreeSchema>;
    type check2_ = requireAssignableTo<typeof testTreeSchema, typeof testTreeSchemaFromInfo>;

    type TestTreeSchema = TypeInfo<typeof testTreeSchema>;

    type _assert = requireTrue<TestTreeSchema["extraGlobalFields"]>;

    type child = FieldInfo<TestTreeSchema["local"][typeof lk1]>;

    // @ts-expect-error This is an error since this field does not exist:
    type invalidChildType = FieldInfo<TestTreeSchema["local"][typeof lk2]>;
    // @ts-expect-error Same as above but for other one:
    type invalidChildType2 = FieldInfo<TestTreeSchema["local"][typeof lk2]>;

    const xxxx = testTreeSchema.localFields.get(lk1);

    // @ts-expect-error This is an error since this field does not exist:
    const invalidChildSchema = testTreeSchema.localFields.get(lk2);
}

{
    const fullData = {
        name: brand<TreeSchemaIdentifier>("X") as TreeSchemaIdentifier & "X",
        local: {},
        extraLocalFields: emptyField,
        extraGlobalFields: false,
        global: {},
        value: ValueSchema.Nothing,
    } as const;
    const shortData = {
        name: "X",
        local: {},
    } as const;
    const testTreeSchemaFromInfo = typedTreeSchemaFromInfo(fullData);
    const testTreeSchema = typedTreeSchema(shortData);

    type Info = TreeInfoFromBuilder<typeof shortData>;
    {
        type check1_ = requireAssignableTo<Info["name"], TreeSchemaIdentifier & "X">;
        type check2_ = requireAssignableTo<{}, Info["local"]>;
        type check3_ = requireAssignableTo<{}, Info["global"]>;
        type check4_ = requireAssignableTo<Info["extraLocalFields"], typeof emptyField>;
        type check5_ = requireAssignableTo<Info["extraGlobalFields"], false>;
        type check6_ = requireAssignableTo<Info["value"], ValueSchema.Nothing>;

        type checkFinal1_ = requireAssignableTo<Info, typeof fullData>;
        type checkFinal2_ = requireAssignableTo<typeof fullData, Info>;
    }

    {
        type T1 = TypeInfo<typeof testTreeSchemaFromInfo>;
        type T2 = TypeInfo<typeof testTreeSchema>;

        type check3_ = requireAssignableTo<T1, T2>;
        type check4_ = requireAssignableTo<T2, T1>;
    }
}

// Test TreeInfoFromBuilder's handling of "local"
{
    type empty_ = requireAssignableTo<
        TreeInfoFromBuilder<{
            name: "X";
            local: {};
        }>["local"],
        {}
    >;
    type empty2_ = requireAssignableTo<
        {},
        TreeInfoFromBuilder<{
            name: "X";
            local: {};
        }>["local"]
    >;
    type undefined_ = requireAssignableTo<
        TreeInfoFromBuilder<{
            name: "X";
            local: undefined;
        }>["local"],
        {}
    >;
    type undefined2_ = requireAssignableTo<
        {},
        TreeInfoFromBuilder<{
            name: "X";
            local: undefined;
        }>["local"]
    >;
    type omitted_ = requireAssignableTo<
        TreeInfoFromBuilder<{
            name: "X";
        }>["local"],
        {}
    >;
    type omitted2_ = requireAssignableTo<
        {},
        TreeInfoFromBuilder<{
            name: "X";
        }>["local"]
    >;
    type used_ = requireAssignableTo<
        TreeInfoFromBuilder<{
            name: "X";
            local: { a: typeof testField };
        }>["local"],
        { a: typeof testField }
    >;
    type used2_ = requireAssignableTo<
        { a: typeof testField },
        TreeInfoFromBuilder<{
            name: "X";
            local: { a: typeof testField };
        }>["local"]
    >;
}

// Test typedFieldSchemaFromInfo and typedFieldSchema
// Using type names
{
    const info = {
        kind: FieldKinds.value,
        types: { number: MapToken },
    } as const;
    const shortData = [FieldKinds.value, ["number"]] as const;

    const testSchemaFromInfo = typedFieldSchemaFromInfo(info);
    type ChildTypes = FieldInfo<typeof testSchemaFromInfo>["types"];
    type Kind = FieldInfo<typeof testSchemaFromInfo>["kind"];
    {
        type checkA_ = requireAssignableTo<ChildTypes, { number: MapToken }>;
        type checkB_ = requireAssignableTo<Kind, typeof FieldKinds.value>;
        // This really looks redundant, for its possible for it to fail and not the others, somehow.
        type checkC_ = requireAssignableTo<keyof ChildTypes, "number">;
    }

    const testSchema = typedFieldSchema(...shortData);
    // TODO: forcing this "as const" is bad. Maybe adjust API?
    const testSchemaInline = typedFieldSchema(FieldKinds.value, ["number"] as const);

    type T1 = FieldInfo<typeof testSchemaFromInfo>;
    type T2 = FieldInfo<typeof testSchema>;
    type T3 = FieldInfo<typeof testSchemaInline>;

    type check1_ = requireAssignableTo<T1, T2>;
    type check2_ = requireAssignableTo<T1, T3>;
    type check3_ = requireAssignableTo<T2, T1>;
    type check4_ = requireAssignableTo<T2, T3>;
    type check5_ = requireAssignableTo<T3, T1>;
    type check6_ = requireAssignableTo<T3, T2>;

    // It seems like that should check the 3 versions for equality,
    // but it fails to detect some cases which we have actually hit:

    type ChildTypes2 = T2["types"];
    type checkA2_ = requireAssignableTo<ChildTypes2, { number: MapToken }>;
    // For the type `{[key: string]: "MapToken";} & ListToKeys<readonly ["number"], "MapToken">``
    // The above check passes but this one catches that the type is not `{ number: MapToken }`
    type checkC2_ = requireAssignableTo<keyof ChildTypes2, "number">;
}

{
    // A concrete example for a numeric field:
    const numericField = typedFieldSchema(FieldKinds.value, ["Number"] as const);
    type NumericFieldInfo = FieldInfo<typeof numericField>;
    type NumericFieldTypes = NumericFieldInfo["types"];
    type check1_ = requireAssignableTo<NumericFieldTypes, { Number: MapToken }>;
    type check2_ = requireAssignableTo<{ Number: MapToken }, NumericFieldTypes>;
    type ChildName = keyof NumericFieldTypes;
    type check3_ = requireAssignableTo<ChildName, "Number">;
}

// TODO: test and fix passing schema objects in type array instead of strings.
