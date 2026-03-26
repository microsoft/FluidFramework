/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspClient } from "@fluidframework/odsp-client/internal";

export function apisToBundle(): void {
	new OdspClient({} as any);
}
