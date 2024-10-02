/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { benchmark } from "./runner";
export { benchmarkMemory, IMemoryTestObject, MemoryTestObjectProps } from "./memoryTestRunner";
export {
	benchmarkCustom,
	CustomBenchmarkOptions,
	IMeasurementReporter,
} from "./customOutputRunner";
