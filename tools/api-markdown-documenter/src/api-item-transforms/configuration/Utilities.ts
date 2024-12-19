/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Trims a trailing semicolon from the provided text, if the text contains one.
 */
export function trimTrailingSemicolon(text: string): string {
	if (text.endsWith(";")) {
		return text.slice(0, text.length - 1);
	}
	return text;
}
