/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    CalcFun,
    CalcObj,
    CalcValue,
    compile,
    Delayed,
    errors,
    Formula,
    isDelayed,
    makeError,
    Pending,
    Primitive,
    Trace,
} from "@tiny-calc/nano";

import * as assert from "assert";

/* tslint:disable:prefer-method-signature */
/* tslint:disable:interface-name */

function assertNever(_: never): never {
    return assert.fail(`
Unreachable Expression ${JSON.stringify(_)}
Stack: ${new Error().stack}
`);
}

/**
 * Core referencing.
 *
 * TODO: Replace string keys with efficient number-based
 * representation.
 */

const ROW = 0 as const;
const COL = 1 as const;
type Point = [number, number];

const pointToKey = (row: number, col: number) => `${row};${col}`;

function keyToPoint(key: string): Point | undefined {
    const tokens = key.split(";");
    if (tokens.length !== 2) { return undefined; }
    const r = Number(tokens[ROW]);
    const c = Number(tokens[COL]);
    return isNaN(r) || isNaN(c) ? undefined : [r, c];
}

function keyAsPoint(key: string): Point {
    const point = keyToPoint(key)!;
    return point === undefined ? assertNever(point as never) : point;
}

function colNameToIndex(chars: string[]) {
    return chars
        .map((letter) => letter.toUpperCase().charCodeAt(0) - 64)
        .reduce((accumulator, value) => (accumulator * 26) + value, 0) - 1;
}

const isDigit = (ch: number) => ch >= 0x30 && ch <= 0x39;

function parseRef(maxRow: number, maxCol: number, text: string): Point | undefined {
    let i = 0;
    const colChars: string[] = [];
    while (i < text.length && !isDigit(text.charCodeAt(i))) {
        colChars.push(text[i]);
        i += 1;
    }
    const col = colNameToIndex(colChars);
    if (col > maxCol) { return undefined; }
    const rowText = text.substring(i);
    if (rowText === "") {
        return undefined;
    }
    const row = Number(text.substring(i)) - 1;
    if (row > maxRow) { return undefined; }
    return isNaN(row) ? undefined : [row, col];
}

/**
 * Depedency Graph
 *
 * Cell-key to cell-key graph. No rectangles (yet).
 * TODO: Tracking of externally linked formulas.
 */
interface Binder<F, T = F> {
    bindCells: (from: F, to: T) => void;
    getDeps: (source: F) => Set<T> | undefined;
    deleteLinks: (source: F) => void;
}

function initBinder(): Binder<string> {
    interface IGraph {
        cells: Map<string, Set<string>>;
        formulaConsumers?: Map<string, unknown>;
    }

    const graph: IGraph = { cells: new Map() };
    return {
        bindCells: (from, to) => {
            let links = graph.cells.get(from);
            if (links === undefined) {
                graph.cells.set(from, links = new Set());
            }
            links.add(to);
        },
        getDeps: (source) => graph.cells.get(source),
        deleteLinks: (source) => {
            graph.cells.delete(source);
        },
    };
}

/*
 * Cell Data Types
 */

/**
 * CalcFlags for Cell Status.
 */
const enum CalcFlag {
    Clean,
    Dirty,
    InCalc,
    Enqueued,
}

type Value = CalcValue<Point>;

interface ValueCell {
    flag: CalcFlag.Clean;
    content: Primitive;
}

interface FormulaCell {
    flag: CalcFlag;
    content: string;
    value: Value | undefined;
    fn: Formula | undefined;
}

type Cell = ValueCell | FormulaCell;

function valueCell(content: Primitive): ValueCell {
    return { flag: CalcFlag.Clean, content };
}

function formulaCell(content: string): FormulaCell {
    return { flag: CalcFlag.Clean, content, value: undefined, fn: undefined };
}

function isFormulaCell(cell: Cell): cell is FormulaCell {
    return "fn" in cell;
}

function makeValueCell(value: Primitive) {
    let content: Primitive;
    switch (typeof value) {
        case "number":
        case "boolean":
            content = value;
            break;
        case "string":
            content = parseValue(value);
            break;
        default:
            return assertNever(value);
    }
    return valueCell(content);
}

function makeFormulaCell(text: string) {
    // text should not start with '='
    const cell = formulaCell(text);
    cell.flag = CalcFlag.Dirty;
    cell.fn = compile(text);
    return cell;
}

function makeCell(value: Primitive | undefined) {
    if (value === undefined || value === "") {
        return undefined;
    }
    if (typeof value === "string" && value[0] === "=") {
        return makeFormulaCell(value.substring(1));
    }
    return makeValueCell(value);
}

function parseValue(value: string): Primitive {
    const upper = value.toUpperCase();
    if (upper === "TRUE") { return true; }
    if (upper === "FALSE") { return false; }
    const asNumber = Number(value);
    return isNaN(asNumber) ? value : asNumber;
}

interface CellReader {
    readCell: (row: number, column: number) => Cell | undefined;
}

interface BuildHost extends CellReader {
    binder: Binder<string>;
    rootContext: CalcValue<Point>;
}

function createInvalidator(reader: CellReader, binder: Binder<string>) {
    const go = (key: string) => {
        const point = keyAsPoint(key);
        const cell = reader.readCell(point[ROW], point[COL]);
        if (cell === undefined || !isFormulaCell(cell)) {
            const deps = binder.getDeps(key);
            if (deps) {
                deps.forEach(go);
            }
            return;
        }
        if (cell.flag !== CalcFlag.Dirty) {
            cell.flag = CalcFlag.Dirty;
            const deps = binder.getDeps(key);
            if (deps) {
                deps.forEach(go);
            }
        }
    };
    return go;
}

/**
 * Initialize a build queue from edited `roots`.
 */
function initBuildQueue(roots: string[], reader: CellReader, binder: Binder<string>) {
    const queue: Fiber[] = [];

    function queueKey(key: string) {
        const [row, column] = keyAsPoint(key);
        const cell = reader.readCell(row, column); // TODO: make this read cell
        if (cell && isFormulaCell(cell) && cell.flag === CalcFlag.Dirty) {
            cell.flag = CalcFlag.Enqueued;
            queue.unshift(makePendingCell(row, column));
            return;
        }
        const deps = binder.getDeps(key);
        binder.deleteLinks(key);
        if (deps) {
            deps.forEach(queueKey);
        }
        return;
    }

    roots.forEach(queueKey);
    return [queue, queueKey] as const;
}

interface PendingValue {
    kind: "Pending";
}

const enum FiberKind {
    Cell,
    Function,
}

interface CellFiber extends PendingValue {
    task: FiberKind.Cell;
    row: number;
    column: number;
}

type FunctionTask = "sum" | "product" | "count" | "average" | "max" | "min";

interface FunctionFiber<O = unknown, T = unknown> extends PendingValue {
    task: FiberKind.Function;
    name: FunctionTask;
    range: Range<O>;
    origin: O;
    point: Point;
    current: T;
}

type Fiber<O = unknown, T = unknown> = CellFiber | FunctionFiber<O, T>;

function makePendingCell(row: number, column: number): CellFiber {
    return { kind: "Pending", task: FiberKind.Cell, row, column };
}

function makePendingFunction<O, V>(name: FunctionTask, range: Range<O>, origin: O, point: Point, current: V): FunctionFiber<O, V> {
    return { kind: "Pending", name, task: FiberKind.Function, range, origin, point, current };
}

function isPending(content: any): content is PendingValue {
    return typeof content === "object" && "kind" in content && content.kind === "Pending";
}

function isFiber(content: any): content is Fiber {
    return isPending(content) && "task" in content;
}

/**
 * Initialise a fiber stack for high-priority tasks.
 */
function initFiberStack() {
    const stack: Fiber[] = [];
    return [stack, (fiber: Fiber) => { stack.push(fiber); }] as const;
}

const coerceResult = (row: number, column: number, value: CalcValue<Point>) =>
    value instanceof Range ? (value as Range<Point>).request([row, column], "value") : value;

/**
 * Mark a cell as calculated with `value`, queue its dependents for
 * evaluation, and remove dependency links (to be re-established on
 * dependent recalc).
 */
function finishCell(queueKey: (key: string) => void, binder: Binder<string>, row: number, col: number, cell: FormulaCell, value: Value) {
    cell.value = value;
    const key = pointToKey(row, col);
    const deps = binder.getDeps(key);
    binder.deleteLinks(key);
    if (deps) {
        deps.forEach(queueKey);
    }
    cell.flag = CalcFlag.Clean;
}

const shouldQueueFiber = (host: BuildHost, row: number, column: number) => {
    const dependent = host.readCell(row, column);
    return dependent && (dependent.flag === CalcFlag.Dirty || dependent.flag === CalcFlag.Enqueued);
};

/**
 * Basic errors.
 */
const errorValues = {
    ...errors,
    unknownField: makeError("#UNKNOWN!"),
    cycle: makeError("#CYCLE!"),
    fallbackCoercion: makeError("#VALUE!"),
    compileFailure: makeError("#COMPILE!"),
    evalFailure: makeError("#EVAL!"),
} as const;

/**
 * Recalc `sheet`, starting from the edited `roots`.
 */
function rebuild(roots: string[], host: BuildHost): void {

    console.time("rebuild");

    const [queue, queueKey] = initBuildQueue(roots, host, host.binder);
    const [dynamicFibers, addFiber] = initFiberStack();

    function runCellFiber(fiber: CellFiber) {
        const { row, column } = fiber;
        const cell = host.readCell(row, column);
        if (cell === undefined || !isFormulaCell(cell)) {
            return assertNever(cell as never);
        }
        const result = evalCell(row, column, cell);
        if (result !== true) {
            addFiber(fiber);
            result.forEach((pending: unknown) => {
                if (isFiber(pending)) {
                    addFiber(pending);
                }
            });
        }
        return;
    }

    function runFunctionFiber<O, T>(fiber: FunctionFiber<O, T>) {
        const { point, range } = fiber;
        const [r, c] = point;
        const endR = range.tl[ROW] + range.height;
        const endC = range.tl[COL] + range.width;
        for (let j = c; j < endC; j += 1) {
            if (shouldQueueFiber(host, r, j)) {
                addFiber(makePendingCell(r, j));
            }
        }
        for (let i = r + 1; i < endR; i += 1) {
            for (let j = 0; j < endC; j += 1) {
                if (shouldQueueFiber(host, i, j)) {
                    addFiber(makePendingCell(i, j));
                }
            }
        }
    }

    function evalCell(row: number, col: number, cell: FormulaCell): true | PendingValue[] {
        if (cell.flag === CalcFlag.Clean) {
            return true;
        }
        if (cell.fn === undefined) {
            finishCell(queueKey, host.binder, row, col, cell, errorValues.compileFailure);
            return true;
        }
        cell.flag = CalcFlag.InCalc;
        let result: [PendingValue[], Delayed<CalcValue<Point>>] = [[], errorValues.evalFailure];
        try {
            result = cell.fn([row, col], host.rootContext);
        } catch {
        }
        if (isDelayed(result[1])) {
            return result[0];
        }
        const value = coerceResult(row, col, result[1]);
        if (isPending(value)) { return [value]; }
        finishCell(queueKey, host.binder, row, col, cell, value);
        return true;
    }

    const lookupTable = {
        [FiberKind.Cell]: runCellFiber,
        [FiberKind.Function]: runFunctionFiber,
    } as const;

    while (queue.length !== 0 || dynamicFibers.length !== 0) {
        const fiber = dynamicFibers.pop() || queue.pop()!;
        lookupTable[fiber.task](fiber as any);
    }

    console.timeEnd("rebuild");
}

/*
 * Function implementations.
 * These are mostly reducer wrappers around Range aggregations.
 */

function extractNumberFromProperty<O>(trace: Trace, origin: O, arg: CalcValue<O>, property: string) {
    if (typeof arg === "number") { return arg; } // fast path
    let result: Delayed<CalcValue<O>> = arg;
    if (arg instanceof Range) {
        result = trace(arg.request(origin, property));
    } else if (typeof arg === "object") {
        result = trace(arg.request(origin, "value"));
    }
    switch (typeof result) {
        case "object":
        case "number":
            return result;
        default:
            return 0;
    }
}

function reduceNumbers<O>(args: Delayed<CalcValue<O>>[], fn: (prev: number, current: number) => number, init: number) {
    let total = init;
    for (const arg of args) {
        if (typeof arg !== "number") {
            return arg;
        }
        total = fn(total, arg);
    }
    return total;
}

const sum: CalcFun = (trace, origin, args) => {
    const totals = args.map((arg) => extractNumberFromProperty(trace, origin, arg, "sum"));
    return reduceNumbers(totals, (prev, current) => prev + current, 0);
};

const product: CalcFun = (trace, origin, args) => {
    const totals = args.map((arg) => extractNumberFromProperty(trace, origin, arg, "product"));
    return reduceNumbers(totals, (prev, current) => prev * current, 1);
};

const count: CalcFun = (trace, origin, args) => {
    const totals = args.map((arg) => extractNumberFromProperty(trace, origin, arg, "count"));
    return reduceNumbers(totals, (prev, current) => prev + current, 0);
};

const average: CalcFun = (trace, origin, args) => {
    const totals = args.map((arg) => extractNumberFromProperty(trace, origin, arg, "sum"));
    const counts = args.map((arg) => extractNumberFromProperty(trace, origin, arg, "count"));
    const total = reduceNumbers(totals, (prev, current) => prev + current, 0);
    if (typeof total === "number") {
        const finalCount = reduceNumbers(counts, (prev, current) => prev + current, 0);
        return typeof finalCount === "number" ? finalCount === 0 ? errorValues.div0 : total / finalCount : finalCount;
    }
    return total;
};

const max: CalcFun = (trace, origin, args) => {
    const maxs = args.map((arg) => extractNumberFromProperty(trace, origin, arg, "max"));
    if (maxs.length === 0) { return 0; }
    for (const arg of maxs) {
        if (typeof arg !== "number") {
            return arg;
        }
    }
    return reduceNumbers(maxs, (prev, current) => current > prev ? current : prev, maxs[0] as number);
};

const min: CalcFun = (trace, origin, args) => {
    const mins = args.map((arg) => extractNumberFromProperty(trace, origin, arg, "min"));
    if (mins.length === 0) { return 0; }
    for (const arg of mins) {
        if (typeof arg !== "number") {
            return arg;
        }
    }
    return reduceNumbers(mins, (prev, current) => current < prev ? current : prev, mins[0] as number);
};

const funcs = {
    sum, product, count, average, max, min,
    SUM: sum, PRODUCT: product, COUNT: count, AVERAGE: average, MAX: max, MIN: min,
};

/*
 * Function Runners are accumulators over ranges.
 */

type FunctionRunner<Res> = [Res, (x: unknown) => void];

const createRunner = <Res>(fn: (box: [Res]) => (x: unknown) => void) => {
    return (init: Res) => {
        const result: FunctionRunner<Res> = [init, undefined!];
        result[1] = fn(result as unknown as [Res]);
        return result;
    };
};

const createSum = createRunner<number>((result) => (n) => { if (typeof n === "number") { result[0] += n; } });
const createProduct = createRunner<number>((result) => (n) => { if (typeof n === "number") { result[0] *= n; } });
const createCount = createRunner<number>((result) => (n) => { if (typeof n === "number") { result[0]++; } });
const createAverage = createRunner<[number, number]>((result) => (n) => { if (typeof n === "number") { result[0][0] += n; result[0][1]++; } });
const createMax = createRunner<number | undefined>(
    (result) => (n) => {
        if (typeof n === "number" && (result[0] === undefined || n > result[0])) {
            result[0] = n;
        }
    },
);
const createMin = createRunner<number | undefined>(
    (result) => (n) => {
        if (typeof n === "number" && (result[0] === undefined || n < result[0])) {
            result[0] = n;
        }
    },
);

/*
 * Core aggregation functions over ranges
 */

interface RangeContext<O> {
    link: (row: number, col: number, origin: O) => CalcValue<O> | CellFiber;
    parseRef: (text: string) => Point | undefined;
}

type RangeAggregation<R, Accum = R> = <O>(
    range: Range<O>, context: RangeContext<O>, origin: O, someTask?: FunctionFiber<O, Accum>,
) => R | FunctionFiber<O, Accum>;

function runFunc<O, Res>(context: RangeContext<O>, task: FunctionFiber<O, Res>, initRunner: (init: Res) => FunctionRunner<Res>) {
    const { current, point, range } = task;
    const runner = initRunner(current);
    const run = runner[1];
    const endR = point[ROW] + range.height;
    const endC = point[COL] + range.width;
    for (let i = point[ROW]; i < endR; i += 1) {
        for (let j = point[COL]; j < endC; j += 1) {
            const content = context.link(i, j, task.origin);
            if (isPending(content)) {
                assert.strictEqual(content.task, FiberKind.Cell);
                task.point = [i, j];
                task.current = runner[0];
                return task;
            }
            run(content);
        }
    }
    return runner[0];
}

const rangeSum: RangeAggregation<number> = (range, context, origin, someTask?) => {
    const task = someTask || makePendingFunction("sum", range, origin, range.tl, 0);
    return runFunc(context, task, createSum);
};

const rangeProduct: RangeAggregation<number> = (range, context, origin, someTask?) => {
    const task = someTask || makePendingFunction("product", range, origin, range.tl, 1);
    return runFunc(context, task, createProduct);
};

const rangeCount: RangeAggregation<number> = (range, context, origin, someTask?) => {
    const task = someTask || makePendingFunction("count", range, origin, range.tl, 0);
    return runFunc(context, task, createCount);
};

const rangeAverage: RangeAggregation<number | CalcObj<unknown>, [number, number]> = (range, context, origin, someTask?) => {
    const task = someTask || makePendingFunction("average", range, origin, range.tl, [0, 0]);
    const result = runFunc(context, task, createAverage);
    if (isPending(result)) { return result; }
    const [total, finalCount] = result;
    return finalCount === 0 ? errorValues.div0 : total / finalCount;
};

const rangeMax: RangeAggregation<number, number | undefined> = (range, context, origin, someTask?) => {
    const task = someTask || makePendingFunction("max", range, origin, range.tl, undefined);
    const result = runFunc(context, task, createMax);
    return result === undefined ? 0 : result;
};

const rangeMin: RangeAggregation<number, number | undefined> = (range, context, origin, someTask?) => {
    const task = someTask || makePendingFunction("min", range, origin, range.tl, undefined);
    const result = runFunc(context, task, createMin);
    return result === undefined ? 0 : result;
};

type FreshAggregation<R, Accum = R> = <O>(
    range: Range<O>, context: RangeContext<O>, origin: O,
) => R | FunctionFiber<O, Accum>;

const aggregations: Record<string, FreshAggregation<CalcValue<unknown>, unknown>> = {
    sum: rangeSum, product: rangeProduct, count: rangeCount, average: rangeAverage, max: rangeMax, min: rangeMin,
    SUM: rangeSum, PRODUCT: rangeProduct, COUNT: rangeCount, AVERAGE: rangeAverage, MAX: rangeMax, MIN: rangeMin,
};

function tryParseRange<O>(context: RangeContext<O>, text: string) {
    const normalizedText = text.toLowerCase();
    const asRange = normalizedText.split(":");
    if (asRange.length >= 1) {
        const first = context.parseRef(asRange[0]);
        if (first === undefined) {
            return undefined;
        }
        if (asRange[1] === undefined) {
            return new Range(context, first, first);
        }
        const second = context.parseRef(asRange[1]);
        if (second !== undefined) {
            return new Range(context, first, second);
        }
    }
    return undefined;
}

/**
 * A Range represents a view of the grid that knows how to calculate
 * aggregations over the view. The canonical value of a Range is the
 * top left corner.
 */
class Range<O> implements CalcObj<O> {
    public readonly tl: Point;
    public readonly height: number;
    public readonly width: number;

    constructor(private readonly context: RangeContext<O>, first: Point, second: Point) {
        this.tl = [
            first[ROW] < second[ROW] ? first[ROW] : second[ROW],
            first[COL] < second[COL] ? first[COL] : second[COL],
        ];
        this.height = Math.abs(first[ROW] - second[ROW]) + 1;
        this.width = Math.abs(first[COL] - second[COL]) + 1;
    }

    public request(origin: O, property: string): CalcValue<O> | Pending<CalcValue<O>> {
        if (aggregations[property] !== undefined) {
            const fn = aggregations[property as keyof typeof aggregations];
            return fn(this, this.context, origin);
        }
        switch (property) {
            case "value":
                return this.context.link(this.tl[ROW], this.tl[COL], origin);
            case "row":
            case "ROW":
                return this.tl[ROW] + 1;
            case "column":
            case "COLUMN":
                return this.tl[COL] + 1;
            default:
                const range = tryParseRange(this.context, property);
                if (range === undefined) {
                    const value = this.context.link(this.tl[ROW], this.tl[COL], origin);
                    if (typeof value === "object") {
                        return isPending(value) ? value : value.request(origin, property);
                    }
                    return errorValues.unknownField;
                }
                return range;
        }
    }
}

/**
 * Core DDS interface for matrix-like document.
 */
export interface IDocumentAdapter {
    rows: () => number;
    columns: () => number;
    loadCellText: (row: number, col: number) => Primitive | undefined;
    storeCellText: (row: number, col: number, value: Primitive | undefined) => void;
    loadCellData: (row: number, col: number) => object | undefined;
    storeCellData: (row: number, col: number, value: object | undefined) => void;
}

/**
 * Sheetlet: a grid of incrementally recalculating formulas.
 */
export interface ISheetlet {
    refreshFromModel: (row: number, col: number) => void;
    setCellText: (row: number, col: number, value: Primitive | undefined) => void;
    evaluateCell: (row: number, col: number) => Primitive | undefined;
    evaluateFormula: (formula: string) => Primitive | undefined;
}

class Sheetlet implements ISheetlet {
    private static readonly blank = "";

    public readonly binder = initBinder();

    public readonly rootContext: CalcValue<Point> = {
        request: (origin, property) => {
            if (property in funcs) {
                return funcs[property];
            }
            switch (property) {
                case "row":
                case "ROW":
                    return origin[ROW] + 1;
                case "column":
                case "COLUMN":
                    return origin[COL] + 1;
                default:
                    const range = tryParseRange(this.inSheetContext, property);
                    return range || errorValues.unknownField;
            }
        },
    };

    private readonly inSheetContext = {
        link: this.getCellValueAndLink.bind(this),
        parseRef: this.parseRef.bind(this),
    };

    private readonly outOfSheetContext = {
        link: this.getCellValueAndForget.bind(this),
        parseRef: this.parseRef.bind(this),
    };

    private readonly invalidate = createInvalidator({
        readCell: this.getCell.bind(this),
    }, this.binder);

    constructor(private readonly adapter: IDocumentAdapter) { }

    public refreshFromModel(row: number, col: number) {
        this.adapter.storeCellData(row, col, undefined);
        this.invalidate(pointToKey(row, col));
    }

    public setCellText(row: number, col: number, value: Primitive | undefined) {
        // setting text clears any cell data
        this.adapter.storeCellText(row, col, value);
        this.invalidate(pointToKey(row, col));
    }

    public parseRef(text: string): Point | undefined {
        return parseRef(this.adapter.rows() - 1, this.adapter.columns() - 1, text);
    }

    public getCell(row: number, col: number) {
        return this.adapter.loadCellData(row, col) as Cell | undefined;
    }

    public readCell(row: number, col: number) {
        let cell = this.getCell(row, col);
        if (cell === undefined) {
            cell = makeCell(this.adapter.loadCellText(row, col));
            if (cell !== undefined) {
                this.adapter.storeCellData(row, col, cell);
            }
        }
        return cell;
    }

    public evaluateCell(row: number, col: number): Primitive | undefined {
        const cell = this.readCell(row, col);
        if (cell && cell.flag === CalcFlag.Dirty) {
            console.log(`building ${pointToKey(row, col)}`);
            console.time(`evalCell`);
            try {
                rebuild([pointToKey(row, col)], this);
            } catch (e) {
                console.log(`Rebuild failure: ${e}`);
            }
            console.timeEnd(`evalCell`);
        }
        if (cell) {
            return isFormulaCell(cell) ?
                cell.value === undefined ?
                    undefined :
                    this.primitiveFromValue([row, col], cell.value)
                :
                cell.content;
        }
        return undefined;
    }

    /**
     * Evaluate a formula string that can start with or without
     * '='. The resulting formula evaluates in the context of the
     * whole sheet and creates no dependencies to the sheet (TODO). We
     * assume that these formulas are run over clean sheets and will
     * not calc dirty cells on demand. We return `undefined` if we
     * encounter anything dirty during calc.
     */
    public evaluateFormula(formula: string): Primitive | undefined {
        const program = formula[0] === "=" ? formula.substring(1) : formula;
        const start: Point = [0, 0];
        const end: Point = [this.adapter.rows() - 1, this.adapter.columns() - 1];
        const fn = compile(program);
        if (fn === undefined) { return undefined; }
        const value = fn(undefined, new Range<unknown>(this.outOfSheetContext, start, end))[1];
        return isDelayed(value) ? undefined : this.primitiveFromValue(undefined, value);
    }

    private primitiveFromValue<O>(origin: O, value: CalcValue<O>) {
        switch (typeof value) {
            case "number":
            case "string":
            case "boolean":
                return value;
            case "function":
                return "<function>";
            case "object":
                const asString = value.request(origin, "stringify");
                return typeof asString === "string" ? asString : undefined;
            default:
                return assertNever(value);
        }
    }

    private getCellValueAndForget(row: number, col: number) {
        const cell = this.readCell(row, col);
        if (cell === undefined) {
            return Sheetlet.blank;
        }
        switch (cell.flag) {
            case CalcFlag.Clean:
                return isFormulaCell(cell) ? cell.value! : cell.content;

            case CalcFlag.Dirty:
            case CalcFlag.Enqueued:
                return makePendingCell(row, col);

            case CalcFlag.InCalc:
            default:
                return assertNever(cell as never);
        }
    }

    private getCellValueAndLink(row: number, col: number, origin: Point) {
        const cell = this.readCell(row, col);
        if (cell === undefined) {
            this.binder.bindCells(pointToKey(row, col), pointToKey(origin[ROW], origin[COL]));
            return Sheetlet.blank;
        }
        switch (cell.flag) {
            case CalcFlag.Clean:
                this.binder.bindCells(pointToKey(row, col), pointToKey(origin[ROW], origin[COL]));
                return isFormulaCell(cell) ? cell.value! : cell.content;

            case CalcFlag.Dirty:
            case CalcFlag.Enqueued:
                return makePendingCell(row, col);

            case CalcFlag.InCalc:
                // TODO: proper cycle handling
                return errorValues.cycle;

            default:
                return assertNever(cell);
        }
    }
}

export const createSheetlet = (adapter: IDocumentAdapter) => new Sheetlet(adapter);
