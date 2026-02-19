/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { UnsafeUnknownSchema } from "@fluidframework/tree/alpha";

import {
	addCommentTest,
	addUsersTest,
	methodUseTest,
	smokeTest,
	sortGroceriesTest,
	sortLinkedGroceriesTest,
	unlinkLinkedGroceriesTest,
	updateUserTest,
} from "./scenarios/index.js";
import { type LLMIntegrationTest, describeIntegrationTests } from "./utils.js";

describeIntegrationTests([
	addCommentTest,
	addUsersTest,
	updateUserTest,
	sortGroceriesTest,
	sortLinkedGroceriesTest,
	unlinkLinkedGroceriesTest,
	smokeTest,
	methodUseTest,
] as unknown as LLMIntegrationTest<UnsafeUnknownSchema>[]);
