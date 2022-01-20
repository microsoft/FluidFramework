/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from '@fluidframework/common-utils';
import { Serializable } from '@fluidframework/datastore-definitions';
import { fail } from '../Common';
import { LocalCompressedId, OpSpaceCompressedId, SessionId } from '../Identifiers';

/**
 * Extensible attribution info associated with a session.
 */
export type AttributionInfo = Serializable;

/**
 * Data describing a range of session-local IDs (from a remote or local session).
 *
 * A range is composed of two adjacent sub-ranges of local IDs:
 * 1. A range of local IDs that were explicitly generated. Some of these may have overrides.
 * 2. A subsequent run of implicitly-generated local IDs, which never have overrides.
 *
 * @example
 * Suppose an IdCompressor generated a sequence of local IDs as follows:
 * ```
 * compressor.generateLocalId()
 * compressor.generateLocalId('0093cf29-9454-4034-8940-33b1077b41c3')
 * compressor.generateLocalId()
 * compressor.generateLocalId('0ed545f8-e97e-4dc1-acf9-c4a783258bdf')
 * compressor.generateLocalId()
 * compressor.takeNextRange(3)
 * ```
 * This would result in the following explicit and implicit sub-ranges:
 * * Explicits:
 * ```
 * {
 *     first: localId1,
 *     last: localId5,
 *     overrides: [[localId2, '0093cf29-9454-4034-8940-33b1077b41c3'], [localId4, '0ed545f8-e97e-4dc1-acf9-c4a783258bdf']]
 * }
 * ```
 * * Implicits:
 * ```
 * {
 *     first: localId6,
 *     last: localId8
 * }
 * ```
 */
export interface IdRange {
	readonly sessionId: SessionId;
	readonly ids?: IdRange.Ids;
	readonly attributionInfo?: AttributionInfo;
}

export type UnackedLocalId = LocalCompressedId & OpSpaceCompressedId;

export namespace IdRange {
	export type Ids =
		| ({ readonly implicits?: Pick<Implicits, 'last'> } & HasExplicits)
		| { readonly implicits: Implicits };

	export interface HasExplicits {
		readonly explicits: Explicits;
	}

	export type Explicits =
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

	export interface Implicits {
		readonly first: UnackedLocalId;
		readonly last: UnackedLocalId;
	}

	export type Override = readonly [id: UnackedLocalId, override: string];
	export type Overrides = readonly [Override, ...Override[]];

	export function getExplicits(
		range: IdRange
	): { first: UnackedLocalId; last: UnackedLocalId; overrides?: Overrides } | undefined {
		if (range.ids === undefined) {
			return undefined;
		}

		const ids = range.ids as Partial<HasExplicits>;

		if (ids.explicits === undefined) {
			return undefined;
		}

		let first = ids.explicits.first;
		let last = ids.explicits.last;

		const explicits = ids.explicits as Partial<HasOverrides>;

		if (explicits.overrides !== undefined) {
			first ??= explicits.overrides[0][0];
			last ??= explicits.overrides[explicits.overrides.length - 1][0];
		}

		assert(first !== undefined && last !== undefined, 'malformed IdRange');

		return {
			first,
			last,
			overrides: explicits.overrides,
		};
	}

	export function getImplicits(range: IdRange): (Implicits & { count: number }) | undefined {
		if (range.ids === undefined) {
			return undefined;
		}

		const ids = range.ids as Ids & Partial<HasExplicits>;
		const implicits = ids.implicits as (Partial<Pick<Implicits, 'first'>> & Pick<Implicits, 'last'>) | undefined;
		if (implicits === undefined) {
			return undefined;
		}
		const first = implicits.first ?? ((getLast(ids.explicits ?? fail('malformed IdRange')) - 1) as UnackedLocalId);
		const last = implicits.last;
		return { first, last, count: first - last + 1 };
	}
}

function getLast(explicits: IdRange.Explicits & Partial<IdRange.HasOverrides>): UnackedLocalId {
	let last = explicits.last;
	if (explicits.overrides !== undefined) {
		last ??= explicits.overrides[explicits.overrides.length - 1][0];
	}
	return last ?? fail('malformed IdRange');
}
