/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export const RBColor = {
	RED: 0,
	BLACK: 1,
} as const;

/**
 * @internal
 */
export type RBColor = (typeof RBColor)[keyof typeof RBColor];

/**
 * @internal
 */
export interface RBNode<TKey, TData> {
	key: TKey;
	data: TData;
	left: RBNode<TKey, TData> | undefined;
	right: RBNode<TKey, TData> | undefined;
	color: RBColor;
	size: number;
}
/**
 * @internal
 */
export interface IRBAugmentation<TKey, TData> {
	update(node: RBNode<TKey, TData>): void;
}
/**
 * @internal
 */
export interface IRBMatcher<TKey, TData> {
	continueSubtree(node: RBNode<TKey, TData> | undefined, key: TKey): boolean;
	matchNode(node: RBNode<TKey, TData> | undefined, key: TKey): boolean;
}

/**
 * @internal
 */
export interface RBNodeActions<TKey, TData> {
	infix?(node: RBNode<TKey, TData>): boolean;
	pre?(node: RBNode<TKey, TData>): boolean;
	post?(node: RBNode<TKey, TData>): boolean;
	showStructure?: boolean;
}

/**
 * @internal
 */
export interface KeyComparer<TKey> {
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	(a: TKey, b: TKey): number;
}

/**
 * @internal
 */
export interface Property<TKey, TData> {
	key: TKey;
	data: TData;
}

/**
 * @internal
 */
export interface PropertyAction<TKey, TData> {
	// eslint-disable-next-line @typescript-eslint/prefer-function-type
	<TAccum>(p: Property<TKey, TData>, accum?: TAccum): boolean;
}

/**
 * @internal
 */
export interface QProperty<TKey, TData> {
	key?: TKey;
	data?: TData;
}

/**
 * @internal
 */
export type ConflictAction<TKey, TData> = (
	key: TKey,
	currentKey: TKey,
	data: TData,
	currentData: TData,
) => QProperty<TKey, TData>;

/**
 * @internal
 */
export interface SortedDictionary<TKey, TData> extends Dictionary<TKey, TData> {
	max(): Property<TKey, TData> | undefined;
	min(): Property<TKey, TData> | undefined;
	mapRange<TAccum>(
		action: PropertyAction<TKey, TData>,
		accum?: TAccum,
		start?: TKey,
		end?: TKey,
	): void;
}

/**
 * @internal
 */
export interface Dictionary<TKey, TData> {
	get(key: TKey): Property<TKey, TData> | undefined;
	put(key: TKey, data: TData, conflict?: ConflictAction<TKey, TData>): void;
	remove(key: TKey): void;
	map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum): void;
}

/**
 * @internal
 */
export class RedBlackTree<TKey, TData> implements SortedDictionary<TKey, TData> {
	private root: RBNode<TKey, TData> | undefined;

	constructor(
		private readonly compareKeys: KeyComparer<TKey>,
		private readonly aug?: IRBAugmentation<TKey, TData>,
	) {}

	private makeNode(key: TKey, data: TData, color: RBColor, size: number): RBNode<TKey, TData> {
		return { key, data, color, size } as any as RBNode<TKey, TData>;
	}

	private isRed(node: RBNode<TKey, TData> | undefined) {
		return !!node && node.color === RBColor.RED;
	}

	private nodeSize(node: RBNode<TKey, TData> | undefined) {
		return node ? node.size : 0;
	}
	public size() {
		return this.nodeSize(this.root);
	}
	public isEmpty() {
		return !this.root;
	}
	public get(key: TKey) {
		if (key !== undefined) {
			return this.nodeGet(this.root, key);
		}
	}
	private nodeGet(node: RBNode<TKey, TData> | undefined, key: TKey) {
		let _node = node;
		while (_node) {
			const cmp = this.compareKeys(key, _node.key);
			if (cmp < 0) {
				_node = _node.left;
			} else if (cmp > 0) {
				_node = _node.right;
			} else {
				return _node;
			}
		}
	}
	private contains(key: TKey) {
		return this.get(key);
	}

	public gather(key: TKey, matcher: IRBMatcher<TKey, TData>) {
		const results = [] as RBNode<TKey, TData>[];
		if (key !== undefined) {
			this.nodeGather(this.root, results, key, matcher);
		}
		return results;
	}

	private nodeGather(
		node: RBNode<TKey, TData> | undefined,
		results: RBNode<TKey, TData>[],
		key: TKey,
		matcher: IRBMatcher<TKey, TData>,
	) {
		if (node) {
			if (matcher.continueSubtree(node.left, key)) {
				this.nodeGather(node.left, results, key, matcher);
			}
			if (matcher.matchNode(node, key)) {
				results.push(node);
			}
			if (matcher.continueSubtree(node.right, key)) {
				this.nodeGather(node.right, results, key, matcher);
			}
		}
	}

	public walkExactMatchesForward(
		compareFn: (node: RBNode<TKey, TData>) => number,
		actionFn: (node: RBNode<TKey, TData>) => void,
		continueLeftFn: (number: number) => boolean,
		continueRightFn: (number: number) => boolean,
	) {
		this.nodeWalkExactMatchesForward(
			this.root,
			compareFn,
			actionFn,
			continueLeftFn,
			continueRightFn,
		);
	}

	private nodeWalkExactMatchesForward(
		node: RBNode<TKey, TData> | undefined,
		compareFn: (node: RBNode<TKey, TData>) => number,
		actionFn: (node: RBNode<TKey, TData>) => void,
		continueLeftFn: (number: number) => boolean,
		continueRightFn: (number: number) => boolean,
	) {
		if (!node) {
			return;
		}
		const result: number = compareFn(node);
		if (continueLeftFn(result)) {
			this.nodeWalkExactMatchesForward(
				node.left,
				compareFn,
				actionFn,
				continueLeftFn,
				continueRightFn,
			);
		}
		if (result === 0) {
			actionFn(node);
		}
		if (continueRightFn(result)) {
			this.nodeWalkExactMatchesForward(
				node.right,
				compareFn,
				actionFn,
				continueLeftFn,
				continueRightFn,
			);
		}
	}

	public walkExactMatchesBackward(
		compareFn: (node: RBNode<TKey, TData>) => number,
		actionFn: (node: RBNode<TKey, TData>) => void,
		continueLeftFn: (number: number) => boolean,
		continueRightFn: (number: number) => boolean,
	) {
		this.nodeWalkExactMatchesBackward(
			this.root,
			compareFn,
			actionFn,
			continueLeftFn,
			continueRightFn,
		);
	}

	private nodeWalkExactMatchesBackward(
		node: RBNode<TKey, TData> | undefined,
		compareFn: (node: RBNode<TKey, TData>) => number,
		actionFn: (node: RBNode<TKey, TData>) => void,
		continueLeftFn: (cmp: number) => boolean,
		continueRightFn: (cmp: number) => boolean,
	) {
		if (!node) {
			return;
		}
		const result: number = compareFn(node);
		if (continueRightFn(result)) {
			this.nodeWalkExactMatchesBackward(
				node.right,
				compareFn,
				actionFn,
				continueLeftFn,
				continueRightFn,
			);
		}
		if (result === 0) {
			actionFn(node);
		}
		if (continueLeftFn(result)) {
			this.nodeWalkExactMatchesBackward(
				node.left,
				compareFn,
				actionFn,
				continueLeftFn,
				continueRightFn,
			);
		}
	}

	public put(key: TKey, data: TData, conflict?: ConflictAction<TKey, TData>) {
		if (key !== undefined) {
			if (data === undefined) {
				this.remove(key);
			} else {
				this.root = this.nodePut(this.root, key, data, conflict);
				this.root.color = RBColor.BLACK;
			}
		}
	}

	private nodePut(
		node: RBNode<TKey, TData> | undefined,
		key: TKey,
		data: TData,
		conflict?: ConflictAction<TKey, TData>,
	) {
		let _node = node;
		if (!_node) {
			return this.makeNode(key, data, RBColor.RED, 1);
		} else {
			const cmp = this.compareKeys(key, _node.key);
			if (cmp < 0) {
				_node.left = this.nodePut(_node.left, key, data, conflict);
			} else if (cmp > 0) {
				_node.right = this.nodePut(_node.right, key, data, conflict);
			} else {
				if (conflict) {
					const kd = conflict(key, _node.key, data, _node.data);
					if (kd.key) {
						_node.key = kd.key;
					}
					_node.data = kd.data ? kd.data : data;
				} else {
					_node.data = data;
				}
			}
			if (this.isRed(_node.right) && !this.isRed(_node.left)) {
				_node = this.rotateLeft(_node);
			}
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			if (this.isRed(_node.left) && this.isRed(_node.left!.left)) {
				_node = this.rotateRight(_node);
			}
			if (this.isRed(_node.left) && this.isRed(_node.right)) {
				this.flipColors(_node);
			}
			_node.size = this.nodeSize(_node.left) + this.nodeSize(_node.right) + 1;
			if (this.aug) {
				this.updateLocal(_node);
			}
			return _node;
		}
	}

	private updateLocal(node: RBNode<TKey, TData>) {
		if (this.aug) {
			if (this.isRed(node.left)) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.aug.update(node.left!);
			}
			if (this.isRed(node.right)) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.aug.update(node.right!);
			}
			this.aug.update(node);
		}
	}

	private nodeRemoveMin(node: RBNode<TKey, TData>) {
		let _node = node;
		if (_node.left) {
			if (!this.isRed(_node.left) && !this.isRed(_node.left.left)) {
				_node = this.moveRedLeft(_node);
			}

			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			_node.left = this.nodeRemoveMin(_node.left!);
			return this.balance(_node);
		}
	}

	public remove(key: TKey) {
		if (key !== undefined) {
			if (!this.contains(key)) {
				return;
			}

			this.removeExisting(key);
		}
		// TODO: error on undefined key
	}

	public removeExisting(key: TKey) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (!this.isRed(this.root!.left) && !this.isRed(this.root!.right)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.root!.color = RBColor.RED;
		}

		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.root = this.nodeRemove(this.root!, key);
	}

	private nodeRemove(node: RBNode<TKey, TData>, key: TKey) {
		let _node = node;
		if (this.compareKeys(key, _node.key) < 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			if (!this.isRed(_node.left) && !this.isRed(_node.left!.left)) {
				_node = this.moveRedLeft(_node);
			}
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			_node.left = this.nodeRemove(_node.left!, key);
		} else {
			if (this.isRed(_node.left)) {
				_node = this.rotateRight(_node);
			}
			if (this.compareKeys(key, _node.key) === 0 && !_node.right) {
				return undefined;
			}
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			if (!this.isRed(_node.right) && !this.isRed(_node.right!.left)) {
				_node = this.moveRedRight(_node);
			}
			if (this.compareKeys(key, _node.key) === 0) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const subtreeMin = this.nodeMin(_node.right!);
				_node.key = subtreeMin.key;
				_node.data = subtreeMin.data;
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				_node.right = this.nodeRemoveMin(_node.right!);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				_node.right = this.nodeRemove(_node.right!, key);
			}
		}
		return this.balance(_node);
	}

	/**
	 * @returns The largest node in this tree which compares less than or equal to `key`
	 */
	public floor(key: TKey) {
		if (!this.isEmpty()) {
			return this.nodeFloor(this.root, key);
		}
	}

	private nodeFloor(
		node: RBNode<TKey, TData> | undefined,
		key: TKey,
	): RBNode<TKey, TData> | undefined {
		if (node) {
			const cmp = this.compareKeys(key, node.key);
			if (cmp === 0) {
				return node;
			} else if (cmp < 0) {
				return this.nodeFloor(node.left, key);
			} else {
				const rightFloor = this.nodeFloor(node.right, key);
				return rightFloor ? rightFloor : node;
			}
		}
	}

	/**
	 * @returns The smallest node in this tree which compares greater than or equal to `key`
	 */
	public ceil(key: TKey) {
		if (!this.isEmpty()) {
			return this.nodeCeil(this.root, key);
		}
	}

	private nodeCeil(
		node: RBNode<TKey, TData> | undefined,
		key: TKey,
	): RBNode<TKey, TData> | undefined {
		if (node) {
			const cmp = this.compareKeys(key, node.key);
			if (cmp === 0) {
				return node;
			} else if (cmp > 0) {
				return this.nodeCeil(node.right, key);
			} else {
				const leftCeil = this.nodeCeil(node.left, key);
				return leftCeil ? leftCeil : node;
			}
		}
	}

	public min() {
		if (this.root) {
			return this.nodeMin(this.root);
		}
	}

	private nodeMin(node: RBNode<TKey, TData>): RBNode<TKey, TData> {
		return !node.left ? node : this.nodeMin(node.left);
	}

	public max() {
		if (this.root) {
			return this.nodeMax(this.root);
		}
	}

	private nodeMax(node: RBNode<TKey, TData>): RBNode<TKey, TData> {
		return !node.right ? node : this.nodeMax(node.right);
	}

	private rotateRight(node: RBNode<TKey, TData>) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const leftChild = node.left!;
		node.left = leftChild.right;
		leftChild.right = node;
		leftChild.color = leftChild.right.color;
		leftChild.right.color = RBColor.RED;
		leftChild.size = node.size;
		node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
		if (this.aug) {
			this.updateLocal(node);
			this.updateLocal(leftChild);
		}
		return leftChild;
	}

	private rotateLeft(node: RBNode<TKey, TData>) {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const rightChild = node.right!;
		node.right = rightChild.left;
		rightChild.left = node;
		rightChild.color = rightChild.left.color;
		rightChild.left.color = RBColor.RED;
		rightChild.size = node.size;
		node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
		if (this.aug) {
			this.updateLocal(node);
			this.updateLocal(rightChild);
		}
		return rightChild;
	}

	private oppositeColor(c: RBColor) {
		return c === RBColor.BLACK ? RBColor.RED : RBColor.BLACK;
	}

	private flipColors(node: RBNode<TKey, TData>) {
		node.color = this.oppositeColor(node.color);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		node.left!.color = this.oppositeColor(node.left!.color);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		node.right!.color = this.oppositeColor(node.right!.color);
	}

	private moveRedLeft(node: RBNode<TKey, TData>) {
		let _node = node;
		this.flipColors(_node);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (this.isRed(_node.right!.left)) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			_node.right = this.rotateRight(_node.right!);
			_node = this.rotateLeft(_node);
			this.flipColors(_node);
		}
		return _node;
	}

	private moveRedRight(node: RBNode<TKey, TData>) {
		let _node = node;
		this.flipColors(_node);
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (this.isRed(_node.left!.left)) {
			_node = this.rotateRight(_node);
			this.flipColors(_node);
		}
		return _node;
	}

	private balance(input: RBNode<TKey, TData>) {
		let node: RBNode<TKey, TData> | undefined = input;
		if (this.isRed(node.right)) {
			node = this.rotateLeft(node);
		}
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		if (this.isRed(node.left) && this.isRed(node.left!.left)) {
			node = this.rotateRight(node);
		}
		if (this.isRed(node.left) && this.isRed(node.right)) {
			this.flipColors(node);
		}
		node.size = this.nodeSize(node.left) + this.nodeSize(node.right) + 1;
		if (this.aug) {
			this.aug.update(node);
		}
		return node;
	}

	public mapRange<TAccum>(
		action: PropertyAction<TKey, TData>,
		accum?: TAccum,
		start?: TKey,
		end?: TKey,
	) {
		this.nodeMap(this.root, action, accum, start, end);
	}

	public map<TAccum>(action: PropertyAction<TKey, TData>, accum?: TAccum) {
		// TODO: optimize to avoid comparisons
		this.nodeMap(this.root, action, accum);
	}

	public keys() {
		const keyList: TKey[] = [];
		const actions: RBNodeActions<TKey, TData> = {
			showStructure: true,
			infix: (node) => {
				keyList.push(node.key);
				return true;
			},
		};
		this.walk(actions);
		return keyList;
	}

	/**
	 * Depth-first traversal with custom action; if action returns
	 * false, traversal is halted.
	 * @param action - action to apply to each node
	 */
	public walk(actions: RBNodeActions<TKey, TData>) {
		this.nodeWalk(this.root, actions);
	}

	public walkBackward(actions: RBNodeActions<TKey, TData>) {
		this.nodeWalkBackward(this.root, actions);
	}

	private nodeWalk(
		node: RBNode<TKey, TData> | undefined,
		actions: RBNodeActions<TKey, TData>,
	): boolean {
		let go = true;
		if (node) {
			if (actions.pre) {
				if (!!actions.showStructure || node.color === RBColor.BLACK) {
					go = actions.pre(node);
				}
			}
			if (node.left) {
				go = this.nodeWalk(node.left, actions);
			}
			if (go && actions.infix) {
				if (!!actions.showStructure || node.color === RBColor.BLACK) {
					go = actions.infix(node);
				}
			}
			if (go) {
				go = this.nodeWalk(node.right, actions);
			}
			if (go && actions.post) {
				if (!!actions.showStructure || node.color === RBColor.BLACK) {
					go = actions.post(node);
				}
			}
		}
		return go;
	}

	private nodeWalkBackward(
		node: RBNode<TKey, TData> | undefined,
		actions: RBNodeActions<TKey, TData>,
	): boolean {
		let go = true;
		if (node) {
			if (actions.pre) {
				if (!!actions.showStructure || node.color === RBColor.BLACK) {
					go = actions.pre(node);
				}
			}
			if (node.right) {
				go = this.nodeWalkBackward(node.right, actions);
			}
			if (go && actions.infix) {
				if (!!actions.showStructure || node.color === RBColor.BLACK) {
					go = actions.infix(node);
				}
			}
			if (go) {
				go = this.nodeWalkBackward(node.left, actions);
			}
			if (go && actions.post) {
				if (!!actions.showStructure || node.color === RBColor.BLACK) {
					go = actions.post(node);
				}
			}
		}
		return go;
	}

	private nodeMap<TAccum>(
		node: RBNode<TKey, TData> | undefined,
		action: PropertyAction<TKey, TData>,
		accum?: TAccum,
		start?: TKey,
		end?: TKey,
	): boolean {
		let _start = start;
		let _end = end;
		if (!node) {
			return true;
		}
		if (_start === undefined) {
			_start = this.nodeMin(node).key;
		}
		if (_end === undefined) {
			_end = this.nodeMax(node).key;
		}
		const cmpStart = this.compareKeys(_start, node.key);
		const cmpEnd = this.compareKeys(_end, node.key);
		let go = true;
		if (cmpStart < 0) {
			go = this.nodeMap(node.left, action, accum, _start, _end);
		}
		if (go && cmpStart <= 0 && cmpEnd >= 0) {
			// REVIEW: test for black node here
			go = action(node, accum);
		}
		if (go && cmpEnd > 0) {
			go = this.nodeMap(node.right, action, accum, _start, _end);
		}
		return go;
	}
}
