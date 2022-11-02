/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor, singleTextCursor } from "../../feature-libraries";
import { testJsonableTreeCursor } from "../cursorTestSuite";

testJsonableTreeCursor("textTreeFormat", singleTextCursor, jsonableTreeFromCursor);
