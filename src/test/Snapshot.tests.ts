/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { NodeId } from '../Identifiers';
import { Side } from '../PersistedTypes';
import { simpleTreeSnapshot, left, right, leftTraitLocation } from './utilities/TestUtilities';
import { EditValidationResult } from '../Snapshot';

describe('Snapshot', () => {
	describe('StableRange validation', () => {
		it('is malformed when anchors are malformed', () => {
			expect(
				simpleTreeSnapshot.validateStableRange({
					// trait and sibling should be mutually exclusive
					start: { referenceTrait: leftTraitLocation, referenceSibling: left.identifier, side: Side.Before },
					end: { referenceSibling: left.identifier, side: Side.After },
				})
			).equals(EditValidationResult.Malformed);
		});
		it('is invalid when anchors are incorrectly ordered', () => {
			expect(
				simpleTreeSnapshot.validateStableRange({
					start: { referenceSibling: left.identifier, side: Side.After },
					end: { referenceSibling: left.identifier, side: Side.Before },
				})
			).equals(EditValidationResult.Invalid);
		});
		it('is invalid when anchors are in different traits', () => {
			expect(
				simpleTreeSnapshot.validateStableRange({
					start: { referenceSibling: left.identifier, side: Side.Before },
					end: { referenceSibling: right.identifier, side: Side.After },
				})
			).equals(EditValidationResult.Invalid);
		});
		it('is invalid when an anchor is invalid', () => {
			expect(
				simpleTreeSnapshot.validateStableRange({
					start: { referenceSibling: '49a7e636-71ed-45f1-a1a8-2b8f2e7e84a3' as NodeId, side: Side.Before },
					end: { referenceSibling: right.identifier, side: Side.After },
				})
			).equals(EditValidationResult.Invalid);
		});
	});
});
