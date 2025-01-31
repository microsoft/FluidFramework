/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { DocumentContext } from "../../document-router/documentContext";
import { DebugLogger, TestKafka } from "@fluidframework/server-test-utils";
import { IContextErrorData, IRoutingKey } from "@fluidframework/server-services-core";

function validateException(fn: () => void) {
	try {
		fn();
		assert.ok(false);
	} catch (exception) {
		assert.ok(true);
	}
}

describe("document-router", () => {
	describe("DocumentContext", () => {
		let testContext: DocumentContext;
		let routingKey: IRoutingKey = {
			tenantId: "test-tenant-id",
			documentId: "test-document-id",
		};
		let offset0 = TestKafka.createdQueuedMessage(0);
		let contextTailOffset = TestKafka.createdQueuedMessage(-1);

		beforeEach(async () => {
			testContext = new DocumentContext(
				routingKey,
				offset0,
				DebugLogger.create("fluid-server:TestDocumentContext"),
				() => contextTailOffset,
				() => ({
					headPaused: false,
					tailPaused: false,
				}),
			);
		});

		describe(".setHead", () => {
			it("Should be able to set a new head offset", () => {
				assert.equal(0, testContext.head.offset);
				testContext.setHead(TestKafka.createdQueuedMessage(1));
				assert.equal(1, testContext.head.offset);
			});

			it("Should assert if new head is equal to existing head", () => {
				validateException(() => testContext.setHead(offset0));
			});

			it("Should assert if new head is less than existing head", () => {
				validateException(() => testContext.setHead(TestKafka.createdQueuedMessage(-5)));
			});
		});

		describe(".checkpoint", () => {
			it("Should be able to update the head offset of the manager", () => {
				testContext.checkpoint(offset0);
				assert.equal(0, testContext.tail.offset);
				assert.ok(!testContext.hasPendingWork());
			});

			it("Should be able to checkpoint after adjusting the head", () => {
				const offset10 = TestKafka.createdQueuedMessage(10);
				const offset15 = TestKafka.createdQueuedMessage(15);

				testContext.setHead(offset10);
				testContext.checkpoint(TestKafka.createdQueuedMessage(5));
				assert.equal(5, testContext.tail.offset);
				testContext.setHead(offset15);
				testContext.checkpoint(offset10);
				assert.equal(10, testContext.tail.offset);
				testContext.checkpoint(offset15);
				assert.equal(15, testContext.tail.offset);
				assert.ok(!testContext.hasPendingWork());
			});

			it("Should assert if checkpoint is less than tail", () => {
				validateException(() => testContext.checkpoint(offset0));
			});

			it("Should assert if checkpoint is equal to tail", () => {
				validateException(() => testContext.checkpoint(TestKafka.createdQueuedMessage(-1)));
			});

			it("Should assert if checkpoint is greater than head", () => {
				validateException(() => testContext.checkpoint(TestKafka.createdQueuedMessage(1)));
			});
		});

		describe(".error", () => {
			it("Should be able to update the head offset of the manager", async () => {
				return new Promise<void>((resolve, reject) => {
					testContext.on("error", (error, errorData: IContextErrorData) => {
						assert.ok(error);
						assert.equal(errorData.restart, true);
						resolve();
					});

					testContext.error("Test error", { restart: true });
				});
			});
		});
	});
});
