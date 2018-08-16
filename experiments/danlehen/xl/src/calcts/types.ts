import { analyze, config, formula, location, parse, runtime, value, util } from '@ms/excel-online-calc';

import AnalyzeGlobals = analyze.AnalyzeGlobals;
import createAnalyzer = analyze.createAnalyzer;

import calcConfig = config.calcConfig;

import CheckedFormula = formula.CheckedFormula;
import RefStyle = formula.RefStyle;
import WellFormedFormula = formula.WellFormedFormula;

import documentLoc = location.documentLoc;
import DocumentLoc = location.DocumentLoc;
import FormulaSource = location.FormulaSource;
import gridCell = location.gridCell;
import gridRange = location.gridRange;
import NameLoc = location.NameLoc;
import sheetGridCell = location.sheetGridCell;
import SheetGridCell = location.SheetGridCell;
import SheetGridRange = location.SheetGridRange;
import sheetGridRange = location.sheetGridRange;
import sheetIndex = location.sheetIndex;

import createParser = parse.createParser;
import notFormulaString = parse.notFormulaString;
import ParseGlobals = parse.ParseGlobals;

import cellFormula = runtime.cellFormula;
import CellFormula = runtime.CellFormula;
import CellValue = runtime.CellValue;
import CompiledFormula = runtime.CompiledFormula;
import CompileGlobals = runtime.CompileGlobals;
import CompileResult = runtime.CompileResult;
import createCompiler = runtime.createCompiler;
import createEvaluator = runtime.createEvaluator;
import EvalGlobals = runtime.EvalGlobals;
import FailureReason = runtime.FailureReason;
import fastMathpack = runtime.fastMathpack;
import finalValue = runtime.finalValue;
import Interrupt = runtime.Interrupt;
import pendingValue = runtime.pendingValue;
import previousFailure = runtime.previousFailure;
import PreviousFailure = runtime.PreviousFailure;
import ReasonKind = runtime.ReasonKind;
import Unavailable = runtime.Unavailable;

import failure = util.failure;
import Result = util.Result;
import success = util.success;
import ResultKind = util.ResultKind;

import blankOper = value.blankOper;
import BlankOper = value.BlankOper;
import ErrorOper = value.ErrorOper;
import OperKind = value.OperKind;
import Precedents = value.Precedents;
import ReadOper = value.ReadOper;
import UnboxedOper = value.UnboxedOper;
import WriteOper = value.WriteOper;

//TODO: Avoid importing test/internal modules from calc.ts?
import { Config } from '@ms/excel-online-calc/lib/lang/config';
import { createLocaleInfo } from "@ms/excel-online-calc/lib/test/config";
import { illFormedFormula } from '@ms/excel-online-calc/lib/runtime/serviceTypes';
import { jaggedArray } from '@ms/excel-online-calc/lib/common/arrayUtils';
import { makeGetFirstOrderFunc } from '@ms/excel-online-calc/lib/test/evalContext';
import { isErrorOper } from '@ms/excel-online-calc/lib/runtime/util';
import { errorNames } from '@ms/excel-online-calc/lib/test/config';

export {
    AnalyzeGlobals,
    blankOper,
    BlankOper,
    calcConfig,
    CellFormula,
    cellFormula,
    CellValue,
    CompiledFormula,
    CompileGlobals,
    CompileResult,
    Config,                     // TODO: Avoid exporting test/internal modules?
    createAnalyzer,
    createCompiler,
    createEvaluator,
    createLocaleInfo,           // TODO: Avoid exporting test/internal modules?
    createParser,
    documentLoc,
    DocumentLoc,
    errorNames,                 // TODO: Avoid exporting test/internal modules?
    ErrorOper,
    EvalGlobals,
    failure,
    FailureReason,
    fastMathpack,
    finalValue,
    FormulaSource,
    gridCell,
    gridRange,
    Interrupt,
    illFormedFormula,           // TODO: Avoid exporting test/internal modules?
    isErrorOper,                // TODO: Avoid exporting test/internal modules?
    jaggedArray,                // TODO: Avoid exporting test/internal modules?
    location,
    makeGetFirstOrderFunc,      // TODO: Avoid exporting test/internal modules?
    NameLoc,
    notFormulaString,
    OperKind,
    ParseGlobals,
    pendingValue,
    Precedents,
    PreviousFailure,
    previousFailure,
    ReadOper,
    ReasonKind,
    RefStyle,
    ResultKind,
    Result,
    runtime,
    SheetGridCell,
    sheetGridCell,
    SheetGridRange,
    sheetGridRange,
    sheetIndex,
    success,
    Unavailable,
    UnboxedOper,
    value,
    WriteOper,
};

/** True if the given oper is the BlankOper. */
export function isBlankOper(oper: any): oper is BlankOper {
    return ((oper && (oper as BlankOper).kind === OperKind.Blank)
        ? true
        : false);
}

/** True if the given string begins with '='. */
export function isFormulaString(input: any): input is string {
    return (typeof input === 'string' && input[0] === '=');
}

/** True if the given CheckedFormula is a WellFormedFormula. */
export function isWellFormed(f: CheckedFormula): f is WellFormedFormula {
    return f.isWellFormed;
}