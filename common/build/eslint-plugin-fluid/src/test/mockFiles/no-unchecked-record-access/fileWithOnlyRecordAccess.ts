/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const record = { a: 1, b: 2 };
const record1 = record.a; // This should not report an error
const recordB = record.b; // This should not report an error
console.log({ record1 });
console.log({ recordB });
type SomeObj = { [key: string]: string };
const someObj: SomeObj = { a: "hello", b: "goodbye" };
someObj.a.length; // This should report an error
