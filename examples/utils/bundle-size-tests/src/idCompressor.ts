/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createIdCompressor,
	deserializeIdCompressor,
	createSessionId,
} from "@fluidframework/id-compressor/internal";

export function apisToBundle() {
	return {
		createIdCompressor,
		deserializeIdCompressor,
		createSessionId,
	};
}
