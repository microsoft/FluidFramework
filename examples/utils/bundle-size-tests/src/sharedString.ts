/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedString } from "@fluidframework/sequence/internal";

export function apisToBundle(): void {
	SharedString.getFactory();
}
