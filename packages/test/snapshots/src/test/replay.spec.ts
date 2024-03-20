/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mode, processContent } from "../replayMultipleFiles.js";
import { getTestContent, skipOrFailIfTestContentMissing } from "../testContent.js";

describe("Snapshots", function () {
	this.timeout(300000);

	const contentLocation = getTestContent("snapshotTestContent");

	beforeEach(function () {
		skipOrFailIfTestContentMissing(this, contentLocation);
	});

	it("Stress Test", async () => {
		await processContent(Mode.Stress);
	});

	it("writes snapshot in correct format", async () => {
		await processContent(Mode.Compare);
	});

	it("loads snapshots in old format", async () => {
		await processContent(Mode.Validate);
	});

	it("loads snapshots in old format and writes in correct format", async () => {
		await processContent(Mode.BackCompat);
	});
});
