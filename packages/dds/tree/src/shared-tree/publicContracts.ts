/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @alpha
 * @legacy
 */
export const SharedTreeType = "https://graph.microsoft.com/types/tree";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @alpha
 * @legacy
 */
export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeType,
	snapshotFormatVersion: "0.0.0",
	packageVersion: "0.0.0",
};
