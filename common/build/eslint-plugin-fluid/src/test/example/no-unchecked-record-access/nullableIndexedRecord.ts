/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Nullable index signature
 */

/* Constants and Variables */
type NullableIndexSignatureType = { [key: string]: string | null };
const nullableIndexedRecord: NullableIndexSignatureType = { a: "hello", b: null };

/* Conditional Checks */
if (nullableIndexedRecord.a) {
	nullableIndexedRecord.a.length; // ok: Within a truthy check, 'a' is guaranteed to be defined
}

/* Function Calls */
function recordAFnExpectsStringOrNull(record: NullableIndexSignatureType): string | null {
	return record.a; // ok: Returning index property 'a' to string or null variable, 'a' might not be present
}

AFnExpectsStringOrNull(nullableIndexedRecord.a); // ok: Passing index property 'a' to a function that accepts null is fine

/*
 * Variable Assignments
 */

const aExpectingStringOrNull: string | null = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null variable, 'a' might not be present
const aExpectingStringOrNullOrUndefined: string | null | undefined = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null or undefined variable, 'a' might not be present
const aImplicitType = nullableIndexedRecord.a; // defect: Assigning index property with inferred type

let aLetExpectingStringOrUndefined: string | null = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null variable, 'a' might not be present
let aLetExpectingStringOrUndefinedAfterVariableDeclaration: string | null;
aLetExpectingStringOrUndefinedAfterVariableDeclaration = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null variable, 'a' might not be present

function AFnExpectsStringOrNull(a: string | null): string | null {
	return a;
}
