/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "../test";
import { createContiguousMatrix } from "../../util";
import { getTestArgs } from "hotloop";

const { row, col, numRows, numCols } = getTestArgs();

const rowSize = row + numRows;
const colSize = col + numCols;

pointwise(`Contiguous Matrix ${rowSize}x${colSize}`, createContiguousMatrix(rowSize, colSize));
