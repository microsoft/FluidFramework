// tslint:disable
import * as MergeTree from "@prague/merge-tree";
import * as Sequence from "@prague/sequence";
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

function getOffset(sharedString: SharedString, segment: MergeTree.ISegment) {
    return sharedString.client.mergeTree.getOffset(segment, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
}

function createRelativeMarkerOp(
    relativePos1: MergeTree.IRelativePosition,
    id: string, refType: MergeTree.ReferenceType, rangeLabels: string[],
    tileLabels?: string[], props?: MergeTree.PropertySet) {

    if (!props) {
        props = <MergeTree.MapLike<any>>{
        };
    }

    if (id.length > 0) {
        props[MergeTree.reservedMarkerIdKey] = id;
    }

    if (rangeLabels.length > 0) {
        props[MergeTree.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        props[MergeTree.reservedTileLabelsKey] = tileLabels;
    }
    return <MergeTree.IMergeTreeInsertMsg>{
        seg: { marker: { refType }, props },
        relativePos1,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
}

export function createMarkerOp(
    pos1: number, id: string,
    refType: MergeTree.ReferenceType, rangeLabels: string[], tileLabels?: string[],
    props?: MergeTree.PropertySet) {

    if (!props) {
        props = <MergeTree.MapLike<any>>{
        };
    }
    if (id.length > 0) {
        props[MergeTree.reservedMarkerIdKey] = id;
    }
    if (rangeLabels.length > 0) {
        props[MergeTree.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        props[MergeTree.reservedTileLabelsKey] = tileLabels;
    }
    return <MergeTree.IMergeTreeInsertMsg>{
        seg: { marker: { refType }, props },
        pos1,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
}

let endPrefix = "end-";

export function idFromEndId(endId: string) {
    return endId.substring(endPrefix.length);
}

function createCellBegin(opList: MergeTree.IMergeTreeOp[], cellEndId: string,
    cellId: string, extraProperties?: MergeTree.PropertySet) {

    let cellEndRelPos = <MergeTree.IRelativePosition>{
        before: true,
        id: cellEndId,
    };
    let startExtraProperties: Object;
    let pgExtraProperties: Object;
    if (extraProperties) {
        startExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
        pgExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOp(cellEndRelPos, cellId,
        MergeTree.ReferenceType.NestBegin, ["cell"], undefined, startExtraProperties));
    let pgOp = createRelativeMarkerOp(cellEndRelPos, cellId + "C",
        MergeTree.ReferenceType.Tile, [], ["pg"], pgExtraProperties);
    opList.push(pgOp);
}

function createCellRelativeWithId(opList: MergeTree.IMergeTreeOp[], cellId: string,
    relpos: MergeTree.IRelativePosition, extraProperties?: MergeTree.PropertySet) {
    let cellEndId = endPrefix + cellId;
    let endExtraProperties: Object;
    if (extraProperties) {
        endExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOp(relpos, cellEndId,
        MergeTree.ReferenceType.NestEnd, ["cell"], undefined, endExtraProperties));
    createCellBegin(opList, cellEndId, cellId, extraProperties);
}

function createCellRelative(opList: MergeTree.IMergeTreeOp[], idBase: string,
    relpos: MergeTree.IRelativePosition, extraProperties?: MergeTree.PropertySet) {
    let cellId = idBase + `cell${cellIdSuffix++}`;
    createCellRelativeWithId(opList, cellId, relpos, extraProperties);
}

function createEmptyRowAfter(opList: MergeTree.IMergeTreeOp[], sharedString: SharedString, prevRow: Row, rowId: string) {
    let endRowPos = {
        id: prevRow.endRowMarker.getId(),
    };
    opList.push(createRelativeMarkerOp(endRowPos, endPrefix + rowId,
        MergeTree.ReferenceType.NestEnd, ["row"]));
    opList.push(createRelativeMarkerOp(endRowPos, rowId,
        MergeTree.ReferenceType.NestBegin, ["row"]));
}

function createRowCellOp(opList: MergeTree.IMergeTreeOp[], sharedString: SharedString,
    idBase: string, endRowId: string, columnId?: string) {
    let props: MergeTree.PropertySet;
    if (columnId) {
        props = { columnId };
    }
    createCellRelative(opList, idBase, { id: endRowId, before: true }, props);
}

function createColumnCellOp(sharedString: SharedString, opList: MergeTree.IMergeTreeOp[], row: Row,
    prevCell: Cell, columnId: string, extraProperties?: MergeTree.PropertySet) {
    let id = prevCell.endMarker.getId();
    createCellRelative(opList, sharedString.client.longClientId,
        { id }, { columnId });
}

function insertColumnCellForRow(sharedString: SharedString, opList: MergeTree.IMergeTreeOp[], row: Row,
    prevColId: string, colId: string) {
    for (let i = 0; i < row.cells.length; i++) {
        let prevCell = row.cells[i];
        if (prevCell.columnId === prevColId) {
            createColumnCellOp(sharedString, opList, row, prevCell, colId);
        }
    }
}

let traceOps = true;

// TODO: non-grid case
export function insertColumn(sharedString: SharedString, prevCell: Cell, row: Row,
    table: Table) {
    let idbase = sharedString.client.longClientId;
    let prevColumnId = prevCell.columnId;
    let columnId = `${idbase}Col${columnIdSuffix++}`;
    if (traceOps) {
        console.log(`insert col prev ${prevCell.marker.toString()} id: ${columnId}`);
    }
    let opList = <MergeTree.IMergeTreeOp[]>[];
    const insertColMarkerOp = <MergeTree.IMergeTreeInsertMsg>{
        seg: {
            marker: <MergeTree.IMarkerDef>{
                refType: MergeTree.ReferenceType.Simple,
            },
            props: { columnId, [MergeTree.reservedMarkerIdKey]: columnId }
        },
        relativePos1: { id: prevColumnId },
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
    opList.push(insertColMarkerOp);
    for (let row of table.rows) {
        insertColumnCellForRow(sharedString, opList, row, prevColumnId, columnId);
    }
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);

    // flush cache
    table.tableMarker.table = undefined;
}

export function insertRowCellForColumn(sharedString: SharedString, opList: MergeTree.IMergeTreeOp[], prevCell: Cell,
    idbase: string, endRowId: string) {
    createRowCellOp(opList, sharedString, idbase, endRowId, prevCell.columnId);
}

// TODO: non-grid
// TODO: GC using consensus remove
export function deleteColumn(sharedString: SharedString, cell: Cell, row: Row,
    table: Table) {
    if (traceOps) {
        console.log(`delete column from cell ${cell.marker.toString()}`);
    }
    let columnId = cell.columnId;
    for (let row of table.rows) {
        for (let cell of row.cells) {
            if (cell.columnId === columnId) {
                const clientId = sharedString.client.longClientId;
                const mergeTree = sharedString.client.mergeTree;
                sharedString.annotateMarkerNotifyConsensus(cell.marker, { moribund: clientId }, (m) => {
                    sharedString.removeRange(
                        mergeTree.getOffset(cell.marker, mergeTree.collabWindow.currentSeq, mergeTree.collabWindow.clientId),
                        mergeTree.getOffset(cell.endMarker, mergeTree.collabWindow.currentSeq, mergeTree.collabWindow.clientId));
                });
            }
        }
    }
    let opList = <MergeTree.IMergeTreeOp[]>[];
    const removeColMarkerOp = <MergeTree.IMergeTreeRemoveMsg>{
        relativePos1: { id: columnId, before: true },
        relativePos2: { id: columnId },
        type: MergeTree.MergeTreeDeltaType.REMOVE,
    };
    opList.push(removeColMarkerOp);
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
    table.tableMarker.table = undefined;
}

// TODO: GC using consensus remove
export function deleteCellShiftLeft(sharedString: SharedString, cell: Cell,
    table: Table) {
    let cellPos = getOffset(sharedString, cell.marker);
    let annotOp = <MergeTree.IMergeTreeAnnotateMsg>{
        pos1: cellPos,
        pos2: cellPos + cell.marker.cachedLength,
        props: { moribund: true },
        type: MergeTree.MergeTreeDeltaType.ANNOTATE,
    };
    let opList = [annotOp];
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
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
    let rowPos = getOffset(sharedString, row.rowMarker);
    let annotOp = <MergeTree.IMergeTreeAnnotateMsg>{
        pos1: rowPos,
        pos2: rowPos + row.rowMarker.cachedLength,
        props: { moribund: true },
        type: MergeTree.MergeTreeDeltaType.ANNOTATE,
    };
    let opList = [annotOp];
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
    table.tableMarker.table = undefined;
}

export function insertRow(sharedString: SharedString, prevRow: Row, table: Table) {
    let idbase = sharedString.client.longClientId;
    let rowId = `${idbase}row${rowIdSuffix++}`;
    if (traceOps) {
        console.log(`insert row id: ${rowId} prev: ${prevRow.rowMarker.getId()}`);
    }
    let opList = <MergeTree.IMergeTreeOp[]>[];
    createEmptyRowAfter(opList, sharedString, prevRow, rowId);
    let endRowId = endPrefix + rowId;
    for (let i = 0, len = prevRow.cells.length; i < len; i++) {
        insertRowCellForColumn(sharedString, opList, prevRow.cells[i], idbase, endRowId);
    }
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);

    // flush cache
    table.tableMarker.table = undefined;
}

// Table Column* (Row (Cell EndCell)* EndRow)* EndTable
export function createTable(pos: number, sharedString: SharedString, nrows = 3, ncells = 3) {
    let pgAtStart = true;
    if (pos > 0) {
        let segoff = sharedString.client.mergeTree.getContainingSegment(pos - 1, MergeTree.UniversalSequenceNumber,
            sharedString.client.getClientId());
        if (segoff.segment.getType() === MergeTree.SegmentType.Marker) {
            let marker = <MergeTree.Marker>segoff.segment;
            if (marker.hasTileLabel("pg")) {
                pgAtStart = false;
            }
        }
    }
    let idBase = sharedString.client.longClientId;
    let tableId = `T${tableIdSuffix++}`;
    let opList = <MergeTree.IMergeTreeInsertMsg[]>[];
    let endTableId = endPrefix + tableId;
    opList.push(createMarkerOp(pos, endTableId,
        MergeTree.ReferenceType.NestEnd |
        MergeTree.ReferenceType.Tile, ["table"], ["pg"]));
    let endTablePos = <MergeTree.IRelativePosition>{
        before: true,
        id: endTableId,
    };
    if (pgAtStart) {
        // TODO: copy pg properties from pg marker after pos
        let pgOp = createRelativeMarkerOp(endTablePos, "",
            MergeTree.ReferenceType.Tile, [], ["pg"]);
        opList.push(pgOp);
    }
    opList.push(createRelativeMarkerOp(endTablePos, tableId,
        MergeTree.ReferenceType.NestBegin, ["table"], [], { rectTable: true }));
    let columnIds = <string[]>[];
    for (let row = 0; row < nrows; row++) {
        let rowId = idBase + `row${rowIdSuffix++}`;
        opList.push(createRelativeMarkerOp(endTablePos, rowId,
            MergeTree.ReferenceType.NestBegin, ["row"]));
        for (let cell = 0; cell < ncells; cell++) {
            if (!columnIds[cell]) {
                columnIds[cell] = idBase + `col${columnIdSuffix++}`;
            }
            let props = { columnId: columnIds[cell] };
            createCellRelative(opList, idBase, endTablePos, props);
        }
        opList.push(createRelativeMarkerOp(endTablePos, endPrefix + rowId,
            MergeTree.ReferenceType.NestEnd, ["row"]));
    }
    for (let i = columnIds.length - 1; i >= 0; i--) {
        let columnId = columnIds[i];
        const insertColMarkerOp = <MergeTree.IMergeTreeInsertMsg>{
            seg: {
                marker: <MergeTree.IMarkerDef>{
                    refType: MergeTree.ReferenceType.Simple,
                },
                props: { columnId, [MergeTree.reservedMarkerIdKey]: columnId }
            },
            relativePos1: { id: tableId },
            type: MergeTree.MergeTreeDeltaType.INSERT,
        };
        opList.push(insertColMarkerOp);
    }
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
}

export class Table {
    public width: number;
    public renderedHeight: number;
    public deferredHeight: number;
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
        this.idToColumn.set(columnMarker.columnId, columnMarker);
        columnMarker.indexInTable = this.gridColumns.length;
        this.gridColumns.push(columnMarker);
    }

    public nextcell(cell: Cell) {
        let retNext = false;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            for (let cellIndex = 0, cellCount = row.cells.length; cellIndex < cellCount; cellIndex++) {
                let rowcell = row.cells[cellIndex];
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
            let row = this.rows[rowIndex];
            for (let cellIndex = row.cells.length - 1; cellIndex >= 0; cellIndex--) {
                let rowcell = row.cells[cellIndex];
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
        let prevRow: Row;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            if (row === startRow) {
                return prevRow;
            }
            if (!rowIsMoribund(row.rowMarker)) {
                prevRow = row;
            }
        }
    }

    public findNextRow(startRow: Row) {
        let nextRow: Row;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            let row = this.rows[rowIndex];
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
            let col = this.logicalColumns[i];
            if (!col.moribund) {
                liveColumnCount++;
            }
        }
        let proportionalWidthPerColumn = Math.floor(this.width / liveColumnCount);
        // assume remaining width positive for now
        // assume uniform number of columns in rows for now (later update each row separately)
        let abscondedWidth = 0;
        let totalWidth = 0;
        for (let i = 0, len = this.logicalColumns.length; i < len; i++) {
            let col = this.logicalColumns[i];
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
                for (let cell of col.cells) {
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
    public table: Table;
    public pos: number;
    public endPos: number;
    public minContentWidth = 0;
    public cells = <Cell[]>[];

    constructor(public rowMarker: IRowMarker, public endRowMarker: IRowMarker) {

    }

    // TODO: move to view layer
    public findClosestCell(x: number) {
        let bestcell: Cell;
        let bestDistance = -1;
        for (let cell of this.cells) {
            if (cell.div) {
                let bounds = cell.div.getBoundingClientRect();
                let center = bounds.left + (bounds.width / 2);
                let distance = Math.abs(center - x);
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
    public renderedHeight: number;
    public div: HTMLDivElement;
    public columnId: string;
    // TODO: update on typing in cell
    public emptyCell = false;
    public additionalCellMarkers: ICellMarker[];
    constructor(public marker: ICellMarker, public endMarker: ICellMarker) {
    }
    public addAuxMarker(marker: ICellMarker) {
        if (!this.additionalCellMarkers) {
            this.additionalCellMarkers = [];
        }
        this.additionalCellMarkers.push(marker);
    }
}

function getEndCellMarker(mergeTree: MergeTree.MergeTree, cellMarker: ICellMarker) {
    let gloId = cellMarker.getId();
    if (gloId) {
        return <ICellMarker>mergeTree.getSegmentFromId(endPrefix + gloId);
    }
}

function parseCell(cellStartPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {
    let markEmptyCells = false;
    let mergeTree = sharedString.client.mergeTree;
    let cellMarkerSegOff = mergeTree.getContainingSegment(cellStartPos, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let cellMarker = <ICellMarker>cellMarkerSegOff.segment;
    let endCellMarker = getEndCellMarker(mergeTree, cellMarker);
    if (!endCellMarker) {
        console.log(`ut-oh: no end for ${cellMarker.toString()}`);
        return undefined;
    }
    let endCellPos = getOffset(sharedString, endCellMarker);
    cellMarker.cell = new Cell(cellMarker, endCellMarker);
    cellMarker.cell.columnId = cellMarker.properties["columnId"];
    let nextPos = cellStartPos + cellMarker.cachedLength;
    if (markEmptyCells && (nextPos === endCellPos - 1)) {
        cellMarker.cell.emptyCell = true;
    } else {
        while (nextPos < endCellPos) {
            let segoff = mergeTree.getContainingSegment(nextPos, MergeTree.UniversalSequenceNumber,
                sharedString.client.getClientId());
            // TODO: model error checking
            let segment = segoff.segment;
            if (segment.getType() === MergeTree.SegmentType.Marker) {
                let marker = <MergeTree.Marker>segoff.segment;
                if (marker.hasRangeLabel("table")) {
                    let tableMarker = <ITableMarker>marker;
                    parseTable(tableMarker, nextPos, sharedString, fontInfo);
                    if (tableMarker.table.minContentWidth > cellMarker.cell.minContentWidth) {
                        cellMarker.cell.minContentWidth = tableMarker.table.minContentWidth;
                    }
                    let endTableMarker = tableMarker.table.endTableMarker;
                    nextPos = mergeTree.getOffset(
                        endTableMarker, MergeTree.UniversalSequenceNumber, sharedString.client.getClientId());
                    nextPos += endTableMarker.cachedLength;
                } else {
                    // empty paragraph
                    nextPos++;
                }
            } else {
                // text segment
                let tilePos = sharedString.findTile(nextPos, "pg", false);
                let pgMarker = <Paragraph.IParagraphMarker>tilePos.tile;
                if (!pgMarker.itemCache) {
                    if (fontInfo) {
                        let itemsContext = <Paragraph.IItemsContext>{
                            curPGMarker: pgMarker,
                            fontInfo,
                            itemInfo: { items: [], minWidth: 0 },
                        };
                        let paragraphLexer = new Paragraph.ParagraphLexer({
                            markerToken: Paragraph.markerToItems,
                            mathToken: Paragraph.textToMathItem,
                            textToken: Paragraph.textTokenToItems,
                        }, itemsContext);
                        itemsContext.paragraphLexer = paragraphLexer;

                        mergeTree.mapRange({ leaf: Paragraph.segmentToItems }, MergeTree.UniversalSequenceNumber,
                            sharedString.client.getClientId(), itemsContext, nextPos, tilePos.pos);
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
    // console.log(`parsed cell ${cellMarker.getId()}`);
    return cellMarker;
}

function parseRow(rowStartPos: number, sharedString: SharedString, table: Table,
    fontInfo?: Paragraph.IFontInfo) {
    let mergeTree = sharedString.client.mergeTree;
    let rowMarkerSegOff = mergeTree.getContainingSegment(rowStartPos, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let rowMarker = <IRowMarker>rowMarkerSegOff.segment;
    let id = rowMarker.getId();
    let endId = endPrefix + id;
    let endRowMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    if (!endRowMarker) {
        console.log(`row parse error: ${rowStartPos}`);
        return undefined;
    }
    let endRowPos = getOffset(sharedString, endRowMarker);
    let row = new Row(rowMarker, endRowMarker);
    rowMarker.row = row;
    let nextPos = rowStartPos + rowMarker.cachedLength;
    let rowColumns = MergeTree.createMap<Cell>();
    while (nextPos < endRowPos) {
        let cellMarker = parseCell(nextPos, sharedString, fontInfo);
        if (!cellMarker) {
            let tableMarkerPos = getOffset(sharedString, table.tableMarker);
            succinctPrintTable(table.tableMarker, tableMarkerPos, sharedString);
            return undefined;
        }
        // TODO: check for column id not in grid
        if (!cellIsMoribund(cellMarker)) {
            let cellColumnId = cellMarker.properties["columnId"];
            rowMarker.row.minContentWidth += cellMarker.cell.minContentWidth;
            rowMarker.row.cells.push(cellMarker.cell);
            rowColumns[cellColumnId] = cellMarker.cell;
        }
        let endcellPos = getOffset(sharedString, cellMarker.cell.endMarker);
        nextPos = endcellPos + cellMarker.cell.endMarker.cachedLength;
    }
    return rowMarker;
}

export function parseColumns(sharedString: SharedString, pos: number, table: Table) {
    let nextPos = pos;
    function addColumn(segment: MergeTree.ISegment, segpos: number) {
        nextPos = segpos;
        if (segment.getType() === MergeTree.SegmentType.Marker) {
            let marker = <IColumnMarker>segment;
            if (marker.hasProperty("columnId")) {
                table.addGridColumn(marker);
                return true;
            }
        }
        return false;
    }
    sharedString.client.mergeTree.mapRange({ leaf: addColumn },
        MergeTree.UniversalSequenceNumber, sharedString.client.getClientId(), undefined, pos);
    return nextPos;
}


export function succinctPrintTable(tableMarker: ITableMarker, tableMarkerPos: number, sharedString: SharedString) {
    let id = tableMarker.getId();
    let endId = endPrefix + id;
    let mergeTree = sharedString.client.mergeTree;
    let endTableMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let endTablePos = endTableMarker.cachedLength + getOffset(sharedString, endTableMarker);
    let lineBuf = "";
    let lastWasCO = false;
    let reqPos = true;
    function printTableSegment(segment: MergeTree.ISegment, segpos: number) {
        if (segment.getType() === MergeTree.SegmentType.Marker) {
            let marker = <MergeTree.Marker>segment;
            let endLine = false;
            if (reqPos) {
                lineBuf += `${segpos}:`;
                reqPos = false;
            }
            if (marker.hasRangeLabels()) {
                let rangeLabel = marker.getRangeLabels()[0];
                if (marker.refType === MergeTree.ReferenceType.NestEnd) {
                    lineBuf += "E";
                    if ((rangeLabel === "table") || (rangeLabel === "row")) {
                        endLine = true;
                    }
                }
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
            } else if (marker.refType === MergeTree.ReferenceType.Simple) {
                if (marker.properties.columnId) {
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
            let textSegment = <MergeTree.TextSegment>segment;
            lineBuf += textSegment.text;
            reqPos = true;
        }
        return true;
    }
    mergeTree.mapRange({ leaf: printTableSegment }, MergeTree.UniversalSequenceNumber, sharedString.client.getClientId(),
        undefined, tableMarkerPos, endTablePos);
    console.log(lineBuf);
}

export function insertHoleFixer(sharedString: SharedString, prevMarker: MergeTree.Marker, columnId: string, rowId: string) {
    let extraProperties = {
        columnId,
    };
    let cellId = `${rowId}X${columnId}`;
    let opList = <MergeTree.IMergeTreeOp[]>[];
    createCellRelativeWithId(opList, cellId, { id: prevMarker.getId() }, extraProperties);
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.groupOperation(groupOp);
}

export function parseTable(
    tableMarker: ITableMarker, tableMarkerPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {

    let mergeTree = sharedString.client.mergeTree;
    let id = tableMarker.getId();
    let endId = endPrefix + id;
    let endTableMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let endTablePos = getOffset(sharedString, endTableMarker);
    let table = new Table(tableMarker, endTableMarker);
    tableMarker.table = table;
    let nextPos = tableMarkerPos + tableMarker.cachedLength;
    nextPos = parseColumns(sharedString, nextPos, tableMarker.table);
    let rowIndex = 0;
    while (nextPos < endTablePos) {
        let rowMarker = parseRow(nextPos, sharedString, table, fontInfo);
        if (!rowMarker) {
            console.log("PARSE ERROR!");
            succinctPrintTable(tableMarker, tableMarkerPos, sharedString);
            return undefined;
        }
        let rowView = rowMarker.row;
        rowView.table = table;
        rowView.pos = nextPos;
        if (!rowIsMoribund(rowMarker)) {
            for (let i = 0, len = rowView.cells.length; i < len; i++) {
                let cell = rowView.cells[i];
                if (!table.logicalColumns[i]) {
                    table.logicalColumns[i] = new Column(i);
                }
                let columnView = table.logicalColumns[i];
                columnView.cells[rowIndex] = cell;
                if (cell.minContentWidth > columnView.minContentWidth) {
                    columnView.minContentWidth = cell.minContentWidth;
                }
                if (cellIsMoribund(cell.marker) && (cell.marker.properties.wholeColumn)) {
                    columnView.moribund = true;
                }
            }

            if (rowMarker.row.minContentWidth > table.minContentWidth) {
                table.minContentWidth = rowMarker.row.minContentWidth;
            }
            table.rows[rowIndex++] = rowView;
        }
        let endRowPos = getOffset(sharedString, rowMarker.row.endRowMarker);
        rowView.endPos = endRowPos;
        nextPos = endRowPos + rowMarker.row.endRowMarker.cachedLength;
    }
    succinctPrintTable(tableMarker, tableMarkerPos, sharedString);
    return table;
}

export function rowIsMoribund(rowMarker: IRowMarker) {
    return rowMarker.properties && rowMarker.properties["moribund"];
}

export function cellIsMoribund(cellMarker: ICellMarker) {
    return cellMarker.properties && cellMarker.properties["moribund"];
}

