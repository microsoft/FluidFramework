import {
    CompiledFormula,
    Precedents,
    ReadOper,
    ReasonKind,
    SheetGridRange,
} from './types'

/** Structure representing the state of a Workbook cell. */
export interface Cell {
    oper: ReadOper;
    state: CellState;
    formulaText?: string;
    compiledFormula?: CompiledFormula;
    reason?: ReasonKind;
    precedents?: Precedents;
    dependents?: SheetGridRange[];
}

/** True if the given 'value' is a 'Cell' structure. */
export function isCell(value: any): value is Cell {
    return (typeof value === 'object' && value.oper && value.state && isCellState(value.state));
}

/**
 * Cells may be dirty (need evaluation), in their final calculated state, or in an
 * error state if evaluation failed.
 */
export enum CellState {
    Dirty = 'Dirty',
    Final = 'Final',
    Failed = 'Failed'
}

/** True if the given 'state' is any of the defined CellStates. */
function isCellState(state: any): state is CellState {
    return (state === CellState.Dirty || state === CellState.Final || state === CellState.Failed);
}

/** 
 * Returns the first index of the given 'dependency' in the array of dependencies, or -1 if
 * the given dependency does not exist in the array.
 */
function findDependencyIndex(dependency: SheetGridRange, dependencies: SheetGridRange[]): number {
    let dependencyIndex = -1;
    dependencies.forEach((existingDependency, index) => {
        if (isSheetGridRangeEqual(dependency, existingDependency)) {
            dependencyIndex = index;
        }
    });
    return dependencyIndex;
}

/** True if the two given SheetGridRanges represent the same area in the same document/sheet. */
function isSheetGridRangeEqual(range1: SheetGridRange, range2: SheetGridRange): boolean {
    return (
        range1.range.row === range2.range.row &&
        range1.range.rows === range2.range.rows &&
        range1.range.col === range2.range.col &&
        range1.range.cols === range2.range.cols &&
        range1.sheet.index === range2.sheet.index &&
        range1.sheet.document === range2.sheet.document
    );
}

/** Add the given SheetGridRange to the 'existing' set, if it's not already in the set. */
function add(existing: SheetGridRange[], toAdd: SheetGridRange) {
    if (findDependencyIndex(toAdd, existing) === -1) {
        existing.push(toAdd);
    }
}

/** 
 * Remove the given SheetGridRange from the 'existing' set.  If the range is not in the set,
 * does nothing.
 */
function remove(existing: SheetGridRange[], toRemove: SheetGridRange) {
    if (existing) {
        //Try to find the precedent in the list of dependents, and remove it if you do.
        const existingDependencyIndex = findDependencyIndex(toRemove, existing);
        if (existingDependencyIndex >= 0) {
            existing.splice(existingDependencyIndex, 1);
        }
    }
}

/** Add the given cell location to the given cell's set of depnedents. */
export function addDependent(cell: Cell, toAdd: SheetGridRange) {
    if (cell.dependents) {
        add(cell.dependents, toAdd);
    } else {
        cell.dependents = [ toAdd ];
    }
}

/** Removes the given cell location from the given cell's set of depnedents. */
export function removeDependent(cell: Cell, toRemove: SheetGridRange) {
    if (cell && cell.dependents) {
        remove(cell.dependents, toRemove);
    }
}