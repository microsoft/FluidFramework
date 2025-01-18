/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// eslint-disable-next-line import/no-deprecated
import type { SummarizerStopReason } from "@fluidframework/container-runtime-definitions/internal";

// eslint-disable-next-line import/no-deprecated
import { Summarizer } from "../../summary/index.js";

describe("Runtime", () => {
	describe("Summarization", () => {
		// eslint-disable-next-line import/no-deprecated
		describe("Summarizer", () => {
			it("Should not run last summary when reason is not parentNotConnected", () => {
				// eslint-disable-next-line import/no-deprecated
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
						// eslint-disable-next-line import/no-deprecated
						Summarizer.stopReasonCanRunLastSummary(stopReason) === false,
						"should not run last summary when stop reason is not parentNotConnected",
					);
				}
			});

			it("Should run last summary when reason is parentNotConnected", () => {
				assert(
					// eslint-disable-next-line import/no-deprecated
					Summarizer.stopReasonCanRunLastSummary("parentNotConnected") === true,
					"should run last summary when stop reason is parentNotConnected",
				);
			});
		});
	});
});
