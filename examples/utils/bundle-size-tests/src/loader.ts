/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Loader } from "@fluidframework/container-loader/internal";

export function apisToBundle(): void {
	new Loader({
		codeLoader: {} as any,
		documentServiceFactory: {} as any,
		urlResolver: {} as any,
	});
}
