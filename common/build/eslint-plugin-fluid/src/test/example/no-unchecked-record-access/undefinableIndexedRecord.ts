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

function AFnExpectsStringOrUndefined(a: string | undefined): string | undefined {
	return a;
}

AFnExpectsStringOrUndefined(undefinableIndexedRecord.a); // ok: Passing index property 'a' to a function that accepts undefined is fine

/*
 * Variable Assignments
 */

const aExpectingStringOrUndefined: string | undefined = undefinableIndexedRecord.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present
const aExpectingStringOrNullOrUndefined: string | null | undefined = undefinableIndexedRecord.a; // ok: Assigning index property 'a' to string or null or undefined variable, 'a' might not be present
const aImplicitType = undefinableIndexedRecord.a; // defect: Assigning index property with inferred type

let aLetExpectingStringOrUndefined: string | undefined = undefinableIndexedRecord.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present
let aLetExpectingStringOrUndefinedAfterVariableDeclaration: string | undefined;
aLetExpectingStringOrUndefinedAfterVariableDeclaration = undefinableIndexedRecord.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present
