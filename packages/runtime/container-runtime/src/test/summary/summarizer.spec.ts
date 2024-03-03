/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SummarizerStopReason, Summarizer } from "../../summary/index.js";

describe("Runtime", () => {
	describe("Summarization", () => {
		describe("Summarizer", () => {
			it("Should not run last summary when reason is not parentNotConnected", () => {
				const stopReasons: SummarizerStopReason[] = [
					"failToSummarize",
					"notElectedParent",
					"notElectedClient",
					"summarizerClientDisconnected",
					"summarizerException",
				];

				// This doesn't prevent future stop reason additions, but it's a good baseline
				for (const stopReason of stopReasons) {
					assert(
						Summarizer.stopReasonCanRunLastSummary(stopReason) === false,
						"should not run last summary when stop reason is not parentNotConnected",
					);
				}
			});

			it("Should run last summary when reason is parentNotConnected", () => {
				assert(
					Summarizer.stopReasonCanRunLastSummary("parentNotConnected") === true,
					"should run last summary when stop reason is parentNotConnected",
				);
			});
		});
	});
});
