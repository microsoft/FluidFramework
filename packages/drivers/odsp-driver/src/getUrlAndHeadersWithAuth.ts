/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

export function getHeadersWithAuth(
	// eslint-disable-next-line @rushstack/no-new-null
	authHeader: string | null,
): { [index: string]: string } {
	assert(!!authHeader, 0x936 /* authHeader should not be null or empty */);

	return {
		Authorization: authHeader,
	};
}
