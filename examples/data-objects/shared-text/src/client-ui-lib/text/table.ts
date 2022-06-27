/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
eslint-disable
@typescript-eslint/no-non-null-assertion,
@typescript-eslint/consistent-type-assertions,
@typescript-eslint/strict-boolean-expressions,
*/

import * as MergeTree from "@fluidframework/merge-tree";
import * as Sequence from "@fluidframework/sequence";
import * as Paragraph from "./paragraph";

type SharedString = Sequence.SharedString;

export interface ITableMarker extends MergeTree.Marker {
    table?: Table;
}

export interface IRowMarker extends MergeTree.Marker {
    row?: Row;
}

export interface IColumnMarker extends MergeTree.Marker {
    column?: Column;
    columnId?: string;
    indexInTable?: number;
}

export interface ICellMarker extends MergeTree.Marker {
    cell?: Cell;
}

let tableIdSuffix = 0;
let cellIdSuffix = 0;
let rowIdSuffix = 0;
let columnIdSuffix = 0;

const getPosition = (sharedString: SharedString, segment: MergeTree.ISegment) => sharedString.getPosition(segment);

function createRelativeMarkerOp(
    relativePos1: MergeTree.IRelativePosition,
    id: string, refType: MergeTree.ReferenceType, rangeLabels: string[],
    tileLabels?: string[], props?: MergeTree.PropertySet) {
    let _props = props;
    if (!_props) {
        _props = <MergeTree.MapLike<any>>{
        };
    }

    if (id.length > 0) {
        _props[MergeTree.reservedMarkerIdKey] = id;
    }

    if (rangeLabels.length > 0) {
        _props[MergeTree.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        _props[MergeTree.reservedTileLabelsKey] = tileLabels;
    }
    return <MergeTree.IMergeTreeInsertMsg>{
        seg: { marker: { refType }, props: _props },
        relativePos1,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
}

export function createMarkerOp(
    pos1: number, id: string,
    refType: MergeTree.ReferenceType, rangeLabels: string[], tileLabels?: string[],
    props?: MergeTree.PropertySet) {
    let _props = props;
    if (!_props) {
        _props = <MergeTree.MapLike<any>>{
        };
    }
    if (id.length > 0) {
        _props[MergeTree.reservedMarkerIdKey] = id;
    }
    if (rangeLabels.length > 0) {
        _props[MergeTree.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        _props[MergeTree.reservedTileLabelsKey] = tileLabels;
    }
    return <MergeTree.IMergeTreeInsertMsg>{
        seg: { marker: { refType }, props: _props },
        pos1,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
}

const endPrefix = "end-";

export const idFromEndId = (endId: string) => endId.substring(endPrefix.length);

function createCellBegin(
    opList: MergeTree.IMergeTreeOp[],
    cellEndId: string,
    cellId: string,
    extraProperties?: MergeTree.PropertySet) {
    const cellEndRelPos = <MergeTree.IRelativePosition>{
        before: true,
        id: cellEndId,
    };
    let startExtraProperties: Record<string, any> | undefined;
    let pgExtraProperties: Record<string, any> | undefined;
    if (extraProperties) {
        startExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
        pgExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOp(cellEndRelPos, cellId,
        MergeTree.ReferenceType.NestBegin, ["cell"], undefined, startExtraProperties));
    const pgOp = createRelativeMarkerOp(cellEndRelPos, `${cellId}C`,
        MergeTree.ReferenceType.Tile, [], ["pg"], pgExtraProperties);
    opList.push(pgOp);
}

function createCellRelativeWithId(
    opList: MergeTree.IMergeTreeOp[],
    cellId: string,
    relpos: MergeTree.IRelativePosition,
    extraProperties?: MergeTree.PropertySet) {
    const cellEndId = endPrefix + cellId;
    let endExtraProperties: Record<string, any> | undefined;
    if (extraProperties) {
        endExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOp(relpos, cellEndId,
        MergeTree.ReferenceType.NestEnd, ["cell"], undefined, endExtraProperties));
    createCellBegin(opList, cellEndId, cellId, extraProperties);
}

function createCellRelative(
    opList: MergeTree.IMergeTreeOp[],
    idBase: string,
    relpos: MergeTree.IRelativePosition,
    extraProperties?: MergeTree.PropertySet) {
    const cellId = `${idBase}cell${cellIdSuffix++}`;
    createCellRelativeWithId(opList, cellId, relpos, extraProperties);
}

function createEmptyRowAfter(
    opList: MergeTree.IMergeTreeOp[],
    sharedString: SharedString,
    prevRow: Row,
    rowId: string) {
    const endRowPos = {
        id: prevRow.endRowMarker.getId(),
    };
    opList.push(createRelativeMarkerOp(endRowPos, endPrefix + rowId,
        MergeTree.ReferenceType.NestEnd, ["row"]));
    opList.push(createRelativeMarkerOp(endRowPos, rowId,
        MergeTree.ReferenceType.NestBegin, ["row"]));
}

function createRowCellOp(
    opList: MergeTree.IMergeTreeOp[],
    sharedString: SharedString,
    idBase: string, endRowId: string,
    columnId?: string) {
    let props: MergeTree.PropertySet | undefined;
    if (columnId) {
        props = { columnId };
    }
    createCellRelative(opList, idBase, { id: endRowId, before: true }, props);
}

function createColumnCellOp(
    idBase: string,
    opList: MergeTree.IMergeTreeOp[],
    row: Row,
    prevCell: Cell,
    columnId: string,
    extraProperties?: MergeTree.PropertySet) {
    const id = prevCell.endMarker.getId();
    createCellRelative(opList, idBase,
        { id }, { columnId });
}

function insertColumnCellForRow(
    idBase: string,
    opList: MergeTree.IMergeTreeOp[],
    row: Row,
    prevColId: string,
    colId: string) {
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
    for (let i = 0; i < row.cells.length; i++) {
        const prevCell = row.cells[i];
        if (prevCell.columnId === prevColId) {
            createColumnCellOp(idBase, opList, row, prevCell, colId);
        }
    }
}

const traceOps = true;

// TODO: non-grid case
export function insertColumn(
    sharedString: SharedString,
    idBase: string,
    prevCell: Cell,
    row: Row,
    table: Table) {
    const prevColumnId = prevCell.columnId;
    const columnId = `${idBase}Col${columnIdSuffix++}`;
    if (traceOps) {
        console.log(`insert col prev ${prevCell.marker.toString()} id: ${columnId}`);
    }
    const opList = <MergeTree.IMergeTreeOp[]>[];
    const insertColMarkerOp = <MergeTree.IMergeTreeInsertMsg>{
        seg: {
            marker: <MergeTree.IMarkerDef>{
                refType: MergeTree.ReferenceType.Simple,
            },
            props: { columnId, [MergeTree.reservedMarkerIdKey]: columnId },
        },
        relativePos1: { id: prevColumnId },
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
    opList.push(insertColMarkerOp);
    for (const currRow of table.rows) {
        insertColumnCellForRow(idBase, opList, currRow, prevColumnId!, columnId);
    }
    const groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);

    // Flush cache
    table.tableMarker.table = undefined;
}

export function insertRowCellForColumn(
    sharedString: SharedString,
    opList: MergeTree.IMergeTreeOp[],
    prevCell: Cell,
    idBase: string,
    endRowId: string) {
    createRowCellOp(opList, sharedString, idBase, endRowId, prevCell.columnId);
}

// TODO: non-grid
// TODO: GC using consensus remove
export function deleteColumn(
    sharedString: SharedString,
    clientId: string,
    cell: Cell,
    row: Row,
    table: Table) {
    if (traceOps) {
        console.log(`delete column from cell ${cell.marker.toString()}`);
    }
    const columnId = cell.columnId;
    for (const currRow of table.rows) {
        for (const currCell of currRow.cells) {
            if (currCell.columnId === columnId) {
                sharedString.annotateMarkerNotifyConsensus(currCell.marker, { moribund: clientId }, (m) => {
                    sharedString.removeRange(
                        sharedString.getPosition(currCell.marker),
                        sharedString.getPosition(currCell.endMarker));
                });
            }
        }
    }
    const opList = <MergeTree.IMergeTreeOp[]>[];
    const removeColMarkerOp = <MergeTree.IMergeTreeRemoveMsg>{
        relativePos1: { id: columnId, before: true },
        relativePos2: { id: columnId },
        type: MergeTree.MergeTreeDeltaType.REMOVE,
    };
    opList.push(removeColMarkerOp);
    const groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
    table.tableMarker.table = undefined;
}

// TODO: GC using consensus remove
export function deleteCellShiftLeft(
    sharedString: SharedString,
    cell: Cell,
    table: Table) {
    const cellPos = getPosition(sharedString, cell.marker);
    const annotOp = <MergeTree.IMergeTreeAnnotateMsg>{
        pos1: cellPos,
        pos2: cellPos + cell.marker.cachedLength,
        props: { moribund: true },
        type: MergeTree.MergeTreeDeltaType.ANNOTATE,
    };
    const opList = [annotOp];
    const groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
    table.tableMarker.table = undefined;
}

// TODO: GC using consensus remove
export function deleteRow(sharedString: SharedString, row: Row, table: Table) {
    if (traceOps) {
        console.log(`delete row ${row.rowMarker.getId()}`);
    }
    const rowPos = getPosition(sharedString, row.rowMarker);
    const annotOp = <MergeTree.IMergeTreeAnnotateMsg>{
        pos1: rowPos,
        pos2: rowPos + row.rowMarker.cachedLength,
        props: { moribund: true },
        type: MergeTree.MergeTreeDeltaType.ANNOTATE,
    };
    const opList = [annotOp];
    const groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
    table.tableMarker.table = undefined;
}

export function insertRow(sharedString: SharedString, idBase: string, prevRow: Row, table: Table) {
    const rowId = `${idBase}row${rowIdSuffix++}`;
    if (traceOps) {
        console.log(`insert row id: ${rowId} prev: ${prevRow.rowMarker.getId()}`);
    }
    const opList = <MergeTree.IMergeTreeOp[]>[];
    createEmptyRowAfter(opList, sharedString, prevRow, rowId);
    const endRowId = endPrefix + rowId;
    for (let i = 0, len = prevRow.cells.length; i < len; i++) {
        insertRowCellForColumn(sharedString, opList, prevRow.cells[i], idBase, endRowId);
    }
    const groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);

    // Flush cache
    table.tableMarker.table = undefined;
}

// Table Column* (Row (Cell EndCell)* EndRow)* EndTable
export function createTable(pos: number, sharedString: SharedString, idBase: string, nrows = 3, ncells = 3) {
    let pgAtStart = true;
    if (pos > 0) {
        const segoff = sharedString.getContainingSegment(pos - 1);
        if (MergeTree.Marker.is(segoff.segment)) {
            if (segoff.segment.hasTileLabel("pg")) {
                pgAtStart = false;
            }
        }
    }
    const tableId = `T${tableIdSuffix++}`;
    const opList = <MergeTree.IMergeTreeInsertMsg[]>[];
    const endTableId = endPrefix + tableId;
    opList.push(createMarkerOp(pos, endTableId,
        // eslint-disable-next-line no-bitwise
        MergeTree.ReferenceType.NestEnd |
        MergeTree.ReferenceType.Tile, ["table"], ["pg"]));
    const endTablePos = <MergeTree.IRelativePosition>{
        before: true,
        id: endTableId,
    };
    if (pgAtStart) {
        // TODO: copy pg properties from pg marker after pos
        const pgOp = createRelativeMarkerOp(endTablePos, "",
            MergeTree.ReferenceType.Tile, [], ["pg"]);
        opList.push(pgOp);
    }
    opList.push(createRelativeMarkerOp(endTablePos, tableId,
        MergeTree.ReferenceType.NestBegin, ["table"], [], { rectTable: true }));
    const columnIds = <string[]>[];
    for (let row = 0; row < nrows; row++) {
        const rowId = `${idBase}row${rowIdSuffix++}`;
        opList.push(createRelativeMarkerOp(endTablePos, rowId,
            MergeTree.ReferenceType.NestBegin, ["row"]));
        for (let cell = 0; cell < ncells; cell++) {
            if (!columnIds[cell]) {
                columnIds[cell] = `${idBase}col${columnIdSuffix++}`;
            }
            const props = { columnId: columnIds[cell] };
            createCellRelative(opList, idBase, endTablePos, props);
        }
        opList.push(createRelativeMarkerOp(endTablePos, endPrefix + rowId,
            MergeTree.ReferenceType.NestEnd, ["row"]));
    }
    for (let i = columnIds.length - 1; i >= 0; i--) {
        const columnId = columnIds[i];
        const insertColMarkerOp = <MergeTree.IMergeTreeInsertMsg>{
            seg: {
                marker: <MergeTree.IMarkerDef>{
                    refType: MergeTree.ReferenceType.Simple,
                },
                props: { columnId, [MergeTree.reservedMarkerIdKey]: columnId },
            },
            relativePos1: { id: tableId },
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };
        opList.push(insertColMarkerOp);
    }
    const groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
}

export class Table {
    public width: number | undefined;
    public renderedHeight: number | undefined;
    public deferredHeight: number | undefined;
    public minContentWidth = 0;
    public indentPct = 0.0;
    public contentPct = 1.0;
    public rows = <Row[]>[];
    public logicalColumns = <Column[]>[];
    public gridColumns = <IColumnMarker[]>[];
    public idToColumn = new Map<string, IColumnMarker>();
    constructor(public tableMarker: ITableMarker, public endTableMarker: ITableMarker) {
    }

    public addGridColumn(columnMarker: IColumnMarker) {
        columnMarker.columnId = columnMarker.getId();
        this.idToColumn.set(columnMarker.columnId!, columnMarker);
        columnMarker.indexInTable = this.gridColumns.length;
        this.gridColumns.push(columnMarker);
    }

    public nextcell(cell: Cell) {
        let retNext = false;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            const row = this.rows[rowIndex];
            for (let cellIndex = 0, cellCount = row.cells.length; cellIndex < cellCount; cellIndex++) {
                const rowcell = row.cells[cellIndex];
                if (retNext && (!cellIsMoribund(rowcell.marker))) {
                    return rowcell;
                }
                if (rowcell === cell) {
                    retNext = true;
                }
            }
        }
    }

    public prevcell(cell: Cell) {
        let retPrev = false;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            const row = this.rows[rowIndex];
            for (let cellIndex = row.cells.length - 1; cellIndex >= 0; cellIndex--) {
                const rowcell = row.cells[cellIndex];
                if (retPrev && (!cellIsMoribund(rowcell.marker))) {
                    return rowcell;
                }
                if (rowcell === cell) {
                    retPrev = true;
                }
            }
        }
    }

    public findPrecedingRow(startRow: Row) {
        let prevRow: Row | undefined;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            const row = this.rows[rowIndex];
            if (row === startRow) {
                return prevRow;
            }
            if (!rowIsMoribund(row.rowMarker)) {
                prevRow = row;
            }
        }
    }

    public findNextRow(startRow: Row) {
        let nextRow: Row | undefined;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            const row = this.rows[rowIndex];
            if (row === startRow) {
                return nextRow;
            }
            if (!rowIsMoribund(row.rowMarker)) {
                nextRow = row;
            }
        }
    }

    public updateWidth(w: number) {
        this.width = w;
        let liveColumnCount = 0;
        for (let i = 0, len = this.logicalColumns.length; i < len; i++) {
            const col = this.logicalColumns[i];
            if (!col.moribund) {
                liveColumnCount++;
            }
        }
        let proportionalWidthPerColumn = Math.floor(this.width / liveColumnCount);
        // Assume remaining width positive for now
        // assume uniform number of columns in rows for now (later update each row separately)
        let abscondedWidth = 0;
        let totalWidth = 0;
        for (let i = 0, len = this.logicalColumns.length; i < len; i++) {
            const col = this.logicalColumns[i];
            // TODO: borders
            if (!col.moribund) {
                if (col.minContentWidth > proportionalWidthPerColumn) {
                    col.width = col.minContentWidth;
                    abscondedWidth += col.width;
                    proportionalWidthPerColumn = Math.floor((this.width - abscondedWidth) / (len - i));
                } else {
                    col.width = proportionalWidthPerColumn;
                }
                totalWidth += col.width;
                if (i === (len - 1)) {
                    if (totalWidth < this.width) {
                        col.width += (this.width - totalWidth);
                    }
                }
                for (const cell of col.cells) {
                    if (cell) {
                        cell.specWidth = col.width;
                    }
                }
            }
        }
    }
}

export class Column {
    public minContentWidth = 0;
    public width = 0;
    public cells = <Cell[]>[];
    public moribund = false;
    constructor(public columnIndex: number) {
    }
}

export class Row {
    public table: Table | undefined;
    public pos: number | undefined;
    public endPos: number | undefined;
    public minContentWidth = 0;
    public cells = <Cell[]>[];

    constructor(public rowMarker: IRowMarker, public endRowMarker: IRowMarker) {

    }

    // TODO: move to view layer
    public findClosestCell(x: number) {
        let bestcell: Cell | undefined;
        let bestDistance = -1;
        for (const cell of this.cells) {
            if (cell.div) {
                const bounds = cell.div.getBoundingClientRect();
                const center = bounds.left + (bounds.width / 2);
                const distance = Math.abs(center - x);
                if ((distance < bestDistance) || (bestDistance < 0)) {
                    bestcell = cell;
                    bestDistance = distance;
                }
            }
        }
        return bestcell;
    }
}

export class Cell {
    public minContentWidth = 0;
    public specWidth = 0;
    public renderedHeight: number | undefined;
    public div: HTMLDivElement | undefined;
    public columnId: string | undefined;
    // TODO: update on typing in cell
    public emptyCell = false;
    public additionalCellMarkers: ICellMarker[] | undefined;
    constructor(public marker: ICellMarker, public endMarker: ICellMarker) {
    }
    public addAuxMarker(marker: ICellMarker) {
        if (!this.additionalCellMarkers) {
            this.additionalCellMarkers = [];
        }
        this.additionalCellMarkers.push(marker);
    }
}

function getEndCellMarker(sharedString: SharedString, cellMarker: ICellMarker) {
    const gloId = cellMarker.getId();
    if (gloId) {
        return <ICellMarker>sharedString.getMarkerFromId(endPrefix + gloId);
    }
}

function parseCell(cellStartPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {
    const markEmptyCells = false;
    const cellMarkerSegOff = sharedString.getContainingSegment(cellStartPos);
    const cellMarker = <ICellMarker>cellMarkerSegOff.segment;
    const endCellMarker = getEndCellMarker(sharedString, cellMarker);
    if (!endCellMarker) {
        console.log(`ut-oh: no end for ${cellMarker.toString()}`);
        return undefined;
    }
    const endCellPos = getPosition(sharedString, endCellMarker);
    cellMarker.cell = new Cell(cellMarker, endCellMarker);
    cellMarker.cell.columnId = cellMarker.properties!.columnId;
    let nextPos = cellStartPos + cellMarker.cachedLength;
    if (markEmptyCells && (nextPos === endCellPos - 1)) {
        cellMarker.cell.emptyCell = true;
    } else {
        while (nextPos < endCellPos) {
            const segoff = sharedString.getContainingSegment(nextPos);
            // TODO: model error checking
            const segment = segoff.segment;
            if (MergeTree.Marker.is(segment)) {
                const marker = <MergeTree.Marker>segoff.segment;
                if (marker.hasRangeLabel("table")) {
                    const tableMarker = <ITableMarker>marker;
                    parseTable(tableMarker, nextPos, sharedString, fontInfo);
                    if (tableMarker.table!.minContentWidth > cellMarker.cell.minContentWidth) {
                        cellMarker.cell.minContentWidth = tableMarker.table!.minContentWidth;
                    }
                    const endTableMarker = tableMarker.table!.endTableMarker;
                    nextPos = sharedString.getPosition(endTableMarker);
                    nextPos += endTableMarker.cachedLength;
                } else {
                    // Empty paragraph
                    nextPos++;
                }
            } else {
                // Text segment
                const tilePos = sharedString.findTile(nextPos, "pg", false);
                const pgMarker = <Paragraph.IParagraphMarker>tilePos.tile;
                if (!pgMarker.itemCache) {
                    if (fontInfo) {
                        const itemsContext = <Paragraph.IItemsContext><unknown>{
                            curPGMarker: pgMarker,
                            fontInfo,
                            itemInfo: { items: [], minWidth: 0 },
                        };
                        const paragraphLexer = new Paragraph.ParagraphLexer({
                            markerToken: Paragraph.markerToItems,
                            textToken: Paragraph.textTokenToItems,
                        }, itemsContext);
                        itemsContext.paragraphLexer = paragraphLexer;

                        sharedString.walkSegments(Paragraph.segmentToItems, nextPos, tilePos.pos, itemsContext);
                        pgMarker.itemCache = itemsContext.itemInfo;
                    }
                }
                nextPos = tilePos.pos + 1;
                if (pgMarker.itemCache) {
                    if (pgMarker.itemCache.minWidth > cellMarker.cell.minContentWidth) {
                        cellMarker.cell.minContentWidth = pgMarker.itemCache.minWidth;
                    }
                }
            }
        }
    }
    // Console.log(`parsed cell ${cellMarker.getId()}`);
    return cellMarker;
}

function parseRow(
    rowStartPos: number,
    sharedString: SharedString,
    table: Table,
    fontInfo?: Paragraph.IFontInfo) {
    const rowMarkerSegOff = sharedString.getContainingSegment(rowStartPos);
    const rowMarker = <IRowMarker>rowMarkerSegOff.segment;
    const id = rowMarker.getId();
    const endId = `${endPrefix}${id}`;
    const endRowMarker = <MergeTree.Marker>sharedString.getMarkerFromId(endId);
    if (!endRowMarker) {
        console.log(`row parse error: ${rowStartPos}`);
        return undefined;
    }
    const endRowPos = getPosition(sharedString, endRowMarker);
    const row = new Row(rowMarker, endRowMarker);
    rowMarker.row = row;
    let nextPos = rowStartPos + rowMarker.cachedLength;
    const rowColumns = MergeTree.createMap<Cell>();
    while (nextPos < endRowPos) {
        const cellMarker = parseCell(nextPos, sharedString, fontInfo);
        if (!cellMarker) {
            const tableMarkerPos = getPosition(sharedString, table.tableMarker);
            succinctPrintTable(table.tableMarker, tableMarkerPos, sharedString);
            return undefined;
        }
        // TODO: check for column id not in grid
        if (!cellIsMoribund(cellMarker)) {
            const cellColumnId = cellMarker.properties!.columnId;
            rowMarker.row.minContentWidth += cellMarker.cell!.minContentWidth;
            rowMarker.row.cells.push(cellMarker.cell!);
            rowColumns[cellColumnId] = cellMarker.cell!;
        }
        const endcellPos = getPosition(sharedString, cellMarker.cell!.endMarker);
        nextPos = endcellPos + cellMarker.cell!.endMarker.cachedLength;
    }
    return rowMarker;
}

export function parseColumns(sharedString: SharedString, pos: number, table: Table) {
    let nextPos = pos;
    function addColumn(segment: MergeTree.ISegment, segpos: number) {
        nextPos = segpos;
        if (MergeTree.Marker.is(segment)) {
            const marker = <IColumnMarker>segment;
            if (marker.hasProperty("columnId")) {
                table.addGridColumn(marker);
                return true;
            }
        }
        return false;
    }
    sharedString.walkSegments(addColumn, pos);
    return nextPos;
}

export function succinctPrintTable(tableMarker: ITableMarker, tableMarkerPos: number, sharedString: SharedString) {
    const id = tableMarker.getId();
    const endId = `${endPrefix}${id}`;
    const endTableMarker = <MergeTree.Marker>sharedString.getMarkerFromId(endId);
    const endTablePos = endTableMarker.cachedLength + getPosition(sharedString, endTableMarker);
    let lineBuf = "";
    let lastWasCO = false;
    let reqPos = true;
    function printTableSegment(segment: MergeTree.ISegment, segpos: number) {
        if (MergeTree.Marker.is(segment)) {
            const marker = segment;
            let endLine = false;
            if (reqPos) {
                lineBuf += `${segpos}:`;
                reqPos = false;
            }
            if (marker.hasRangeLabels()) {
                const rangeLabel = marker.getRangeLabels()![0];
                if (marker.refType === MergeTree.ReferenceType.NestEnd) {
                    lineBuf += "E";
                    if ((rangeLabel === "table") || (rangeLabel === "row")) {
                        endLine = true;
                    }
                }
                /* eslint-disable default-case */
                switch (rangeLabel) {
                    case "table":
                        lineBuf += "T";
                        lastWasCO = false;
                        break;
                    case "row":
                        if (marker.refType === MergeTree.ReferenceType.NestBegin) {
                            if (lastWasCO) {
                                lineBuf += "\n";
                                lastWasCO = false;
                            }
                        }
                        lineBuf += "R";
                        break;
                    case "cell":
                        lineBuf += "CL";
                        break;
                }
                /* eslint-enable default-case */
            } else if (marker.refType === MergeTree.ReferenceType.Simple) {
                if (marker.properties!.columnId) {
                    lineBuf += "CO";
                    lastWasCO = true;
                }
            } else if (marker.refType === MergeTree.ReferenceType.Tile) {
                lineBuf += "P";
            }
            if (marker.hasProperty("moribund")) {
                lineBuf += "_";
            }
            if (endLine) {
                lineBuf += " \n";
                reqPos = true;
            } else {
                lineBuf += " ";
            }
        } else {
            const textSegment = <MergeTree.TextSegment>segment;
            lineBuf += textSegment.text;
            reqPos = true;
        }
        return true;
    }
    sharedString.walkSegments(printTableSegment, tableMarkerPos, endTablePos);
    console.log(lineBuf);
}

export function insertHoleFixer(
    sharedString: SharedString,
    prevMarker: MergeTree.Marker,
    columnId: string,
    rowId: string) {
    const extraProperties = {
        columnId,
    };
    const cellId = `${rowId}X${columnId}`;
    const opList = <MergeTree.IMergeTreeOp[]>[];
    createCellRelativeWithId(opList, cellId, { id: prevMarker.getId() }, extraProperties);
    const groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
}

export function parseTable(
    tableMarker: ITableMarker, tableMarkerPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {
    const id = tableMarker.getId();
    const endId = `${endPrefix}${id}`;
    const endTableMarker = <MergeTree.Marker>sharedString.getMarkerFromId(endId);
    const endTablePos = getPosition(sharedString, endTableMarker);
    const table = new Table(tableMarker, endTableMarker);
    tableMarker.table = table;
    let nextPos = tableMarkerPos + tableMarker.cachedLength;
    nextPos = parseColumns(sharedString, nextPos, tableMarker.table);
    let rowIndex = 0;
    while (nextPos < endTablePos) {
        const rowMarker = parseRow(nextPos, sharedString, table, fontInfo);
        if (!rowMarker) {
            console.log("PARSE ERROR!");
            succinctPrintTable(tableMarker, tableMarkerPos, sharedString);
            return undefined;
        }
        const rowView = rowMarker.row!;
        rowView.table = table;
        rowView.pos = nextPos;
        if (!rowIsMoribund(rowMarker)) {
            for (let i = 0, len = rowView.cells.length; i < len; i++) {
                const cell = rowView.cells[i];
                if (!table.logicalColumns[i]) {
                    table.logicalColumns[i] = new Column(i);
                }
                const columnView = table.logicalColumns[i];
                columnView.cells[rowIndex] = cell;
                if (cell.minContentWidth > columnView.minContentWidth) {
                    columnView.minContentWidth = cell.minContentWidth;
                }
                if (cellIsMoribund(cell.marker) && (cell.marker.properties!.wholeColumn)) {
                    columnView.moribund = true;
                }
            }

            if (rowMarker.row!.minContentWidth > table.minContentWidth) {
                table.minContentWidth = rowMarker.row!.minContentWidth;
            }
            table.rows[rowIndex++] = rowView;
        }
        const endRowPos = getPosition(sharedString, rowMarker.row!.endRowMarker);
        rowView.endPos = endRowPos;
        nextPos = endRowPos + rowMarker.row!.endRowMarker.cachedLength;
    }
    succinctPrintTable(tableMarker, tableMarkerPos, sharedString);
    return table;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
export const rowIsMoribund = (rowMarker: IRowMarker) => rowMarker.properties && rowMarker.properties.moribund;

// eslint-disable-next-line @typescript-eslint/no-unsafe-return
export const cellIsMoribund = (cellMarker: ICellMarker) => cellMarker.properties && cellMarker.properties.moribund;

/*
eslint-enable
@typescript-eslint/no-non-null-assertion,
@typescript-eslint/consistent-type-assertions,
@typescript-eslint/strict-boolean-expressions,
*/
