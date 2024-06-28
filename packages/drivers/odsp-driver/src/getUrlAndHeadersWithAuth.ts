/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function getHeadersWithAuth(
	// eslint-disable-next-line @rushstack/no-new-null
	authHeader: string | null,
): { [index: string]: string } {
	if (!authHeader || authHeader.length === 0) {
		return {};
	}

	return {
		Authorization: authHeader,
	};
}
