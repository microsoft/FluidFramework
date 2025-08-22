/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @legacy
 * @beta
 */
export const SharedTreeFactoryType = "https://graph.microsoft.com/types/tree";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @legacy
 * @beta
 */
export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeFactoryType,
	snapshotFormatVersion: "0.0.0",
	packageVersion: pkgVersion,
};
