/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IAudience } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { Attributor } from "../attributor";
import { makeMockAudience } from "./utils";

const clientIds = ["A", "B", "C"];
const defaultAudience = makeMockAudience(clientIds);

class OpFactory {
	private seq = 0;

	public makeOp({ timestamp, clientId }: { timestamp: number; clientId: string; }): ISequencedDocumentMessage {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		return {
			timestamp,
			clientId,
			sequenceNumber: this.seq++,
		} as ISequencedDocumentMessage;
	}
}

function makeMockRuntime(clientId: string, audience: IAudience = defaultAudience): IFluidDataStoreRuntime {
	const runtime = new MockFluidDataStoreRuntime({ clientId });
	runtime.getAudience = () => audience;
	return runtime;
}

describe("Attributor", () => {
	let opFactory: OpFactory;
	beforeEach(() => {
		opFactory = new OpFactory();
	});

	describe("can retrieve user information", () => {
		it("from ops submitted during the current session", () => {
			const runtime = makeMockRuntime(clientIds[0]);
			const attributor = new Attributor(runtime);
			const clientId = clientIds[1];
			const timestamp = 50;
			const op = opFactory.makeOp({ timestamp, clientId });
			(runtime.deltaManager as any).emit("op", op);
			assert.deepEqual(
				attributor.getAttributionInfo(op.sequenceNumber),
				{ user: runtime.getAudience().getMember(clientId)?.user, timestamp },
			);
		});

		it("from ops submitted during a previous session", () => {
			const runtime = makeMockRuntime(clientIds[0]);
			const originalAttributor = new Attributor(runtime);
			const clientId = clientIds[1];
			const timestamp = 50;
			const op = opFactory.makeOp({ timestamp, clientId });
			(runtime.deltaManager as any).emit("op", op);
			const attributor = new Attributor(makeMockRuntime(clientIds[0]), originalAttributor.serialize());
			assert.deepEqual(
				attributor.getAttributionInfo(op.sequenceNumber),
				{ user: runtime.getAudience().getMember(clientId)?.user, timestamp },
			);
		});
	});

	it("getAttributionInfo throws on attempt to retrieve user information for an invalid key", () => {
		const attributor = new Attributor(makeMockRuntime(clientIds[0]));
		assert.throws(
			() => attributor.getAttributionInfo(42),
			/Requested attribution information for unstored key/,
			"invalid key should throw",
		);
	});

	it("tryGetAttributionInfo returns undefined to retrieve user information for an invalid key", () => {
		const attributor = new Attributor(makeMockRuntime(clientIds[0]));
		assert.equal(attributor.tryGetAttributionInfo(42), undefined);
	});
});
