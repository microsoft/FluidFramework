/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle, fluidHandleSymbol } from '@fluidframework/core-interfaces';
import type { IFluidHandleInternal } from '@fluidframework/core-interfaces/internal';
import { assert } from '@fluidframework/core-utils/internal';
import { FluidSerializer } from '@fluidframework/shared-object-base/internal';
import { MockFluidDataStoreRuntime } from '@fluidframework/test-runtime-utils/internal';
import { expect } from 'chai';

import { BuildNode, BuildTreeNode } from '../ChangeTypes.js';
import { noop } from '../Common.js';
import {
	PlaceValidationResult,
	RangeValidationResultKind,
	convertTreeNodes,
	deepCompareNodes,
	internalizeBuildNode,
	validateStablePlace,
	validateStableRange,
	walkTree,
} from '../EditUtilities.js';
import { Definition, NodeId } from '../Identifiers.js';
import { comparePayloads } from '../PayloadUtilities.js';
import { getChangeNodeFromView } from '../SerializationUtilities.js';
import { BuildNodeInternal, ChangeNode, Payload, Side, TreeNode } from '../persisted-types/index.js';

import { refreshTestTree } from './utilities/TestUtilities.js';

describe('EditUtilities', () => {
	const testTree = refreshTestTree(undefined, undefined, /* expensiveValidation: */ true);

	describe('validateStablePlace', () => {
		it('accepts valid places', () => {
			expect(
				validateStablePlace(testTree.view, {
					referenceSibling: testTree.left.identifier,
					side: Side.Before,
				})
			).deep.equals({
				result: PlaceValidationResult.Valid,
				referenceSibling: testTree.left.identifier,
				side: Side.Before,
			});
		});

		it('detects malformed places', () => {
			expect(
				validateStablePlace(testTree.view, {
					referenceTrait: testTree.left.traitLocation,
					referenceSibling: testTree.left.identifier,
					side: Side.Before,
				})
			).deep.equals({ result: PlaceValidationResult.Malformed });
		});

		it('detects missing siblings', () => {
			expect(
				validateStablePlace(testTree.view, {
					referenceSibling: testTree.generateNodeId(),
					side: Side.Before,
				})
			).deep.equals({ result: PlaceValidationResult.MissingSibling });
		});

		it('detects missing parents', () => {
			expect(
				validateStablePlace(testTree.view, {
					referenceTrait: {
						parent: testTree.generateNodeId(),
						label: testTree.left.traitLabel,
					},
					side: Side.Before,
				})
			).deep.equals({ result: PlaceValidationResult.MissingParent });
		});

		it('detects root places', () => {
			expect(
				validateStablePlace(testTree.view, {
					referenceSibling: testTree.identifier,
					side: Side.Before,
				})
			).deep.equals({ result: PlaceValidationResult.SiblingIsRootOrDetached });
		});
	});

	describe('validateStableRange', () => {
		it('accepts valid ranges', () => {
			const validatedRange = validateStableRange(testTree.view, {
				start: { referenceSibling: testTree.left.identifier, side: Side.Before },
				end: { referenceSibling: testTree.left.identifier, side: Side.After },
			});
			expect(validatedRange.result).to.equal(RangeValidationResultKind.Valid);
			if (validatedRange.result === RangeValidationResultKind.Valid) {
				expect(validatedRange.start.referenceSibling).to.equal(testTree.left.identifier);
				expect(validatedRange.start.referenceTrait).to.be.undefined;
				expect(validatedRange.start.side).to.equal(Side.Before);
				expect(validatedRange.end.referenceSibling).to.equal(testTree.left.identifier);
				expect(validatedRange.end.referenceTrait).to.be.undefined;
				expect(validatedRange.end.side).to.equal(Side.After);
			} else {
				expect.fail();
			}
		});

		it('detects inverted ranges', () => {
			expect(
				validateStableRange(testTree.view, {
					start: { referenceSibling: testTree.left.identifier, side: Side.After },
					end: { referenceSibling: testTree.left.identifier, side: Side.Before },
				})
			).deep.equals({ result: RangeValidationResultKind.Inverted });
		});

		it('detects when place are in different traits', () => {
			expect(
				validateStableRange(testTree.view, {
					start: { referenceSibling: testTree.left.identifier, side: Side.Before },
					end: { referenceSibling: testTree.right.identifier, side: Side.After },
				})
			).deep.equals({ result: RangeValidationResultKind.PlacesInDifferentTraits });
		});

		it('detects malformed places', () => {
			const start = {
				referenceTrait: testTree.left.traitLocation,
				referenceSibling: testTree.left.identifier,
				side: Side.Before,
			};
			expect(
				validateStableRange(testTree.view, {
					// trait and sibling should be mutually exclusive
					start,
					end: { referenceSibling: testTree.left.identifier, side: Side.After },
				})
			).deep.equals({
				result: {
					kind: RangeValidationResultKind.BadPlace,
					place: start,
					placeFailure: PlaceValidationResult.Malformed,
				},
			});
		});

		it('detects invalid places', () => {
			const start = {
				referenceSibling: testTree.generateNodeId(),
				side: Side.Before,
			};
			expect(
				validateStableRange(testTree.view, {
					start,
					end: { referenceSibling: testTree.right.identifier, side: Side.After },
				})
			).deep.equals({
				result: {
					kind: RangeValidationResultKind.BadPlace,
					place: start,
					placeFailure: PlaceValidationResult.MissingSibling,
				},
			});
		});
	});

	describe('Tree node conversion', () => {
		it('can clone a tree', () => {
			const clone = convertTreeNodes<ChangeNode, ChangeNode>(getChangeNodeFromView(testTree.view), (node) => ({
				...node,
			}));
			expect(testTree).to.not.equal(clone);
			expect(deepCompareNodes(testTree, clone)).to.be.true;
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
			const leafTrait = 'main';
			const leafId = testTree.generateNodeId();
			const tree = {
				...testTree.buildLeaf(testTree.generateNodeId()),
				payload: 'payload',
				traits: { [leafTrait]: [testTree.buildLeaf(leafId)] },
			};
			const clone = convertTreeNodes<ChangeNode, ChangeNode>(tree, (node) => ({ ...node }));
			assert(typeof clone !== 'number', 0x660 /*  */);
			expect(clone.definition).to.equal(tree.definition);
			expect(clone.identifier).to.equal(tree.identifier);
			expect(clone.payload).to.equal(tree.payload);
			expect(clone.traits[leafTrait][0].identifier).to.equal(leafId);
		});

		it('correctly invokes the convert function', () => {
			const node = { ...testTree.buildLeaf(testTree.generateNodeId()), payload: 'payload' };
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
			const node = { ...testTree.buildLeaf(testTree.generateNodeId()), payload: 'payload' };
			const id = testTree.generateNodeId();
			const converted = convertTreeNodes(
				node,
				(_) => ({ definition: '_def' as Definition, identifier: id, payload: 'payload2' }),
				isNumber
			);
			expect(converted).to.deep.equal({ definition: '_def', identifier: id, payload: 'payload2', traits: {} });
		});

		it('creates empty trait objects for the root', () => {
			const node: BuildTreeNode = { ...testTree.buildLeaf(testTree.generateNodeId()) };
			const converted = convertTreeNodes<BuildTreeNode, TreeNode<BuildNodeInternal, NodeId>, number>(
				node,
				(n) => internalizeBuildNode(n, testTree),
				isNumber
			);
			assert(typeof converted !== 'number', 0x661 /* unexpected detached ID */);
			expect(converted.traits).to.not.be.undefined;
		});

		it('creates empty trait objects for children', () => {
			const node: BuildNode = { ...testTree.buildLeaf(), traits: { main: { ...testTree.buildLeaf() } } };
			const converted = convertTreeNodes<BuildTreeNode, TreeNode<BuildNodeInternal, NodeId>, number>(
				node,
				(n) => internalizeBuildNode(n, testTree),
				isNumber
			);
			assert(typeof converted !== 'number', 0x662 /* unexpected detached ID */);
			expect(converted.traits).to.not.be.undefined;
		});

		it('can convert a tree with children', () => {
			const childA = { ...testTree.buildLeaf(testTree.generateNodeId()), payload: 'a' };
			const childB = { ...testTree.buildLeaf(testTree.generateNodeId()), payload: 'b' };
			const node = { ...testTree.buildLeaf(testTree.generateNodeId()), traits: { main: [childA, childB] } };
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

		it('can convert a tree with a grandchild', () => {
			const grandchild = { ...testTree.buildLeaf(testTree.generateNodeId()), payload: 'g' };
			const child = { ...testTree.buildLeaf(testTree.generateNodeId()), traits: { main: [grandchild] } };
			const parent = { ...testTree.buildLeaf(testTree.generateNodeId()), traits: { main: [child] } };
			const converted = convertTreeNodes<ChangeNode, ChangeNode>(parent, (node) => {
				if (node.identifier === grandchild.identifier) {
					return { definition: node.definition, identifier: node.identifier, payload: 'h' };
				}
				return node;
			});
			expect(converted).to.deep.equal({
				definition: parent.definition,
				identifier: parent.identifier,
				traits: {
					main: [
						{
							definition: child.definition,
							identifier: child.identifier,
							traits: {
								main: [
									{
										definition: grandchild.definition,
										identifier: grandchild.identifier,
										payload: 'h',
										traits: {},
									},
								],
							},
						},
					],
				},
			});
		});

		it('walks trees in a consistent order', () => {
			// Construct two trees that are the same but have their traits defined in different orders
			const buildTreeA: BuildTreeNode = {
				definition: 'parent',
				traits: {
					left: {
						definition: 'left child',
						traits: {
							left: {
								definition: 'left grandchild under left',
							},
							right: {
								definition: 'right grandchild under left',
							},
							main: [
								{ definition: 'grandchild A under left main' },
								{ definition: 'grandchild B under left main' },
								{ definition: 'grandchild C under left main' },
							],
						},
					},
					right: {
						definition: 'right child',
						traits: {
							left: {
								definition: 'left grandchild under right',
							},
							right: {
								definition: 'right grandchild under right',
							},
							main: [
								{ definition: 'grandchild A under right main' },
								{ definition: 'grandchild B under right main' },
								{ definition: 'grandchild C under right main' },
							],
						},
					},
					main: [
						{ definition: 'child A under main' },
						{ definition: 'child B under main' },
						{ definition: 'child C under main' },
					],
				},
			};

			const buildTreeB: BuildTreeNode = {
				definition: 'parent',
				traits: {
					right: {
						definition: 'right child',
						traits: {
							left: {
								definition: 'left grandchild under right',
							},
							main: [
								{ definition: 'grandchild A under right main' },
								{ definition: 'grandchild B under right main' },
								{ definition: 'grandchild C under right main' },
							],
							right: {
								definition: 'right grandchild under right',
							},
						},
					},
					main: [
						{ definition: 'child A under main' },
						{ definition: 'child B under main' },
						{ definition: 'child C under main' },
					],
					left: {
						definition: 'left child',
						traits: {
							main: [
								{ definition: 'grandchild A under left main' },
								{ definition: 'grandchild B under left main' },
								{ definition: 'grandchild C under left main' },
							],
							right: {
								definition: 'right grandchild under left',
							},
							left: {
								definition: 'left grandchild under left',
							},
						},
					},
				},
			};

			// Record the order in which the tree walk visits each node in each tree
			const definitionsA: string[] = [];
			walkTree<BuildTreeNode, number>(
				buildTreeA,
				(n) => definitionsA.push(n.definition),
				(x): x is number => typeof x === 'number'
			);

			const definitionsB: string[] = [];
			walkTree<BuildTreeNode, number>(
				buildTreeB,
				(n) => definitionsB.push(n.definition),
				(x): x is number => typeof x === 'number'
			);

			// The orders should be the same, even though the trees had their traits defined in different orders
			expect(definitionsA).to.deep.equal(definitionsB);
		});
	});

	describe('Build tree internalization', () => {
		it('does not copy extraneous properties from input tree', () => {
			const node: BuildTreeNode = {
				...testTree.buildLeaf(testTree.generateNodeId()),
				traits: { main: [testTree.buildLeaf(testTree.generateNodeId())] },
			};
			(node as unknown as { extra: string }).extra = 'This is extra data that should not be copied';
			const converted = convertTreeNodes<BuildTreeNode, TreeNode<BuildNodeInternal, NodeId>, number>(
				node,
				(node) => internalizeBuildNode(node, testTree),
				isNumber
			);
			expect(converted).to.deep.equal({
				definition: node.definition,
				identifier: node.identifier,
				traits: node.traits,
			});
		});

		it('does not copy extraneous properties from converter', () => {
			const node = testTree.buildLeaf(testTree.generateNodeId());
			expect(Object.prototype.hasOwnProperty.call(node, 'payload')).to.be.false;
			const converted = convertTreeNodes(node, (node) => internalizeBuildNode(node, testTree), isNumber);
			expect(Object.prototype.hasOwnProperty.call(converted, 'payload')).to.be.false;
		});
	});

	function isNumber(node: number | unknown): node is number {
		return typeof node === 'number';
	}

	describe('comparePayloads', () => {
		const serializer: FluidSerializer = new FluidSerializer(
			new MockFluidDataStoreRuntime().IFluidHandleContext,
			() => {}
		);
		const binder: IFluidHandle = {
			bind: noop,
			get [fluidHandleSymbol]() {
				return binder;
			},
		} as unknown as IFluidHandle;

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
			check(null, 'null', allUnequal);
			check(null, 'null', allUnequal);
			check(1, '1', allUnequal);
			check(null, 0, allUnequal);
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
			// This is used instead of MockHandle so equal handles compare deeply equal.
			function makeMockHandle(data: string): IFluidHandle {
				// `/` prefix is needed to prevent serializing from modifying handle.
				const handleObject = {
					absolutePath: `/${data}`,
					IFluidHandle: undefined as unknown,
					[fluidHandleSymbol]: undefined as any,
				};
				handleObject.IFluidHandle = handleObject;
				handleObject[fluidHandleSymbol] = handleObject;
				return handleObject as unknown as IFluidHandleInternal;
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
			check(undefined, null, sameAfter);
		});
	});
});
