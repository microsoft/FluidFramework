/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { benchmark } from "./runner";
export {
	benchmarkMemory,
	type IMemoryTestObject,
	type MemoryTestObjectProps,
} from "./memoryTestRunner";
export {
	benchmarkCustom,
	type CustomBenchmarkOptions,
	type IMeasurementReporter,
} from "./customOutputRunner";
