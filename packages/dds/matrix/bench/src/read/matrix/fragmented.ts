/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "../test";
import { createFragmentedMatrix } from "../../util";
import { getTestArgs } from "hotloop";

const { row, col, rowCount, colCount } = getTestArgs();

pointwise("Fragmented Matrix 256x256", createFragmentedMatrix(row + rowCount, col + colCount));
