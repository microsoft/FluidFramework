/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { MergeTreeDeltaCallback } from "../mergeTreeDeltaCallback.js";
import { MergeTreeDeltaType } from "../ops.js";

import { ClientTestHelper } from "./partialSyncHelper.js";
import { useStrictPartialLengthChecks } from "./testUtils.js";

describe("obliterate delta callback", () => {
	useStrictPartialLengthChecks();

	let length: number;
	let cb: MergeTreeDeltaCallback;

	beforeEach(() => {
		length = 0;
		cb = (opArgs, deltaArgs): void => {
			switch (opArgs.op.type) {
				case MergeTreeDeltaType.INSERT: {
					for (const { segment } of deltaArgs.deltaSegments) {
						length += segment.cachedLength;
					}
					break;
				}
				case MergeTreeDeltaType.REMOVE:
				case MergeTreeDeltaType.OBLITERATE: {
					for (const { segment } of deltaArgs.deltaSegments) {
						length -= segment.cachedLength;
					}
					break;
				}
				default:
			}
		};
	});

	describe("is invoked", () => {
		it("on local obliterate", () => {
			const helper = new ClientTestHelper();

			let count = 0;

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				if (opArgs.op.type === MergeTreeDeltaType.OBLITERATE) {
					count += 1;
				}
			});

			helper.insertText("A", 0, "a");
			assert.equal(count, 0);
			helper.obliterateRange("A", 0, 1);
			assert.equal(count, 1);
			helper.processAllOps();
			assert.equal(count, 1);
			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});

		it("on remote obliterate", () => {
			const helper = new ClientTestHelper();

			let count = 0;

			helper.clients.A.on("delta", (opArgs, deltaArgs) => {
				if (opArgs.op.type === MergeTreeDeltaType.OBLITERATE) {
					count += 1;
				}
			});

			helper.insertText("B", 0, "a");
			assert.equal(count, 0);
			helper.obliterateRange("B", 0, 1);
			assert.equal(count, 0);
			helper.processAllOps();
			assert.equal(count, 1);
			assert.equal(helper.clients.A.getText(), "");

			helper.logger.validate();
		});
	});

	describe("overlapping obliterate and remove", () => {
		const text = "abcdef";

		it("remove first", () => {
			const helper = new ClientTestHelper();

			helper.clients.A.on("delta", cb);

			helper.insertText("A", 0, text);
			helper.processAllOps();
			assert.equal(length, text.length);
			helper.removeRange("B", 0, text.length);
			helper.obliterateRange("C", 0, text.length);
			helper.processAllOps();
			assert.equal(length, 0);

			helper.logger.validate();

			helper.clients.A.off("delta", cb);
		});

		it("obliterate first", () => {
			const helper = new ClientTestHelper();

			helper.clients.A.on("delta", cb);

			helper.insertText("B", 0, text);
			helper.processAllOps();
			assert.equal(length, text.length);
			helper.obliterateRange("C", 0, text.length);
			helper.removeRange("B", 0, text.length);
			helper.processAllOps();
			assert.equal(length, 0);

			helper.logger.validate();

			helper.clients.A.off("delta", cb);
		});
	});

	it("overlapping obliterate and obliterate", () => {
		const helper = new ClientTestHelper();

		helper.clients.A.on("delta", cb);

		const text = "abcdef";

		helper.insertText("B", 0, text);
		helper.processAllOps();
		assert.equal(length, text.length);
		helper.obliterateRange("B", 0, text.length);
		helper.obliterateRange("C", 0, text.length);
		helper.processAllOps();
		assert.equal(length, 0);

		helper.logger.validate();

		helper.clients.A.off("delta", cb);
	});

	describe("insert into obliterated range", () => {
		const text = "abcdef";

		it("insert first", () => {
			const helper = new ClientTestHelper();

			helper.clients.A.on("delta", cb);

			helper.insertText("B", 0, text);
			helper.processAllOps();
			assert.equal(length, text.length);
			helper.insertText("B", 3, text);
			helper.obliterateRange("C", 0, text.length);
			helper.processAllOps();
			assert.equal(length, 0);

			helper.logger.validate();

			helper.clients.A.off("delta", cb);
		});

		it("obliterate first", () => {
			const helper = new ClientTestHelper();

			helper.clients.A.on("delta", cb);

			helper.insertText("B", 0, text);
			helper.processAllOps();
			assert.equal(length, text.length);
			helper.obliterateRange("C", 0, text.length);
			helper.insertText("B", 3, text);
			helper.processAllOps();
			assert.equal(length, 0);

			helper.logger.validate();

			helper.clients.A.off("delta", cb);
		});
	});
});
