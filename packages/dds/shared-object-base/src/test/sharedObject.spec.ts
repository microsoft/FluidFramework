/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Add IFluidHandle import for mock handle
import type { IFluidHandleContext } from "@fluidframework/core-interfaces/internal";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	IChannelStorageService,
	IFluidDataStoreRuntimeInternalConfig,
} from "@fluidframework/datastore-definitions/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	IGarbageCollectionData,
	ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions/internal";
import { isSerializedHandle } from "@fluidframework/runtime-utils/internal";
import {
	MockFluidDataStoreRuntime,
	MockHandle,
	validateAssertionError,
} from "@fluidframework/test-runtime-utils/internal";
import sinon from "sinon";

import { FluidSerializer, IFluidSerializer } from "../serializer.js";
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
	): void {
		throw new Error("Method not implemented.");
	}
	protected onDisconnect(): void {
		throw new Error("Method not implemented.");
	}
	protected applyStashedOp(content: unknown): void {
		throw new Error("Method not implemented.");
	}
}

class MySharedObjectCore extends SharedObjectCore {
	constructor({
		id,
		runtime = new MockFluidDataStoreRuntime(),
		attributes = { type: "test" } as unknown as IChannelAttributes,
		submitFnOverride = sinon.fake(),
		attached = false,
	}: {
		id: string;
		runtime?: IFluidDataStoreRuntime;
		attributes?: IChannelAttributes;
		submitFnOverride?: sinon.SinonSpy;
		attached?: boolean;
	}) {
		super(id, runtime, attributes);

		this.attached = attached;
		// See call site in SharedObjectCore.submitLocalMessage
		Object.assign(this, { services: { deltaConnection: { submit: submitFnOverride } } });
	}

	// Make submitLocalMessage public for testing
	public submitLocalMessage(content: unknown, localOpMetadata: unknown = undefined): void {
		super.submitLocalMessage(content, localOpMetadata);
	}

	public stubSubmitFn(submitFn: sinon.SinonSpy): void {
		// See call site in SharedObjectCore.submitLocalMessage
		Object.assign(this, { services: { deltaConnection: { submit: submitFn } } });
	}

	public override isAttached(): boolean {
		return this.attached;
	}
	private readonly attached: boolean;

	protected readonly serializer = new FluidSerializer({} as unknown as IFluidHandleContext);

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
	): void {
		throw new Error("Method not implemented.");
	}
	protected onDisconnect(): void {
		throw new Error("Method not implemented.");
	}
	protected applyStashedOp(content: unknown): void {
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
		const codeBlock = (): SharedObject => new MySharedObject(invalidId);
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(e, "Id cannot contain slashes"),
		);
	});
});

describe("SharedObjectCore", () => {
	it("rejects slashes in id", () => {
		const invalidId = "beforeSlash/afterSlash";
		const codeBlock = (): SharedObjectCore => new MySharedObjectCore({ id: invalidId });
		assert.throws(codeBlock, (e: Error) =>
			validateAssertionError(e, "Id cannot contain slashes"),
		);
	});

	describe("handle encoding in submitLocalMessage", () => {
		let sharedObject: MySharedObjectCore;
		let dataStoreRuntime: MockFluidDataStoreRuntime;
		let submitSpy: sinon.SinonSpy;

		// Define a mock handle object
		const mockHandle = new MockHandle("some data");

		// Define message content with the handle
		const messageContentWithHandle = {
			type: "opWithHandle",
			handle: mockHandle,
		};

		const serializedMockHandleMatcher = sinon.match(
			(value: unknown) => isSerializedHandle(value) && value.url === mockHandle.absolutePath,
			"serialized handle string",
		);

		function set_submitMessagesWithoutEncodingHandles(value: boolean | undefined): void {
			(
				dataStoreRuntime as unknown as {
					submitMessagesWithoutEncodingHandles?: boolean;
				} satisfies Partial<IFluidDataStoreRuntimeInternalConfig>
			).submitMessagesWithoutEncodingHandles = value;
		}

		beforeEach(() => {
			dataStoreRuntime = new MockFluidDataStoreRuntime();
			set_submitMessagesWithoutEncodingHandles(undefined); // Reset config

			submitSpy = sinon.fake();

			sharedObject = new MySharedObjectCore({
				id: "testId",
				runtime: dataStoreRuntime,
				attached: true,
				submitFnOverride: submitSpy,
			});
			sharedObject.stubSubmitFn(submitSpy);
		});

		afterEach(() => {
			// Reset the submit spy after each test
			submitSpy.resetHistory();
		});

		it("submits handle object when submitMessagesWithoutEncodingHandles is true", () => {
			set_submitMessagesWithoutEncodingHandles(true);

			sharedObject.submitLocalMessage(messageContentWithHandle);

			// Assert submit was called once with the exact object containing the handle object
			assert(
				submitSpy.calledOnceWithExactly(
					messageContentWithHandle,
					undefined /* localOpMetadata */,
				),
				"Submit should be called with the exact message content including the handle object",
			);
		});

		it("submits stringified handle when submitMessagesWithoutEncodingHandles is false", () => {
			set_submitMessagesWithoutEncodingHandles(false);

			sharedObject.submitLocalMessage(messageContentWithHandle);

			// Assert submit was called once with an object where 'handle' matches the serialized string pattern
			assert(
				submitSpy.calledOnceWith(
					sinon.match({
						type: messageContentWithHandle.type,
						handle: serializedMockHandleMatcher,
					}),
					undefined /* localOpMetadata */,
				),
				"Submit should be called with message content including a serialized handle string",
			);
		});

		it("submits stringified handle when submitMessagesWithoutEncodingHandles is undefined", () => {
			assert.strictEqual(
				(dataStoreRuntime as Partial<IFluidDataStoreRuntimeInternalConfig>)
					.submitMessagesWithoutEncodingHandles,
				undefined,
				"Config should be undefined initially",
			);

			sharedObject.submitLocalMessage(messageContentWithHandle);

			// Assert submit was called once with an object where 'handle' matches the serialized string pattern
			assert(
				submitSpy.calledOnceWith(
					sinon.match({
						type: messageContentWithHandle.type,
						handle: serializedMockHandleMatcher, // Use the custom matcher
					}),
					undefined /* localOpMetadata */,
				),
				"Submit should be called with message content including a serialized handle string (default case)",
			);
		});
	});
});
