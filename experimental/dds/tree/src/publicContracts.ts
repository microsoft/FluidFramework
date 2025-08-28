/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelAttributes } from '@fluidframework/datastore-definitions/internal';

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @beta
 * @legacy
 */
export const SharedTreeFactoryType = 'SharedTree';

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @beta
 * @legacy
 */
export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeFactoryType,
	snapshotFormatVersion: '0.1',
	packageVersion: '0.1',
};
