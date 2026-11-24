/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { asAlpha } from "../api.js";
import {
	SchemaFactory,
	type ImplicitAllowedTypes,
	type TreeArrayNode,
	type TreeArrayNodeAlpha,
	type TreeMapNode,
	type TreeMapNodeAlpha,
	typeSchemaSymbol,
} from "../simple-tree/index.js";
import type { areSafelyAssignable, requireAssignableTo, requireTrue } from "../util/index.js";

import { describeHydration } from "./simple-tree/index.js";

const sf = new SchemaFactory("api-conversion");

class Numbers extends sf.array("Numbers", sf.number) {
	public label = "numbers";
	public first(): number | undefined {
		return this[0];
	}
}

class NumberMap extends sf.map("NumberMap", sf.number) {
	public label = "numbers";
	public first(): number | undefined {
		return this.get("first");
	}
}

describe("asAlpha", () => {
	describeHydration("ArrayNode", (init) => {
		it("preserves customized array types and types the alpha methods", () => {
			const node = init(Numbers, [1]);
			const alpha = asAlpha(node);
			assert.equal(alpha, node);
			assert.equal(alpha.label, "numbers");
			assert.equal(alpha.first(), 1);
			type _node = requireAssignableTo<typeof alpha, Numbers>;
			const twice = asAlpha(alpha);
			type _repeated = requireTrue<areSafelyAssignable<typeof twice, typeof alpha>>;
			assert.equal(twice, node);
			type _schema = requireTrue<
				areSafelyAssignable<
					(typeof alpha)[typeof typeSchemaSymbol],
					(typeof node)[typeof typeSchemaSymbol]
				>
			>;

			alpha.insertAtEnd(2);
			alpha.unshift(0);
			const mapped = alpha.map((value) => value + 1);
			const removed = alpha.splice(1, 1, 3);
			const last = alpha.pop();
			type _mapped = requireTrue<areSafelyAssignable<typeof mapped, number[]>>;
			type _removed = requireTrue<areSafelyAssignable<typeof removed, number[]>>;
			type _last = requireTrue<areSafelyAssignable<typeof last, number | undefined>>;
			// The conversion must not introduce a permissive overload alongside the original write API.
			type _stableWrite = requireTrue<
				areSafelyAssignable<typeof alpha.insertAtEnd, typeof node.insertAtEnd>
			>;
			type _alphaWrite = requireTrue<
				areSafelyAssignable<
					Parameters<typeof alpha.unshift>,
					Parameters<typeof node.insertAtStart>
				>
			>;
			assert.deepEqual(mapped, [1, 2, 3]);
			assert.deepEqual(removed, [1]);
			assert.equal(last, 2);
			assert.deepEqual([...node], [0, 3]);
		});

		it("preserves types for structurally named arrays", () => {
			const array = asAlpha(init(sf.array(sf.number), [1]));
			array.unshift(2);
			const first = array.at(0);
			type _first = requireTrue<areSafelyAssignable<typeof first, number | undefined>>;
			assert.equal(first, 2);
		});

		it("distinguishes readable nodes from insertable object data", () => {
			class Item extends sf.object("Item", { value: sf.number }) {}
			class Items extends sf.array("Items", Item) {}
			const array = asAlpha(init(Items, []));

			// Plain objects are valid inputs, but reads must return schema-based node instances.
			array.unshift({ value: 1 });
			const removed = array.pop();
			type _removed = requireTrue<areSafelyAssignable<typeof removed, Item | undefined>>;
			assert(removed instanceof Item);
			assert.equal(removed.value, 1);

			// Compile-only calls: an intersection must not hide an incorrectly typed alpha write method.
			function _rejectInvalidContent(): void {
				// @ts-expect-error The item's value must be numeric.
				array.unshift({ value: "invalid" });
			}
		});

		it("preserves recursive array read and insertion types", () => {
			class RecursiveArray extends sf.arrayRecursive("RecursiveArray", [
				sf.number,
				() => RecursiveArray,
			]) {}
			const array = asAlpha(init(RecursiveArray, []));
			array.unshift(1, new RecursiveArray([]));
			const last = array.pop();
			type _last = requireTrue<
				areSafelyAssignable<typeof last, number | RecursiveArray | undefined>
			>;
			assert(last instanceof RecursiveArray);
		});
	});

	describeHydration("MapNode", (init) => {
		it("preserves customized map types and types the alpha methods", () => {
			const node = init(NumberMap, { first: 1 });
			const alpha = asAlpha(node);
			assert.equal(alpha, node);
			assert.equal(alpha.label, "numbers");
			assert.equal(alpha.first(), 1);
			type _node = requireAssignableTo<typeof alpha, NumberMap>;
			const twice = asAlpha(alpha);
			type _repeated = requireTrue<areSafelyAssignable<typeof twice, typeof alpha>>;
			assert.equal(twice, node);
			type _schema = requireTrue<
				areSafelyAssignable<
					(typeof alpha)[typeof typeSchemaSymbol],
					(typeof node)[typeof typeSchemaSymbol]
				>
			>;

			alpha.set("second", 2);
			const read = alpha.get("second");
			const inserted = alpha.getOrInsert("third", 3);
			const computed = alpha.getOrInsertComputed("fourth", (key) => key.length);
			type _read = requireTrue<areSafelyAssignable<typeof read, number | undefined>>;
			type _inserted = requireTrue<areSafelyAssignable<typeof inserted, number>>;
			type _computed = requireTrue<areSafelyAssignable<typeof computed, number>>;
			type _stableWrite = requireTrue<areSafelyAssignable<typeof alpha.set, typeof node.set>>;
			type _alphaWrite = requireTrue<
				areSafelyAssignable<Parameters<typeof alpha.getOrInsert>, [string, number]>
			>;
			assert.equal(read, 2);
			assert.equal(inserted, 3);
			assert.equal(computed, 6);
			alpha.clear();
			assert.equal(node.size, 0);
		});

		it("preserves types for structurally named maps", () => {
			const map = asAlpha(init(sf.map(sf.number), { first: 1 }));
			const entry = map.getOrInsert("second", 2);
			type _entry = requireTrue<areSafelyAssignable<typeof entry, number>>;
			assert.equal(entry, 2);
		});

		it("distinguishes readable nodes from insertable object data", () => {
			class Item extends sf.object("Item", { value: sf.number }) {}
			class ItemMap extends sf.map("ItemMap", Item) {}
			const map = asAlpha(init(ItemMap, {}));

			// Plain objects are valid inputs, but reads must return schema-based node instances.
			const inserted = map.getOrInsert("first", { value: 2 });
			const computed = map.getOrInsertComputed("second", () => ({ value: 3 }));
			type _inserted = requireTrue<areSafelyAssignable<typeof inserted, Item>>;
			type _computed = requireTrue<areSafelyAssignable<typeof computed, Item>>;
			assert(inserted instanceof Item);
			assert(computed instanceof Item);
			assert.equal(inserted.value, 2);
			assert.equal(computed.value, 3);

			// Compile-only calls: an intersection must not hide an incorrectly typed alpha write method.
			function _rejectInvalidContent(): void {
				// @ts-expect-error The item's value must be numeric.
				map.getOrInsert("invalid", { value: "invalid" });
				// @ts-expect-error A computed fallback must also match the schema.
				map.getOrInsertComputed("invalid", () => ({ value: "invalid" }));
				// @ts-expect-error Unlike set, getOrInsert does not accept undefined.
				map.getOrInsert("invalid", undefined);
			}
		});

		it("preserves recursive map read and insertion types", () => {
			class RecursiveMap extends sf.mapRecursive("RecursiveMap", [
				sf.number,
				() => RecursiveMap,
			]) {}
			const map = asAlpha(init(RecursiveMap, {}));
			const entry = map.getOrInsert("first", new RecursiveMap({}));
			type _entry = requireTrue<areSafelyAssignable<typeof entry, number | RecursiveMap>>;
			assert(entry instanceof RecursiveMap);
		});

		it("preserves null as a map value rather than treating it as a missing entry", () => {
			const map = asAlpha(init(sf.map([sf.number, sf.null]), { first: null }));
			// Only undefined is removed when deriving the fallback type from set's parameter.
			const existing = map.getOrInsert("first", 1);
			const inserted = map.getOrInsert("second", null);
			type _existing = requireTrue<areSafelyAssignable<typeof existing, number | null>>;
			type _inserted = requireTrue<areSafelyAssignable<typeof inserted, number | null>>;
			assert.equal(existing, null);
			assert.equal(inserted, null);
		});
	});

	it("supports generic collection callers and explicit type arguments", () => {
		function arrayAlpha<T extends ImplicitAllowedTypes>(
			node: TreeArrayNode<T>,
		): TreeArrayNodeAlpha<T> {
			return asAlpha(node);
		}
		function mapAlpha<T extends ImplicitAllowedTypes>(
			node: TreeMapNode<T>,
		): TreeMapNodeAlpha<T> {
			return asAlpha(node);
		}

		const array = new Numbers([]);
		const map = new NumberMap({});
		arrayAlpha<typeof sf.number>(array).unshift(1);
		assert.equal(mapAlpha<typeof sf.number>(map).getOrInsert("first", 1), 1);
		asAlpha<typeof sf.number>(array).unshift(2);
		assert.equal(asAlpha<typeof sf.number>(map).getOrInsert("second", 2), 2);
		// TypeScript does not infer later type parameters after an explicit earlier argument.
		// Supplying both arguments preserves the customized node type in that call form.
		assert.equal(asAlpha<typeof sf.number, Numbers>(array).first(), 2);
		assert.equal(asAlpha<typeof sf.number, NumberMap>(map).first(), 1);
	});

	it("keeps union array writes safe", () => {
		class Strings extends sf.array("Strings", sf.string) {}

		function checkArray(node: Numbers | Strings): void {
			const alpha = asAlpha(node);
			const last = alpha.pop();
			type _last = requireTrue<areSafelyAssignable<typeof last, number | string | undefined>>;
			assert.equal(last, undefined);
			// Narrowing the node must also narrow its alpha insertion methods.
			if (alpha instanceof Numbers) {
				alpha.unshift(1);
			} else {
				alpha.unshift("first");
			}
			function _rejectWrongBranch(): void {
				// @ts-expect-error A number cannot be inserted if the input might be a string array.
				alpha.unshift(1);
			}
		}

		checkArray(new Numbers([]));
		checkArray(new Strings([]));
	});

	it("keeps union map writes safe", () => {
		class StringMap extends sf.map("StringMap", sf.string) {}

		function checkMap(node: NumberMap | StringMap): void {
			const alpha = asAlpha(node);
			const entry = alpha.get("first");
			type _entry = requireTrue<
				areSafelyAssignable<typeof entry, number | string | undefined>
			>;
			assert.equal(entry, undefined);
			if (alpha instanceof NumberMap) {
				const inserted = alpha.getOrInsert("first", 1);
				type _inserted = requireTrue<areSafelyAssignable<typeof inserted, number>>;
				assert.equal(inserted, 1);
			} else {
				const inserted = alpha.getOrInsert("first", "value");
				type _inserted = requireTrue<areSafelyAssignable<typeof inserted, string>>;
				assert.equal(inserted, "value");
			}
			function _rejectWrongBranch(): void {
				// @ts-expect-error A number cannot be inserted if the input might be a string map.
				alpha.getOrInsert("first", 1);
			}
		}

		checkMap(new NumberMap({}));
		checkMap(new StringMap({}));
	});
});
