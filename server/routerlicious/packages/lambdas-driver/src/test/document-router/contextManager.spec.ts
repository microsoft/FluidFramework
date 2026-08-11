/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IContext,
	IQueuedMessage,
	ILogger,
	IContextErrorData,
	IRoutingKey,
} from "@fluidframework/server-services-core";
import { TestKafka, DebugLogger } from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import { DocumentContextManager } from "../../document-router/contextManager";

class TestContext implements IContext {
	public offset = -1;

	public checkpoint(queuedMessage: IQueuedMessage) {
		assert(queuedMessage.offset >= this.offset, `${queuedMessage.offset} >= ${this.offset}`);
		this.offset = queuedMessage.offset;
	}

	public error(error: any, errorData: IContextErrorData) {
		throw new Error("Method not implemented.");
	}

	public pause(reason?: any) {
		throw new Error("Method not implemented.");
	}

	public resume() {
		throw new Error("Method not implemented.");
	}

	public readonly log: ILogger = DebugLogger.create("fluid-server:TestContextManager");
}

describe("document-router", () => {
	describe("DocumentContextManager", () => {
		let testContext: TestContext;
		let testContextManager: DocumentContextManager;
		let offset0: IQueuedMessage,
			offset5: IQueuedMessage,
			offset10: IQueuedMessage,
			offset12: IQueuedMessage,
			offset15: IQueuedMessage,
			offset20: IQueuedMessage,
			offset25: IQueuedMessage;
		let routingKey: IRoutingKey;

		beforeEach(async () => {
			testContext = new TestContext();
			testContextManager = new DocumentContextManager(testContext);

			routingKey = {
				tenantId: "test-tenant-id",
				documentId: "test-document-id",
			};

			offset0 = TestKafka.createdQueuedMessage(0);
			offset5 = TestKafka.createdQueuedMessage(5);
			offset10 = TestKafka.createdQueuedMessage(10);
			offset12 = TestKafka.createdQueuedMessage(12);
			offset15 = TestKafka.createdQueuedMessage(15);
			offset20 = TestKafka.createdQueuedMessage(20);
			offset25 = TestKafka.createdQueuedMessage(25);
		});

		describe(".createContext", () => {
			it("Should be able to create and then track a document context", () => {
				// Create an initial context
				testContextManager.setHead(offset0);
				const context = testContextManager.createContext(routingKey, offset0);
				testContextManager.setTail(offset0);

				// Move the head offset and update the context to match
				testContextManager.setHead(offset5);
				context.setHead(offset5);
				context.checkpoint(offset5);
				testContextManager.setTail(offset5);

				// Validate we are at the checkpointed context
				assert.equal(testContext.offset, 5);
			});

			it("Should be able to create and track multiple document contexts", () => {
				// Create an initial context
				testContextManager.setHead(offset0);
				const context0 = testContextManager.createContext(routingKey, offset0);
				testContextManager.setTail(offset0);

				// And then a second one
				testContextManager.setHead(offset5);
				const context1 = testContextManager.createContext(routingKey, offset5);
				testContextManager.setTail(offset5);

				// Third context
				testContextManager.setHead(offset10);
				const context2 = testContextManager.createContext(routingKey, offset10);
				testContextManager.setTail(offset10);

				// Offset should still be unset
				assert.equal(testContext.offset, -1);

				// New message and checkpoint the first context at the initial message.
				// Overall checkpoint still unaffected
				testContextManager.setHead(offset12);
				context0.setHead(offset12);
				context0.checkpoint(offset0);
				testContextManager.setTail(offset12);
				assert.equal(testContext.offset, 0);

				// New message and checkpoint the second message at the initial message.
				// Overall checkpoint still unaffected
				testContextManager.setHead(offset15);
				context1.setHead(offset15);
				context1.checkpoint(offset5);
				testContextManager.setTail(offset15);
				assert.equal(testContext.offset, 0);

				// Checkpoint the third context at its head - this should have the checkpoint be at the 0th
				// context's tail since it's the earliest
				context2.checkpoint(offset10);
				assert.equal(testContext.offset, 0);

				// Checkpoint the first context at its head. This will make the context1 the latest
				context0.checkpoint(offset12);
				assert.equal(testContext.offset, 5);

				// Update the manager location - the second context is not caught up so will hold the checkpoint offset
				testContextManager.setHead(offset20);
				testContextManager.setTail(offset20);
				assert.equal(testContext.offset, 5);

				// Move the second context to the head. This will make the manager's offset take over
				context1.checkpoint(offset15);
				assert.equal(testContext.offset, 20);
			});

			it("Should correctly compute the checkpointed offset after contexts switch pending work state", () => {
				// Create an initial context
				testContextManager.setHead(offset0);
				const context = testContextManager.createContext(routingKey, offset0);
				testContextManager.setTail(offset0);

				// Checkpoint the main context at a later point - having it no longer have pending work
				testContextManager.setHead(offset12);
				context.setHead(offset12);
				context.checkpoint(offset12);
				testContextManager.setTail(offset12);

				// Move the overall offsets - context having no pending work will have it not affect the offset
				// computation
				testContextManager.setHead(offset20);
				testContextManager.setTail(offset20);
				assert.equal(testContext.offset, 20);

				// Update context's head. This will transition it from no work to having pending work (the new head
				// at offset 25).
				testContextManager.setHead(offset25);
				context.setHead(offset25);
				testContextManager.setTail(offset25);

				// context did no checkpoint so the offset remains at 20
				assert.equal(testContext.offset, 20);
			});

			it("Should ignore contexts without pending work", () => {
				// Create an initial context
				testContextManager.setHead(offset0);
				const context = testContextManager.createContext(routingKey, offset0);
				context.checkpoint(offset0);
				testContextManager.setTail(offset0);

				// Move the manager's locations but keep the context static
				testContextManager.setHead(offset5);
				testContextManager.setTail(offset5);

				// Validate we are at the checkpointed context
				assert.equal(testContext.offset, 5);
			});

			it("Should not checkpoint until the starting offset changes", () => {
				// Create an initial context and verify no change to the checkpoint offset
				testContextManager.setHead(offset0);
				testContextManager.createContext(routingKey, offset0);
				testContextManager.setTail(offset0);
				assert.equal(testContext.offset, -1);

				// Move the manager's locations and verify no change to the checkpoint offset
				testContextManager.setHead(offset5);
				testContextManager.setTail(offset5);
				assert.equal(testContext.offset, -1);
			});

			it("Should emit an error if a created context emits an error", async () => {
				testContextManager.setHead(offset0);
				const context = testContextManager.createContext(routingKey, offset0);
				testContextManager.setTail(offset0);

				return new Promise<void>((resolve, reject) => {
					testContextManager.on("error", (error, errorData: IContextErrorData) => {
						assert.ok(error);
						assert.ok(errorData.restart);
						resolve();
					});

					context.error("Test Error", { restart: true });
				});
			});
		});
	});
});
