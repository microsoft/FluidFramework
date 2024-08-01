/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const record = { a: 1, b: 2 };
const recordA = record.a; // This will not report an error
const recordB = record.b; // This will not report an error

type SomeObj = { [key: string]: string };
const someObj: SomeObj = { a: "hello", b: "goodbye" };
someObj.a; // This will report an error
someObj.a.length; // This will report 2 errors because a is undefined and length on the undefined value is not allowed

type SomeNestedObj = { a: { [key: string]: string } };
const someNestedObj: SomeNestedObj = { a: { b: "goodbye" } };
someNestedObj.a.a.length; // This will report 2 errors because a is undefined and length on the undefined value is not allowed
