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
	nullableIndexedRecord.a.length; // ok: Within a presence check, 'a' is guaranteed to be defined
}

/* Function Calls */
function recordAFnExpectsStringOrNull(record: NullableIndexSignatureType): string | null {
	return record.a; // defect: Returning index property 'a' as string or null variable should be caught, 'a' might be undefined
}

function recordAFnExpectsStringOrUndefinedOrNull(
	record: NullableIndexSignatureType,
): string | undefined | null {
	return record.a; // ok: Returning index property 'a' to string or undefined or null variable, 'a' might be undefined
}

function AFnExpectsStringOrNull(a: string | null): string | null {
	return a;
}

function AFnExpectsStringOrUndefinedOrNull(
	a: string | undefined | null,
): string | undefined | null {
	return a;
}

AFnExpectsStringOrNull(nullableIndexedRecord.a); // defect: Passing index property 'a' to a function without having type undefined
AFnExpectsStringOrUndefinedOrNull(nullableIndexedRecord.a); // ok: Passing index property 'a' to a function that accepts undefined is fine

/*
 * Variable Assignments
 */

const aExpectingStringOrNull: string | null = nullableIndexedRecord.a; // defect: Assigning index property 'a' to string or null variable, 'a' might not be present, type should include an undefined type
let aLetExpectingStringOrNull: string | null = nullableIndexedRecord.a; // defect: Assigning index property 'a' to string or null variable, 'a' might not be present, either the index signature type should include an undefined type or the variable declaration should be changed to string | null | undefined
const aExpectingStringOrNullOrUndefined: string | null | undefined = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null or undefined variable is fine, 'a' might not be present
let aLetExpectingStringOrNullOrUndefined: string | null | undefined = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null or undefined variable is fine, 'a' might not be present

const aImplicitType = nullableIndexedRecord.a; // defect: Index property without an explicit undefined can not be assigned to an inferred type

let aLetExpectingStringOrUndefinedAfterVariableDeclaration: string | null;
aLetExpectingStringOrUndefinedAfterVariableDeclaration = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null variable, 'a' might not be present, either the index signature type should include an undefined type or the variable declaration should be changed to string | null | undefined
