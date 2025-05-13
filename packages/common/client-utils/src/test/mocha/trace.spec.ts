/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Trace } from "../../indexNode.js";

describe("Trace", () => {
	it("measure 2ms timeout", async () => {
		const trace = Trace.start();

		return new Promise((resolve, reject) => {
			setTimeout(() => {
				try {
					const event = trace.trace();

					// While we specify a 2ms timeout, it's possible for performance.now() to measure a
					// slightly smaller duration due to timing attack and fingerprinting mitigations.
					// (See https://developer.mozilla.org/en-US/docs/Web/API/Performance/now#security_requirements)
					//
					// Therefore, we conservatively require that only 1ms has elapsed.
					assert(event.duration >= 1);
					assert(event.totalTimeElapsed >= 1);

					resolve(undefined);
				} catch (error) {
					reject(error);
				}
			}, 2);
		});
	});
});
