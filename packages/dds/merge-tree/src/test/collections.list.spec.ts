/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DoublyLinkedList, walkList } from "../collections/index.js";

describe("Collections.DoublyLinkedList", () => {
	const listCount = 5;
	let list: DoublyLinkedList<number>;

	beforeEach(() => {
		list = new DoublyLinkedList<number>();
		for (let i = 0; i < listCount; i++) {
			list.unshift(i);
		}
	});

	describe(".length", () => {
		it("Should return the total number of items in the list", () =>
			assert.equal(
				list.length,
				listCount,
				"The list count doesn't match the expected count.",
			));
	});

	describe(".first", () => {
		it("Should return the first item in the list", () =>
			assert.equal(list.first?.data, listCount - 1, "first item not expected value"));
	});

	describe(".last", () => {
		it("Should return the last item in the list", () =>
			assert.equal(list.last?.data, 0, "last item not expected value"));
	});

	describe("walkList", () => {
		it("Should walk all items of the list", () => {
			let i = listCount - 1;
			walkList(list, (node) => {
				assert.equal(node.data, i, "elemeted not expected value");
				i--;
			});
		});
	});

	describe(".iterator", () => {
		it("Should walk all items of the list", () => {
			let i = listCount - 1;
			for (const item of list) {
				assert.equal(item.data, i, "elemeted not expected value");
				i--;
			}
		});
	});

	describe(".unshift", () => {
		it("Should add item to the start of the list", () => {
			list.unshift(99);
			assert.equal(list.first?.data, 99, "first item not expected value");
			assert.equal(
				list.length,
				listCount + 1,
				"The list count doesn't match the expected count.",
			);
		});
	});
	describe(".push", () => {
		it("Should add item to the end of the list", () => {
			list.push(99);
			assert.equal(list.last?.data, 99, "last item not expected value");
			assert.equal(
				list.length,
				listCount + 1,
				"The list count doesn't match the expected count.",
			);
		});
	});

	describe(".splice", () => {
		for (const splicePos of [-1, 0, 1, Math.floor(listCount / 2), listCount, listCount - 1]) {
			it(`splice at position ${splicePos}`, () => {
				const nodesArray = [...list];
				// negative numbers for the start move back from the end
				// see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice#syntax
				const spliceIndex = splicePos < 0 ? nodesArray.length + splicePos : splicePos;
				// capture the node for the list splice
				const spliceNode = nodesArray[spliceIndex];
				const arraySplice = nodesArray.splice(spliceIndex);

				const listSplice =
					spliceNode === undefined ? new DoublyLinkedList() : list.splice(spliceNode);

				assert.equal(list.length, nodesArray.length, "remaining lengths don't match");
				assert.equal(listSplice.length, arraySplice.length, "spliced lengths don't match");

				const listNodes = [...list];
				for (let i = 0; i < listNodes.length; i++) {
					assert.equal(
						listNodes[i],
						nodesArray[i],
						`remaining node mismatch at pos ${i}`,
					);
				}

				const listSpliceNodes = [...listSplice];
				for (let i = 0; i < listSpliceNodes.length; i++) {
					assert.equal(
						listSpliceNodes[i],
						arraySplice[i],
						`splice node mismatch at pos ${i}`,
					);
				}
			});
		}
	});
});
