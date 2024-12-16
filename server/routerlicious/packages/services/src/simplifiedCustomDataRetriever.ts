/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISimplifiedCustomDataRetriever,
	ITenantCustomData,
} from "@fluidframework/server-services-core";

/**
 * Retrieve simplified customData.
 * @internal
 */
export class SimplifiedCustomDataRetriever implements ISimplifiedCustomDataRetriever {
	public constructor() {}

	public get(customData: ITenantCustomData): string {
		return "";
	}
}
