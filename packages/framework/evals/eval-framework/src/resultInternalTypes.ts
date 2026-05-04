/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Minimal metadata types for eval results.
 * These are self-contained — no dependency on boardGeneration/inputTypes.
 */

import type { DatasetArtifact, ScenarioArtifact } from "./artifactTypes.js";
import type { DatasetEvalResult, ScenarioEvalResult } from "./resultTypes.js";

/** @internal */
export interface ScenarioEvalResultInternal
	extends Omit<ScenarioEvalResult, "datasetResults"> {
	llmEvalConfig: ScenarioArtifact["llmEvalConfig"];
	datasetResults: DatasetEvalResultInternal[];
}

/** @internal */
export interface DatasetEvalResultInternal extends DatasetEvalResult {
	input: DatasetArtifact["input"];
	output: DatasetArtifact["output"];
	images: DatasetArtifact["images"];
}
