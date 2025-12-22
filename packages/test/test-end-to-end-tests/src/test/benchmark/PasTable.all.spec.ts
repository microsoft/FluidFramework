/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat } from "@fluid-private/test-version-utils";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { IBenchmarkParameters, benchmarkAll } from "./DocumentCreator.js";

function createLocalMatrix(
	id: string,
	dataStoreRuntime: MockFluidDataStoreRuntime,
): SharedMatrix {
	return SharedMatrix.create(dataStoreRuntime, id);
}

function createString(id: string, dataStoreRuntime: MockFluidDataStoreRuntime): SharedString {
	return SharedString.create(dataStoreRuntime, id);
}

describeCompat("PAS Test", "NoCompat", () => {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		registry: [SharedMatrix.getFactory(), SharedString.getFactory()],
	});
	const rowSize = 6;
	const columnSize = 5;

	before(async () => {});

	/**
	 * The PerformanceTestWrapper class includes 2 functionalities:
	 * 1) Store any objects that should not be garbage collected during the benchmark execution (specific for memory tests).
	 * 2) Stores the configuration properties that should be consumed by benchmarkAll to define its behavior:
	 * a. Benchmark Time tests: {@link https://benchmarkjs.com/docs#options} or  {@link BenchmarkOptions}
	 * b. Benchmark Memory tests: {@link MemoryTestObjectProps}
	 */
	benchmarkAll(
		"Create Table Matrix With SharedStrings",
		new (class PerformanceTestWrapper implements IBenchmarkParameters {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			matrix = createLocalMatrix("matrix1", dataStoreRuntime);

			async run(): Promise<void> {
				this.matrix.insertRows(0, rowSize);
				this.matrix.insertCols(0, columnSize);
				for (let i = 0; i < rowSize; i++) {
					for (let j = 0; j < columnSize; j++) {
						const id = `${j},${i}`;
						const sharedString: SharedString = createString(id, dataStoreRuntime);
						sharedString.insertText(0, "testValue");
						this.matrix.setCell(i, j, sharedString.handle);
					}
				}
			}
			async before(): Promise<void> {}
			beforeIteration(): void {}
			async after(): Promise<void> {}
		})(),
	);
});
