/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelAttributes } from '@fluidframework/datastore-definitions/internal';

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @public
 */
export const SharedTreeType = 'SharedTree';

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @public
 */
export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeType,
	snapshotFormatVersion: '0.1',
	packageVersion: '0.1',
};
