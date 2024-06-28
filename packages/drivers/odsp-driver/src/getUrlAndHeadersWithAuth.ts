/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export function getUrlAndHeadersWithAuth(
	url: string,
	// eslint-disable-next-line @rushstack/no-new-null
	token: string | null,
): { url: string; headers: { [index: string]: string } } {
	if (!token || token.length === 0) {
		return { url, headers: {} };
	}

	return {
		headers: {
			Authorization: `Bearer ${token}`,
		},
		url,
	};
}
