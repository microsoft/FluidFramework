/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mapTreeFromCursor, cursorForMapTreeNode } from "../../feature-libraries/index.js";
import { testGeneralPurposeTreeCursor } from "../cursorTestSuite.js";

testGeneralPurposeTreeCursor("mapTreeCursor", cursorForMapTreeNode, mapTreeFromCursor);
