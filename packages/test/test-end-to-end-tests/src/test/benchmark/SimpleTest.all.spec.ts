/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat } from "@fluid-private/test-version-utils";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import { IBenchmarkParameters, benchmarkAll } from "./DocumentCreator.js";

describeCompat("Simple Scenario Title", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;

	before(async () => {
		provider = getTestObjectProvider();
	});

	/**
	 * The PerformanceTestWrapper class includes 2 functionalities:
	 * 1) Store any objects that should not be garbage collected during the benchmark execution (specific for memory tests).
	 * 2) Stores the configuration properties that should be consumed by benchmarkAll to define its behavior:
	 * a. Benchmark Time tests: {@link https://benchmarkjs.com/docs#options} or  {@link BenchmarkOptions}
	 * b. Benchmark Memory tests: {@link MemoryTestObjectProps}
	 */
	benchmarkAll(
		"test1",
		new (class PerformanceTestWrapper implements IBenchmarkParameters {
			container: IContainer | undefined;
			iteration = 0;

			async run(): Promise<void> {
				this.container = undefined;
				this.iteration++;
				assert(this.iteration > 0, "testTitle needs to be defined");
				console.log(`this will run for each iteration ${this.iteration}`);
			}
			async before(): Promise<void> {
				console.log(`this will run before the measurements`);
			}
			beforeIteration(): void {
				console.log(`this will run before each iteration ${this.iteration}`);
			}
			async after(): Promise<void> {
				this.iteration = 0;
			}
		})(),
	);

	benchmarkAll(
		"test2",
		new (class PerformanceTestWrapper implements IBenchmarkParameters {
			container: IContainer | undefined;
			iteration = 0;

			async run(): Promise<void> {
				this.container = undefined;
				this.iteration++;
				assert(this.iteration > 0, "testTitle needs to be defined");
				console.log(`this will run for each iteration ${this.iteration}`);
			}
			async before(): Promise<void> {
				console.log(`this will run before the measurements`);
			}
			beforeIteration(): void {
				console.log(`this will run before each iteration ${this.iteration}`);
			}
			async after(): Promise<void> {
				this.iteration = 0;
			}
		})(),
	);
});
