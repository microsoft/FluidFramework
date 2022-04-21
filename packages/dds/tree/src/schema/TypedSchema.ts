// /*!
//  * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
//  * Licensed under the MIT License.
//  */

// import { Invariant, requireTrue } from "../TypeCheck";
// import {
//     FieldSchema,
//     LocalFieldKey,
//     Multiplicity,
//     TreeSchema,
//     ValueSchema,
// } from "./Schema";

// /**
//  * APIs for building typescript types and schema together.
//  */

// /**
//  * Type implemented by schema to allow compile time schema access via type checking.
//  */
// interface TreeSchemaTypeInfo {
//     local: { [key: string]: LabeledFieldSchema<any>; };
//     global: { [key: string]: unknown; };
//     extraLocalFields: LabeledFieldSchema<any>;
//     extraGlobalFields: boolean;
//     value: ValueSchema;
// }

// interface FieldSchemaTypeInfo {
//     types: { [key: string]: unknown; };
//     multiplicity: Multiplicity;
// }

// function build<T extends TreeSchemaTypeInfo>(t: T): LabeledTreeSchema<T> {
//     return t as any as LabeledTreeSchema<T>; // TODO
// }

// function field<T extends FieldSchemaTypeInfo>(t: T): LabeledFieldSchema<T> {
//     return t as any as LabeledFieldSchema<T>; // TODO
// }

// const lk1 = "lk1Name" as const;

// export const lk2 = "lk2Name" as const;

// export const ti1 = "ti1" as const;

// const testField = field({ types: { ti1: 0 as unknown }, multiplicity: Multiplicity.Value });

// export const x = build({
//     local: { lk1Name: testField },
//     global: {},
//     extraLocalFields: testField,
//     extraGlobalFields: true as const,
//     value: ValueSchema.Serializable,
// });

// type xx = TypeInfo<typeof x>;

// export type y = requireTrue<xx["extraGlobalFields"]>;

// type TypeInfo<T extends LabeledTreeSchema<any>> = T extends LabeledTreeSchema<infer R> ? R : unknown;
// type FieldInfo<T extends LabeledFieldSchema<any>> = T extends LabeledFieldSchema<infer R> ? R : unknown;

// export interface LabeledTreeSchema<T extends TreeSchemaTypeInfo> extends TreeSchema {
//     readonly typeCheck?: Invariant<T>;

//     readonly localFields: ObjectToMap<T["local"], LocalFieldKey>;
// }

// export interface LabeledFieldSchema<T extends FieldSchemaTypeInfo> extends TreeSchema {
//     readonly typeCheck?: Invariant<T>;
// }

// export type child = FieldInfo<xx["local"][typeof lk1]>;

// // type child2 = FieldInfo<xx["local"][typeof lk2]>;

// type ObjectToMap<T, K extends number | string> =
//     & ReadonlyMap<K, FieldSchema>
//     & { get<X extends keyof T>(key: X): T[X]; };

// export const xxxx = x.localFields.get(lk1);
// // const xxx2 = x.localFields.get(lk2);
