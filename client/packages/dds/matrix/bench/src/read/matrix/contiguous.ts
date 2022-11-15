/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { pointwise } from "../test";
import { createContiguousMatrix } from "../../util";
import { getTestArgs } from "hotloop";

const { row, col, rowCount, colCount } = getTestArgs();

const rowSize = row + rowCount;
const colSize = col + colCount;

pointwise(`Contiguous Matrix ${rowSize}x${colSize}`, createContiguousMatrix(rowSize, colSize));
