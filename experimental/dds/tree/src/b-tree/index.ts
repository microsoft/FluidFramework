/* eslint-disable eqeqeq */
/* eslint-disable prefer-spread */
/* eslint-disable @typescript-eslint/no-this-alias */
/* eslint-disable no-bitwise */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/prefer-optional-chain */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable object-shorthand */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/quotes */
/* eslint-disable no-sequences */
/* eslint-disable @typescript-eslint/no-unused-expressions */
/* eslint-disable default-case */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/prefer-for-of */
/* eslint-disable prefer-const */
/* eslint-disable no-var */
/* eslint-disable one-var */
/* eslint-disable spaced-comment */
/* eslint-disable jsdoc/check-line-alignment */
/* eslint-disable jsdoc/require-hyphen-before-param-description */
/* eslint-disable jsdoc/check-indentation */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable no-param-reassign */
/* eslint-disable tsdoc/syntax */
// B+ tree by David Piepgrass. License: MIT
import { ISortedMap, ISortedMapF, ISortedSet } from './interfaces';

export {
	ISetSource,
	ISetSink,
	ISet,
	ISetF,
	ISortedSetSource,
	ISortedSet,
	ISortedSetF,
	IMapSource,
	IMapSink,
	IMap,
	IMapF,
	ISortedMapSource,
	ISortedMap,
	ISortedMapF,
} from './interfaces';

export type EditRangeResult<V, R = number> = { value?: V; break?: R; delete?: boolean };

type index = number;

// Informative microbenchmarks & stuff:
// http://www.jayconrod.com/posts/52/a-tour-of-v8-object-representation (very educational)
// https://blog.mozilla.org/luke/2012/10/02/optimizing-javascript-variable-access/ (local vars are faster than properties)
// http://benediktmeurer.de/2017/12/13/an-introduction-to-speculative-optimization-in-v8/ (other stuff)
// https://jsperf.com/js-in-operator-vs-alternatives (avoid 'in' operator; `.p!==undefined` faster than `hasOwnProperty('p')` in all browsers)
// https://jsperf.com/instanceof-vs-typeof-vs-constructor-vs-member (speed of type tests varies wildly across browsers)
// https://jsperf.com/detecting-arrays-new (a.constructor===Array is best across browsers, assuming a is an object)
// https://jsperf.com/shallow-cloning-methods (a constructor is faster than Object.create; hand-written clone faster than Object.assign)
// https://jsperf.com/ways-to-fill-an-array (slice-and-replace is fastest)
// https://jsperf.com/math-min-max-vs-ternary-vs-if (Math.min/max is slow on Edge)
// https://jsperf.com/array-vs-property-access-speed (v.x/v.y is faster than a[0]/a[1] in major browsers IF hidden class is constant)
// https://jsperf.com/detect-not-null-or-undefined (`x==null` slightly slower than `x===null||x===undefined` on all browsers)
// Overall, microbenchmarks suggest Firefox is the fastest browser for JavaScript and Edge is the slowest.
// Lessons from https://v8project.blogspot.com/2017/09/elements-kinds-in-v8.html:
//   - Avoid holes in arrays. Avoid `new Array(N)`, it will be "holey" permanently.
//   - Don't read outside bounds of an array (it scans prototype chain).
//   - Small integer arrays are stored differently from doubles
//   - Adding non-numbers to an array deoptimizes it permanently into a general array
//   - Objects can be used like arrays (e.g. have length property) but are slower
//   - V8 source (NewElementsCapacity in src/objects.h): arrays grow by 50% + 16 elements

/**
 * Types that BTree supports by default
 */
export type DefaultComparable =
	| number
	| string
	| Date
	| boolean
	| null
	| undefined
	| (number | string)[]
	| { valueOf: () => number | string | Date | boolean | null | undefined | (number | string)[] };

/**
 * Compares DefaultComparables to form a strict partial ordering.
 *
 * Handles +/-0 and NaN like Map: NaN is equal to NaN, and -0 is equal to +0.
 *
 * Arrays are compared using '<' and '>', which may cause unexpected equality:
 * for example [1] will be considered equal to ['1'].
 *
 * Two objects with equal valueOf compare the same, but compare unequal to
 * primitives that have the same value.
 */
export function defaultComparator(a: DefaultComparable, b: DefaultComparable): number {
	// Special case finite numbers first for performance.
	// Note that the trick of using 'a - b' and checking for NaN to detect non-numbers
	// does not work if the strings are numeric (ex: "5"). This would leading most
	// comparison functions using that approach to fail to have transitivity.
	if (Number.isFinite(a as any) && Number.isFinite(b as any)) {
		return (a as number) - (b as number);
	}

	// The default < and > operators are not totally ordered. To allow types to be mixed
	// in a single collection, compare types and order values of different types by type.
	let ta = typeof a;
	let tb = typeof b;
	if (ta !== tb) {
		return ta < tb ? -1 : 1;
	}

	if (ta === 'object') {
		// standardized JavaScript bug: null is not an object, but typeof says it is
		if (a === null) return b === null ? 0 : -1;
		else if (b === null) return 1;

		a = a!.valueOf() as DefaultComparable;
		b = b!.valueOf() as DefaultComparable;
		ta = typeof a;
		tb = typeof b;
		// Deal with the two valueOf()s producing different types
		if (ta !== tb) {
			return ta < tb ? -1 : 1;
		}
	}

	// a and b are now the same type, and will be a number, string or array
	// (which we assume holds numbers or strings), or something unsupported.
	if (a! < b!) return -1;
	if (a! > b!) return 1;
	if (a === b) return 0;

	// Order NaN less than other numbers
	if (Number.isNaN(a as any)) return Number.isNaN(b as any) ? 0 : -1;
	else if (Number.isNaN(b as any)) return 1;
	// This could be two objects (e.g. [7] and ['7']) that aren't ordered
	return Array.isArray(a) ? 0 : Number.NaN;
}

/**
 * Compares items using the < and > operators. This function is probably slightly
 * faster than the defaultComparator for Dates and strings, but has not been benchmarked.
 * Unlike defaultComparator, this comparator doesn't support mixed types correctly,
 * i.e. use it with `BTree<string>` or `BTree<number>` but not `BTree<string|number>`.
 *
 * NaN is not supported.
 *
 * Note: null is treated like 0 when compared with numbers or Date, but in general
 *   null is not ordered with respect to strings (neither greater nor less), and
 *   undefined is not ordered with other types.
 */
export function simpleComparator(a: string, b: string): number;
export function simpleComparator(a: number | null, b: number | null): number;
export function simpleComparator(a: Date | null, b: Date | null): number;
export function simpleComparator(a: (number | string)[], b: (number | string)[]): number;
export function simpleComparator(a: any, b: any): number {
	return a > b ? 1 : a < b ? -1 : 0;
}

/**
 * A reasonably fast collection of key-value pairs with a powerful API.
 * Largely compatible with the standard Map. BTree is a B+ tree data structure,
 * so the collection is sorted by key.
 *
 * B+ trees tend to use memory more efficiently than hashtables such as the
 * standard Map, especially when the collection contains a large number of
 * items. However, maintaining the sort order makes them modestly slower:
 * O(log size) rather than O(1). This B+ tree implementation supports O(1)
 * fast cloning. It also supports freeze(), which can be used to ensure that
 * a BTree is not changed accidentally.
 *
 * Confusingly, the ES6 Map.forEach(c) method calls c(value,key) instead of
 * c(key,value), in contrast to other methods such as set() and entries()
 * which put the key first. I can only assume that the order was reversed on
 * the theory that users would usually want to examine values and ignore keys.
 * BTree's forEach() therefore works the same way, but a second method
 * `.forEachPair((key,value)=>{...})` is provided which sends you the key
 * first and the value second; this method is slightly faster because it is
 * the "native" for-each method for this class.
 *
 * Out of the box, BTree supports keys that are numbers, strings, arrays of
 * numbers/strings, Date, and objects that have a valueOf() method returning a
 * number or string. Other data types, such as arrays of Date or custom
 * objects, require a custom comparator, which you must pass as the second
 * argument to the constructor (the first argument is an optional list of
 * initial items). Symbols cannot be used as keys because they are unordered
 * (one Symbol is never "greater" or "less" than another).
 *
 * @example
 * Given a {name: string, age: number} object, you can create a tree sorted by
 * name and then by age like this:
 *
 *     var tree = new BTree(undefined, (a, b) => {
 *       if (a.name > b.name)
 *         return 1; // Return a number >0 when a > b
 *       else if (a.name < b.name)
 *         return -1; // Return a number <0 when a < b
 *       else // names are equal (or incomparable)
 *         return a.age - b.age; // Return >0 when a.age > b.age
 *     });
 *
 *     tree.set({name:"Bill", age:17}, "happy");
 *     tree.set({name:"Fran", age:40}, "busy & stressed");
 *     tree.set({name:"Bill", age:55}, "recently laid off");
 *     tree.forEachPair((k, v) => {
 *       console.log(`Name: ${k.name} Age: ${k.age} Status: ${v}`);
 *     });
 *
 * @description
 * The "range" methods (`forEach, forRange, editRange`) will return the number
 * of elements that were scanned. In addition, the callback can return {break:R}
 * to stop early and return R from the outer function.
 *
 * - TODO: Test performance of preallocating values array at max size
 * - TODO: Add fast initialization when a sorted array is provided to constructor
 *
 * For more documentation see https://github.com/qwertie/btree-typescript
 *
 * Are you a C# developer? You might like the similar data structures I made for C#:
 * BDictionary, BList, etc. See http://core.loyc.net/collections/
 *
 * @author David Piepgrass
 */
export class BTree<K = any, V = any> implements ISortedMapF<K, V>, ISortedMap<K, V> {
	private _root: BNode<K, V> = EmptyLeaf as BNode<K, V>;
	_size: number = 0;
	_maxNodeSize: number;

	/**
	 * provides a total order over keys (and a strict partial order over the type K)
	 * @returns a negative value if a < b, 0 if a === b and a positive value if a > b
	 */
	_compare: (a: K, b: K) => number;

	/**
	 * Initializes an empty B+ tree.
	 * @param compare Custom function to compare pairs of elements in the tree.
	 *   If not specified, defaultComparator will be used which is valid as long as K extends DefaultComparable.
	 * @param entries A set of key-value pairs to initialize the tree
	 * @param maxNodeSize Branching factor (maximum items or children per node)
	 *   Must be in range 4..256. If undefined or <4 then default is used; if >256 then 256.
	 */
	public constructor(entries?: [K, V][], compare?: (a: K, b: K) => number, maxNodeSize?: number) {
		this._maxNodeSize = maxNodeSize! >= 4 ? Math.min(maxNodeSize!, 256) : 32;
		this._compare = compare || (defaultComparator as any as (a: K, b: K) => number);
		if (entries) this.setPairs(entries);
	}

	/////////////////////////////////////////////////////////////////////////////
	// ES6 Map<K,V> methods /////////////////////////////////////////////////////

	/** Gets the number of key-value pairs in the tree. */
	get size() {
		return this._size;
	}
	/** Gets the number of key-value pairs in the tree. */
	get length() {
		return this._size;
	}
	/** Returns true iff the tree contains no key-value pairs. */
	get isEmpty() {
		return this._size === 0;
	}

	/** Releases the tree so that its size is 0. */
	clear() {
		this._root = EmptyLeaf as BNode<K, V>;
		this._size = 0;
	}

	forEach(callback: (v: V, k: K, tree: BTree<K, V>) => void, thisArg?: any): number;

	/** Runs a function for each key-value pair, in order from smallest to
	 *  largest key. For compatibility with ES6 Map, the argument order to
	 *  the callback is backwards: value first, then key. Call forEachPair
	 *  instead to receive the key as the first argument.
	 * @param thisArg If provided, this parameter is assigned as the `this`
	 *        value for each callback.
	 * @returns the number of values that were sent to the callback,
	 *        or the R value if the callback returned {break:R}. */
	forEach<R = number>(callback: (v: V, k: K, tree: BTree<K, V>) => { break?: R } | void, thisArg?: any): R | number {
		if (thisArg !== undefined) callback = callback.bind(thisArg);
		return this.forEachPair((k, v) => callback(v, k, this));
	}

	/** Runs a function for each key-value pair, in order from smallest to
	 *  largest key. The callback can return {break:R} (where R is any value
	 *  except undefined) to stop immediately and return R from forEachPair.
	 * @param onFound A function that is called for each key-value pair. This
	 *        function can return {break:R} to stop early with result R.
	 *        The reason that you must return {break:R} instead of simply R
	 *        itself is for consistency with editRange(), which allows
	 *        multiple actions, not just breaking.
	 * @param initialCounter This is the value of the third argument of
	 *        `onFound` the first time it is called. The counter increases
	 *        by one each time `onFound` is called. Default value: 0
	 * @returns the number of pairs sent to the callback (plus initialCounter,
	 *        if you provided one). If the callback returned {break:R} then
	 *        the R value is returned instead. */
	forEachPair<R = number>(
		callback: (k: K, v: V, counter: number) => { break?: R } | void,
		initialCounter?: number
	): R | number {
		var low = this.minKey(),
			high = this.maxKey();
		return this.forRange(low!, high!, true, callback, initialCounter);
	}

	/**
	 * Finds a pair in the tree and returns the associated value.
	 * @param defaultValue a value to return if the key was not found.
	 * @returns the value, or defaultValue if the key was not found.
	 * @description Computational complexity: O(log size)
	 */
	get(key: K, defaultValue?: V): V | undefined {
		return this._root.get(key, defaultValue, this);
	}

	/**
	 * Adds or overwrites a key-value pair in the B+ tree.
	 * @param key the key is used to determine the sort order of
	 *        data in the tree.
	 * @param value data to associate with the key (optional)
	 * @param overwrite Whether to overwrite an existing key-value pair
	 *        (default: true). If this is false and there is an existing
	 *        key-value pair then this method has no effect.
	 * @returns true if a new key-value pair was added.
	 * @description Computational complexity: O(log size)
	 * Note: when overwriting a previous entry, the key is updated
	 * as well as the value. This has no effect unless the new key
	 * has data that does not affect its sort order.
	 */
	set(key: K, value: V, overwrite?: boolean): boolean {
		if (this._root.isShared) this._root = this._root.clone();
		var result = this._root.set(key, value, overwrite, this);
		if (result === true || result === false) return result;
		// Root node has split, so create a new root node.
		this._root = new BNodeInternal<K, V>([this._root, result]);
		return true;
	}

	/**
	 * Returns true if the key exists in the B+ tree, false if not.
	 * Use get() for best performance; use has() if you need to
	 * distinguish between "undefined value" and "key not present".
	 * @param key Key to detect
	 * @description Computational complexity: O(log size)
	 */
	has(key: K): boolean {
		return this.forRange(key, key, true, undefined) !== 0;
	}

	/**
	 * Removes a single key-value pair from the B+ tree.
	 * @param key Key to find
	 * @returns true if a pair was found and removed, false otherwise.
	 * @description Computational complexity: O(log size)
	 */
	delete(key: K): boolean {
		return this.editRange(key, key, true, DeleteRange) !== 0;
	}

	/////////////////////////////////////////////////////////////////////////////
	// Clone-mutators ///////////////////////////////////////////////////////////

	/** Returns a copy of the tree with the specified key set (the value is undefined). */
	with(key: K): BTree<K, V | undefined>;
	/** Returns a copy of the tree with the specified key-value pair set. */
	with<V2>(key: K, value: V2, overwrite?: boolean): BTree<K, V | V2>;
	with<V2>(key: K, value?: V2, overwrite?: boolean): BTree<K, V | V2 | undefined> {
		let nu = this.clone() as BTree<K, V | V2 | undefined>;
		return nu.set(key, value, overwrite) || overwrite ? nu : this;
	}

	/** Returns a copy of the tree with the specified key-value pairs set. */
	withPairs<V2>(pairs: [K, V | V2][], overwrite: boolean): BTree<K, V | V2> {
		let nu = this.clone() as BTree<K, V | V2>;
		return nu.setPairs(pairs, overwrite) !== 0 || overwrite ? nu : this;
	}

	/** Returns a copy of the tree with the specified keys present.
	 *  @param keys The keys to add. If a key is already present in the tree,
	 *         neither the existing key nor the existing value is modified.
	 *  @param returnThisIfUnchanged if true, returns this if all keys already
	 *  existed. Performance note: due to the architecture of this class, all
	 *  node(s) leading to existing keys are cloned even if the collection is
	 *  ultimately unchanged.
	 */
	withKeys(keys: K[], returnThisIfUnchanged?: boolean): BTree<K, V | undefined> {
		let nu = this.clone() as BTree<K, V | undefined>,
			changed = false;
		for (var i = 0; i < keys.length; i++) changed = nu.set(keys[i], undefined, false) || changed;
		return returnThisIfUnchanged && !changed ? this : nu;
	}

	/** Returns a copy of the tree with the specified key removed.
	 * @param returnThisIfUnchanged if true, returns this if the key didn't exist.
	 *  Performance note: due to the architecture of this class, node(s) leading
	 *  to where the key would have been stored are cloned even when the key
	 *  turns out not to exist and the collection is unchanged.
	 */
	without(key: K, returnThisIfUnchanged?: boolean): BTree<K, V> {
		return this.withoutRange(key, key, true, returnThisIfUnchanged);
	}

	/** Returns a copy of the tree with the specified keys removed.
	 * @param returnThisIfUnchanged if true, returns this if none of the keys
	 *  existed. Performance note: due to the architecture of this class,
	 *  node(s) leading to where the key would have been stored are cloned
	 *  even when the key turns out not to exist.
	 */
	withoutKeys(keys: K[], returnThisIfUnchanged?: boolean): BTree<K, V> {
		let nu = this.clone();
		return nu.deleteKeys(keys) || !returnThisIfUnchanged ? nu : this;
	}

	/** Returns a copy of the tree with the specified range of keys removed. */
	withoutRange(low: K, high: K, includeHigh: boolean, returnThisIfUnchanged?: boolean): BTree<K, V> {
		let nu = this.clone();
		if (nu.deleteRange(low, high, includeHigh) === 0 && returnThisIfUnchanged) return this;
		return nu;
	}

	/** Returns a copy of the tree with pairs removed whenever the callback
	 *  function returns false. `where()` is a synonym for this method. */
	filter(callback: (k: K, v: V, counter: number) => boolean, returnThisIfUnchanged?: boolean): BTree<K, V> {
		var nu = this.greedyClone();
		var del: any;
		nu.editAll((k, v, i) => {
			if (!callback(k, v, i)) return (del = Delete);
		});
		if (!del && returnThisIfUnchanged) return this;
		return nu;
	}

	/** Returns a copy of the tree with all values altered by a callback function. */
	mapValues<R>(callback: (v: V, k: K, counter: number) => R): BTree<K, R> {
		var tmp = {} as { value: R };
		var nu = this.greedyClone();
		nu.editAll((k, v, i) => {
			return (tmp.value = callback(v, k, i)), tmp as any;
		});
		return nu as any as BTree<K, R>;
	}

	/** Performs a reduce operation like the `reduce` method of `Array`.
	 *  It is used to combine all pairs into a single value, or perform
	 *  conversions. `reduce` is best understood by example. For example,
	 *  `tree.reduce((P, pair) => P * pair[0], 1)` multiplies all keys
	 *  together. It means "start with P=1, and for each pair multiply
	 *  it by the key in pair[0]". Another example would be converting
	 *  the tree to a Map (in this example, note that M.set returns M):
	 *
	 *  var M = tree.reduce((M, pair) => M.set(pair[0],pair[1]), new Map())
	 *
	 *  **Note**: the same array is sent to the callback on every iteration.
	 */
	reduce<R>(
		callback: (previous: R, currentPair: [K, V], counter: number, tree: BTree<K, V>) => R,
		initialValue: R
	): R;
	reduce<R>(
		callback: (previous: R | undefined, currentPair: [K, V], counter: number, tree: BTree<K, V>) => R
	): R | undefined;
	reduce<R>(
		callback: (previous: R | undefined, currentPair: [K, V], counter: number, tree: BTree<K, V>) => R,
		initialValue?: R
	): R | undefined {
		let i = 0,
			p = initialValue;
		var it = this.entries(this.minKey(), ReusedArray),
			next;
		while (!(next = it.next()).done) p = callback(p, next.value, i++, this);
		return p;
	}

	/////////////////////////////////////////////////////////////////////////////
	// Iterator methods /////////////////////////////////////////////////////////

	/** Returns an iterator that provides items in order (ascending order if
	 *  the collection's comparator uses ascending order, as is the default.)
	 *  @param lowestKey First key to be iterated, or undefined to start at
	 *         minKey(). If the specified key doesn't exist then iteration
	 *         starts at the next higher key (according to the comparator).
	 *  @param reusedArray Optional array used repeatedly to store key-value
	 *         pairs, to avoid creating a new array on every iteration.
	 */
	entries(lowestKey?: K, reusedArray?: (K | V)[]): IterableIterator<[K, V]> {
		var info = this.findPath(lowestKey);
		if (info === undefined) return iterator<[K, V]>();
		var { nodequeue, nodeindex, leaf } = info;
		var state = reusedArray !== undefined ? 1 : 0;
		var i = lowestKey === undefined ? -1 : leaf.indexOf(lowestKey, 0, this._compare) - 1;

		return iterator<[K, V]>(() => {
			jump: for (;;) {
				switch (state) {
					case 0:
						if (++i < leaf.keys.length) return { done: false, value: [leaf.keys[i], leaf.values[i]] };
						state = 2;
						continue;
					case 1:
						if (++i < leaf.keys.length) {
							(reusedArray![0] = leaf.keys[i]), (reusedArray![1] = leaf.values[i]);
							return { done: false, value: reusedArray as [K, V] };
						}
						state = 2;
					case 2:
						// Advance to the next leaf node
						for (var level = -1; ; ) {
							if (++level >= nodequeue.length) {
								state = 3;
								continue jump;
							}
							if (++nodeindex[level] < nodequeue[level].length) break;
						}
						for (; level > 0; level--) {
							nodequeue[level - 1] = (nodequeue[level][nodeindex[level]] as BNodeInternal<K, V>).children;
							nodeindex[level - 1] = 0;
						}
						leaf = nodequeue[0][nodeindex[0]];
						i = -1;
						state = reusedArray !== undefined ? 1 : 0;
						continue;
					case 3:
						return { done: true, value: undefined };
				}
			}
		});
	}

	/** Returns an iterator that provides items in reversed order.
	 *  @param highestKey Key at which to start iterating, or undefined to
	 *         start at maxKey(). If the specified key doesn't exist then iteration
	 *         starts at the next lower key (according to the comparator).
	 *  @param reusedArray Optional array used repeatedly to store key-value
	 *         pairs, to avoid creating a new array on every iteration.
	 *  @param skipHighest Iff this flag is true and the highestKey exists in the
	 *         collection, the pair matching highestKey is skipped, not iterated.
	 */
	entriesReversed(highestKey?: K, reusedArray?: (K | V)[], skipHighest?: boolean): IterableIterator<[K, V]> {
		if (highestKey === undefined) {
			highestKey = this.maxKey();
			skipHighest = undefined;
			if (highestKey === undefined) return iterator<[K, V]>(); // collection is empty
		}
		var { nodequeue, nodeindex, leaf } = this.findPath(highestKey) || this.findPath(this.maxKey())!;
		check(!nodequeue[0] || leaf === nodequeue[0][nodeindex[0]], 'wat!');
		var i = leaf.indexOf(highestKey, 0, this._compare);
		if (!skipHighest && i < leaf.keys.length && this._compare(leaf.keys[i], highestKey) <= 0) i++;
		var state = reusedArray !== undefined ? 1 : 0;

		return iterator<[K, V]>(() => {
			jump: for (;;) {
				switch (state) {
					case 0:
						if (--i >= 0) return { done: false, value: [leaf.keys[i], leaf.values[i]] };
						state = 2;
						continue;
					case 1:
						if (--i >= 0) {
							(reusedArray![0] = leaf.keys[i]), (reusedArray![1] = leaf.values[i]);
							return { done: false, value: reusedArray as [K, V] };
						}
						state = 2;
					case 2:
						// Advance to the next leaf node
						for (var level = -1; ; ) {
							if (++level >= nodequeue.length) {
								state = 3;
								continue jump;
							}
							if (--nodeindex[level] >= 0) break;
						}
						for (; level > 0; level--) {
							nodequeue[level - 1] = (nodequeue[level][nodeindex[level]] as BNodeInternal<K, V>).children;
							nodeindex[level - 1] = nodequeue[level - 1].length - 1;
						}
						leaf = nodequeue[0][nodeindex[0]];
						i = leaf.keys.length;
						state = reusedArray !== undefined ? 1 : 0;
						continue;
					case 3:
						return { done: true, value: undefined };
				}
			}
		});
	}

	/* Used by entries() and entriesReversed() to prepare to start iterating.
	 * It develops a "node queue" for each non-leaf level of the tree.
	 * Levels are numbered "bottom-up" so that level 0 is a list of leaf
	 * nodes from a low-level non-leaf node. The queue at a given level L
	 * consists of nodequeue[L] which is the children of a BNodeInternal,
	 * and nodeindex[L], the current index within that child list, such
	 * such that nodequeue[L-1] === nodequeue[L][nodeindex[L]].children.
	 * (However inside this function the order is reversed.)
	 */
	private findPath(key?: K): { nodequeue: BNode<K, V>[][]; nodeindex: number[]; leaf: BNode<K, V> } | undefined {
		var nextnode = this._root;
		var nodequeue: BNode<K, V>[][], nodeindex: number[];

		if (nextnode.isLeaf) {
			(nodequeue = EmptyArray), (nodeindex = EmptyArray); // avoid allocations
		} else {
			(nodequeue = []), (nodeindex = []);
			for (var d = 0; !nextnode.isLeaf; d++) {
				nodequeue[d] = (nextnode as BNodeInternal<K, V>).children;
				nodeindex[d] = key === undefined ? 0 : nextnode.indexOf(key, 0, this._compare);
				if (nodeindex[d] >= nodequeue[d].length) return; // first key > maxKey()
				nextnode = nodequeue[d][nodeindex[d]];
			}
			nodequeue.reverse();
			nodeindex.reverse();
		}
		return { nodequeue, nodeindex, leaf: nextnode };
	}

	/**
	 * Computes the differences between `this` and `other`.
	 * For efficiency, the diff is returned via invocations of supplied handlers.
	 * The computation is optimized for the case in which the two trees have large amounts
	 * of shared data (obtained by calling the `clone` or `with` APIs) and will avoid
	 * any iteration of shared state.
	 * The handlers can cause computation to early exit by returning {break: R}.
	 * Neither of the collections should be changed during the comparison process (in your callbacks), as this method assumes they will not be mutated.
	 * @param other The tree to compute a diff against.
	 * @param onlyThis Callback invoked for all keys only present in `this`.
	 * @param onlyOther Callback invoked for all keys only present in `other`.
	 * @param different Callback invoked for all keys with differing values.
	 */
	diffAgainst<R>(
		other: BTree<K, V>,
		onlyThis?: (k: K, v: V) => { break?: R } | void,
		onlyOther?: (k: K, v: V) => { break?: R } | void,
		different?: (k: K, vThis: V, vOther: V) => { break?: R } | void
	): R | undefined {
		if (other._compare !== this._compare) {
			throw new Error('Tree comparators are not the same.');
		}

		if (this.isEmpty || other.isEmpty) {
			if (this.isEmpty && other.isEmpty) return undefined;
			// If one tree is empty, everything will be an onlyThis/onlyOther.
			if (this.isEmpty)
				return onlyOther === undefined ? undefined : BTree.stepToEnd(BTree.makeDiffCursor(other), onlyOther);
			return onlyThis === undefined ? undefined : BTree.stepToEnd(BTree.makeDiffCursor(this), onlyThis);
		}

		// Cursor-based diff algorithm is as follows:
		// - Until neither cursor has navigated to the end of the tree, do the following:
		//  - If the `this` cursor is "behind" the `other` cursor (strictly <, via compare), advance it.
		//  - Otherwise, advance the `other` cursor.
		//  - Any time a cursor is stepped, perform the following:
		//    - If either cursor points to a key/value pair:
		//      - If thisCursor === otherCursor and the values differ, it is a Different.
		//      - If thisCursor > otherCursor and otherCursor is at a key/value pair, it is an OnlyOther.
		//      - If thisCursor < otherCursor and thisCursor is at a key/value pair, it is an OnlyThis as long as the most recent
		//        cursor step was *not* otherCursor advancing from a tie. The extra condition avoids erroneous OnlyOther calls
		//        that would occur due to otherCursor being the "leader".
		//    - Otherwise, if both cursors point to nodes, compare them. If they are equal by reference (shared), skip
		//      both cursors to the next node in the walk.
		// - Once one cursor has finished stepping, any remaining steps (if any) are taken and key/value pairs are logged
		//   as OnlyOther (if otherCursor is stepping) or OnlyThis (if thisCursor is stepping).
		// This algorithm gives the critical guarantee that all locations (both nodes and key/value pairs) in both trees that
		// are identical by value (and possibly by reference) will be visited *at the same time* by the cursors.
		// This removes the possibility of emitting incorrect diffs, as well as allowing for skipping shared nodes.
		const { _compare } = this;
		const thisCursor = BTree.makeDiffCursor(this);
		const otherCursor = BTree.makeDiffCursor(other);
		// It doesn't matter how thisSteppedLast is initialized.
		// Step order is only used when either cursor is at a leaf, and cursors always start at a node.
		let thisSuccess = true,
			otherSuccess = true,
			prevCursorOrder = BTree.compare(thisCursor, otherCursor, _compare);
		while (thisSuccess && otherSuccess) {
			const cursorOrder = BTree.compare(thisCursor, otherCursor, _compare);
			const { leaf: thisLeaf, internalSpine: thisInternalSpine, levelIndices: thisLevelIndices } = thisCursor;
			const { leaf: otherLeaf, internalSpine: otherInternalSpine, levelIndices: otherLevelIndices } = otherCursor;
			if (thisLeaf || otherLeaf) {
				// If the cursors were at the same location last step, then there is no work to be done.
				if (prevCursorOrder !== 0) {
					if (cursorOrder === 0) {
						if (thisLeaf && otherLeaf && different) {
							// Equal keys, check for modifications
							const valThis = thisLeaf.values[thisLevelIndices[thisLevelIndices.length - 1]];
							const valOther = otherLeaf.values[otherLevelIndices[otherLevelIndices.length - 1]];
							if (!Object.is(valThis, valOther)) {
								const result = different(thisCursor.currentKey, valThis, valOther);
								if (result && result.break) return result.break;
							}
						}
					} else if (cursorOrder > 0) {
						// If this is the case, we know that either:
						// 1. otherCursor stepped last from a starting position that trailed thisCursor, and is still behind, or
						// 2. thisCursor stepped last and leapfrogged otherCursor
						// Either of these cases is an "only other"
						if (otherLeaf && onlyOther) {
							const otherVal = otherLeaf.values[otherLevelIndices[otherLevelIndices.length - 1]];
							const result = onlyOther(otherCursor.currentKey, otherVal);
							if (result && result.break) return result.break;
						}
					} else if (onlyThis) {
						if (thisLeaf && prevCursorOrder !== 0) {
							const valThis = thisLeaf.values[thisLevelIndices[thisLevelIndices.length - 1]];
							const result = onlyThis(thisCursor.currentKey, valThis);
							if (result && result.break) return result.break;
						}
					}
				}
			} else if (!thisLeaf && !otherLeaf && cursorOrder === 0) {
				const lastThis = thisInternalSpine.length - 1;
				const lastOther = otherInternalSpine.length - 1;
				const nodeThis = thisInternalSpine[lastThis][thisLevelIndices[lastThis]];
				const nodeOther = otherInternalSpine[lastOther][otherLevelIndices[lastOther]];
				if (nodeOther === nodeThis) {
					prevCursorOrder = 0;
					thisSuccess = BTree.step(thisCursor, true);
					otherSuccess = BTree.step(otherCursor, true);
					continue;
				}
			}
			prevCursorOrder = cursorOrder;
			if (cursorOrder < 0) {
				thisSuccess = BTree.step(thisCursor);
			} else {
				otherSuccess = BTree.step(otherCursor);
			}
		}

		if (thisSuccess && onlyThis) return BTree.finishCursorWalk(thisCursor, otherCursor, _compare, onlyThis);
		if (otherSuccess && onlyOther) return BTree.finishCursorWalk(otherCursor, thisCursor, _compare, onlyOther);
	}

	///////////////////////////////////////////////////////////////////////////
	// Helper methods for diffAgainst /////////////////////////////////////////

	private static finishCursorWalk<K, V, R>(
		cursor: DiffCursor<K, V>,
		cursorFinished: DiffCursor<K, V>,
		compareKeys: (a: K, b: K) => number,
		callback: (k: K, v: V) => { break?: R } | void
	): R | undefined {
		const compared = BTree.compare(cursor, cursorFinished, compareKeys);
		if (compared === 0) {
			if (!BTree.step(cursor)) return undefined;
		} else if (compared < 0) {
			check(false, 'cursor walk terminated early');
		}
		return BTree.stepToEnd(cursor, callback);
	}

	private static stepToEnd<K, V, R>(
		cursor: DiffCursor<K, V>,
		callback: (k: K, v: V) => { break?: R } | void
	): R | undefined {
		let canStep: boolean = true;
		while (canStep) {
			const { leaf, levelIndices, currentKey } = cursor;
			if (leaf) {
				const value = leaf.values[levelIndices[levelIndices.length - 1]];
				const result = callback(currentKey, value);
				if (result && result.break) return result.break;
			}
			canStep = BTree.step(cursor);
		}
		return undefined;
	}

	private static makeDiffCursor<K, V>(tree: BTree<K, V>): DiffCursor<K, V> {
		const { _root, height } = tree;
		return {
			height: height,
			internalSpine: [[_root]],
			levelIndices: [0],
			leaf: undefined,
			currentKey: _root.maxKey(),
		};
	}

	/**
	 * Advances the cursor to the next step in the walk of its tree.
	 * Cursors are walked backwards in sort order, as this allows them to leverage maxKey() in order to be compared in O(1).
	 * @param cursor The cursor to step
	 * @param stepToNode If true, the cursor will be advanced to the next node (skipping values)
	 * @returns true if the step was completed and false if the step would have caused the cursor to move beyond the end of the tree.
	 */
	private static step<K, V>(cursor: DiffCursor<K, V>, stepToNode?: boolean): boolean {
		const { internalSpine, levelIndices, leaf } = cursor;
		if (stepToNode === true || leaf) {
			const levelsLength = levelIndices.length;
			// Step to the next node only if:
			// - We are explicitly directed to via stepToNode, or
			// - There are no key/value pairs left to step to in this leaf
			if (stepToNode === true || levelIndices[levelsLength - 1] === 0) {
				const spineLength = internalSpine.length;
				// Root is leaf
				if (spineLength === 0) return false;
				// Walk back up the tree until we find a new subtree to descend into
				const nodeLevelIndex = spineLength - 1;
				let levelIndexWalkBack = nodeLevelIndex;
				while (levelIndexWalkBack >= 0) {
					if (levelIndices[levelIndexWalkBack] > 0) {
						if (levelIndexWalkBack < levelsLength - 1) {
							// Remove leaf state from cursor
							cursor.leaf = undefined;
							levelIndices.pop();
						}
						// If we walked upwards past any internal node, slice them out
						if (levelIndexWalkBack < nodeLevelIndex)
							cursor.internalSpine = internalSpine.slice(0, levelIndexWalkBack + 1);
						// Move to new internal node
						cursor.currentKey =
							internalSpine[levelIndexWalkBack][--levelIndices[levelIndexWalkBack]].maxKey();
						return true;
					}
					levelIndexWalkBack--;
				}
				// Cursor is in the far left leaf of the tree, no more nodes to enumerate
				return false;
			} else {
				// Move to new leaf value
				const valueIndex = --levelIndices[levelsLength - 1];
				cursor.currentKey = (leaf as unknown as BNode<K, V>).keys[valueIndex];
				return true;
			}
		} else {
			// Cursor does not point to a value in a leaf, so move downwards
			const nextLevel = internalSpine.length;
			const currentLevel = nextLevel - 1;
			const node = internalSpine[currentLevel][levelIndices[currentLevel]];
			if (node.isLeaf) {
				// Entering into a leaf. Set the cursor to point at the last key/value pair.
				cursor.leaf = node;
				const valueIndex = (levelIndices[nextLevel] = node.values.length - 1);
				cursor.currentKey = node.keys[valueIndex];
			} else {
				const children = (node as BNodeInternal<K, V>).children;
				internalSpine[nextLevel] = children;
				const childIndex = children.length - 1;
				levelIndices[nextLevel] = childIndex;
				cursor.currentKey = children[childIndex].maxKey();
			}
			return true;
		}
	}

	/**
	 * Compares the two cursors. Returns a value indicating which cursor is ahead in a walk.
	 * Note that cursors are advanced in reverse sorting order.
	 */
	private static compare<K, V>(
		cursorA: DiffCursor<K, V>,
		cursorB: DiffCursor<K, V>,
		compareKeys: (a: K, b: K) => number
	): number {
		const { height: heightA, currentKey: currentKeyA, levelIndices: levelIndicesA } = cursorA;
		const { height: heightB, currentKey: currentKeyB, levelIndices: levelIndicesB } = cursorB;
		// Reverse the comparison order, as cursors are advanced in reverse sorting order
		const keyComparison = compareKeys(currentKeyB, currentKeyA);
		if (keyComparison !== 0) {
			return keyComparison;
		}

		// Normalize depth values relative to the shortest tree.
		// This ensures that concurrent cursor walks of trees of differing heights can reliably land on shared nodes at the same time.
		// To accomplish this, a cursor that is on an internal node at depth D1 with maxKey X is considered "behind" a cursor on an
		// internal node at depth D2 with maxKey Y, when D1 < D2. Thus, always walking the cursor that is "behind" will allow the cursor
		// at shallower depth (but equal maxKey) to "catch up" and land on shared nodes.
		const heightMin = heightA < heightB ? heightA : heightB;
		const depthANormalized = levelIndicesA.length - (heightA - heightMin);
		const depthBNormalized = levelIndicesB.length - (heightB - heightMin);
		return depthANormalized - depthBNormalized;
	}

	// End of helper methods for diffAgainst //////////////////////////////////
	///////////////////////////////////////////////////////////////////////////

	/** Returns a new iterator for iterating the keys of each pair in ascending order.
	 *  @param firstKey: Minimum key to include in the output. */
	keys(firstKey?: K): IterableIterator<K> {
		var it = this.entries(firstKey, ReusedArray);
		return iterator<K>(() => {
			var n: IteratorResult<any> = it.next();
			if (n.value) n.value = n.value[0];
			return n;
		});
	}

	/** Returns a new iterator for iterating the values of each pair in order by key.
	 *  @param firstKey: Minimum key whose associated value is included in the output. */
	values(firstKey?: K): IterableIterator<V> {
		var it = this.entries(firstKey, ReusedArray);
		return iterator<V>(() => {
			var n: IteratorResult<any> = it.next();
			if (n.value) n.value = n.value[1];
			return n;
		});
	}

	/////////////////////////////////////////////////////////////////////////////
	// Additional methods ///////////////////////////////////////////////////////

	/** Returns the maximum number of children/values before nodes will split. */
	get maxNodeSize() {
		return this._maxNodeSize;
	}

	/** Gets the lowest key in the tree. Complexity: O(log size) */
	minKey(): K | undefined {
		return this._root.minKey();
	}

	/** Gets the highest key in the tree. Complexity: O(1) */
	maxKey(): K | undefined {
		return this._root.maxKey();
	}

	/** Quickly clones the tree by marking the root node as shared.
	 *  Both copies remain editable. When you modify either copy, any
	 *  nodes that are shared (or potentially shared) between the two
	 *  copies are cloned so that the changes do not affect other copies.
	 *  This is known as copy-on-write behavior, or "lazy copying". */
	clone(): BTree<K, V> {
		this._root.isShared = true;
		var result = new BTree<K, V>(undefined, this._compare, this._maxNodeSize);
		result._root = this._root;
		result._size = this._size;
		return result;
	}

	/** Performs a greedy clone, immediately duplicating any nodes that are
	 *  not currently marked as shared, in order to avoid marking any
	 *  additional nodes as shared.
	 *  @param force Clone all nodes, even shared ones.
	 */
	greedyClone(force?: boolean): BTree<K, V> {
		var result = new BTree<K, V>(undefined, this._compare, this._maxNodeSize);
		result._root = this._root.greedyClone(force);
		result._size = this._size;
		return result;
	}

	/** Gets an array filled with the contents of the tree, sorted by key */
	toArray(maxLength: number = 0x7fffffff): [K, V][] {
		let min = this.minKey(),
			max = this.maxKey();
		if (min !== undefined) return this.getRange(min, max!, true, maxLength);
		return [];
	}

	/** Gets an array of all keys, sorted */
	keysArray() {
		var results: K[] = [];
		this._root.forRange(this.minKey()!, this.maxKey()!, true, false, this, 0, (k, v) => {
			results.push(k);
		});
		return results;
	}

	/** Gets an array of all values, sorted by key */
	valuesArray() {
		var results: V[] = [];
		this._root.forRange(this.minKey()!, this.maxKey()!, true, false, this, 0, (k, v) => {
			results.push(v);
		});
		return results;
	}

	/** Gets a string representing the tree's data based on toArray(). */
	toString() {
		return this.toArray().toString();
	}

	/** Stores a key-value pair only if the key doesn't already exist in the tree.
	 * @returns true if a new key was added
	 */
	setIfNotPresent(key: K, value: V): boolean {
		return this.set(key, value, false);
	}

	/** Returns the next pair whose key is larger than the specified key (or undefined if there is none).
	 * If key === undefined, this function returns the lowest pair.
	 * @param key The key to search for.
	 * @param reusedArray Optional array used repeatedly to store key-value pairs, to
	 * avoid creating a new array on every iteration.
	 */
	nextHigherPair(key: K | undefined, reusedArray?: [K, V]): [K, V] | undefined {
		reusedArray = reusedArray || ([] as unknown as [K, V]);
		if (key === undefined) {
			return this._root.minPair(reusedArray);
		}
		return this._root.getPairOrNextHigher(key, this._compare, false, reusedArray);
	}

	/** Returns the next key larger than the specified key, or undefined if there is none.
	 *  Also, nextHigherKey(undefined) returns the lowest key.
	 */
	nextHigherKey(key: K | undefined): K | undefined {
		var p = this.nextHigherPair(key, ReusedArray as [K, V]);
		return p && p[0];
	}

	/** Returns the next pair whose key is smaller than the specified key (or undefined if there is none).
	 *  If key === undefined, this function returns the highest pair.
	 * @param key The key to search for.
	 * @param reusedArray Optional array used repeatedly to store key-value pairs, to
	 *        avoid creating a new array each time you call this method.
	 */
	nextLowerPair(key: K | undefined, reusedArray?: [K, V]): [K, V] | undefined {
		reusedArray = reusedArray || ([] as unknown as [K, V]);
		if (key === undefined) {
			return this._root.maxPair(reusedArray);
		}
		return this._root.getPairOrNextLower(key, this._compare, false, reusedArray);
	}

	/** Returns the next key smaller than the specified key, or undefined if there is none.
	 *  Also, nextLowerKey(undefined) returns the highest key.
	 */
	nextLowerKey(key: K | undefined): K | undefined {
		var p = this.nextLowerPair(key, ReusedArray as [K, V]);
		return p && p[0];
	}

	/** Returns the key-value pair associated with the supplied key if it exists
	 *  or the pair associated with the next lower pair otherwise. If there is no
	 *  next lower pair, undefined is returned.
	 * @param key The key to search for.
	 * @param reusedArray Optional array used repeatedly to store key-value pairs, to
	 *        avoid creating a new array each time you call this method.
	 * */
	getPairOrNextLower(key: K, reusedArray?: [K, V]): [K, V] | undefined {
		return this._root.getPairOrNextLower(key, this._compare, true, reusedArray || ([] as unknown as [K, V]));
	}

	/** Returns the key-value pair associated with the supplied key if it exists
	 *  or the pair associated with the next lower pair otherwise. If there is no
	 *  next lower pair, undefined is returned.
	 * @param key The key to search for.
	 * @param reusedArray Optional array used repeatedly to store key-value pairs, to
	 *        avoid creating a new array each time you call this method.
	 * */
	getPairOrNextHigher(key: K, reusedArray?: [K, V]): [K, V] | undefined {
		return this._root.getPairOrNextHigher(key, this._compare, true, reusedArray || ([] as unknown as [K, V]));
	}

	/** Edits the value associated with a key in the tree, if it already exists.
	 * @returns true if the key existed, false if not.
	 */
	changeIfPresent(key: K, value: V): boolean {
		return this.editRange(key, key, true, (k, v) => ({ value })) !== 0;
	}

	/**
	 * Builds an array of pairs from the specified range of keys, sorted by key.
	 * Each returned pair is also an array: pair[0] is the key, pair[1] is the value.
	 * @param low The first key in the array will be greater than or equal to `low`.
	 * @param high This method returns when a key larger than this is reached.
	 * @param includeHigh If the `high` key is present, its pair will be included
	 *        in the output if and only if this parameter is true. Note: if the
	 *        `low` key is present, it is always included in the output.
	 * @param maxLength Length limit. getRange will stop scanning the tree when
	 *                  the array reaches this size.
	 * @description Computational complexity: O(result.length + log size)
	 */
	getRange(low: K, high: K, includeHigh?: boolean, maxLength: number = 0x3ffffff): [K, V][] {
		var results: [K, V][] = [];
		this._root.forRange(low, high, includeHigh, false, this, 0, (k, v) => {
			results.push([k, v]);
			return results.length > maxLength ? Break : undefined;
		});
		return results;
	}

	/** Adds all pairs from a list of key-value pairs.
	 * @param pairs Pairs to add to this tree. If there are duplicate keys,
	 *        later pairs currently overwrite earlier ones (e.g. [[0,1],[0,7]]
	 *        associates 0 with 7.)
	 * @param overwrite Whether to overwrite pairs that already exist (if false,
	 *        pairs[i] is ignored when the key pairs[i][0] already exists.)
	 * @returns The number of pairs added to the collection.
	 * @description Computational complexity: O(pairs.length * log(size + pairs.length))
	 */
	setPairs(pairs: [K, V][], overwrite?: boolean): number {
		var added = 0;
		for (var i = 0; i < pairs.length; i++) if (this.set(pairs[i][0], pairs[i][1], overwrite)) added++;
		return added;
	}

	forRange(
		low: K,
		high: K,
		includeHigh: boolean,
		onFound?: (k: K, v: V, counter: number) => void,
		initialCounter?: number
	): number;

	/**
	 * Scans the specified range of keys, in ascending order by key.
	 * Note: the callback `onFound` must not insert or remove items in the
	 * collection. Doing so may cause incorrect data to be sent to the
	 * callback afterward.
	 * @param low The first key scanned will be greater than or equal to `low`.
	 * @param high Scanning stops when a key larger than this is reached.
	 * @param includeHigh If the `high` key is present, `onFound` is called for
	 *        that final pair if and only if this parameter is true.
	 * @param onFound A function that is called for each key-value pair. This
	 *        function can return {break:R} to stop early with result R.
	 * @param initialCounter Initial third argument of onFound. This value
	 *        increases by one each time `onFound` is called. Default: 0
	 * @returns The number of values found, or R if the callback returned
	 *        `{break:R}` to stop early.
	 * @description Computational complexity: O(number of items scanned + log size)
	 */
	forRange<R = number>(
		low: K,
		high: K,
		includeHigh: boolean,
		onFound?: (k: K, v: V, counter: number) => { break?: R } | void,
		initialCounter?: number
	): R | number {
		var r = this._root.forRange(low, high, includeHigh, false, this, initialCounter || 0, onFound);
		return typeof r === 'number' ? r : r.break!;
	}

	/**
	 * Scans and potentially modifies values for a subsequence of keys.
	 * Note: the callback `onFound` should ideally be a pure function.
	 *   Specfically, it must not insert items, call clone(), or change
	 *   the collection except via return value; out-of-band editing may
	 *   cause an exception or may cause incorrect data to be sent to
	 *   the callback (duplicate or missed items). It must not cause a
	 *   clone() of the collection, otherwise the clone could be modified
	 *   by changes requested by the callback.
	 * @param low The first key scanned will be greater than or equal to `low`.
	 * @param high Scanning stops when a key larger than this is reached.
	 * @param includeHigh If the `high` key is present, `onFound` is called for
	 *        that final pair if and only if this parameter is true.
	 * @param onFound A function that is called for each key-value pair. This
	 *        function can return `{value:v}` to change the value associated
	 *        with the current key, `{delete:true}` to delete the current pair,
	 *        `{break:R}` to stop early with result R, or it can return nothing
	 *        (undefined or {}) to cause no effect and continue iterating.
	 *        `{break:R}` can be combined with one of the other two commands.
	 *        The third argument `counter` is the number of items iterated
	 *        previously; it equals 0 when `onFound` is called the first time.
	 * @returns The number of values scanned, or R if the callback returned
	 *        `{break:R}` to stop early.
	 * @description
	 *   Computational complexity: O(number of items scanned + log size)
	 *   Note: if the tree has been cloned with clone(), any shared
	 *   nodes are copied before `onFound` is called. This takes O(n) time
	 *   where n is proportional to the amount of shared data scanned.
	 */
	editRange<R = V>(
		low: K,
		high: K,
		includeHigh: boolean,
		onFound: (k: K, v: V, counter: number) => EditRangeResult<V, R> | void,
		initialCounter?: number
	): R | number {
		var root = this._root;
		if (root.isShared) this._root = root = root.clone();
		try {
			var r = root.forRange(low, high, includeHigh, true, this, initialCounter || 0, onFound);
			return typeof r === 'number' ? r : r.break!;
		} finally {
			let isShared;
			while (root.keys.length <= 1 && !root.isLeaf) {
				isShared ||= root.isShared;
				this._root = root =
					root.keys.length === 0 ? EmptyLeaf : (root as any as BNodeInternal<K, V>).children[0];
			}
			// If any ancestor of the new root was shared, the new root must also be shared
			if (isShared) {
				root.isShared = true;
			}
		}
	}

	/** Same as `editRange` except that the callback is called for all pairs. */
	editAll<R = V>(
		onFound: (k: K, v: V, counter: number) => EditRangeResult<V, R> | void,
		initialCounter?: number
	): R | number {
		return this.editRange(this.minKey()!, this.maxKey()!, true, onFound, initialCounter);
	}

	/**
	 * Removes a range of key-value pairs from the B+ tree.
	 * @param low The first key scanned will be greater than or equal to `low`.
	 * @param high Scanning stops when a key larger than this is reached.
	 * @param includeHigh Specifies whether the `high` key, if present, is deleted.
	 * @returns The number of key-value pairs that were deleted.
	 * @description Computational complexity: O(log size + number of items deleted)
	 */
	deleteRange(low: K, high: K, includeHigh: boolean): number {
		return this.editRange(low, high, includeHigh, DeleteRange);
	}

	/** Deletes a series of keys from the collection. */
	deleteKeys(keys: K[]): number {
		for (var i = 0, r = 0; i < keys.length; i++) if (this.delete(keys[i])) r++;
		return r;
	}

	/** Gets the height of the tree: the number of internal nodes between the
	 *  BTree object and its leaf nodes (zero if there are no internal nodes). */
	get height(): number {
		let node: BNode<K, V> | undefined = this._root;
		let height = -1;
		while (node) {
			height++;
			node = node.isLeaf ? undefined : (node as unknown as BNodeInternal<K, V>).children[0];
		}
		return height;
	}

	/** Makes the object read-only to ensure it is not accidentally modified.
	 *  Freezing does not have to be permanent; unfreeze() reverses the effect.
	 *  This is accomplished by replacing mutator functions with a function
	 *  that throws an Error. Compared to using a property (e.g. this.isFrozen)
	 *  this implementation gives better performance in non-frozen BTrees.
	 */
	freeze() {
		var t = this as any;
		// Note: all other mutators ultimately call set() or editRange()
		//       so we don't need to override those others.
		t.clear =
			t.set =
			t.editRange =
				function () {
					throw new Error('Attempted to modify a frozen BTree');
				};
	}

	/** Ensures mutations are allowed, reversing the effect of freeze(). */
	unfreeze() {
		// @ts-ignore "The operand of a 'delete' operator must be optional."
		//            (wrong: delete does not affect the prototype.)
		delete this.clear;
		// @ts-ignore
		delete this.set;
		// @ts-ignore
		delete this.editRange;
	}

	/** Returns true if the tree appears to be frozen. */
	get isFrozen() {
		return this.hasOwnProperty('editRange');
	}

	/** Scans the tree for signs of serious bugs (e.g. this.size doesn't match
	 *  number of elements, internal nodes not caching max element properly...)
	 *  Computational complexity: O(number of nodes), i.e. O(size). This method
	 *  skips the most expensive test - whether all keys are sorted - but it
	 *  does check that maxKey() of the children of internal nodes are sorted. */
	checkValid() {
		var size = this._root.checkValid(0, this, 0);
		check(size === this.size, 'size mismatch: counted ', size, 'but stored', this.size);
	}
}

/** A TypeScript helper function that simply returns its argument, typed as
 *  `ISortedSet<K>` if the BTree implements it, as it does if `V extends undefined`.
 *  If `V` cannot be `undefined`, it returns `unknown` instead. Or at least, that
 *  was the intention, but TypeScript is acting weird and may return `ISortedSet<K>`
 *  even if `V` can't be `undefined` (discussion: btree-typescript issue #14) */
export function asSet<K, V>(btree: BTree<K, V>): undefined extends V ? ISortedSet<K> : unknown {
	return btree as any;
}

declare const Symbol: any;
if (Symbol && Symbol.iterator)
	// iterator is equivalent to entries()
	(BTree as any).prototype[Symbol.iterator] = BTree.prototype.entries;
(BTree as any).prototype.where = BTree.prototype.filter;
(BTree as any).prototype.setRange = BTree.prototype.setPairs;
(BTree as any).prototype.add = BTree.prototype.set; // for compatibility with ISetSink<K>

function iterator<T>(next: () => IteratorResult<T> = () => ({ done: true, value: undefined })): IterableIterator<T> {
	var result: any = { next };
	if (Symbol && Symbol.iterator)
		result[Symbol.iterator] = function () {
			return this;
		};
	return result;
}

/** Leaf node / base class. **************************************************/
class BNode<K, V> {
	// If this is an internal node, _keys[i] is the highest key in children[i].
	keys: K[];
	values: V[];
	// True if this node might be within multiple `BTree`s (or have multiple parents).
	// If so, it must be cloned before being mutated to avoid changing an unrelated tree.
	// This is transitive: if it's true, children are also shared even if `isShared!=true`
	// in those children. (Certain operations will propagate isShared=true to children.)
	isShared: true | undefined;
	get isLeaf() {
		return (this as any).children === undefined;
	}

	constructor(keys: K[] = [], values?: V[]) {
		this.keys = keys;
		this.values = values || (undefVals as any[]);
		this.isShared = undefined;
	}

	///////////////////////////////////////////////////////////////////////////
	// Shared methods /////////////////////////////////////////////////////////

	maxKey() {
		return this.keys[this.keys.length - 1];
	}

	// If key not found, returns i^failXor where i is the insertion index.
	// Callers that don't care whether there was a match will set failXor=0.
	indexOf(key: K, failXor: number, cmp: (a: K, b: K) => number): index {
		const keys = this.keys;
		var lo = 0,
			hi = keys.length,
			mid = hi >> 1;
		while (lo < hi) {
			var c = cmp(keys[mid], key);
			if (c < 0) lo = mid + 1;
			else if (c > 0)
				// key < keys[mid]
				hi = mid;
			else if (c === 0) return mid;
			else {
				// c is NaN or otherwise invalid
				if (key === key)
					// at least the search key is not NaN
					return keys.length;
				else throw new Error('BTree: NaN was used as a key');
			}
			mid = (lo + hi) >> 1;
		}
		return mid ^ failXor;

		// Unrolled version: benchmarks show same speed, not worth using
		/*var i = 1, c: number = 0, sum = 0;
    if (keys.length >= 4) {
      i = 3;
      if (keys.length >= 8) {
        i = 7;
        if (keys.length >= 16) {
          i = 15;
          if (keys.length >= 32) {
            i = 31;
            if (keys.length >= 64) {
              i = 127;
              i += (c = i < keys.length ? cmp(keys[i], key) : 1) < 0 ? 64 : -64;
              sum += c;
              i += (c = i < keys.length ? cmp(keys[i], key) : 1) < 0 ? 32 : -32;
              sum += c;
            }
            i += (c = i < keys.length ? cmp(keys[i], key) : 1) < 0 ? 16 : -16;
            sum += c;
          }
          i += (c = i < keys.length ? cmp(keys[i], key) : 1) < 0 ? 8 : -8;
          sum += c;
        }
        i += (c = i < keys.length ? cmp(keys[i], key) : 1) < 0 ? 4 : -4;
        sum += c;
      }
      i += (c = i < keys.length ? cmp(keys[i], key) : 1) < 0 ? 2 : -2;
      sum += c;
    }
    i += (c = i < keys.length ? cmp(keys[i], key) : 1) < 0 ? 1 : -1;
    c = i < keys.length ? cmp(keys[i], key) : 1;
    sum += c;
    if (c < 0) {
      ++i;
      c = i < keys.length ? cmp(keys[i], key) : 1;
      sum += c;
    }
    if (sum !== sum) {
      if (key === key) // at least the search key is not NaN
        return keys.length ^ failXor;
      else
        throw new Error("BTree: NaN was used as a key");
    }
    return c === 0 ? i : i ^ failXor;*/
	}

	/////////////////////////////////////////////////////////////////////////////
	// Leaf Node: misc //////////////////////////////////////////////////////////

	minKey(): K | undefined {
		return this.keys[0];
	}

	minPair(reusedArray: [K, V]): [K, V] | undefined {
		if (this.keys.length === 0) return undefined;
		reusedArray[0] = this.keys[0];
		reusedArray[1] = this.values[0];
		return reusedArray;
	}

	maxPair(reusedArray: [K, V]): [K, V] | undefined {
		if (this.keys.length === 0) return undefined;
		const lastIndex = this.keys.length - 1;
		reusedArray[0] = this.keys[lastIndex];
		reusedArray[1] = this.values[lastIndex];
		return reusedArray;
	}

	clone(): BNode<K, V> {
		var v = this.values;
		return new BNode<K, V>(this.keys.slice(0), v === undefVals ? v : v.slice(0));
	}

	greedyClone(force?: boolean): BNode<K, V> {
		return this.isShared && !force ? this : this.clone();
	}

	get(key: K, defaultValue: V | undefined, tree: BTree<K, V>): V | undefined {
		var i = this.indexOf(key, -1, tree._compare);
		return i < 0 ? defaultValue : this.values[i];
	}

	getPairOrNextLower(
		key: K,
		compare: (a: K, b: K) => number,
		inclusive: boolean,
		reusedArray: [K, V]
	): [K, V] | undefined {
		var i = this.indexOf(key, -1, compare);
		const indexOrLower = i < 0 ? ~i - 1 : inclusive ? i : i - 1;
		if (indexOrLower >= 0) {
			reusedArray[0] = this.keys[indexOrLower];
			reusedArray[1] = this.values[indexOrLower];
			return reusedArray;
		}
		return undefined;
	}

	getPairOrNextHigher(
		key: K,
		compare: (a: K, b: K) => number,
		inclusive: boolean,
		reusedArray: [K, V]
	): [K, V] | undefined {
		var i = this.indexOf(key, -1, compare);
		const indexOrLower = i < 0 ? ~i : inclusive ? i : i + 1;
		const keys = this.keys;
		if (indexOrLower < keys.length) {
			reusedArray[0] = keys[indexOrLower];
			reusedArray[1] = this.values[indexOrLower];
			return reusedArray;
		}
		return undefined;
	}

	checkValid(depth: number, tree: BTree<K, V>, baseIndex: number): number {
		var kL = this.keys.length,
			vL = this.values.length;
		check(
			this.values === undefVals ? kL <= vL : kL === vL,
			'keys/values length mismatch: depth',
			depth,
			'with lengths',
			kL,
			vL,
			'and baseIndex',
			baseIndex
		);
		// Note: we don't check for "node too small" because sometimes a node
		// can legitimately have size 1. This occurs if there is a batch
		// deletion, leaving a node of size 1, and the siblings are full so
		// it can't be merged with adjacent nodes. However, the parent will
		// verify that the average node size is at least half of the maximum.
		check(depth == 0 || kL > 0, 'empty leaf at depth', depth, 'and baseIndex', baseIndex);
		return kL;
	}

	/////////////////////////////////////////////////////////////////////////////
	// Leaf Node: set & node splitting //////////////////////////////////////////

	set(key: K, value: V, overwrite: boolean | undefined, tree: BTree<K, V>): boolean | BNode<K, V> {
		var i = this.indexOf(key, -1, tree._compare);
		if (i < 0) {
			// key does not exist yet
			i = ~i;
			tree._size++;

			if (this.keys.length < tree._maxNodeSize) {
				return this.insertInLeaf(i, key, value, tree);
			} else {
				// This leaf node is full and must split
				var newRightSibling = this.splitOffRightSide(),
					target: BNode<K, V> = this;
				if (i > this.keys.length) {
					i -= this.keys.length;
					target = newRightSibling;
				}
				target.insertInLeaf(i, key, value, tree);
				return newRightSibling;
			}
		} else {
			// Key already exists
			if (overwrite !== false) {
				if (value !== undefined) this.reifyValues();
				// usually this is a no-op, but some users may wish to edit the key
				this.keys[i] = key;
				this.values[i] = value;
			}
			return false;
		}
	}

	reifyValues() {
		if (this.values === undefVals) return (this.values = this.values.slice(0, this.keys.length));
		return this.values;
	}

	insertInLeaf(i: index, key: K, value: V, tree: BTree<K, V>) {
		this.keys.splice(i, 0, key);
		if (this.values === undefVals) {
			while (undefVals.length < tree._maxNodeSize) undefVals.push(undefined);
			if (value === undefined) {
				return true;
			} else {
				this.values = undefVals.slice(0, this.keys.length - 1);
			}
		}
		this.values.splice(i, 0, value);
		return true;
	}

	takeFromRight(rhs: BNode<K, V>) {
		// Reminder: parent node must update its copy of key for this node
		// assert: neither node is shared
		// assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
		var v = this.values;
		if (rhs.values === undefVals) {
			if (v !== undefVals) v.push(undefined as any);
		} else {
			v = this.reifyValues();
			v.push(rhs.values.shift()!);
		}
		this.keys.push(rhs.keys.shift()!);
	}

	takeFromLeft(lhs: BNode<K, V>) {
		// Reminder: parent node must update its copy of key for this node
		// assert: neither node is shared
		// assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
		var v = this.values;
		if (lhs.values === undefVals) {
			if (v !== undefVals) v.unshift(undefined as any);
		} else {
			v = this.reifyValues();
			v.unshift(lhs.values.pop()!);
		}
		this.keys.unshift(lhs.keys.pop()!);
	}

	splitOffRightSide(): BNode<K, V> {
		// Reminder: parent node must update its copy of key for this node
		var half = this.keys.length >> 1,
			keys = this.keys.splice(half);
		var values = this.values === undefVals ? undefVals : this.values.splice(half);
		return new BNode<K, V>(keys, values);
	}

	/////////////////////////////////////////////////////////////////////////////
	// Leaf Node: scanning & deletions //////////////////////////////////////////

	forRange<R>(
		low: K,
		high: K,
		includeHigh: boolean | undefined,
		editMode: boolean,
		tree: BTree<K, V>,
		count: number,
		onFound?: (k: K, v: V, counter: number) => EditRangeResult<V, R> | void
	): EditRangeResult<V, R> | number {
		var cmp = tree._compare;
		var iLow, iHigh;
		if (high === low) {
			if (!includeHigh) return count;
			iHigh = (iLow = this.indexOf(low, -1, cmp)) + 1;
			if (iLow < 0) return count;
		} else {
			iLow = this.indexOf(low, 0, cmp);
			iHigh = this.indexOf(high, -1, cmp);
			if (iHigh < 0) iHigh = ~iHigh;
			else if (includeHigh === true) iHigh++;
		}
		var keys = this.keys,
			values = this.values;
		if (onFound !== undefined) {
			for (var i = iLow; i < iHigh; i++) {
				var key = keys[i];
				var result = onFound(key, values[i], count++);
				if (result !== undefined) {
					if (editMode === true) {
						if (key !== keys[i] || this.isShared === true)
							throw new Error('BTree illegally changed or cloned in editRange');
						if (result.delete) {
							this.keys.splice(i, 1);
							if (this.values !== undefVals) this.values.splice(i, 1);
							tree._size--;
							i--;
							iHigh--;
						} else if (result.hasOwnProperty('value')) {
							values![i] = result.value!;
						}
					}
					if (result.break !== undefined) return result;
				}
			}
		} else count += iHigh - iLow;
		return count;
	}

	/** Adds entire contents of right-hand sibling (rhs is left unchanged) */
	mergeSibling(rhs: BNode<K, V>, _: number) {
		this.keys.push.apply(this.keys, rhs.keys);
		if (this.values === undefVals) {
			if (rhs.values === undefVals) return;
			this.values = this.values.slice(0, this.keys.length);
		}
		this.values.push.apply(this.values, rhs.reifyValues());
	}
}

/** Internal node (non-leaf node) ********************************************/
class BNodeInternal<K, V> extends BNode<K, V> {
	// Note: conventionally B+ trees have one fewer key than the number of
	// children, but I find it easier to keep the array lengths equal: each
	// keys[i] caches the value of children[i].maxKey().
	children: BNode<K, V>[];

	/**
	 * This does not mark `children` as shared, so it is the responsibility of the caller
	 * to ensure children are either marked shared, or aren't included in another tree.
	 */
	constructor(children: BNode<K, V>[], keys?: K[]) {
		if (!keys) {
			keys = [];
			for (var i = 0; i < children.length; i++) keys[i] = children[i].maxKey();
		}
		super(keys);
		this.children = children;
	}

	clone(): BNode<K, V> {
		var children = this.children.slice(0);
		for (var i = 0; i < children.length; i++) children[i].isShared = true;
		return new BNodeInternal<K, V>(children, this.keys.slice(0));
	}

	greedyClone(force?: boolean): BNode<K, V> {
		if (this.isShared && !force) return this;
		var nu = new BNodeInternal<K, V>(this.children.slice(0), this.keys.slice(0));
		for (var i = 0; i < nu.children.length; i++) nu.children[i] = nu.children[i].greedyClone(force);
		return nu;
	}

	minKey() {
		return this.children[0].minKey();
	}

	minPair(reusedArray: [K, V]): [K, V] | undefined {
		return this.children[0].minPair(reusedArray);
	}

	maxPair(reusedArray: [K, V]): [K, V] | undefined {
		return this.children[this.children.length - 1].maxPair(reusedArray);
	}

	get(key: K, defaultValue: V | undefined, tree: BTree<K, V>): V | undefined {
		var i = this.indexOf(key, 0, tree._compare),
			children = this.children;
		return i < children.length ? children[i].get(key, defaultValue, tree) : undefined;
	}

	getPairOrNextLower(
		key: K,
		compare: (a: K, b: K) => number,
		inclusive: boolean,
		reusedArray: [K, V]
	): [K, V] | undefined {
		var i = this.indexOf(key, 0, compare),
			children = this.children;
		if (i >= children.length) return this.maxPair(reusedArray);
		const result = children[i].getPairOrNextLower(key, compare, inclusive, reusedArray);
		if (result === undefined && i > 0) {
			return children[i - 1].maxPair(reusedArray);
		}
		return result;
	}

	getPairOrNextHigher(
		key: K,
		compare: (a: K, b: K) => number,
		inclusive: boolean,
		reusedArray: [K, V]
	): [K, V] | undefined {
		var i = this.indexOf(key, 0, compare),
			children = this.children,
			length = children.length;
		if (i >= length) return undefined;
		const result = children[i].getPairOrNextHigher(key, compare, inclusive, reusedArray);
		if (result === undefined && i < length - 1) {
			return children[i + 1].minPair(reusedArray);
		}
		return result;
	}

	checkValid(depth: number, tree: BTree<K, V>, baseIndex: number): number {
		let kL = this.keys.length,
			cL = this.children.length;
		check(kL === cL, 'keys/children length mismatch: depth', depth, 'lengths', kL, cL, 'baseIndex', baseIndex);
		check(kL > 1 || depth > 0, 'internal node has length', kL, 'at depth', depth, 'baseIndex', baseIndex);
		let size = 0,
			c = this.children,
			k = this.keys,
			childSize = 0;
		for (var i = 0; i < cL; i++) {
			size += c[i].checkValid(depth + 1, tree, baseIndex + size);
			childSize += c[i].keys.length;
			check(size >= childSize, 'wtf', baseIndex); // no way this will ever fail
			check(i === 0 || c[i - 1].constructor === c[i].constructor, 'type mismatch, baseIndex:', baseIndex);
			if (c[i].maxKey() != k[i])
				check(
					false,
					'keys[',
					i,
					'] =',
					k[i],
					'is wrong, should be ',
					c[i].maxKey(),
					'at depth',
					depth,
					'baseIndex',
					baseIndex
				);
			if (!(i === 0 || tree._compare(k[i - 1], k[i]) < 0))
				check(false, 'sort violation at depth', depth, 'index', i, 'keys', k[i - 1], k[i]);
		}
		// 2020/08: BTree doesn't always avoid grossly undersized nodes,
		// but AFAIK such nodes are pretty harmless, so accept them.
		let toofew = childSize === 0; // childSize < (tree.maxNodeSize >> 1)*cL;
		if (toofew || childSize > tree.maxNodeSize * cL)
			check(
				false,
				toofew ? 'too few' : 'too many',
				'children (',
				childSize,
				size,
				') at depth',
				depth,
				'maxNodeSize:',
				tree.maxNodeSize,
				'children.length:',
				cL,
				'baseIndex:',
				baseIndex
			);
		return size;
	}

	/////////////////////////////////////////////////////////////////////////////
	// Internal Node: set & node splitting //////////////////////////////////////

	set(key: K, value: V, overwrite: boolean | undefined, tree: BTree<K, V>): boolean | BNodeInternal<K, V> {
		var c = this.children,
			max = tree._maxNodeSize,
			cmp = tree._compare;
		var i = Math.min(this.indexOf(key, 0, cmp), c.length - 1),
			child = c[i];

		if (child.isShared) c[i] = child = child.clone();
		if (child.keys.length >= max) {
			// child is full; inserting anything else will cause a split.
			// Shifting an item to the left or right sibling may avoid a split.
			// We can do a shift if the adjacent node is not full and if the
			// current key can still be placed in the same node after the shift.
			var other: BNode<K, V>;
			if (i > 0 && (other = c[i - 1]).keys.length < max && cmp(child.keys[0], key) < 0) {
				if (other.isShared) c[i - 1] = other = other.clone();
				other.takeFromRight(child);
				this.keys[i - 1] = other.maxKey();
			} else if ((other = c[i + 1]) !== undefined && other.keys.length < max && cmp(child.maxKey(), key) < 0) {
				if (other.isShared) c[i + 1] = other = other.clone();
				other.takeFromLeft(child);
				this.keys[i] = c[i].maxKey();
			}
		}

		var result = child.set(key, value, overwrite, tree);
		if (result === false) return false;
		this.keys[i] = child.maxKey();
		if (result === true) return true;

		// The child has split and `result` is a new right child... does it fit?
		if (this.keys.length < max) {
			// yes
			this.insert(i + 1, result);
			return true;
		} else {
			// no, we must split also
			var newRightSibling = this.splitOffRightSide(),
				target: BNodeInternal<K, V> = this;
			if (cmp(result.maxKey(), this.maxKey()) > 0) {
				target = newRightSibling;
				i -= this.keys.length;
			}
			target.insert(i + 1, result);
			return newRightSibling;
		}
	}

	/**
	 * Inserts `child` at index `i`.
	 * This does not mark `child` as shared, so it is the responsibility of the caller
	 * to ensure that either child is marked shared, or it is not included in another tree.
	 */
	insert(i: index, child: BNode<K, V>) {
		this.children.splice(i, 0, child);
		this.keys.splice(i, 0, child.maxKey());
	}

	/**
	 * Split this node.
	 * Modifies this to remove the second half of the items, returning a separate node containing them.
	 */
	splitOffRightSide() {
		// assert !this.isShared;
		var half = this.children.length >> 1;
		return new BNodeInternal<K, V>(this.children.splice(half), this.keys.splice(half));
	}

	takeFromRight(rhs: BNode<K, V>) {
		// Reminder: parent node must update its copy of key for this node
		// assert: neither node is shared
		// assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
		this.keys.push(rhs.keys.shift()!);
		this.children.push((rhs as BNodeInternal<K, V>).children.shift()!);
	}

	takeFromLeft(lhs: BNode<K, V>) {
		// Reminder: parent node must update its copy of key for this node
		// assert: neither node is shared
		// assert rhs.keys.length > (maxNodeSize/2 && this.keys.length<maxNodeSize)
		this.keys.unshift(lhs.keys.pop()!);
		this.children.unshift((lhs as BNodeInternal<K, V>).children.pop()!);
	}

	/////////////////////////////////////////////////////////////////////////////
	// Internal Node: scanning & deletions //////////////////////////////////////

	// Note: `count` is the next value of the third argument to `onFound`.
	//       A leaf node's `forRange` function returns a new value for this counter,
	//       unless the operation is to stop early.
	forRange<R>(
		low: K,
		high: K,
		includeHigh: boolean | undefined,
		editMode: boolean,
		tree: BTree<K, V>,
		count: number,
		onFound?: (k: K, v: V, counter: number) => EditRangeResult<V, R> | void
	): EditRangeResult<V, R> | number {
		var cmp = tree._compare;
		var keys = this.keys,
			children = this.children;
		var iLow = this.indexOf(low, 0, cmp),
			i = iLow;
		var iHigh = Math.min(high === low ? iLow : this.indexOf(high, 0, cmp), keys.length - 1);
		if (!editMode) {
			// Simple case
			for (; i <= iHigh; i++) {
				var result = children[i].forRange(low, high, includeHigh, editMode, tree, count, onFound);
				if (typeof result !== 'number') return result;
				count = result;
			}
		} else if (i <= iHigh) {
			try {
				for (; i <= iHigh; i++) {
					if (children[i].isShared) children[i] = children[i].clone();
					var result = children[i].forRange(low, high, includeHigh, editMode, tree, count, onFound);
					// Note: if children[i] is empty then keys[i]=undefined.
					//       This is an invalid state, but it is fixed below.
					keys[i] = children[i].maxKey();
					if (typeof result !== 'number') return result;
					count = result;
				}
			} finally {
				// Deletions may have occurred, so look for opportunities to merge nodes.
				var half = tree._maxNodeSize >> 1;
				if (iLow > 0) iLow--;
				for (i = iHigh; i >= iLow; i--) {
					if (children[i].keys.length <= half) {
						if (children[i].keys.length !== 0) {
							this.tryMerge(i, tree._maxNodeSize);
						} else {
							// child is empty! delete it!
							keys.splice(i, 1);
							children.splice(i, 1);
						}
					}
				}
				if (children.length !== 0 && children[0].keys.length === 0) check(false, 'emptiness bug');
			}
		}
		return count;
	}

	/** Merges child i with child i+1 if their combined size is not too large */
	tryMerge(i: index, maxSize: number): boolean {
		var children = this.children;
		if (i >= 0 && i + 1 < children.length) {
			if (children[i].keys.length + children[i + 1].keys.length <= maxSize) {
				if (children[i].isShared)
					// cloned already UNLESS i is outside scan range
					children[i] = children[i].clone();
				children[i].mergeSibling(children[i + 1], maxSize);
				children.splice(i + 1, 1);
				this.keys.splice(i + 1, 1);
				this.keys[i] = children[i].maxKey();
				return true;
			}
		}
		return false;
	}

	/**
	 * Move children from `rhs` into this.
	 * `rhs` must be part of this tree, and be removed from it after this call
	 * (otherwise isShared for its children could be incorrect).
	 */
	mergeSibling(rhs: BNode<K, V>, maxNodeSize: number) {
		// assert !this.isShared;
		var oldLength = this.keys.length;
		this.keys.push.apply(this.keys, rhs.keys);
		const rhsChildren = (rhs as any as BNodeInternal<K, V>).children;
		this.children.push.apply(this.children, rhsChildren);

		if (rhs.isShared && !this.isShared) {
			// All children of a shared node are implicitly shared, and since their new
			// parent is not shared, they must now be explicitly marked as shared.
			for (var i = 0; i < rhsChildren.length; i++) rhsChildren[i].isShared = true;
		}

		// If our children are themselves almost empty due to a mass-delete,
		// they may need to be merged too (but only the oldLength-1 and its
		// right sibling should need this).
		this.tryMerge(oldLength - 1, maxNodeSize);
	}
}

/**
 * A walkable pointer into a BTree for computing efficient diffs between trees with shared data.
 * - A cursor points to either a key/value pair (KVP) or a node (which can be either a leaf or an internal node).
 *    As a consequence, a cursor cannot be created for an empty tree.
 * - A cursor can be walked forwards using `step`. A cursor can be compared to another cursor to
 *    determine which is ahead in advancement.
 * - A cursor is valid only for the tree it was created from, and only until the first edit made to
 *    that tree since the cursor's creation.
 * - A cursor contains a key for the current location, which is the maxKey when the cursor points to a node
 *    and a key corresponding to a value when pointing to a leaf.
 * - Leaf is only populated if the cursor points to a KVP. If this is the case, levelIndices.length === internalSpine.length + 1
 *    and levelIndices[levelIndices.length - 1] is the index of the value.
 */
type DiffCursor<K, V> = {
	height: number;
	internalSpine: BNode<K, V>[][];
	levelIndices: number[];
	leaf: BNode<K, V> | undefined;
	currentKey: K;
};

// Optimization: this array of `undefined`s is used instead of a normal
// array of values in nodes where `undefined` is the only value.
// Its length is extended to max node size on first use; since it can
// be shared between trees with different maximums, its length can only
// increase, never decrease. Its type should be undefined[] but strangely
// TypeScript won't allow the comparison V[] === undefined[]. To prevent
// users from making this array too large, BTree has a maximum node size.
//
// FAQ: undefVals[i] is already undefined, so why increase the array size?
// Reading outside the bounds of an array is relatively slow because it
// has the side effect of scanning the prototype chain.
var undefVals: any[] = [];

const Delete = { delete: true },
	DeleteRange = () => Delete;
const Break = { break: true };
const EmptyLeaf = (function () {
	var n = new BNode<any, any>();
	n.isShared = true;
	return n;
})();
const EmptyArray: any[] = [];
const ReusedArray: any[] = []; // assumed thread-local

function check(fact: boolean, ...args: any[]) {
	if (!fact) {
		args.unshift('B+ tree'); // at beginning of message
		throw new Error(args.join(' '));
	}
}

/** A BTree frozen in the empty state. */
export const EmptyBTree = (() => {
	let t = new BTree();
	t.freeze();
	return t;
})();
