/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTestArgs } from "hotloop";
import { createContiguousMatrix } from "../../util";
import { pointwise } from "../test";

const { row, col, rowCount, colCount } = getTestArgs();

const rowSize = row + rowCount;
const colSize = col + colCount;

pointwise(`Contiguous Matrix ${rowSize}x${colSize}`, createContiguousMatrix(rowSize, colSize));
