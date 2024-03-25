/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createInsertOnlyAttributionPolicy } from "../attributionPolicy.js";
import { TestClient } from "./testClient.js";

const localUserLongId = "localUser";
describe("createInsertOnlyAttributionPolicy", () => {
	let client: TestClient;
	let seq = 0;
	beforeEach(() => {
		client = new TestClient({
			attribution: {
				track: true,
				policyFactory: createInsertOnlyAttributionPolicy,
			},
		});
		seq = 0;
	});

	it("Attributes content on insert", () => {
		client.startOrUpdateCollaboration(localUserLongId);
		client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "ABC"), ++seq, seq - 1));
		assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, 1]);
	});

	it("Attributes content inserted before starting collaboration with a detached key", () => {
		client.insertTextLocal(0, "C");
		client.startOrUpdateCollaboration(localUserLongId);
		client.applyMsg(client.makeOpMessage(client.insertTextLocal(0, "AB"), ++seq, seq - 1));
		assert.deepEqual(client.getAllAttributionSeqs(), [1, 1, { type: "detached", id: 0 }]);
	});
});
