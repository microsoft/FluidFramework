/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/common-utils';
import type { IdCreationRange, UnackedLocalId } from './persisted-types';

export function getIds(
	range: IdCreationRange
): { first: UnackedLocalId; last: UnackedLocalId; overrides?: IdCreationRange.Overrides } | undefined {
	const { ids } = range;
	if (ids === undefined) {
		return undefined;
	}

	let first = ids.first;
	let last = ids.last;

	const overrides = ids as Partial<IdCreationRange.HasOverrides>;
	if (overrides.overrides !== undefined) {
		first ??= overrides.overrides[0][0];
		last ??= overrides.overrides[overrides.overrides.length - 1][0];
	}

	assert(first !== undefined && last !== undefined, 'malformed IdCreationRange');

	return {
		first,
		last,
		overrides: overrides.overrides,
	};
}
