/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { IAudience } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { OpStreamAttributor } from "../attributor";
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

describe("OpStreamAttributor", () => {
	let opFactory: OpFactory;
	beforeEach(() => {
		opFactory = new OpFactory();
	});

	it("can retrieve user information from ops submitted during the current session", () => {
        const runtime = makeMockRuntime(clientIds[0]);
        const attributor = new OpStreamAttributor(runtime);
        const clientId = clientIds[1];
        const timestamp = 50;
        const op = opFactory.makeOp({ timestamp, clientId });
        (runtime.deltaManager as any).emit("op", op);
        assert.deepEqual(
            attributor.getAttributionInfo(op.sequenceNumber),
            { user: runtime.getAudience().getMember(clientId)?.user, timestamp },
        );
	});
});
