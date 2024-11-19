/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Index signature type
 */

/* Constants and Variables */
type IndexSignatureType = { [key: string]: string };
interface ExtendedIndexSignatureType extends IndexSignatureType {
	a: string;
}
const indexedRecordOfStrings: IndexSignatureType = { a: "hello", b: "goodbye" };
const extendedIndexedRecordOfStrings: ExtendedIndexSignatureType = { a: "hello", b: "goodbye" };
const a = "a";
const b = "b";

/*
 * Accessing Properties
 */

indexedRecordOfStrings.a; // ok: Accessing index property 'a' without requiring a particular result
indexedRecordOfStrings.a.length; // defect: Accessing length of index property 'a', but 'a' might not be present
indexedRecordOfStrings["a"]; // ok: Accessing property 'a' using bracket notation
indexedRecordOfStrings["a"].length; // defect: Accessing length of index property 'a' using bracket notation, but 'a' might not be present
indexedRecordOfStrings[a].length; // defect: Accessing length of index property 'a' using bracket notation, but 'a' might not be present
indexedRecordOfStrings[b].length; // defect: Accessing length of index property 'b' using bracket notation, but 'b' might not be present
indexedRecordOfStrings.a?.length; // ok: Using optional chaining to access length safely handles 'undefined'
indexedRecordOfStrings.a!.length; // ok: The author says they understand the question raised by check and acknowledge that they have other information expecting that it is actually defined or that they are okay with an exception being raise here if "a" is not present and defined
indexedRecordOfStrings["a"]?.length; // ok: Using optional chaining to access length using bracket notation safely handles 'undefined'
indexedRecordOfStrings["a"]!.length; // ok: The author says they understand the question raised by check and acknowledge that they have other information expecting that it is actually defined or that they are okay with an exception being raise here if "a" is not present and defined

/* Conditional Checks */
if (indexedRecordOfStrings.a) {
	indexedRecordOfStrings.a.length; // ok: Within a presence check, 'a' is guaranteed to be defined
}

if ("a" in indexedRecordOfStrings) {
	indexedRecordOfStrings.a.length; // ok: Accessing length of property inside an 'in' check, 'a' is guaranteed to be defined
}

/* Function Calls */
function recordAFnExpectsString(record: IndexSignatureType): string {
	return record.a; // defect: Returning index property 'a' directly, but 'a' might not be present
}

function recordAFnExpectsStringOrUndefined(record: IndexSignatureType): string | undefined {
	return record.a; // ok: Returning index property 'a' to string or undefined variable, 'a' might not be present
}

function AFnExpectsString(a: string): string {
	return a;
}

function AFnExpectsStringOrUndefined(a: string | undefined): string | undefined {
	return a;
}

AFnExpectsString(indexedRecordOfStrings.a); // defect: Passing index property 'a' to a function that expects a string should fail
AFnExpectsStringOrUndefined(indexedRecordOfStrings.a); // ok: Passing index property 'a' to a function that accepts undefined is fine

/* Looping */
for (const [key, value] of Object.entries(indexedRecordOfStrings)) {
	value.length; // ok: Object.entries provides only present values
	indexedRecordOfStrings[key]; // ok: Accessing property while looping though records which acts like a `has` property check
	indexedRecordOfStrings[key].length; // ok: When noUncheckedIndexedAccess is enabled, TSC will treat indexedRecordOfStrings[key] as an error, but no-unchecked-record-access does not because accessing properties while looping though records acts like a presence check
}

for (const key of Object.keys(indexedRecordOfStrings)) {
	indexedRecordOfStrings[key]; // ok: Accessing property while looping though records which acts like a `has` property check
	indexedRecordOfStrings[key].length; // ok: When noUncheckedIndexedAccess is enabled, TSC will treat indexedRecordOfStrings[key] as an error, but no-unchecked-record-access does not because accessing properties while looping though records acts like a presence check
}

/*
 * Variable Assignments
 */

const aExpectingString: string = indexedRecordOfStrings.a; // defect: Assigning index property 'a' to a strict string variable, but 'a' might not be present
const aExpectingStringOrUndefined: string | undefined = indexedRecordOfStrings.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present
let aLetExpectingString: string = indexedRecordOfStrings.a; // defect: Assigning index property 'a' to a strict string variable, but 'a' might not be present
let aLetExpectingStringOrUndefined: string | undefined = indexedRecordOfStrings.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present
let aLetExpectingStringAfterVariableDeclaration: string;
aLetExpectingStringAfterVariableDeclaration = indexedRecordOfStrings.a; // defect: Assigning index property 'a' to a strict string variable, but 'a' might not be present
let aLetExpectingStringOrUndefinedAfterVariableDeclaration: string | undefined;
aLetExpectingStringOrUndefinedAfterVariableDeclaration = indexedRecordOfStrings.a; // ok: Assigning index property 'a' to string or undefined variable, 'a' might not be present

/*
 * When noUncheckedIndexedAccess is enabled, TSC will treat property access on aImplicitType as an error, but no-unchecked-record-access causes an error if an index signature is not typed to allow undefined.
 */
const aImplicitType = indexedRecordOfStrings.a; // defect: Assigning index property with inferred type without an explicit undefined type is not allowed
aImplicitType.length; // ok: aImplicitType is the continuation of the inferred type case and should be caught in the variable initialization


extendedIndexedRecordOfStrings.a.length; // ok: Accessing string property of extendedIndexedRecordOfStrings is allowed
extendedIndexedRecordOfStrings.b.length; // defect: Accessing length of index property 'b', but 'b' might not be present
