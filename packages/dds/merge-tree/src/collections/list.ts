/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UsageError } from "@fluidframework/telemetry-utils/internal";

/**
 * Represents a node in a doubly linked list.
 * @internal
 */
export interface ListNode<T> {
	/**
	 * The list this node belongs to, or undefined if not attached.
	 */
	readonly list: DoublyLinkedList<T> | undefined;
	/**
	 * The data value stored in this node.
	 */
	readonly data: T;
	/**
	 * The next node in the list, or undefined if this is the last node.
	 */
	readonly next: ListNode<T> | undefined;
	/**
	 * The previous node in the list, or undefined if this is the first node.
	 */
	readonly prev: ListNode<T> | undefined;
	/**
	 * Removes this node from its list.
	 * @returns The removed node, or undefined if not in a list.
	 */
	remove(): ListNode<T> | undefined;
}

/**
 * Represents a range of nodes in a doubly linked list.
 * @internal
 */
export interface ListNodeRange<T> {
	/**
	 * The first node in the range.
	 */
	first: ListNode<T>;
	/**
	 * The last node in the range.
	 */
	last: ListNode<T>;
}

class HeadNode<T> {
	public _next: HeadNode<T> | DataNode<T> = this;
	public _prev: HeadNode<T> | DataNode<T> = this;
	public headNode: HeadNode<T> = this;
	private readonly _list?: DoublyLinkedList<T>;
	constructor(list: DoublyLinkedList<T> | undefined) {
		if (list) {
			this._list = list;
		}
	}
	public get next(): DataNode<T> | undefined {
		return this._next === this.headNode ? undefined : (this._next as DataNode<T>);
	}
	public get prev(): DataNode<T> | undefined {
		return this._prev === this.headNode ? undefined : (this._prev as DataNode<T>);
	}
	public get list(): DoublyLinkedList<T> | undefined {
		return this.headNode._list;
	}
}

// The any is needed for use in the remove function, where the nodes are defined with a generic type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DeadHead = new HeadNode<any>(undefined);

class DataNode<T> extends HeadNode<T> implements ListNode<T> {
	constructor(
		headNode: HeadNode<T>,
		public readonly data: T,
	) {
		super(undefined);
		this.headNode = headNode;
	}
	remove(): ListNode<T> | undefined {
		return this.list?.remove(this);
	}
}

function insertAfter<T>(node: DataNode<T> | HeadNode<T>, items: T[]): ListNodeRange<T> {
	let previousNode = node;
	const oldNext = previousNode._next;
	let newRange: ListNodeRange<T> | undefined;
	for (const n of items) {
		const newNode = new DataNode<T>(node.headNode, n);
		if (newRange === undefined) {
			newRange = { first: newNode, last: newNode };
		} else {
			newRange.last = newNode;
		}
		newNode._prev = previousNode;
		previousNode._next = newNode;
		previousNode = newNode;
	}
	oldNext._prev = previousNode;
	previousNode._next = oldNext;
	// explicitly prevent newRange from being undefined without casting,
	// and without additional conditionals, as this is used in some perf critical areas.
	// i could have just asserted, but that throws a non-user friendly error,
	// so i went with a more user-friendly error, which describes the
	// only condition that could lead to this being undefined in the current code.
	if (newRange === undefined) {
		throw new UsageError("items must not be empty");
	}
	return newRange;
}

/**
 * A doubly linked list implementation with array-like methods and node access.
 * @typeParam T - The type of data stored in the list nodes.
 * @internal
 */
export class DoublyLinkedList<T>
	implements
		Iterable<ListNode<T>>,
		Partial<ListNodeRange<T>>,
		// try to match array signature and semantics where possible
		Pick<ListNode<T>[], "pop" | "shift" | "length" | "includes">
{
	/**
	 * Creates a new doubly linked list optionally initialized with values.
	 * @param values - Optional iterable of values to populate the list.
	 */
	constructor(values?: Iterable<T>) {
		if (values !== undefined) {
			this.push(...values);
		}
	}

	/**
	 * Finds the first node matching the predicate.
	 * @param predicate - Function to test each node.
	 * @returns The first matching node, or undefined if none found.
	 */
	find(
		predicate: (value: ListNode<T>, obj: DoublyLinkedList<T>) => unknown,
	): ListNode<T> | undefined {
		let found: ListNode<T> | undefined;
		walkList(this, (node) => {
			if (predicate(node, this)) {
				found = node;
				return false;
			}
		});
		return found;
	}

	/**
	 * Returns an iterable that maps each node to a new value.
	 * @param callbackfn - Function to produce a new value for each node.
	 */
	map<U>(callbackfn: (value: ListNode<T>) => U): Iterable<U> {
		let node = this.first;
		const iterator: IterableIterator<U> = {
			next(): IteratorResult<U> {
				if (node === undefined) {
					return { done: true, value: undefined };
				}
				const rtn = { value: callbackfn(node), done: false };
				node = node.next;
				return rtn;
			},
			[Symbol.iterator]() {
				return this;
			},
		};
		return iterator;
	}

	/**
	 * Inserts items after the specified node.
	 * @param preceding - The node to insert after.
	 * @param items - Items to insert.
	 * @returns The range of newly inserted nodes.
	 */
	insertAfter(preceding: ListNode<T>, ...items: T[]): ListNodeRange<T> {
		if (!this._includes(preceding)) {
			throw new Error("preceding not in list");
		}
		this._len += items.length;
		return insertAfter(preceding, items);
	}

	/**
	 * Removes and returns the last node in the list.
	 * @returns The removed node, or undefined if the list is empty.
	 */
	pop(): ListNode<T> | undefined {
		return this.remove(this.last);
	}

	/**
	 * Appends items to the end of the list.
	 * @param items - Items to append.
	 * @returns The range of newly inserted nodes.
	 */
	push(...items: T[]): ListNodeRange<T> {
		this._len += items.length;
		const start = this.headNode._prev;
		return insertAfter(start, items);
	}

	/**
	 * Removes and returns the first node in the list.
	 * @returns The removed node, or undefined if the list is empty.
	 */
	shift(): ListNode<T> | undefined {
		return this.remove(this.first);
	}

	/**
	 * Inserts items at the start of the list.
	 * @param items - Items to insert.
	 * @returns The range of newly inserted nodes.
	 */
	unshift(...items: T[]): ListNodeRange<T> {
		this._len += items.length;
		return insertAfter(this.headNode, items);
	}

	/**
	 * Removes nodes starting at `start` until `end` or `count` is reached.
	 * @param start - The node to start removing from.
	 * @param countOrEnd - The number of nodes to remove or the end node.
	 * @returns A new list containing the removed nodes.
	 */
	splice(start: ListNode<T>, countOrEnd?: ListNode<T> | number): DoublyLinkedList<T> {
		const newList = new DoublyLinkedList<T>();
		walkList(
			this,
			(node) => {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const removedNode = this._remove(node)!;
				// whats special here is we preserve the node
				// this allow looking up the old node in the new list
				// when something preserves a reference
				removedNode.headNode = newList.headNode;
				removedNode._next = newList.headNode;
				removedNode._prev = newList.headNode._prev;
				newList.headNode._prev._next = removedNode;
				newList.headNode._prev = removedNode;
				newList._len++;
				if (node === countOrEnd || newList.length === countOrEnd) {
					return false;
				}
			},
			start,
		);
		return newList;
	}

	/**
	 * Checks if the node is in this list.
	 * @param node - The node to check.
	 * @returns True if the node is in the list.
	 */
	public includes(node: ListNode<T> | undefined): node is ListNode<T> {
		return this._includes(node);
	}

	private _includes(node: ListNode<T> | undefined): node is DataNode<T> {
		return node instanceof DataNode && node.headNode === this.headNode;
	}

	private _remove(node: ListNode<T> | undefined): DataNode<T> | undefined {
		if (this._includes(node)) {
			node._prev._next = node._next;
			node._next._prev = node._prev;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			node.headNode = node._next = node._prev = DeadHead;
			this._len--;
			return node;
		}
		return undefined;
	}

	/**
	 * Removes the specified node from the list.
	 * @param node - The node to remove.
	 * @returns The removed node, or undefined if not in the list.
	 */
	public remove(node: ListNode<T> | undefined): ListNode<T> | undefined {
		return this._remove(node);
	}

	public [Symbol.iterator](): IterableIterator<ListNode<T>> {
		let value = this.first;
		const iterator: IterableIterator<ListNode<T>> = {
			next(): IteratorResult<ListNode<T>> {
				if (value !== undefined) {
					const rtn = { value, done: false };
					value = value.next;
					return rtn;
				}
				return { value: undefined, done: true };
			},
			[Symbol.iterator]() {
				return this;
			},
		};
		return iterator;
	}

	private _len: number = 0;
	private readonly headNode: HeadNode<T> | DataNode<T> = new HeadNode(this);

	/**
	 * The number of nodes in the list.
	 */
	public get length(): number {
		return this._len;
	}

	/**
	 * Whether the list is empty.
	 */
	public get empty(): boolean {
		return this._len === 0;
	}

	/**
	 * The first node in the list, or undefined if empty.
	 */
	public get first(): ListNode<T> | undefined {
		return this.headNode.next;
	}

	/**
	 * The last node in the list, or undefined if empty.
	 */
	public get last(): ListNode<T> | undefined {
		return this.headNode.prev;
	}
}

export function walkList<T>(
	list: DoublyLinkedList<T>,
	visitor: (node: ListNode<T>) => boolean | void,
	start?: ListNode<T>,
	forward: boolean = true,
): boolean {
	let current: ListNode<T> | undefined;
	if (start) {
		if (!list.includes(start)) {
			throw new UsageError("start must be in the provided list");
		}
		current = start;
	} else {
		current = forward ? list.first : list.last;
	}
	// cache the next node, incase the visitor mutates the list
	// need this to support splice
	let next = forward ? current?.next : current?.prev;
	while (current !== undefined) {
		if (visitor(current) === false) {
			return false;
		}
		current = next;
		next = forward ? next?.next : next?.prev;
	}
	return true;
}

/**
 * Creates a lazily evaluated iterable which returns values while the predicate returns true,
 * and stops iterating at the first value where the predicate is false.
 * @param start - the node to start the iteration from
 * @param includePredicate - determine if the current value be included in the iteration or stop if iteration
 */
export function iterateListValuesWhile<T>(
	start: ListNode<T> | undefined,
	includePredicate: (n: ListNode<T>) => boolean,
): Iterable<T> {
	let next: ListNode<T> | undefined = start;
	const iterator: IterableIterator<T> = {
		next: (): IteratorResult<T> => {
			if (next !== undefined) {
				const current = next;
				next = current.next;
				if (includePredicate(current) === true) {
					return { value: current.data, done: false };
				}
			}
			return { done: true, value: undefined };
		},
		[Symbol.iterator]() {
			return this;
		},
	};
	return iterator;
}
