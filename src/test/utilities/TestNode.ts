/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { memoizeGetter, fail } from '../../Common';
import { ChangeNode, StableTraitLocation, TraitMap } from '../../generic';
import { Definition, NodeId, TraitLabel } from '../../Identifiers';
import { RevisionView } from '../../TreeView';
import { testTrait } from './TestUtilities';

/**
 * An object containing useful properties for analyzing a node within a test context.
 */
export interface TestNode extends ChangeNode {
	/** The label of the trait under which this node resides */
	traitLabel: TraitLabel;
	/** The trait location at which this node resides */
	traitLocation: StableTraitLocation;
	/** A revision view of this node */
	view: RevisionView;
}

/**
 * A small tree of `TestNode`s consisting of a root/parent node, a "left" child and a "right" child.
 */
export interface TestTree extends TestNode {
	/** The left child node */
	left: TestNode;
	/** The right child node */
	right: TestNode;
	/** Create a globally unique identifier for a node */
	generateId(): NodeId;
	/** Create an arbitrary unparented node with a unique identifier */
	buildLeaf(): ChangeNode;
}

/**
 * A TestTree for general use within the shared-tree package. The nodes in every `SimpleTestTree` will have unique identifiers - i.e. two
 * different instances of `SimpleTestTree` are never equivalent.
 */
export class SimpleTestTree implements TestTree {
	public static readonly definition = 'node' as Definition;
	public static readonly traitLabel = 'root' as TraitLabel;
	public static readonly leftTraitLabel = 'left' as TraitLabel;
	public static readonly rightTraitLabel = 'right' as TraitLabel;

	private readonly root: TestNode;
	public readonly left: TestNode;
	public readonly right: TestNode;
	public readonly expensiveValidation;

	public constructor(public generateId: () => NodeId, expensiveValidation = true) {
		const leftIdentifier = this.generateId();
		const rightIdentifier = this.generateId();
		const rootIdentifier = this.generateId();
		this.expensiveValidation = expensiveValidation;
		this.left = {
			definition: SimpleTestTree.definition,
			identifier: leftIdentifier,
			traits: {},
			traitLabel: SimpleTestTree.leftTraitLabel,
			traitLocation: {
				parent: rootIdentifier,
				label: SimpleTestTree.leftTraitLabel,
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
		};
		this.right = {
			definition: SimpleTestTree.definition,
			identifier: rightIdentifier,
			traits: {},
			traitLabel: SimpleTestTree.rightTraitLabel,
			traitLocation: {
				parent: rootIdentifier,
				label: SimpleTestTree.rightTraitLabel,
			},
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
		};
		this.root = {
			definition: SimpleTestTree.definition,
			identifier: rootIdentifier,
			traits: {
				[SimpleTestTree.leftTraitLabel]: [this.left],
				[SimpleTestTree.rightTraitLabel]: [this.right],
			},
			traitLabel: testTrait.label,
			traitLocation: testTrait,
			get view() {
				return memoizeGetter(this, 'view', RevisionView.fromTree(this, expensiveValidation));
			},
		};
	}

	public get view(): RevisionView {
		return memoizeGetter(this, 'view', RevisionView.fromTree(this, this.expensiveValidation));
	}

	public get definition(): Definition {
		return this.root.definition;
	}

	public get identifier(): NodeId {
		return this.root.identifier;
	}

	public get traits(): TraitMap<ChangeNode> {
		return this.root.traits;
	}

	public get traitLabel(): TraitLabel {
		return this.root.traitLabel;
	}

	public get traitLocation(): StableTraitLocation {
		return this.root.traitLocation;
	}

	public buildLeaf(): ChangeNode {
		return {
			definition: SimpleTestTree.definition,
			identifier: this.generateId(),
			traits: {},
		};
	}
}

/** A TestTree which resets before each test */
export class RefreshingTestTree<T extends TestTree> implements TestTree {
	private _testTree?: T;

	public constructor(createTestTree: () => T, fn?: (testTree: T) => void) {
		beforeEach(() => {
			this._testTree = createTestTree();
			fn?.(this._testTree);
		});
	}

	private get testTree(): T {
		return (
			this._testTree ??
			fail(
				'BeforeEachTestTree should be created within a describe() block and should only be read within it() blocks'
			)
		);
	}

	public get left(): TestNode {
		return this.testTree.left;
	}

	public get right(): TestNode {
		return this.testTree.right;
	}

	public get definition(): Definition {
		return this.testTree.definition;
	}

	public get identifier(): NodeId {
		return this.testTree.identifier;
	}

	public get traits(): TraitMap<ChangeNode> {
		return this.testTree.traits;
	}

	public get traitLabel(): TraitLabel {
		return this.testTree.traitLabel;
	}

	public get traitLocation(): StableTraitLocation {
		return this.testTree.traitLocation;
	}

	public get view(): RevisionView {
		return this.testTree.view;
	}

	public generateId(): NodeId {
		return this.testTree.generateId();
	}

	public buildLeaf(): ChangeNode {
		return this.testTree.buildLeaf();
	}
}
