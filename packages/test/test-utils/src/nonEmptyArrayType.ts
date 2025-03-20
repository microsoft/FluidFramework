/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type NonEmptyArray<T> = [T, ...T[]] | [...T[], T] | [T, ...T[], T];

export function isNonEmptyArray<T>(arr: T[]): arr is NonEmptyArray<T> {
	return arr.length > 0;
}
