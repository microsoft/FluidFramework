/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	cursorForJsonableTreeNode,
	jsonableTreeFromCursor,
} from "../../feature-libraries/index.js";
import { testGeneralPurposeTreeCursor } from "../cursorTestSuite.js";

testGeneralPurposeTreeCursor(
	"textTreeFormat",
	cursorForJsonableTreeNode,
	jsonableTreeFromCursor,
);
