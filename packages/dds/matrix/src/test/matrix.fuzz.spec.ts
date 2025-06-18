/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import {
	DDSFuzzModel,
	DDSFuzzSuiteOptions,
	createDDSFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { FlushMode } from "@fluidframework/runtime-definitions/internal";

import { SharedMatrixFactory } from "../runtime.js";

import { _dirname } from "./dirname.cjs";
import { baseSharedMatrixModel, type Operation } from "./fuzz.js";

describe("Matrix fuzz tests", function () {
	/**
	 * SparseArray2D's clearRows / clearCols involves a loop over 64k elements and is called on row/col handle recycle.
	 * This makes some seeds rather slow (since that cost is paid 3 times per recycled row/col per client).
	 * Despite this accounting for 95% of test runtime when profiled, this codepath doesn't appear to be a bottleneck
	 * in profiled production scenarios investigated at the time of writing.
	 *
	 * This timeout is set to 30s to avoid flakiness on CI, but it's worth noting the vast majority of these test cases
	 * do not go anywhere near this.
	 * We've previously skipped the long seeds, but that tended to lead to more code churn when adding features to the
	 * underlying harness (which affects which seeds are the slow ones).
	 */
	this.timeout(30_000);

	const baseOptions: Partial<DDSFuzzSuiteOptions> = {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
		},
		reconnectProbability: 0,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results") },
	};

	const nameModel = (workloadName: string): DDSFuzzModel<SharedMatrixFactory, Operation> => ({
		...baseSharedMatrixModel,
		workloadName,
	});

	createDDSFuzzSuite(nameModel("default"), {
		...baseOptions,
		reconnectProbability: 0,
		// Uncomment to replay a particular seed.
		// replay: 0,
	});

	createDDSFuzzSuite(nameModel("with reconnect"), {
		...baseOptions,
		defaultTestCount: 100,
		clientJoinOptions: {
			maxNumberOfClients: 3,
			clientAddProbability: 0,
		},
		reconnectProbability: 0.1,
		// Uncomment to replay a particular seed.
		// replay: 0,
	});

	createDDSFuzzSuite(nameModel("with batches and rebasing"), {
		...baseOptions,
		rebaseProbability: 0.2,
		containerRuntimeOptions: {
			flushMode: FlushMode.TurnBased,
			enableGroupedBatching: true,
		},
		// Uncomment to replay a particular seed.
		// replay: 0,
	});

	createDDSFuzzSuite(nameModel("with stashing"), {
		...baseOptions,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
			stashableClientProbability: 0.5,
		},
		// Uncomment to replay a particular seed.
		// replay: 0,
	});
});
