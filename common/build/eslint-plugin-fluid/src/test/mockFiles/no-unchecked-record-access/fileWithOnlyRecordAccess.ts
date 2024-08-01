/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const record = { a: 1, b: 2 };
const recordA = record.a; // This should not report an error
const recordB = record.b; // This should not report an error
type SomeObj = { [key: string]: string };
const someObj: SomeObj = { a: "hello", b: "goodbye" };
someObj.a.length; // This should report an error
