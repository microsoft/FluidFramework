/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTestArgs } from "hotloop";
import { createFragmentedMatrix } from "../../util";
import { pointwise } from "../test";

const { row, col, rowCount, colCount } = getTestArgs();

pointwise("Fragmented Matrix 256x256", createFragmentedMatrix(row + rowCount, col + colCount));
