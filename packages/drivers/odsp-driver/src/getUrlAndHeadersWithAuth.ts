/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";

export function getHeadersWithAuth(
	// eslint-disable-next-line @rushstack/no-new-null
	authHeader: string | null,
): { [index: string]: string } {
	assert(authHeader !== null && authHeader.length > 0, 0x936 /* should be token */);
	if (!authHeader || authHeader.length === 0) {
		return {};
	}

	return {
		Authorization: authHeader,
	};
}
