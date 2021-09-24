/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { NodeId } from '../Identifiers';
import { Side } from '../TreeView';
import {
	PlaceValidationResult,
	RangeValidationResultKind,
	validateStablePlace,
	validateStableRange,
} from '../default-edits';
import {
	simpleRevisionViewWithValidation,
	left,
	right,
	leftTraitLocation,
	rootNodeId,
} from './utilities/TestUtilities';

describe('EditUtilities', () => {
	describe('validateStablePlace', () => {
		it('accepts valid places', () => {
			expect(
				validateStablePlace(simpleRevisionViewWithValidation, {
					referenceSibling: left.identifier,
					side: Side.Before,
				})
			).equals(PlaceValidationResult.Valid);
		});

		it('detects malformed places', () => {
			expect(
				validateStablePlace(simpleRevisionViewWithValidation, {
					referenceTrait: leftTraitLocation,
					referenceSibling: left.identifier,
					side: Side.Before,
				})
			).equals(PlaceValidationResult.Malformed);
		});

		it('detects missing siblings', () => {
			expect(
				validateStablePlace(simpleRevisionViewWithValidation, {
					referenceSibling: '49a7e636-71ed-45f1-a1a8-2b8f2e7e84a3' as NodeId,
					side: Side.Before,
				})
			).equals(PlaceValidationResult.MissingSibling);
		});

		it('detects missing parents', () => {
			expect(
				validateStablePlace(simpleRevisionViewWithValidation, {
					referenceTrait: {
						parent: '49a7e636-71ed-45f1-a1a8-2b8f2e7e84a3' as NodeId,
						label: leftTraitLocation.label,
					},
					side: Side.Before,
				})
			).equals(PlaceValidationResult.MissingParent);
		});

		it('detects root places', () => {
			expect(
				validateStablePlace(simpleRevisionViewWithValidation, {
					referenceSibling: rootNodeId,
					side: Side.Before,
				})
			).equals(PlaceValidationResult.SiblingIsRootOrDetached);
		});
	});

	describe('validateStableRange', () => {
		it('accepts valid ranges', () => {
			expect(
				validateStableRange(simpleRevisionViewWithValidation, {
					start: { referenceSibling: left.identifier, side: Side.Before },
					end: { referenceSibling: left.identifier, side: Side.After },
				})
			).equals(RangeValidationResultKind.Valid);
		});

		it('detects inverted ranges', () => {
			expect(
				validateStableRange(simpleRevisionViewWithValidation, {
					start: { referenceSibling: left.identifier, side: Side.After },
					end: { referenceSibling: left.identifier, side: Side.Before },
				})
			).equals(RangeValidationResultKind.Inverted);
		});

		it('detects when place are in different traits', () => {
			expect(
				validateStableRange(simpleRevisionViewWithValidation, {
					start: { referenceSibling: left.identifier, side: Side.Before },
					end: { referenceSibling: right.identifier, side: Side.After },
				})
			).equals(RangeValidationResultKind.PlacesInDifferentTraits);
		});

		it('detects malformed places', () => {
			const start = { referenceTrait: leftTraitLocation, referenceSibling: left.identifier, side: Side.Before };
			expect(
				validateStableRange(simpleRevisionViewWithValidation, {
					// trait and sibling should be mutually exclusive
					start,
					end: { referenceSibling: left.identifier, side: Side.After },
				})
			).deep.equals({
				kind: RangeValidationResultKind.BadPlace,
				place: start,
				placeFailure: PlaceValidationResult.Malformed,
			});
		});

		it('detects invalid places', () => {
			const start = { referenceSibling: '49a7e636-71ed-45f1-a1a8-2b8f2e7e84a3' as NodeId, side: Side.Before };
			expect(
				validateStableRange(simpleRevisionViewWithValidation, {
					start,
					end: { referenceSibling: right.identifier, side: Side.After },
				})
			).deep.equals({
				kind: RangeValidationResultKind.BadPlace,
				place: start,
				placeFailure: PlaceValidationResult.MissingSibling,
			});
		});
	});
});
