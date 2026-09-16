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

let aLetExpectingStringOrNullAfterVariableDeclaration: string | null;
aLetExpectingStringOrNullAfterVariableDeclaration = nullableIndexedRecord.a; // defect: Assigning index property 'a' to string or null variable should report an error, 'a' might not be present, either the index signature type should include an undefined type or the variable declaration should be changed to string | null | undefined
let aLetExpectingStringOrNullOrUndefinedAfterVariableDeclaration: string | null | undefined;
aLetExpectingStringOrNullOrUndefinedAfterVariableDeclaration = nullableIndexedRecord.a; // ok: Assigning index property 'a' to string or null or undefined variable, 'a' might not be present

/*
 * When noUncheckedIndexedAccess is enabled, TSC will treat property access on aImplicitType as an error, but no-unchecked-record-access causes an error if an index signature is not typed to allow undefined.
 */
const aImplicitType = nullableIndexedRecord.a; // defect: Index property without an explicit undefined can not be assigned to an inferred type
AFnExpectsStringOrNull(aImplicitType); // ok: AFnExpectsStringOrNull(aImplicitType) is the continuation of the inferred type case and should be caught in the variable initialization
