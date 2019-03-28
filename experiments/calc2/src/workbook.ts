import { mapperContext, recalcMapper } from "@ms/excel-online-calc/lib/calc";
import * as assert from "assert";
import { Cell, CellState } from "./cell";
import { printSheetGridRange } from "./helpers";
import { calcConfig } from "@ms/excel-online-calc/lib/lang/config";
import { createCompiler, fastMathpack, createEvaluator, Interrupt, notImplemented, CompiledFormula, FailureReason, CompileResult, illFormedFormula, Unavailable, CellFormula, cellFormula, CellValue, finalValue, pendingValue, PreviousFailure, previousFailure } from "@ms/excel-online-calc/lib/runtime";
import { createAnalyzer } from "@ms/excel-online-calc/lib/analyze";
import { documentLoc, FormulaSource, SheetGridCell, sheetGridCell, sheetIndex, gridCell, SheetGridRange, DocumentLoc, NameLoc, sheetGridRange, gridRange } from "@ms/excel-online-calc/lib/lang/location";
import { failure, success, Result, ResultKind } from "@ms/excel-online-calc/lib/lang/util";
import { ReadOper, blankOper, WriteOper, errorOper } from "@ms/excel-online-calc/lib/lang/value";
import { notFormulaString } from "@ms/excel-online-calc/lib/parse/serviceTypes";
import { OperKind } from "@ms/excel-online-calc/lib/lang/types";
import { isFormulaString, isWellFormed } from "./types";
import { RefStyle } from "@ms/excel-online-calc/lib/lang/formula";
import { jaggedArray } from "@ms/excel-online-calc/lib/common/arrayUtils";
import { createParser } from "@ms/excel-online-calc/lib/parse";
import { createLocaleInfo } from "@ms/excel-online-calc/lib/test/config";
import { makeGetFirstOrderFunc } from "@ms/excel-online-calc/lib/test/evalContext";

export type UnboxedOper = undefined | boolean | number | string;

/**
 * One sheet Workbook that evaluates using 'Calc.ts'.
 */
export abstract class Workbook {
    protected abstract get numRows();
    protected abstract get numCols();

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
        getUsedRange: () => failure(notImplemented(["getUsedRange"])),
    });

    // Workbook state
    private readonly workbookLoc = documentLoc(undefined, "");
    private readonly nameToFormula: Map<string, CompiledFormula> = new Map();
    // private readonly dirty: SheetGridCell[] = [];

    private readonly mapperContext = mapperContext(
        /* maxRangeSize */ 100,
        /* nameRefs: */ false,
        /* rowRefs: */ false,
        /* columnRefs: */ false,
        /* crossSheetRefs: */ true,
        /* crossDocRefs: */ false,
        /* getCurrentDocumentLoc */ this.getDocumentLoc.bind(this),
        /* getCurrentSheetIndex */ () => 0,
        /* getSheetIndex */ () => 0,
        /* nameRefToSheetGridRange */ () => undefined,
    );

    private readonly mapper = recalcMapper({
        shipAssertTag: (tag: number, category: any, condition: boolean, message: string) => {
            console.assert(condition, "shipAssertTag:", tag, category, message);
        },

        assertTag: (tag: number, category: any, condition: boolean, message: string) => {
            if (!condition) {
                throw new Error(`assertTag2 ${tag} ${category} ${message}`);
            }
        },

        traceTag: () => {
            // console.log("traceTag2", tag, message, category, level);
        },

        debugTraceTag: () => {
            // console.log("debugTraceTag2", tag, message, category, level);
        },
    });

    private convertReadOper(oper: ReadOper): UnboxedOper {
        switch (typeof oper) {
            case "string":
            case "number":
            case "boolean":
            case "undefined":
                return oper as UnboxedOper;
            case "object":
                switch (oper.kind) {
                    case OperKind.Blank:
                        return undefined;
                    case OperKind.Error:
                        throw new Error(this.config.localeInfo.errorNames[oper.type]);
                }
        }

        throw new Error(`Unhandled cell oper '${JSON.stringify(oper)}'`);
    }

    /** Return the result of evaluating the workbook cell at the given row/col. */
    public evaluateCell(row: number, col: number): UnboxedOper {
        const cell = this.getCellData(row, col);
        if (cell.state === CellState.Dirty) {
            this.evaluator.evalCells([this.getCellLoc(row, col)]);
        }
        return this.convertReadOper(cell.oper);
    }

    /**
     * Return the result of evaluating the given formula.  The specified row/col are used
     * to resolve relative cell references.
     */
    public evaluateFormulaText(formulaText: string, row = 0, col = 0): UnboxedOper {
        const compileResult = this.compileFormulaText(formulaText, row, col);
        if (compileResult.kind === ResultKind.Success) {
            const formulaLocation = this.getCellLoc(row, col);
            const evalResult = this.evaluator.evalFormula(
                formulaLocation,
                FormulaSource.Cell,
                compileResult.value,
                undefined,
            );
            if (evalResult.kind === ResultKind.Success) {
                return this.convertReadOper(evalResult.value);
            } else {
                throw new Error(`Formula evaluation failed: ${JSON.stringify(evalResult.reason)}`);
            }
        }
        throw new Error(`Formula complilation failed: ${JSON.stringify(compileResult.reason)}`);
    }

    private newCell(row: number, col: number, cellText: UnboxedOper): Cell | undefined {
        if (cellText === undefined || cellText === "") {
            return undefined;
        } else if (isFormulaString(cellText)) {
            // Handle formula input
            const compileResult = this.compileFormulaText(cellText, row, col);
            return { 
                oper: blankOper,
                compiledFormula: compileResult.kind === ResultKind.Success ? compileResult.value : undefined,
                state: CellState.Dirty
            };
        } else {
            // Handle numbers, boolean, and strings.
            switch (typeof cellText) {
                case "number":
                case "boolean":
                    return { oper: cellText, state: CellState.Final };

                case "string":
                    return { oper: this.parseValue(cellText), state: CellState.Final }
            }
        }

        console.error(`cellText was an unexpected type! ${JSON.stringify(cellText)}`);
        return undefined;
    }

    private getCellData(row: number, col: number) {
        const maybeCell = this.maybeGetCell(row, col);
        const cell = maybeCell || this.newCell(row, col, this.loadCellText(row, col));

        if (maybeCell !== cell) {
            this.storeCellData(row, col, cell);
        }

        return cell || { oper: blankOper, state: CellState.Final };
    }

    /**
     * Sets the cell at the give row/col to the given newValue.  Strings beginning
     * with "=" are parsed as formulas.  Strings containing numbers or booleans are
     * parsed as primitive values.
     */
    public setCellText(row: number, col: number, newValue: UnboxedOper, isExternalUpdate = false) {
        this.storeCellData(row, col, undefined);
        this.invalidate(this.getCellLoc(row, col));
        if (!isExternalUpdate) {
            this.storeCellText(row, col, newValue);
        }
    }

    protected abstract loadCellText(row: number, col: number): UnboxedOper;
    protected abstract storeCellText(row: number, col: number, value: UnboxedOper);

    /**
     * Returns the Cell at the given row/col if it is populated, otherwise
     * return undefined.
     */
    private maybeGetCell(row: number, col: number): Cell | undefined {
        return this.loadCellData(row, col) as Cell;
    }

    protected abstract loadCellData(row: number, col: number): object | undefined;
    protected abstract storeCellData(row: number, col: number, cell: object | undefined);

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

    /**
     * Compiles the given formula string for the cell residing at the specified row/col and adds
     * its static dependencies to the recalc mapper.
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
                if (compilerResult.kind === ResultKind.Success) {
                    this.mapper.add(this.mapperContext, formulaLocation, parseResult.value);
                } else {
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
    private invalidate(cellLoc: SheetGridCell) {
        const dependents = this.mapper.directDependents(cellLoc);
        for (const dependentLoc of dependents) {
            const { row, col } = dependentLoc.range;
            const maybeDependent = this.maybeGetCell(row, col);
            if (maybeDependent && maybeDependent.state !== CellState.Dirty) {
                maybeDependent.state = CellState.Dirty;
                this.invalidate(dependentLoc);
            }
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

    //
    //  Begin EvalConfig implementation
    //

    private getDocumentLoc(): DocumentLoc | undefined {
        return this.workbookLoc;
    }

    private getSheetIndex(): Result<number | undefined, Unavailable> {
        return success(0);
    }

    private getNameFormula(name: NameLoc): Result<CompiledFormula | undefined, Unavailable> {
        return success(this.nameToFormula[name.name.toLocaleUpperCase()]);
    }

    // TODO: enhance this so that it can handle array formulas (e.g. cellFormulas where FormulaSource = Range)
    private getCellFormula(cellLoc: SheetGridCell): Result<CellFormula | undefined, Unavailable> {
        const { row, col } = cellLoc.range;
        const cell = this.maybeGetCell(row, col);

        return success(
            cell && cell.compiledFormula
                ? cellFormula(
                    sheetGridRange(cellLoc.sheet, gridRange(row, col, 1, 1)),
                    // Currently this can only handle single-cell formulas (i.e. not array-entered)
                    FormulaSource.Cell,
                    cell.compiledFormula)
                : undefined);
    }

    private getCellValueImpl(cellLoc: SheetGridCell): CellValue | undefined {
        const { row, col } = cellLoc.range;
        const cell = this.getCellData(row, col);

        switch (cell.state) {
            case CellState.Final:
                return finalValue(cell.oper);
            case CellState.Dirty:
                return pendingValue(this.getCellLoc(row, col));
            default:
                assert(cell.state === CellState.Failed);
                return undefined;
        }
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
        const cellContent = this.maybeGetCell(row, col);

        if (cellContent) {
            cellContent.oper = oper;
            cellContent.state = CellState.Final;
        } else {
            console.error("setCellValue tried to work with a cell that didn't yet exist in the data array!");
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
            const cellContent = this.maybeGetCell(row, col);
            if (cellContent) {
                cellContent.oper = blankOper;           // TODO: Should this be an error oper?
                cellContent.state = CellState.Failed;
                cellContent.reason = reason;
            } else {
                console.error("setCellFailure tried to work with a cell that didn't yet exist in the data array!");
            }
        });
    }

    private setDynamicPrecs(): void { /* do nothing */ }

    //
    //  End EvalConfig implementation
    //
}
