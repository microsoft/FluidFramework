/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createLoader } from "@fluidframework/container-loader/internal";

export function apisToBundle(): void {
	createLoader({
		codeLoader: {} as any,
		documentServiceFactory: {} as any,
		urlResolver: {} as any,
	});
}
