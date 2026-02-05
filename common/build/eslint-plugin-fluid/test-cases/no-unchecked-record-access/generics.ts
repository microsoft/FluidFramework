/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Generics
 */

function readRecordA<T>(record: Record<string, T>): T {
	return record.a; // defect: Returning 'record.a' directly from an index signature type is not allowed. It may be 'undefined'
}

function readOptionalRecordA<T>(record: Record<string, T>): T | undefined {
	return record.a; // ok: Returning index property 'a' to string or undefined variable, 'a' might not be present
}
