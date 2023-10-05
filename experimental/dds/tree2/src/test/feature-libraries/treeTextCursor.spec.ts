/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor, singleTextCursor } from "../../feature-libraries";
import { testGeneralPurposeTreeCursor } from "../cursorTestSuite";

testGeneralPurposeTreeCursor("textTreeFormat", singleTextCursor, jsonableTreeFromCursor);
