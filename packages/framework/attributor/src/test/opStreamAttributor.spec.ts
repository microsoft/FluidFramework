/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "node:assert";
import { type ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockDeltaManager } from "@fluidframework/test-runtime-utils";
import { OpStreamAttributor } from "../attributor.js";
import { makeMockAudience } from "./utils.js";

const clientIds = ["A", "B", "C"];
const defaultAudience = makeMockAudience(clientIds);

class OpFactory {
	private seq = 0;

	public makeOp({
		timestamp,
		clientId,
	}: {
		timestamp: number;
		clientId: string;
	}): ISequencedDocumentMessage {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return {
			type: "op",
			timestamp,
			clientId,
			sequenceNumber: this.seq++,
		} as ISequencedDocumentMessage;
	}
}

describe("OpStreamAttributor", () => {
	let opFactory: OpFactory;
	beforeEach(() => {
		opFactory = new OpFactory();
	});

	it("can retrieve user information from ops submitted during the current session", () => {
		const deltaManager = new MockDeltaManager();
		const attributor = new OpStreamAttributor(deltaManager, defaultAudience);
		const clientId = clientIds[1];
		const timestamp = 50;
		const op = opFactory.makeOp({ timestamp, clientId });
		deltaManager.emit("op", op);
		assert.deepEqual(attributor.getAttributionInfo(op.sequenceNumber), {
			user: defaultAudience.getMember(clientId)?.user,
			timestamp,
		});
	});
});
