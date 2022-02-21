/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from 'chai';
import { assert } from '@fluidframework/common-utils';
import { v4 } from 'uuid';
import { Definition, NodeId } from '../Identifiers';
import {
	internalizeBuildNode,
	PlaceValidationResult,
	RangeValidationResultKind,
	validateStablePlace,
	validateStableRange,
} from '../default-edits';
import { convertTreeNodes } from '../generic/GenericEditUtilities';
import { ChangeNode, Side } from '../generic';
import {
	simpleRevisionViewWithValidation,
	left,
	right,
	leftTraitLocation,
	rootNodeId,
	makeEmptyNode,
	simpleTestTree,
	deepCompareNodes,
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

	describe('Tree node conversion', () => {
		it('can clone a tree', () => {
			const clone = convertTreeNodes<ChangeNode, ChangeNode>(simpleTestTree, identity);
			expect(deepCompareNodes(simpleTestTree, clone)).to.be.true;
		});

		it('can clone a leaf', () => {
			let converted = false;
			expect(
				convertTreeNodes(
					42,
					(n) => {
						converted = true;
						return n;
					},
					isNumber
				)
			).to.equal(42);
			expect(converted).to.be.false;
		});

		it('can clone a tree with a leaf', () => {
			const leaf = makeEmptyNode();
			const tree = { ...makeEmptyNode(), payload: 'payload', traits: { main: [leaf] } };
			const clone = convertTreeNodes<ChangeNode, ChangeNode>(tree, identity);
			assert(typeof clone !== 'number', '');
			expect(clone.definition).to.equal(tree.definition);
			expect(clone.identifier).to.equal(tree.identifier);
			expect(clone.payload).to.equal(tree.payload);
			expect(clone.traits).to.deep.equal({ main: [leaf] });
		});

		it('correctly invokes the convert function', () => {
			const node = { ...makeEmptyNode(), payload: 'payload' };
			let converted = false;
			convertTreeNodes(
				node,
				(n) => {
					converted = true;
					expect(node.definition).to.equal(node.definition);
					expect(node.identifier).to.equal(node.identifier);
					expect(node.payload).to.equal(node.payload);
					return n;
				},
				isNumber
			);
			expect(converted).to.be.true;
		});

		it('can convert a node', () => {
			const node = { ...makeEmptyNode(), payload: 'payload' };
			const converted = convertTreeNodes(
				node,
				(_) => ({ definition: '_def' as Definition, identifier: '_id' as NodeId, payload: 'payload2' }),
				isNumber
			);
			expect(converted).to.deep.equal({ definition: '_def', identifier: '_id', payload: 'payload2', traits: {} });
		});

		it('can convert a tree with children', () => {
			const childA = { ...makeEmptyNode(), payload: 'a' };
			const childB = { ...makeEmptyNode(), payload: 'b' };
			const node = { ...makeEmptyNode(), traits: { main: [childA, childB] } };
			const converted = convertTreeNodes<ChangeNode, ChangeNode>(node, (node) => {
				if (node.identifier === childB.identifier) {
					return { definition: node.definition, identifier: node.identifier, payload: 'c' };
				}
				return node;
			});
			expect(converted).to.deep.equal({
				definition: node.definition,
				identifier: node.identifier,
				traits: {
					main: [
						{ definition: childA.definition, identifier: childA.identifier, payload: 'a', traits: {} },
						{ definition: childB.definition, identifier: childB.identifier, payload: 'c', traits: {} },
					],
				},
			});
		});
	});

	describe('Build tree internalization', () => {
		it('does not copy extraneous properties from input tree', () => {
			const node = {
				...makeEmptyNode(),
				extra: 'This is extra data that should not be copied',
			};
			const converted = convertTreeNodes(
				node,
				(node) => internalizeBuildNode(node, { generateNodeId: () => v4() as NodeId }),
				isNumber
			);
			expect(converted).to.deep.equal({
				definition: node.definition,
				identifier: node.identifier,
				traits: node.traits,
			});
		});

		it('does not add undefined payload field', () => {
			const node = makeEmptyNode();
			expect(Object.prototype.hasOwnProperty.call(node, 'payload')).to.be.false;
			const converted = convertTreeNodes(
				node,
				(node) => internalizeBuildNode(node, { generateNodeId: () => v4() as NodeId }),
				isNumber
			);
			expect(Object.prototype.hasOwnProperty.call(converted, 'payload')).to.be.false;
		});
	});

	function identity<T>(x: T): T {
		return x;
	}

	function isNumber(node: number | unknown): node is number {
		return typeof node === 'number';
	}
});
