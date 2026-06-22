/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeCompat } from "@fluid-private/test-version-utils";
import type { SharedMatrix } from "@fluidframework/matrix/internal";
import type { SharedString } from "@fluidframework/sequence/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import { IBenchmarkParameters, benchmarkAll } from "./DocumentCreator.js";

describeCompat("PAS Test", "NoCompat", (_getTestObjectProvider, apis) => {
	const { SharedMatrix, SharedString } = apis.dds;

	const createLocalMatrix = (id: string, runtime: MockFluidDataStoreRuntime): SharedMatrix =>
		SharedMatrix.create(runtime, id);

	const createString = (id: string, runtime: MockFluidDataStoreRuntime): SharedString =>
		SharedString.create(runtime, id);

	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		registry: [SharedMatrix.getFactory(), SharedString.getFactory()],
	});
	const rowSize = 6;
	const columnSize = 5;

	/**
	 * The PerformanceTestWrapper class includes 2 functionalities:
	 * 1) Store any objects that should not be garbage collected during the benchmark execution (specific for memory tests).
	 * 2) Stores the configuration properties that should be consumed by benchmarkAll to define its behavior:
	 * a. Benchmark Time tests: {@link https://benchmarkjs.com/docs#options} or  {@link BenchmarkOptions}
	 * b. Benchmark Memory tests: {@link MemoryTestObjectProps}
	 */
	benchmarkAll("Create Table Matrix With SharedStrings", () => {
		return new (class PerformanceTestWrapper implements IBenchmarkParameters {
			containerRuntimeFactory = new MockContainerRuntimeFactory();
			matrix = createLocalMatrix("matrix1", dataStoreRuntime);

			// Every iteration of this benchmark will allocate lots of new SharedString instances
			// The old ones from the previous iteration will no longer be reachable from the matrix after they are replaced,
			// but are leaked in the container as Fluid's GC won't collect them for a very long time (much longer than this test will run).
			// This behavior is undesired and should be fixed if practical.
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
		})();
	});
});
