/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelAttributes } from "@fluidframework/datastore-definitions/internal";

import { pkgVersion } from "./packageVersion.js";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @beta
 * @legacy
 */
// New type string, to be activated once the migration has been fully shipped dark and is safe to flip.
// See LegacyTypeAwareRegistry in packages/runtime/datastore/src/dataStoreRuntime.ts.
// export const SharedTreeFactoryType = "tree";
export const SharedTreeFactoryType = "https://graph.microsoft.com/types/tree";

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @beta
 * @legacy
 */
export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeFactoryType,
	snapshotFormatVersion: "0.0.0",
	packageVersion: pkgVersion,
};
