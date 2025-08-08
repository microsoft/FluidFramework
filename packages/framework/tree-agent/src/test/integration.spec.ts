/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { UnsafeUnknownSchema } from "@fluidframework/tree/alpha";

import { addCommentTest, smokeTest } from "./scenarios/index.js";
import { describeIntegrationTests, type LLMIntegrationTest } from "./utils.js";

describeIntegrationTests([
	addCommentTest,
	smokeTest,
] as unknown as LLMIntegrationTest<UnsafeUnknownSchema>[]);
