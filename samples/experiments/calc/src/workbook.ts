/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    blankOper,
    calcConfig,
    CellFormula,
    cellFormula,
    CellValue,
    CompiledFormula,
    CompileResult,
    createAnalyzer,
    createCompiler,
    createEvaluator,
    createLocaleInfo,
    createParser,
    documentLoc,
    DocumentLoc,
    EvalFormulaPaused,
    failure,
    FailureReason,
    fastMathpack,
    finalValue,
    FormulaSource,
    gridCell,
    gridRange,
    illFormedFormula,
    IllFormedFormula,
    Interrupt,
    isFormulaString,
    isWellFormed,
    jaggedArray,
    makeGetFirstOrderFunc,
    NameLoc,
    notFormulaString,
    NotFormulaString,
    NotImplemented,
    notImplemented,
    pendingValue,
    Precedents,
    previousFailure,
    PreviousFailure,
    ReadOper,
    RefStyle,
    Result,
    ResultKind,
    sheetGridCell,
    SheetGridCell,
    SheetGridRange,
    sheetGridRange,
    sheetIndex,
    success,
    Unavailable,
    UnboxedOper,
    WriteOper,
    //isBlankOper,
    OperKind,
    //BlankOper,
    Oper,
    errorOper,
} from "./types";

// Local imports.
import { addDependent, Cell, CellState, removeDependent } from "./cell";
import { printPrecedents, printSheetGridCell, printSheetGridRange } from "./helpers";

/**
 * One sheet Workbook that evaluates using 'Calc.ts'.  Pulled together from various 'Calc.ts'
 * tests and Andrew Stegmaier's prototype showing RichValues (esp. the EvalConfig impl.)
 *
 * There's a an attempt at tracking dependents/precedents from Andrew's code that I left in,
 * but I don't believe it's actually used, since recalcAll() re-evaluates cells indiscriminantly.
 */
export abstract class Workbook {
    // Calc.ts services
    private readonly config = calcConfig(createLocaleInfo());
    private readonly parser = createParser({ config: { localeInfo: this.config.localeInfo } });
    private readonly compiler = createCompiler({ config: this.config, mathpack: fastMathpack });
    private readonly analyzer = createAnalyzer({ config: this.config });
    private readonly evaluator = createEvaluator({
        config: this.config,
        mathpack: fastMathpack,
        getDocumentLoc: this.getDocumentLoc.bind(this),
        getSheetIndex: this.getSheetIndex.bind(this),
        getCellValue: this.getCellValue.bind(this),
        getCellValues: this.getCellValues.bind(this),
        getFirstOrderFunc: makeGetFirstOrderFunc(this.config.localeInfo),
        getNameFormula: this.getNameFormula.bind(this),
        getCellFormula: this.getCellFormula.bind(this),
        interruptToken: [Interrupt.Continue],
        schedulerInfo: {},
        setCellValue: this.setCellValue.bind(this),
        setCellValues: this.setCellValues.bind(this),
        setCellFailure: this.setCellFailure.bind(this),
        setDynamicPrecs: this.setDynamicPrecs.bind(this),
        loadObjects: () => false,
        getUsedRange: () => failure(notImplemented(["getUsedRange"]))
    });

    // Workbook state
    private readonly workbookLoc = documentLoc(undefined, "Book1");
    private readonly nameToFormula: Map<string, CompiledFormula> = new Map();
    private readonly cells: Cell[][] = [];
    private needsRecalc = true;

    /**
     * Constructs a new Workbook with the prescribed dimensions, optionally initializing it
     * with a jagged 2D array of cell values as pre-parsed strings.
     */
    constructor(public readonly numRows: number, public readonly numCols: number) {
        this.numRows = numRows;
        this.numCols = numCols;
    }

    /** Initialize workbook cells with the given 2D sparse array. */
    public init(init?: string[][]) {
        // 'init' may be sparse in either dimension.  'initialValue' fills in missing values
        // with an empty string.
        const initialValue = (row: number, col: number) => {
            const rowArray = init[row];
            if (typeof rowArray === "undefined") {
                return ""
            }

            const value = rowArray[col];
            return value !== "undefined"
                ? value
                : "";
        }

        for (let row = 0; row < this.numRows; row++) {
            const rowArray: Cell[] = [];
            this.cells.push(rowArray);
            for (let col = 0; col < this.numCols; col++) {
                rowArray.push({ oper: blankOper, state: CellState.Final });
                this.setCellText(row, col, initialValue(row, col));
            }
        }
    }

    /** Return the result of evaluating the workbook cell at the given row/col. */
    public evaluateCell(row: number, col: number): Result<ReadOper, FailureReason | NotImplemented | NotFormulaString | IllFormedFormula> | EvalFormulaPaused {
        this.ensureEvaluated();

        const cell = this.maybeGetCellAt(row, col);
        const oper: Oper = typeof cell === "undefined"
            ? { kind: OperKind.Blank }
            : cell.oper;

        return success(oper);
    }

    /**
     * Return the result of evaluating the given formula.  The specified row/col are used
     * to resolve relative cell references.
     */
    public evaluateFormulaText(formulaText: string, row = 0, col = 0): Result<ReadOper, FailureReason | NotImplemented | NotFormulaString | IllFormedFormula> | EvalFormulaPaused {
        this.ensureEvaluated();

        const compileResult = this.compileFormulaText(formulaText, row, col);
        if (compileResult.kind === ResultKind.Success) {
            const formulaLocation = this.getCellLoc(row, col);
            const evalResult = this.evaluator.evalFormula(
                formulaLocation,
                FormulaSource.Cell,
                compileResult.value,
                undefined,
            );
            return evalResult;
        }
        return failure(compileResult.reason);
    }

    /**
     * Returns the Cell at the given row/col if it is populated, otherwise
     * return undefined.
     */
    private maybeGetCellAt(row: number, col: number): Cell | undefined {
        const rowArray = this.cells[row];
        return (rowArray
            ? rowArray[col]
            : undefined);
    }

    /** Constructs a sheetGridCell referencing the given row/col in this Workbook. */
    private getCellLoc(row: number, col: number): SheetGridCell {
        return sheetGridCell(sheetIndex(this.workbookLoc, 0), gridCell(row, col));
    }

    /** Invokes the given callback with a SheetGridCell location for each cell contained in the given range. */
    private forEachCellLocInRange(range: SheetGridRange, callback: (cellLoc: SheetGridCell) => void): void {
        const { row, col, rows, cols } = range.range;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                callback(sheetGridCell(range.sheet, gridCell(r + row, c + col)));
            }
        }
    }

    /** Invokes the given callback with each 'Cell' contained within the given range. */
    private forEachCellInRange(range: SheetGridRange, callback: (cell: Cell) => void): void {
        const { row, col, rows, cols } = range.range;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                callback(this.maybeGetCellAt(r + row, c + col));
            }
        }
    }

    /** Evaluates all populated cells within the workbook, regardless of their current dirty status. */
    private ensureEvaluated() {
        // Early exit if no cells have been modified.
        if (!this.needsRecalc) {
            return;
        }

        console.log("(Workbook recalculating)");

        // TODO: Use dependency tracking to elide cells that are still valid.
        const cellsToRecalc: SheetGridCell[] = [];
        for (let row = 0; row < this.cells.length; row++) {
            for (let col = 0; col < this.cells[row].length; col++) {
                const cell = this.maybeGetCellAt(row, col);
                if (cell) {
                    if (cell.formulaText) {
                        // TODO: maybe also recompile the formulas?
                        cell.state = CellState.Dirty;
                        cellsToRecalc.push(this.getCellLoc(row, col));
                    } else {
                        cell.state = CellState.Final;
                    }

                    // Clear precedents/dependents
                    cell.precedents = undefined;
                    cell.dependents = undefined;
                }
            }
        }

        this.evaluator.evalCells(cellsToRecalc);
        this.needsRecalc = false;
    }

    /**
     * Compiles the given formula string for the cell residing at the specified row/col.
     *
     * (The row/col of the cell containing the formula are required to generate relative references
     * to other cells.)
     */
    private compileFormulaText(formulaText: string, row: number, col: number): CompileResult {
        const formulaLocation = this.getCellLoc(row, col);
        const parseResult = this.parser.parseFormula(RefStyle.A1, formulaLocation, FormulaSource.Cell, formulaText);

        if (parseResult.kind === ResultKind.Success && parseResult.value) {
            const checkedFormula = this.analyzer.checkFormula(formulaLocation, FormulaSource.Cell, parseResult.value);
            if (isWellFormed(checkedFormula)) {
                const compilerResult = this.compiler.compileFormula(formulaLocation, FormulaSource.Cell, checkedFormula);
                if (compilerResult.kind !== ResultKind.Success) {
                    console.error(`Could not compile formula at ${printSheetGridRange(formulaLocation)}. Here's the full compilerResult: `, compilerResult);
                }
                return compilerResult;
            } else {
                console.error(`Formula at ${printSheetGridRange(formulaLocation)} is not well-formed.`);
                return failure(illFormedFormula("Formula is not well-formed."));
            }
        }
        console.error(`Could not parse formula at ${printSheetGridRange(formulaLocation)}. Here's the full parseResult: `, parseResult);
        return failure(notFormulaString(parseResult.kind));
    }

    /**
     * For the given set of cell dependents, recursively walks the dependents graph and adds
     * all transitively dependent cells to the accumulator.
     */
    private addDependentsToAccumulatorAndMarkDirty(accumulator: SheetGridCell[], dependents: SheetGridRange[] | undefined) {
        if (!dependents) {
            return;
        }

        dependents.forEach((dependent) => {
            this.forEachCellLocInRange(dependent, (cellLoc) => {
                accumulator.push(cellLoc);
                const cell = this.maybeGetCellAt(cellLoc.range.row, cellLoc.range.col);
                // TODO: add proper null checks.
                cell.state = CellState.Dirty;
                this.addDependentsToAccumulatorAndMarkDirty(accumulator, cell && cell.dependents);
            });
        });
    }

    /**
     * For the given set of precedents, transitively walks their dependents and removes the specified
     * dependentCell from their list of dependents.
     */
    private removeDependents(dependentCell: SheetGridCell, precedents?: Precedents) {
        if (precedents && precedents.cells) {
            precedents.cells.forEach((precedentRange) => {
                this.forEachCellInRange(precedentRange, (precedent) => {
                    removeDependent(precedent, dependentCell);
                });
            });
        }
    }

    /**
     * Primitive value parser for excel values. Handles booleans,
     * strings, numbers and errors.
     * @param inputStr
     */
    private parseValue(inputStr: string): WriteOper {
        const input = inputStr.trim();
        if (input === this.config.localeInfo.trueName) {
            return true;
        }
        if (input === this.config.localeInfo.falseName) {
            return false;
        }
        const error = this.config.localeInfo.errorNames.indexOf(input);
        if (error > 0) {
            return errorOper(error);
        }
        const parseAttempt = Number(input);
        if (typeof parseAttempt === "number" && !isNaN(parseAttempt)) {
            return parseAttempt;
        }
        return input;
    }


    public serialiseValue(input: ReadOper): string {
        switch(typeof input) {
            case "string":
                return input;

            case "number":
                // 3 dp for numbers.
                return (Math.round(input * 1000) / 1000).toString();

            case "boolean":
                return input ? this.config.localeInfo.trueName : this.config.localeInfo.falseName

            default:
                switch (input.kind) {
                    case OperKind.Error:
                        return this.config.localeInfo.errorNames[input.type];

                    case OperKind.Array:
                        return '{ARR}';

                    case OperKind.Blank:
                        return "";
                    case OperKind.Rich:
                        return this.serialiseValue(input.getFallback());
                }
        }
        return input // never;
    }

    /** Returns the pre-parsed 'string | number | boolean' as originally provided to setCellText. */
    public getCellText(row: number, col: number) {
        const value = this.loadCellText(row, col);
        return (typeof value !== "undefined")
            ? value
            : "";
    }

    protected abstract loadCellText(row: number, col: number): string;

    /**
     * Sets the cell at the give row/col to the given newValue.  Strings beginning
     * with "=" are parsed as formulas.  Strings containing numbers or booleans are
     * parsed as primitive values.
     */
    public setCellText(row: number, col: number, newValue: UnboxedOper, isExternalUpdate = false) {
        this.needsRecalc = true;

        const cell = this.maybeGetCellAt(row, col);
        const dependents = cell.dependents;
        const cellLoc = this.getCellLoc(row, col);
        this.removeDependents(cellLoc, cell.precedents);

        // Handle Blank
        if (newValue === "") {
            cell.oper = blankOper;
            cell.formulaText = undefined;
            cell.precedents = undefined;
            cell.state = CellState.Final;


        // Handle formula input
        } else if (isFormulaString(newValue)) {
            let compiledFormula;
            const compileResult = this.compileFormulaText(newValue, row, col);
            if (compileResult.kind === ResultKind.Success) {
                compiledFormula = compileResult.value;
            }
            cell.oper = blankOper;
            cell.formulaText = newValue;
            cell.compiledFormula = compiledFormula;
            cell.state = CellState.Dirty;

        // Handle numbers, boolean, and strings.
        } else {
            switch (typeof newValue) {
                case "number":
                case "boolean":
                    cell.oper = newValue;
                    cell.formulaText = undefined;
                    cell.precedents = undefined;
                    cell.state = CellState.Final;
                    break;

                case "string":
                    cell.oper = this.parseValue(newValue);
                    cell.formulaText = undefined;
                    cell.precedents = undefined;
                    cell.state = CellState.Final;
                    break;

                default:
                    const proof: never = newValue
                    console.error("newValue was an unexpected type! " + proof);
            }
        }
        this.addDependentsToAccumulatorAndMarkDirty([cellLoc], dependents);
        if (!isExternalUpdate) {
            this.storeCellText(row, col, newValue);
        }
    }

    protected abstract storeCellText(row: number, col: number, value: UnboxedOper);

    //
    //  Begin EvalConfig implementation
    //

    private getDocumentLoc(path: string | undefined, name: string): DocumentLoc | undefined {
        return this.workbookLoc;
    }

    private getSheetIndex(doc: DocumentLoc, name: string): Result<number | undefined, Unavailable> {
        return success(0);
    }

    private getNameFormula(name: NameLoc): Result<CompiledFormula | undefined, Unavailable> {
        return success(this.nameToFormula[name.name.toLocaleUpperCase()]);
    }

    // TODO: enhance this so that it can handle array formulas (e.g. cellFormulas where FormulaSource = Range)
    private getCellFormula(cellLoc: SheetGridCell): Result<CellFormula | undefined, Unavailable> {
        const { row, col } = cellLoc.range;
        const cell = this.maybeGetCellAt(row, col);

        // Handle the case where there is no data in the grid in that location.
        if (!cell) {
            return success(undefined);
        } else if (!cell.compiledFormula) {
            return success(undefined);
        } else {
            return success(
                cellFormula(
                    sheetGridRange(cellLoc.sheet, gridRange(row, col, 1, 1)),
                    // Currently this can only handle single-cell formulas (i.e. not array-entered)
                    FormulaSource.Cell,
                    cell.compiledFormula,
                ));
        }
    }

    private getCellValueImpl(cellLoc: SheetGridCell): CellValue | undefined {
        const { row, col } = cellLoc.range;
        const cell = this.maybeGetCellAt(row, col);

        // TODO: should we make sure the formula is compiled first?

        // If there is no formula, the value should be final
        if (!cell.compiledFormula && cell.state !== CellState.Final) {
            cell.state = CellState.Final;
        }

        // If the value is final (either because it is a final formula, or because it was a non-formula)
        if (cell.state === CellState.Final) {
            return finalValue(cell.oper);
        }

        // Return undefined if evaluation failed
        if (cell.state === CellState.Failed) {
            return undefined;
        }

        if (cell.state === CellState.Dirty) {
            return pendingValue(this.getCellLoc(row, col));
        }

        console.error("something went wrong with GetCellValueImpl() <- this code path should never be hit!");
    }

    private getCellValue(cell: SheetGridCell): Result<CellValue, PreviousFailure | Unavailable> {
        const res = this.getCellValueImpl(cell);
        if (!res) {
            return failure(previousFailure(cell));
        }

        return success(res);
    }

    private getCellValues(range: SheetGridRange): Result<CellValue[][], PreviousFailure | Unavailable> {
        const { range: { row, col, rows, cols } } = range;

        let failed = false;
        const array = jaggedArray(rows, cols, (i, j) => {
            const value = this.getCellValueImpl(this.getCellLoc(i + row, j + col));
            if (value === undefined) {
                failed = true;
                return finalValue(blankOper);
            }
            return value;
        });

        if (failed) {
            return failure(previousFailure(range));
        }

        return success(array);
    }

    private setCellValue(cell: SheetGridCell, oper: WriteOper): void {
        const { row, col } = cell.range;
        let cellContent: Cell;

        if (this.maybeGetCellAt(row, col)) {
            cellContent = this.maybeGetCellAt(row, col);
            cellContent.oper = oper;
            cellContent.state = CellState.Final;
        } else {
            console.error("setCellValue tried to work with a cell that didn't yet exist in the data array!");
            // TODO: handle this case.
        }
    }

    private setCellValues(range: SheetGridRange, opers: ReadonlyArray<ReadonlyArray<WriteOper>>): void {
        const { sheet, range: { row, col, rows, cols } } = range;
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                const cell = sheetGridCell(sheet, gridCell(i + row, j + col));
                this.setCellValue(cell, opers[i][j]);
            }
        }
    }

    private setCellFailure(range: SheetGridRange, reason: FailureReason): void {
        this.forEachCellLocInRange(range, (cell: SheetGridCell) => {
            const { row, col } = cell.range;
            if (this.maybeGetCellAt(row, col)) {
                const cellContent = this.maybeGetCellAt(row, col);
                cellContent.oper = blankOper;           // TODO: Should this be an error oper?
                cellContent.state = CellState.Failed;
                cellContent.reason = reason;
            } else {
                console.error("setCellFailure tried to work with a cell that didn't yet exist in the data array!");
                // TODO: handle this case.
            }
        });
    }

    private setDynamicPrecs(range: SheetGridRange, precedents: Precedents): void {
        this.forEachCellLocInRange(range, (dependentCell) => {
            const { row, col } = dependentCell.range;

            // Set the precedents on the cell.
            if (this.maybeGetCellAt(row, col)) {
                this.maybeGetCellAt(row, col).precedents = precedents;
                console.log(`Marked ${printSheetGridCell(dependentCell)} as having these precedents: ${printPrecedents(precedents)}`);
            } else {
                // TODO: handle this case.
                console.error("setDynamicPrecs tried to set a precedent on a cell that didn't yet exist in the data array!");
            }

            // Set all the dependents, too.
            precedents.cells.forEach((precedentRange) => {
                this.forEachCellLocInRange(precedentRange, (precedentCell) => {
                    const c = this.maybeGetCellAt(precedentCell.range.row, precedentCell.range.col);
                    if (c) {
                        addDependent(c, dependentCell);
                        console.log(`Marked ${printSheetGridCell(precedentCell)} as a precedent of ${printSheetGridCell(dependentCell)}`);
                    } else {
                        // TODO: handle this case.
                        console.error("setDynamicPrecs tried to set a dependent a cell that didn't yet exist in the data array!");
                    }
                });
            });
        });
    }

    //
    //  End EvalConfig implementation
    //
}
