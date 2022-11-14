/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mapTreeFromCursor, singleMapTreeCursor } from "../../feature-libraries";
import { testJsonableTreeCursor } from "../cursorTestSuite";

testJsonableTreeCursor("mapTreeCursor", singleMapTreeCursor, mapTreeFromCursor);
