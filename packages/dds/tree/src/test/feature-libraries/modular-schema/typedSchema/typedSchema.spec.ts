/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/ban-types */

import {
	typedTreeSchema,
	typedFieldSchema,
	typedTreeSchemaFromInfo,
	TreeInfoFromBuilder,
	emptyField,
	nameSet,
	// Allow importing from this specific file which is being tested:
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/typedSchema";

import { ValueSchema } from "../../../../core";
import { requireTrue, requireAssignableTo } from "../../../../util";
import { FieldKinds } from "../../../../feature-libraries";

import {
	FieldSchemaTypeInfo,
	NameSet,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../../../../feature-libraries/modular-schema/typedSchema/outputTypes";

// These tests currently just cover the type checking, so its all compile time.

const lk1 = "localKey1Name";

export const lk2 = "localKey2Name";

export const testTypeIdentifier = "testType";

const testField = typedFieldSchema(FieldKinds.value, testTypeIdentifier);
// TODO: why does intellisense list type of testField.types as: ArrayToSet<readonly ["testType"]>; ?
// Why doesn't it inline and get ReadonlySet<"testType">?
// The compiler knows it could, since:
{
	type check1_ = requireAssignableTo<
		typeof testField,
		{ kind: typeof FieldKinds.value; types: NameSet<readonly ["testType"]> }
	>;
	const fieldTest1_: FieldSchemaTypeInfo = testField;
	type check3_ = requireAssignableTo<typeof testField, FieldSchemaTypeInfo>;
}

{
	const testTreeSchemaFromInfo = typedTreeSchemaFromInfo({
		name: "testTreeSchema",
		local: { localKey1Name: testField },
		extraLocalFields: testField,
		extraGlobalFields: true,
		global: [] as const,
		value: ValueSchema.Serializable,
	});

	const testTreeSchema = typedTreeSchema({
		name: "testTreeSchema",
		local: { localKey1Name: testField },
		extraLocalFields: testField,
		extraGlobalFields: true,
		value: ValueSchema.Serializable,
	});

	type TT = typeof testTreeSchema;
	type TT2 = {
		[Property in keyof TT]: TT[Property];
	};

	type InlineOnce<T> = {
		[Property in keyof T]: T[Property];
	};

	type InlineDeep<T> = {
		[Property in keyof T]: InlineOnce<T[Property]>;
	};

	type TT3 = InlineOnce<TT>;
	type TT4 = InlineDeep<TT>;

	type check_ = requireAssignableTo<
		typeof testTreeSchemaFromInfo.typeInfo.name,
		typeof testTreeSchema.typeInfo.name
	>;
	type check2_ = requireAssignableTo<typeof testTreeSchema, typeof testTreeSchemaFromInfo>;
	type check3_ = requireAssignableTo<typeof testTreeSchemaFromInfo, typeof testTreeSchema>;

	type TestTreeSchema = typeof testTreeSchema.typeInfo;

	type _assert = requireTrue<TestTreeSchema["extraGlobalFields"]>;

	type child = TestTreeSchema["local"][typeof lk1];

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
		name: "X",
		local: {},
		extraLocalFields: emptyField,
		extraGlobalFields: false,
		global: [] as const,
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
		type check1_ = requireAssignableTo<Info["name"], "X">;
		type check2_ = requireAssignableTo<{}, Info["local"]>;
		type check3_ = requireAssignableTo<readonly [], Info["global"]>;
		type check4_ = requireAssignableTo<Info["extraLocalFields"], typeof emptyField>;
		type check5_ = requireAssignableTo<Info["extraGlobalFields"], false>;
		type check6_ = requireAssignableTo<Info["value"], ValueSchema.Nothing>;

		type checkFinal1_ = requireAssignableTo<Info, typeof fullData>;
		type checkFinal2_ = requireAssignableTo<typeof fullData, Info>;
	}

	{
		type T1 = typeof testTreeSchemaFromInfo.typeInfo;
		type T2 = typeof testTreeSchema.typeInfo;

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
		types: nameSet("number"),
	} as const;
	const shortData = [FieldKinds.value, "number"] as const;

	const testSchema = typedFieldSchema(...shortData);
	const testSchemaInline = typedFieldSchema(FieldKinds.value, "number");

	type T1 = typeof info;
	type T2 = typeof testSchema;
	type T3 = typeof testSchemaInline;

	type check1_ = requireAssignableTo<T1, T2>;
	type check2_ = requireAssignableTo<T1, T3>;
	type check3_ = requireAssignableTo<T2, T1>;
	type check4_ = requireAssignableTo<T2, T3>;
	type check5_ = requireAssignableTo<T3, T1>;
	type check6_ = requireAssignableTo<T3, T2>;
}

{
	// A concrete example for a numeric field:
	const numericField = typedFieldSchema(FieldKinds.value, "Number");
	type NumericFieldInfo = typeof numericField;
	type NumericFieldTypes = NumericFieldInfo["types"];
	type check1_ = requireAssignableTo<NumericFieldTypes, NameSet<readonly ["Number"]>>;
	type check2_ = requireAssignableTo<NameSet<readonly ["Number"]>, NumericFieldTypes>;
}

// TODO: test and fix passing schema objects in type array instead of strings.
