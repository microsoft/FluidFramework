/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReadOper } from "@ms/excel-online-calc/lib/lang/value";
import { CompiledFormula, FailureReason } from "@ms/excel-online-calc/lib/runtime";

/**
 * Cells may be dirty (need evaluation), in their final calculated state, or in an
 * error state if evaluation failed.
 */
export enum CellState {
    Dirty = "Dirty",
    Final = "Final",
    Failed = "Failed",
}

/** Structure representing the state of a Workbook cell. */
// tslint:disable-next-line:interface-name
export interface Cell {
    oper: ReadOper;
    state: CellState;
    compiledFormula?: CompiledFormula;
    reason?: FailureReason;
}
