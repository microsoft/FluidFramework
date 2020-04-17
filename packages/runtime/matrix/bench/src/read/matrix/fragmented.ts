/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "../test";
import { createFragmentedMatrix } from "../../util";
import { getTestArgs } from "hotloop";

const { row, col, numRows, numCols } = getTestArgs();

pointwise("Fragmented Matrix 256x256", createFragmentedMatrix(row + numRows, col + numCols));
