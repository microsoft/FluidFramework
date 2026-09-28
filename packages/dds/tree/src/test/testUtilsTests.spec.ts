/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

import type { JsonableTree } from "../core/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	toInitialSchema,
} from "../simple-tree/index.js";
import { brand } from "../util/index.js";

import {
	createSnapshotCompressor,
	getView,
	prepareTreeForCompare,
	snapshotSessionId,
	validateCheckoutSnapshotConsistency,
	validateViewConsistency,
} from "./utils.js";

describe("Test utils", () => {
	describe("prepareTreeForCompare", () => {
		it("normalizing", () => {
			assert.deepEqual(prepareTreeForCompare([{ type: brand("foo") }]), [{ type: "foo" }]);
			assert.deepEqual(prepareTreeForCompare([{ type: brand("foo"), fields: {} }]), [
				{ type: "foo" },
			]);
			assert.deepEqual(prepareTreeForCompare([{ type: brand("foo"), value: undefined }]), [
				{ type: "foo" },
			]);
		});

		it("without handles", () => {
			assert.deepEqual(prepareTreeForCompare([]), []);
			const leaf: JsonableTree = {
				type: brand("baz"),
				value: "x",
			};
			const cases: JsonableTree[] = [
				{ type: brand("foo") },
				leaf,
				{ type: brand("foo"), fields: { f: [leaf] } },
			];
			for (const node of cases) {
				assert.deepEqual(prepareTreeForCompare([node]), [node]);
			}
			// make sure multiple nodes work at once.
			assert.deepEqual(prepareTreeForCompare(cases), cases);
		});

		it("with handles", () => {
			assert.deepEqual(prepareTreeForCompare([]), []);
			const withHandle: JsonableTree = {
				type: brand("baz"),
				value: new MockHandle(5, "path", "fullPath"),
			};
			const withHandleExpected = {
				type: "baz",
				value: { Handle: "fullPath" },
			};
			const cases: JsonableTree[] = [
				{ type: brand("foo") },
				withHandle,
				{ type: brand("foo"), fields: { f: [withHandle] } },
			];

			assert.deepEqual(prepareTreeForCompare(cases), [
				{ type: "foo" },
				// This test is known to be impacted by https://github.com/nodejs/node/issues/62422 and thus can fail when running the full test suite (but not just this test) in NodeJS 24.
				// Adding the extra clone here works around that bug.
				// TODO: remove this unnecessary structuredClone call when it is no longer needed (likely once we drop support for NodeJS 24 when adopting NodeJS 26).
				structuredClone(withHandleExpected),
				{ type: "foo", fields: { f: [withHandleExpected] } },
			]);
		});

		it("createSnapshotCompressor", () => {
			// Test that createSnapshotCompressor gives a deterministic compressor
			const compressor = createSnapshotCompressor();

			{
				const compressed = compressor.generateCompressedId();
				assert.equal(compressed, 0);
				const stable = compressor.decompress(compressed);
				assert.equal(stable, snapshotSessionId);
			}
			{
				const compressed = compressor.generateCompressedId();
				assert.equal(compressed, 1);
				const stable = compressor.decompress(compressed);
				assert.equal(stable, "beefbeef-beef-4000-8000-000000000002");
			}
		});
	});

	describe("validateCheckoutSnapshotConsistency", () => {
		const config = new TreeViewConfiguration({
			schema: SchemaFactory.optional(SchemaFactory.number),
		});

		for (const difference of ["tree", "schema", "removed"] as const) {
			it(`detects a difference in ${difference}`, () => {
				const view = getView(config);
				view.initialize(1);
				view.root = 2;
				const checkout = view.checkout;
				const fork = checkout.fork();
				validateCheckoutSnapshotConsistency(checkout, fork);
				switch (difference) {
					case "tree": {
						fork.viewWith(config).root = 3;
						break;
					}
					case "schema": {
						fork.updateSchema(
							toInitialSchema(
								SchemaFactory.optional([SchemaFactory.number, SchemaFactory.string]),
							),
						);
						break;
					}
					case "removed": {
						const removed = fork.getRemovedRoots();
						assert(removed.length > 0);
						removed[0][2] = { ...removed[0][2], value: 3 };
						fork.getRemovedRoots = () => removed;
						break;
					}
					default: {
						assert.fail("Unexpected snapshot difference");
					}
				}
				assert.throws(
					() => validateCheckoutSnapshotConsistency(checkout, fork, difference),
					new RegExp(`Inconsistent .*: ${difference}`),
				);
				fork.dispose();
				view.dispose();
			});
		}
	});

	describe("validateViewConsistency", () => {
		it("compares the detached content of both checkouts", () => {
			const view = getView(
				new TreeViewConfiguration({ schema: SchemaFactory.optional(SchemaFactory.number) }),
			);
			view.initialize(1);
			view.root = undefined;
			const fork = view.checkout.fork();
			validateViewConsistency(view.checkout, fork);
			const removed = fork.getRemovedRoots();
			assert(removed.length > 0);
			removed[0][2] = { ...removed[0][2], value: 2 };
			fork.getRemovedRoots = () => removed;
			assert.throws(
				() => validateViewConsistency(view.checkout, fork),
				/Inconsistent removed trees json representation/,
			);
			fork.dispose();
			view.dispose();
		});
	});
});
