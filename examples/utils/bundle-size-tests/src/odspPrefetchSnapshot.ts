/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { prefetchLatestSnapshot } from "@fluidframework/odsp-driver/internal";

export function apisToBundle(): void {
	// eslint-disable-next-line @typescript-eslint/no-floating-promises
	prefetchLatestSnapshot(
		undefined as any,
		undefined as any,
		undefined as any,
		undefined as any,
		undefined as any,
		undefined,
	);
}
