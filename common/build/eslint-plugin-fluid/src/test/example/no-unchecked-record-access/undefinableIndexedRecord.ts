/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Undefinable index signature
 */

/* Constants and Variables */
type UndefinableIndexSignatureType = { [key: string]: string | undefined };
const undefinableIndexedRecord: UndefinableIndexSignatureType = { a: "hello", b: undefined };

/* Function Calls */
function recordAFnExpectsStringOrUndefined(
	record: UndefinableIndexSignatureType,
): string | undefined {
	return record.a; // ok: Returning index property 'a' as string or undefined variable should be not be caught, 'a' might be undefined
}

function AFnExpectsStringOrUndefined(a: string | undefined): string | undefined {
	return a;
}

AFnExpectsStringOrUndefined(undefinableIndexedRecord.a); // ok: Passing index property 'a' to a function that accepts undefined is fine

/*
 * Variable Assignments
 */

const aExpectingStringOrUndefined: string | undefined = undefinableIndexedRecord.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present
let aLetExpectingStringOrUndefined: string | undefined = undefinableIndexedRecord.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present

const aImplicitType = undefinableIndexedRecord.a; // ok: Index property with union type undefined is allowed to be assigned to inferred type

let aLetExpectingStringOrUndefinedAfterVariableDeclaration: string | undefined;
aLetExpectingStringOrUndefinedAfterVariableDeclaration = undefinableIndexedRecord.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present
