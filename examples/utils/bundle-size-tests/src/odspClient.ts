/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createOdspClient } from "@fluidframework/odsp-client/internal";

export function apisToBundle() {
	createOdspClient({} as any);
}
