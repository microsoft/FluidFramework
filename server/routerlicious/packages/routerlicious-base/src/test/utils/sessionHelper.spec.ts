/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import sinon from "sinon";
import {
	IDocumentRepository,
	IDocument,
	MongoDocumentRepository,
} from "@fluidframework/server-services-core";
import { getSession } from "../../utils/sessionHelper";
import { strict as assert } from "assert";

describe("sessionHelper", () => {
	describe("getSession", () => {
		let documentRepository: sinon.SinonStubbedInstance<IDocumentRepository>;

		beforeEach(() => {
			// Create a mock document repository that will fail the first doc call
			documentRepository =
				sinon.createStubInstance<IDocumentRepository>(MongoDocumentRepository);
		});

		it("should retry on transilient replication sync and succeed on subsequent calls", async () => {
			const ordererUrl = "ordererUrl";
			const historianUrl = "historianUrl";
			const deltaStreamUrl = "deltaStreamUrl";
			const tenantId = "tenantId";
			const documentId = "documentId";
			const sessionStickinessDurationMs = 60000;

			const document = {
				session: undefined,
				isEphemeralContainer: false,
				createTime: Date.now(),
				documentId: "documentId",
				tenantId: "tenantId",
				scribe: undefined,
				deli: undefined,
				version: "1.0",
			} as unknown as IDocument;

			// Force the first documentRepository call to return a null document, to test retry behaviors
			documentRepository.readOne
				.onFirstCall()
				.resolves(null)
				.onSecondCall()
				.resolves(document);

			const session = await getSession(
				ordererUrl,
				historianUrl,
				deltaStreamUrl,
				tenantId,
				documentId,
				documentRepository,
				sessionStickinessDurationMs,
			);

			assert.ok(session);
		});

		it("should throw an error if documents not found after retry", async () => {
			const ordererUrl = "ordererUrl";
			const historianUrl = "historianUrl";
			const deltaStreamUrl = "deltaStreamUrl";
			const tenantId = "tenantId";
			const documentId = "documentId";
			const sessionStickinessDurationMs = 60000;

			documentRepository.readOne.resolves(null);

			try {
				await getSession(
					ordererUrl,
					historianUrl,
					deltaStreamUrl,
					tenantId,
					documentId,
					documentRepository,
					sessionStickinessDurationMs,
				);
				assert.fail("Expected an error to be thrown");
			} catch (error: any) {
				assert.equal(error?.name, "NetworkError");
			}
		});
	});
});
