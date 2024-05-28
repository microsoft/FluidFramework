/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	ISummaryTree,
	SummaryType,
	ICommittedProposal,
} from "@fluidframework/protocol-definitions";

import * as services from "@fluidframework/server-services";
import { defaultHash } from "@fluidframework/server-services-client";

import {
	IDeliState,
	IScribe,
	MongoDatabaseManager,
	MongoManager,
} from "@fluidframework/server-services-core";
import { TestEngine1, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
	TestDbFactory,
	TestTenantManager,
	TestNotImplementedDocumentRepository,
} from "@fluidframework/server-test-utils";
import Sinon from "sinon";

const lumberjackEngine = new TestEngine1();
if (!Lumberjack.isSetupCompleted()) {
	Lumberjack.setup([lumberjackEngine]);
}

describe("Routerlicious", () => {
	describe("storage", () => {
		const testTenantId = "test";
		const testId = "test";
		const url = "http://test";

		let testTenantManager: TestTenantManager;
		let testStorage: services.DocumentStorage;
		beforeEach(async () => {
			const collectionNames = "test";
			const testData: { [key: string]: any[] } = {};

			testTenantManager = new TestTenantManager(url);
			const testDbFactory = new TestDbFactory(testData);
			const mongoManager = new MongoManager(testDbFactory);
			const globalDbEnabled = false;
			const testDocumentRepository = new TestNotImplementedDocumentRepository();
			const stub = Sinon.stub(testDocumentRepository, "findOneOrCreate");
			stub.callsFake(async (filter: any, value: any, option: any) => {
				return { value, existing: false };
			});

			const databaseManager = new MongoDatabaseManager(
				globalDbEnabled,
				mongoManager,
				mongoManager,
				collectionNames,
				collectionNames,
				collectionNames,
				collectionNames,
				collectionNames,
			);
			testStorage = new services.DocumentStorage(
				testDocumentRepository,
				testTenantManager,
				false,
				await databaseManager.getDeltaCollection(undefined, undefined),
				undefined,
			);
		});

		it("create document with summary", async () => {
			const summaryTree: ISummaryTree = { type: SummaryType.Tree, tree: {} };
			const proposal: ICommittedProposal = {
				key: "code",
				value: "empty",
				approvalSequenceNumber: 0,
				commitSequenceNumber: 0,
				sequenceNumber: 0,
			};
			const docDetails = await testStorage.createDocument(
				testTenantId,
				testId,
				summaryTree,
				10,
				defaultHash,
				url,
				url,
				url,
				[["code", proposal]],
			);
			assert.equal(docDetails.existing, false, "Doc should not be existing!!");
			assert.equal(docDetails.value.documentId, testId, "Docid should be the provided one!!");
			const deli: IDeliState = JSON.parse(docDetails.value.deli);
			assert.equal(
				deli.sequenceNumber,
				10,
				"Seq number should be 10 at which the summary was generated!!",
			);
			const scribe: IScribe = JSON.parse(docDetails.value.scribe);
			assert.equal(
				scribe.protocolState.values[0][1]["value"],
				"empty",
				"Code proposal value should be equal!!",
			);
		});
	});
});
