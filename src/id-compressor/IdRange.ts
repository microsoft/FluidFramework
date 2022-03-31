/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/common-utils';
import { Serializable } from '@fluidframework/datastore-definitions';
import { LocalCompressedId, OpSpaceCompressedId, SessionId } from '../Identifiers';

/**
 * Extensible attribution info associated with a session.
 */
export type AttributionInfo = Serializable;

/**
 * Data describing a range of session-local IDs (from a remote or local session).
 *
 * A range is composed of local IDs that were generated. Some of these may have overrides.
 *
 * @example
 * Suppose an IdCompressor generated a sequence of local IDs as follows:
 * ```
 * compressor.generateLocalId()
 * compressor.generateLocalId('0093cf29-9454-4034-8940-33b1077b41c3')
 * compressor.generateLocalId()
 * compressor.generateLocalId('0ed545f8-e97e-4dc1-acf9-c4a783258bdf')
 * compressor.generateLocalId()
 * compressor.generateLocalId()
 * compressor.takeNextCreationRange()
 * ```
 * This would result in the following range:
 * ```
 * {
 *     first: localId1,
 *     last: localId6,
 *     overrides: [[localId2, '0093cf29-9454-4034-8940-33b1077b41c3'], [localId4, '0ed545f8-e97e-4dc1-acf9-c4a783258bdf']]
 * }
 * ```
 */
export interface IdCreationRange {
	readonly sessionId: SessionId;
	readonly ids?: IdCreationRange.Ids;
	readonly attributionInfo?: AttributionInfo;
}

export type UnackedLocalId = LocalCompressedId & OpSpaceCompressedId;

export namespace IdCreationRange {
	export type Ids =
		| {
				readonly first: UnackedLocalId;
				readonly last: UnackedLocalId;
		  }
		| ({
				readonly first?: UnackedLocalId;
				readonly last?: UnackedLocalId;
		  } & HasOverrides);

	export interface HasOverrides {
		readonly overrides: Overrides;
	}

	export type Override = readonly [id: UnackedLocalId, override: string];
	export type Overrides = readonly [Override, ...Override[]];

	export function getIds(
		range: IdCreationRange
	): { first: UnackedLocalId; last: UnackedLocalId; overrides?: Overrides } | undefined {
		const { ids } = range;
		if (ids === undefined) {
			return undefined;
		}

		let first = ids.first;
		let last = ids.last;

		const overrides = ids as Partial<HasOverrides>;
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
}
