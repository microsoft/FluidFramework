/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const arr1 = [1, 2, 3];
const value1 = arr1[0]; // This should not report an error

const record = { a: 1, b: 2 };
const uncheckedAccess = record["c"]; // This should report an error
