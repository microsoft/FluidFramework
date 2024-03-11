/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MergeTreeDeltaType } from "../ops.js";
import { MergeTreeDeltaCallback } from "../mergeTreeDeltaCallback.js";
import { useStrictPartialLengthChecks } from "./testUtils.js";
import { ReconnectTestHelper } from "./reconnectHelper.js";

describe("obliterate delta callback", () => {
	useStrictPartialLengthChecks();

	let length: number;
	let cb: MergeTreeDeltaCallback;

	beforeEach(() => {
		length = 0;
		cb = (opArgs, deltaArgs) => {
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
				default: {
				}
			}
		};
	});

	it("works", () => {
		const helper = new ReconnectTestHelper();

		let count = 0;

		helper.clients.A.on("delta", (opArgs, deltaArgs) => {
			if (opArgs.op.type === MergeTreeDeltaType.OBLITERATE) {
				count += 1;
			}
		});

		// local
		helper.insertText("A", 0, "a");
		assert.equal(count, 0);
		helper.obliterateRange("A", 0, 1);
		assert.equal(count, 1);
		helper.processAllOps();
		assert.equal(count, 1);
		assert.equal(helper.clients.A.getText(), "");

		// remote
		helper.insertText("B", 0, "a");
		assert.equal(count, 1);
		helper.obliterateRange("B", 0, 1);
		assert.equal(count, 1);
		helper.processAllOps();
		assert.equal(count, 2);
		assert.equal(helper.clients.A.getText(), "");

		helper.logger.validate();
	});

	it("overlapping obliterate+remove", () => {
		const helper = new ReconnectTestHelper();

		helper.clients.A.on("delta", cb);

		const text = "abcdef";

		// obliterate first
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

	it("overlapping remove+obliterate", () => {
		const helper = new ReconnectTestHelper();

		helper.clients.A.on("delta", cb);

		const text = "abcdef";

		// remove first
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

	it("overlapping obliterate+obliterate", () => {
		const helper = new ReconnectTestHelper();

		helper.clients.A.on("delta", cb);

		const text = "abcdef";

		// obliterate first
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

	it("insert into obliterated range", () => {
		const helper = new ReconnectTestHelper();

		helper.clients.A.on("delta", cb);

		const text = "abcdef";

		// insert first
		helper.insertText("B", 0, text);
		helper.processAllOps();
		assert.equal(length, text.length);
		helper.insertText("B", 3, text);
		helper.obliterateRange("C", 0, text.length);
		helper.processAllOps();
		assert.equal(length, 0);

		// obliterate first
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
