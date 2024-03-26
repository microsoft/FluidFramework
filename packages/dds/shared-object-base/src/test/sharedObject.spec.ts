/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	IChannelAttributes,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IGarbageCollectionData, ISummaryTreeWithStats } from "@fluidframework/runtime-definitions";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { IFluidSerializer } from "../serializer.js";
import { SharedObject, SharedObjectCore } from "../sharedObject.js";

class MySharedObject extends SharedObject {
	constructor(id: string) {
		super(
			id,
			undefined as unknown as IFluidDataStoreRuntime,
			undefined as unknown as IChannelAttributes,
			"",
		);
	}

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		throw new Error("Method not implemented.");
	}
	protected async loadCore(services: IChannelStorageService): Promise<void> {
		throw new Error("Method not implemented.");
	}
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		throw new Error("Method not implemented.");
	}
	protected onDisconnect() {
		throw new Error("Method not implemented.");
	}
	protected applyStashedOp(content: any): unknown {
		throw new Error("Method not implemented.");
	}
}

class MySharedObjectCore extends SharedObjectCore {
	constructor(id: string) {
		super(
			id,
			undefined as unknown as IFluidDataStoreRuntime,
			undefined as unknown as IChannelAttributes,
		);
	}

	protected readonly serializer = {} as any as IFluidSerializer;

	protected summarizeCore(serializer: IFluidSerializer): ISummaryTreeWithStats {
		throw new Error("Method not implemented.");
	}
	protected async loadCore(services: IChannelStorageService): Promise<void> {
		throw new Error("Method not implemented.");
	}
	protected processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		throw new Error("Method not implemented.");
	}
	protected onDisconnect() {
		throw new Error("Method not implemented.");
	}
	protected applyStashedOp(content: any): unknown {
		throw new Error("Method not implemented.");
	}
	public getAttachSummary(fullTree?: boolean, trackState?: boolean): ISummaryTreeWithStats {
		throw new Error("Method not implemented.");
	}
	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
	): Promise<ISummaryTreeWithStats> {
		throw new Error("Method not implemented.");
	}
	public getGCData(fullGC?: boolean): IGarbageCollectionData {
		throw new Error("Method not implemented.");
	}
}

describe("SharedObject", () => {
	it("rejects slashes in id", () => {
		const invalidId = "beforeSlash/afterSlash";
		const codeBlock = () => new MySharedObject(invalidId);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(e, "Id cannot contain slashes"),
		);
	});
});

describe("SharedObjectCore", () => {
	it("rejects slashes in id", () => {
		const invalidId = "beforeSlash/afterSlash";
		const codeBlock = () => new MySharedObjectCore(invalidId);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(e, "Id cannot contain slashes"),
		);
	});
});
