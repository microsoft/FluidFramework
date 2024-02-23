/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	MockFluidDataStoreRuntime,
	MockContainerRuntimeFactoryForReconnection,
	MockContainerRuntimeForReconnection,
	MockStorage,
	MockDeltaConnection,
} from "@fluidframework/test-runtime-utils";
import { ISequencedDocumentMessage, ISummaryTree } from "@fluidframework/protocol-definitions";
import { SharedMatrix, SharedMatrixFactory } from "../index";
import { extract } from "./utils";

async function createMatrixForReconnection(
	id: string,
	runtimeFactory: MockContainerRuntimeFactoryForReconnection,
	summary?: ISummaryTree,
	overrides?: { minimumSequenceNumber?: number; trackRemoteOps?: true },
): Promise<{
	matrix: SharedMatrix;
	containerRuntime: MockContainerRuntimeForReconnection;
	deltaConnection: MockDeltaConnection;
	dataStoreRuntime: MockFluidDataStoreRuntime;
}> {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const containerRuntime = runtimeFactory.createContainerRuntime(dataStoreRuntime, overrides);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage:
			summary !== undefined ? MockStorage.createFromSummary(summary) : new MockStorage(),
	};

	const matrix = new SharedMatrix(dataStoreRuntime, id, SharedMatrixFactory.Attributes);
	if (summary !== undefined) {
		await matrix.load(services);
	} else {
		matrix.connect(services);
	}
	return {
		matrix,
		containerRuntime,
		deltaConnection: services.deltaConnection,
		dataStoreRuntime,
	};
}

function spyOnContainerRuntimeMessages(runtime: MockContainerRuntimeForReconnection): {
	submittedContent: any[];
	processedMessages: ISequencedDocumentMessage[];
} {
	const submittedContent: any[] = [];
	const originalSubmit = runtime.submit.bind(runtime);
	runtime.submit = (content: any, localMetadata) => {
		submittedContent.push(content);
		return originalSubmit(content, localMetadata);
	};

	const processedMessages: ISequencedDocumentMessage[] = [];
	const originalProcess = runtime.process.bind(runtime);
	runtime.process = (message: ISequencedDocumentMessage) => {
		processedMessages.push(message);
		return originalProcess(message);
	};

	return { submittedContent, processedMessages };
}

/**
 * Note: be careful when writing tests in this suite. The mocks don't have much safety around use of applyStashedOp,
 * since they're mostly built for scenarios where clients aren't joining/leaving.
 *
 * In particular, the author of a test needs to make sure that a container applying stashed ops has reasonable values
 * for referenceSequenceNumber for any resubmitted ops.
 */
describe("Matrix applyStashedOp", () => {
	it("Can rehydrate a session with stashed ops", async () => {
		const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
		const {
			matrix: matrix1,
			containerRuntime: containerRuntime1,
			dataStoreRuntime: dataStoreRuntime1,
		} = await createMatrixForReconnection("A", containerRuntimeFactory, undefined, {
			trackRemoteOps: true,
		});
		const { summary } = await matrix1.summarize();
		const { matrix: matrix2, containerRuntime: containerRuntime2 } =
			await createMatrixForReconnection("B", containerRuntimeFactory, summary, {
				minimumSequenceNumber: dataStoreRuntime1.deltaManager.minimumSequenceNumber,
			});

		matrix1.insertRows(0, 2);
		matrix2.insertCols(0, 2);
		containerRuntimeFactory.processAllMessages();
		const minimumSequenceNumber = dataStoreRuntime1.deltaManager.minimumSequenceNumber;

		const { submittedContent } = spyOnContainerRuntimeMessages(containerRuntime1);
		const { processedMessages } = spyOnContainerRuntimeMessages(containerRuntime2);

		containerRuntime1.connected = false;
		matrix1.setCell(0, 0, "Originally submitted by matrix1, applied via matrix3");

		matrix2.setCell(1, 0, "Applied via matrix2");
		containerRuntimeFactory.processAllMessages();

		assert.equal(submittedContent.length, 1);
		assert.equal(processedMessages.length, 1);

		const { matrix: matrix3, containerRuntime } = await createMatrixForReconnection(
			"C",
			containerRuntimeFactory,
			summary,
			{
				minimumSequenceNumber,
			},
		);

		await containerRuntime.initializeWithStashedOps(containerRuntime1);

		matrix3.setCell(0, 1, "Originally submitted by matrix3, applied via matrix3");
		containerRuntimeFactory.processAllMessages();

		const expected = [
			[
				"Originally submitted by matrix1, applied via matrix3",
				"Originally submitted by matrix3, applied via matrix3",
			],
			["Applied via matrix2", undefined],
		];
		assert.deepEqual(extract(matrix2), expected);
		assert.deepEqual(extract(matrix3), expected);
	});
});
