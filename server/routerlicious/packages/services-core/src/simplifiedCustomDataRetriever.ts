/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITenantCustomData } from "./tenant";

/**
 * @internal
 */
export interface ISimplifiedCustomDataRetriever {
	get(customData: ITenantCustomData): string;
}
