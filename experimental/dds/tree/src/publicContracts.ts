/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannelAttributes } from '@fluidframework/datastore-definitions/internal';

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory."type"}
 * @alpha
 */
export const SharedTreeType: string = 'SharedTree';

/**
 * {@inheritDoc @fluidframework/shared-object-base#ISharedObjectFactory.attributes}
 * @alpha
 */
export const SharedTreeAttributes: IChannelAttributes = {
	type: SharedTreeType,
	snapshotFormatVersion: '0.1',
	packageVersion: '0.1',
};
