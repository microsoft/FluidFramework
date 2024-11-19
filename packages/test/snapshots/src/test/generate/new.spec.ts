/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Mode, processContent } from "../../replayMultipleFiles.js";

describe("Create snapshots", function () {
	this.timeout(999998);

	it("Create snapshots", async () => {
		await processContent(Mode.NewSnapshots);
	});
});
