/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from '@fluidframework/core-interfaces';
import { FluidSerializer } from '@fluidframework/runtime-utils';
import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils';
import { expect } from 'chai';
import { comparePayloads } from '../Common';
import { Payload } from '../generic';

describe('SnapshotUtilities', () => {
	describe('comparePayloads', () => {
		const serializer: FluidSerializer = new MockFluidDataStoreRuntime().IFluidSerializer;
		const binder: IFluidHandle = { bind: () => void {} } as unknown as IFluidHandle;

		enum Equality {
			Equal,
			Unequal,
			Unspecified,
		}

		function checkEquality(equal: boolean, equality: Equality): void {
			if (equality !== Equality.Unspecified) {
				expect(equal).equals(equality === Equality.Equal);
			}
		}

		function check(
			a: Payload,
			b: Payload,
			flags: { initial: Equality; serialized: Equality; deserialized: Equality; roundtrip: Equality }
		): void {
			// Check reflexive
			expect(comparePayloads(a, a)).equal(true);
			expect(comparePayloads(b, b)).equal(true);

			checkEquality(comparePayloads(a, b), flags.initial);
			// Check commutative
			checkEquality(comparePayloads(b, a), flags.initial);

			const [aString, aDeserialized] = checkSerialization(a, flags.roundtrip);
			const [bString, bDeserialized] = checkSerialization(b, flags.roundtrip);

			checkEquality(aString === bString, flags.serialized);
			checkEquality(comparePayloads(aDeserialized, bDeserialized), flags.deserialized);
			// Check commutative
			checkEquality(comparePayloads(bDeserialized, aDeserialized), flags.deserialized);
		}

		function checkSerialization(a: Payload, roundtrip: Equality): [string, Payload] {
			const aString = serializer.stringify(a, binder);
			const a2: Payload = serializer.parse(aString);
			const aString2 = serializer.stringify(a2, binder);
			expect(aString2).equal(aString);
			checkEquality(comparePayloads(a, a2), roundtrip);

			// Check second round trip, should always be equal
			const a3: Payload = serializer.parse(aString2);
			expect(comparePayloads(a3, a2)).true;

			return [aString, a2];
		}

		const allEqual = {
			initial: Equality.Equal,
			serialized: Equality.Equal,
			deserialized: Equality.Equal,
			roundtrip: Equality.Equal,
		};

		// For when the inputs are logically equal, but may serialize differently due to field ordering.
		const allEqualUnstable = {
			initial: Equality.Equal,
			serialized: Equality.Unspecified,
			deserialized: Equality.Equal,
			roundtrip: Equality.Equal,
		};

		const allUnequal = {
			initial: Equality.Unequal,
			serialized: Equality.Unequal,
			deserialized: Equality.Unequal,
			roundtrip: Equality.Equal,
		};

		it('compares numbers correctly', () => {
			check(0, 0, allEqual);
			check(1, 1, allEqual);
			check(0, 1, allUnequal);
			check(-1, 1, allUnequal);
			check(5.2, 5.200000001, allUnequal);
		});

		it('compares strings', () => {
			check('', '', allEqual);
			check(' ', '', allUnequal);
			check('1', '+1', allUnequal);
			// This character makes sure multi-byte utf-8 and multi-word utf-16 at least somewhat work
			// Cases like unicode normalization are not covered here here. Normalization or not will be considered ok.
			check('𤭢', '𤭢', allEqual);
			check('𤭢', '', allUnequal);
			check('several characters', 'several characters', allEqual);
			check('several characters', 'several_characters', allUnequal);
		});

		it('compares arrays', () => {
			check([], [], allEqual);
			check([1], [1], allEqual);
			check([[1]], [[1]], allEqual);
			check([[1]], [[2]], allUnequal);
			check([], [1], allUnequal);
			check([1, 2], [2, 1], allUnequal);
		});

		it('compares objects', () => {
			check({ 1: 'x' }, { 1: 'x' }, allEqual);
			check({ x: 'x' }, { y: 'x' }, allUnequal);
			check({ x: 'x' }, { x: {} }, allUnequal);
			check({ x: {} }, { x: {} }, allEqual);
			check({ x: [1, 2, 3, 5] }, { x: [1, 2, 3, 4] }, allUnequal);
			check({ 1: 'x' }, {}, allUnequal);
			check({ x: 'x' }, { x: 'x', y: 'x' }, allUnequal);
			check({ field: 'a' }, { field: 'b' }, allUnequal);

			// Fluid Serialization arbitrarily orders fields.
			// Thus any object with more than one field may have non-deterministic serialization.
			// However objects have field order, and we need to check comparePayloads is not impacted by it.
			check({ y: 'a', x: 'b' }, { x: 'b', y: 'a' }, allEqualUnstable);
		});

		it('compares mixed types', () => {
			check({ 0: 1 }, [1], allUnequal);
			// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface)
			/* eslint-disable no-null/no-null */
			check(null, 'null', allUnequal);
			check(null, 'null', allUnequal);
			check(1, '1', allUnequal);
			check(null, 0, allUnequal);
			/* eslint-enable no-null/no-null */
			check('', 0, allUnequal);
		});

		const sameAfter = {
			initial: Equality.Unspecified,
			serialized: Equality.Unspecified,
			deserialized: Equality.Equal,
			roundtrip: Equality.Unspecified,
		};
		const differentAfter = {
			initial: Equality.Unequal,
			serialized: Equality.Unequal,
			deserialized: Equality.Unequal,
			roundtrip: Equality.Unspecified,
		};

		it('lossy cases', () => {
			// Undefined fields are omitted in json, and thus lost on the round trip.
			check({ x: undefined }, { y: undefined }, sameAfter);
			check({ x: undefined }, {}, sameAfter);

			// NaN and Infinity become null
			check(NaN, NaN, sameAfter);
			check(NaN, 7, differentAfter);
			check(Infinity, Infinity, sameAfter);
			check(-Infinity, Infinity, sameAfter);
			check(NaN, 'NaN', differentAfter);

			// json loses -0 on round trip
			check(-0, -0, sameAfter);
		});

		it('compares handles', () => {
			function makeMockHandle(data: string): IFluidHandle {
				const handleObject = { absolutePath: data, IFluidHandle: undefined as unknown };
				handleObject.IFluidHandle = handleObject;
				const handle = handleObject as IFluidHandle;
				// Handle gets modified by serializing. This is probably because handle is malformed.
				// To avoid this being an issue, round trip it.
				const serialized = serializer.stringify(handle, binder);
				const finalHandle: IFluidHandle = serializer.parse(serialized);
				return finalHandle;
			}
			// Theoretically handles serialize as objects with 2 fields and thus serialization is allowed to be non-deterministic
			// so use allEqualUnstable not allEqual.
			check(makeMockHandle('x'), makeMockHandle('x'), allEqualUnstable);
			check(makeMockHandle('x'), makeMockHandle('y'), allUnequal);
			check({ x: makeMockHandle('x') }, makeMockHandle('x'), allUnequal);
		});

		// These are cases that are allowed by the type system and produce unexpected results due to Json serialization.
		// Clear documentation and/or adjustments to equality, type checking or serialization would help with these cases.
		it.skip('strange cases', () => {
			// Top level undefined fails in JSON.parse.
			// Rationale: 'undefined' is reserved for future use (see 'SetValue' interface.)
			// eslint-disable-next-line no-null/no-null
			check(undefined, null, sameAfter);
		});
	});
});
