// tslint:disable
import * as core from "../api-core";
import * as MergeTree from "../merge-tree";
import { SharedString } from "../shared-string";
import * as Paragraph from "./paragraph";
import { MergeTreeDeltaType } from "../merge-tree";

export interface ITableMarker extends MergeTree.Marker {
    view?: Table;
}

export interface ICellMarker extends MergeTree.Marker {
    view?: Cell;
}

export interface IRowMarker extends MergeTree.Marker {
    view?: Row;
}

let tableIdSuffix = 0;
let cellIdSuffix = 0;
let rowIdSuffix = 0;
let columnIdSuffix = 0;
let localCellIdSuffix = 0;

function getOffset(sharedString, segment: MergeTree.Segment) {
    return sharedString.client.mergeTree.getOffset(segment, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
}

function createRelativeMarkerOp(relativePos1: MergeTree.IRelativePosition,
    id: string, refType: MergeTree.ReferenceType, rangeLabels: string[],
    tileLabels?: string[], props?: MergeTree.PropertySet) {
    return createRelativeMarkerOpOptLocal(relativePos1, false, id, refType,
        rangeLabels, tileLabels, props);
}

function createRelativeMarkerOpOptLocal(
    relativePos1: MergeTree.IRelativePosition,
    local: boolean, id: string, refType: MergeTree.ReferenceType, rangeLabels: string[],
    tileLabels?: string[], props?: MergeTree.PropertySet) {

    if (!props) {
        props = <MergeTree.MapLike<any>>{
        };
    }

    if (id.length > 0) {
        if (local) {
            props[MergeTree.reservedMarkerLocalIdKey] = id;
        } else {
            props[MergeTree.reservedMarkerIdKey] = id;
        }
    }

    if (rangeLabels.length > 0) {
        props[MergeTree.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        props[MergeTree.reservedTileLabelsKey] = tileLabels;
    }
    return <MergeTree.IMergeTreeInsertMsg>{
        marker: { refType },
        relativePos1,
        props,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
}

function createMarkerOpOptLocal(
    pos1: number, local: boolean, id: string,
    refType: MergeTree.ReferenceType, rangeLabels: string[], tileLabels?: string[],
    props?: MergeTree.PropertySet) {
    if (!props) {
        props = <MergeTree.MapLike<any>>{
        };
    }
    if (id.length > 0) {
        if (local) {
            props[MergeTree.reservedMarkerLocalIdKey] = id;
        } else {
            props[MergeTree.reservedMarkerIdKey] = id;
        }
    }
    if (rangeLabels.length > 0) {
        props[MergeTree.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        props[MergeTree.reservedTileLabelsKey] = tileLabels;
    }
    return <MergeTree.IMergeTreeInsertMsg>{
        marker: { refType },
        pos1,
        props,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
}

function createMarkerOp(
    pos1: number, id: string,
    refType: MergeTree.ReferenceType, rangeLabels: string[], tileLabels?: string[]) {

    let props = <MergeTree.MapLike<any>>{
    };
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
        marker: { refType },
        pos1,
        props,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };
}

let endPrefix = "end-";

function createCell(opList: MergeTree.IMergeTreeOp[], idBase: string,
    pos: number, local: boolean, cellId?: string,
    extraProperties?: MergeTree.PropertySet) {
    if (!cellId) {
        cellId = idBase + `cell${cellIdSuffix++}`;
    }
    let cellEndId = endPrefix + cellId;
    let endExtraProperties: Object;
    if (extraProperties) {
        endExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createMarkerOpOptLocal(pos, local, cellEndId,
        MergeTree.ReferenceType.NestEnd, ["cell"], undefined, endExtraProperties));
    createCellBegin(opList, cellEndId, cellId, local, extraProperties);
}

function createCellBegin(opList: MergeTree.IMergeTreeOp[], cellEndId: string,
    cellId: string, local: boolean, extraProperties?: MergeTree.PropertySet) {
    let cellEndRelPos: MergeTree.IRelativePosition;
    if (local) {
        cellEndRelPos = <MergeTree.IRelativePosition>{
            before: true,
            localId: cellEndId,
        };
    }
    else {
        cellEndRelPos = <MergeTree.IRelativePosition>{
            before: true,
            id: cellEndId,
        };
    }
    let startExtraProperties: Object;
    if (extraProperties) {
        startExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOpOptLocal(cellEndRelPos, local, cellId,
        MergeTree.ReferenceType.NestBegin, ["cell"], undefined, startExtraProperties));
    let pgOp = createRelativeMarkerOpOptLocal(cellEndRelPos, local, cellId + "C",
        MergeTree.ReferenceType.Tile, [], ["pg"]);
    opList.push(pgOp);
}

function createCellRelative(opList: MergeTree.IMergeTreeOp[], idBase: string,
    relpos: MergeTree.IRelativePosition, local: boolean, cellId?: string,
    extraProperties?: MergeTree.PropertySet) {
    if (!cellId) {
        cellId = idBase + `cell${cellIdSuffix++}`;
    }
    let cellEndId = endPrefix + cellId;
    let endExtraProperties: Object;
    if (extraProperties) {
        endExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOpOptLocal(relpos, local, cellEndId,
        MergeTree.ReferenceType.NestEnd, ["cell"], undefined, endExtraProperties));
    createCellBegin(opList, cellEndId, cellId, local, extraProperties);
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

function createRowCellOp(sharedString: SharedString, endRowId: string,
    localCellId: string) {
    let opList = <MergeTree.IMergeTreeInsertMsg[]>[];
    createCellRelative(opList, undefined, { id: endRowId, before: true }, true, localCellId);
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    return groupOp;
}

function createColumnCellOp(sharedString: SharedString, row: Row, prevCell: Cell, colId: string,
    extraProperties?: MergeTree.PropertySet) {
    let opList = <MergeTree.IMergeTreeInsertMsg[]>[];
    let rowId = row.rowMarker.getId();
    let cellId = rowId + "X" + colId;
    let gloId = prevCell.endMarker.getId();
    if (gloId) {
        createCellRelative(opList, undefined, { id: prevCell.endMarker.getId() }, false, cellId,
            extraProperties);
    } else {
        let pos = getOffset(sharedString, prevCell.endMarker);
        pos += prevCell.endMarker.cachedLength;
        createCell(opList, undefined, pos, false, cellId, extraProperties);
    }
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    if (extraProperties) {
        groupOp.macroOp = <MergeTree.IMacroOpSpec>{
            name: "insertColumn",
            params: {
                cellId,
            },
        };
    }
    return groupOp;
}

const newColumnProp = "newColumnId";
function insertColumnCellForRow(sharedString: SharedString, rowView: Row,
    columnOffset: number, colId: string, segmentGroup: MergeTree.SegmentGroup, shared = false) {
    if (columnOffset < rowView.cells.length) {
        let prevcellView = rowView.cells[columnOffset];
        let groupOp = createColumnCellOp(sharedString, rowView, prevcellView, colId);
        sharedString.client.localTransaction(groupOp, segmentGroup);
    }
    // REVIEW: place cell at end of row even if not enough cells preceding
}

export function finishInsertedRow(rowId: string, prevRowId: string, msg: core.ISequencedObjectMessage,
    sharedString: SharedString) {
    let rowMarker = <IRowMarker>sharedString.client.mergeTree.getSegmentFromId(rowId);
    let prevRowMarker = <IRowMarker>sharedString.client.mergeTree.getSegmentFromId(prevRowId);
    let rowPos = getOffset(sharedString, rowMarker);
    let rowPosStack =
        sharedString.client.mergeTree.getStackContext(rowPos, sharedString.client.getClientId(), ["table", "row"]);
    let tableMarker = <ITableMarker>rowPosStack["table"].top();
    let tableMarkerPos = getOffset(sharedString, tableMarker);
    parseTable(tableMarker, tableMarkerPos, sharedString);
    let endRowId = endPrefix + rowId;
    let prevRow = prevRowMarker.view;
    for (let prevCell of prevRow.cells) {
        let localCellId = `cellId${localCellIdSuffix++}`;
        let groupOp = createRowCellOp(sharedString, endRowId, localCellId);

        if ((prevCell.marker.seq === MergeTree.UnassignedSequenceNumber) &&
            (prevCell.marker.segmentGroup)) {
            sharedString.client.localTransaction(groupOp,
                prevCell.marker.segmentGroup);
        } else {
            let tempSegmentGroup = <MergeTree.SegmentGroup>{ segments: [] };
            let clid = sharedString.client.getShortClientId(msg.clientId);
            sharedString.client.setLocalSequenceNumberCli(msg.sequenceNumber, clid);
            sharedString.client.localTransaction(groupOp, tempSegmentGroup);
            for (let segment of tempSegmentGroup.segments) {
                segment.segmentGroup = undefined;
            }
            sharedString.client.resetLocalSequenceNumberCli();
        }
    }

    // flush cache
    tableMarker.view = undefined;
}

export function finishInsertedColumn(cellId: string, msg: core.ISequencedObjectMessage,
    sharedString: SharedString) {
    // TODO: error checking
    let cellMarker = <ICellMarker>sharedString.client.mergeTree.getSegmentFromId(cellId);
    let cellPos = getOffset(sharedString, cellMarker);
    let cellPosStack =
        sharedString.client.mergeTree.getStackContext(cellPos, sharedString.client.getClientId(), ["table", "cell", "row"]);
    let tableMarker = <ITableMarker>cellPosStack["table"].top();
    let tableMarkerPos = getOffset(sharedString, tableMarker);
    let rowMarker = <IRowMarker>cellPosStack["row"].top();
    let tableView = parseTable(tableMarker, tableMarkerPos, sharedString);
    let enclosingRowView = rowMarker.view;
    let columnOffset = 0;
    for (; columnOffset < enclosingRowView.cells.length; columnOffset++) {
        if (enclosingRowView.cells[columnOffset] === cellMarker.view) {
            break;
        }
    }
    columnOffset--;
    let colId = cellMarker.properties[newColumnProp];
    for (let rowView of tableView.rows) {
        if (rowView !== enclosingRowView) {
            if (rowView.cells.length > columnOffset) {
                let prevcellView = rowView.cells[columnOffset];
                let groupOp = createColumnCellOp(sharedString, rowView, prevcellView, colId);
                if ((rowView.rowMarker.seq === MergeTree.UnassignedSequenceNumber) &&
                    (rowView.rowMarker.segmentGroup)) {
                    sharedString.client.localTransaction(groupOp, rowView.rowMarker.segmentGroup);
                } else {
                    let tempSegmentGroup = <MergeTree.SegmentGroup>{ segments: [] };
                    let clid = sharedString.client.getShortClientId(msg.clientId);
                    sharedString.client.setLocalSequenceNumberCli(msg.sequenceNumber, clid);
                    for (let segment of tempSegmentGroup.segments) {
                        segment.segmentGroup = undefined;
                    }
                    sharedString.client.localTransaction(groupOp, tempSegmentGroup);
                    sharedString.client.resetLocalSequenceNumberCli();
                }
            }
        }
        // REVIEW: place cell at end of row even if not enough cells preceding
    }
    // clear cache
    tableMarker.view = undefined;
}

export function insertColumn(sharedString: SharedString, prevCell: Cell, row: Row,
    table: Table) {
    let columnOffset = 0;
    while (columnOffset < row.cells.length) {
        if (row.cells[columnOffset] === prevCell) {
            break;
        }
        columnOffset++;
    }
    let colId = `${sharedString.client.longClientId}Col${columnIdSuffix++}`;
    let groupOp = createColumnCellOp(sharedString, row, prevCell, colId,
        { [newColumnProp]: colId });
    let segmentGroup = sharedString.transaction(groupOp);
    // fill cell into other rows
    for (let otherRowView of table.rows) {
        if (otherRowView !== row) {
            insertColumnCellForRow(sharedString, otherRowView, columnOffset, colId,
                segmentGroup);
        }
    }
    // flush cache
    table.tableMarker.view = undefined;
}

export function insertRowCellForColumn(sharedString: SharedString,
    endRowId: string, segmentGroup: MergeTree.SegmentGroup) {
    let localCellId = `cellId${localCellIdSuffix++}`;
    let groupOp = createRowCellOp(sharedString, endRowId, localCellId);
    sharedString.client.localTransaction(groupOp, segmentGroup);
}

export function moribundToGone(sharedString: SharedString, rowMarker: IRowMarker, tableMarker: ITableMarker,
    seq: number, origClientId: number) {
    console.log(`perm removing row ${rowMarker.getId()}`);
    if (!tableMarker.view) {
        let tableMarkerPos = getOffset(sharedString, tableMarker);
        parseTable(tableMarker, tableMarkerPos, sharedString);
    }
    let start = getOffset(sharedString, rowMarker);
    let row = rowMarker.view;
    let end = getOffset(sharedString, row.endRowMarker) + row.endRowMarker.cachedLength;
    let tempSegmentGroup = <MergeTree.SegmentGroup>{ segments: [] };
    sharedString.client.mergeTree.markRangeRemoved(start, end, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId(), seq);
    for (let segment of tempSegmentGroup.segments) {
        segment.clientId = origClientId;
        segment.segmentGroup = undefined;
    }
    tableMarker.view = undefined;
}

export function finishDeletedRow(rowId: string, msg: core.ISequencedObjectMessage,
    sharedString: SharedString) {
    // msg op marked row moribund
    let rowMarker = <IRowMarker>sharedString.client.mergeTree.getSegmentFromId(rowId);
    let rowPos = getOffset(sharedString, rowMarker);
    let rowPosStack =
        sharedString.client.mergeTree.getStackContext(rowPos, sharedString.client.getClientId(), ["table", "row"]);
    let tableMarker = <ITableMarker>rowPosStack["table"].top();
    let tableMarkerPos = getOffset(sharedString, tableMarker);
    parseTable(tableMarker, tableMarkerPos, sharedString);
    sharedString.client.mergeTree.addMinSeqListener(msg.sequenceNumber, (minSeq) => {
        let clid = sharedString.client.getShortClientId(msg.clientId);
        moribundToGone(sharedString, rowMarker, tableMarker, msg.sequenceNumber, clid);
    });
}

export function deleteRow(sharedString: SharedString, row: Row, table: Table) {
    let rowPos = getOffset(sharedString, row.rowMarker);
    let annotOp = <MergeTree.IMergeTreeAnnotateMsg>{
        pos1: rowPos,
        pos2: rowPos + row.rowMarker.cachedLength,
        props: { moribund: true },
        type: MergeTreeDeltaType.ANNOTATE,
    };
    let opList = [annotOp];
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        macroOp: {
            name: "deleteRow",
            params: {
                rowId: row.rowMarker.getId(),
            }
        },
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    let segmentGroup = sharedString.transaction(groupOp);
    segmentGroup.onAck = (seq) => {
        sharedString.client.mergeTree.addMinSeqListener(seq, (minSeq) => {
            moribundToGone(sharedString, row.rowMarker, table.tableMarker,
                seq, sharedString.client.getClientId());
        });
    };
}

export function insertRow(sharedString: SharedString, prevRow: Row, table: Table) {
    let rowId = `${sharedString.client.longClientId}Row${rowIdSuffix++}`;
    let opList = <MergeTree.IMergeTreeOp[]>[];
    createEmptyRowAfter(opList, sharedString, prevRow, rowId);
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        macroOp: {
            name: "insertRow",
            params: {
                rowId,
                prevRowId: prevRow.rowMarker.getId(),
            }
        },
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    let segmentGroup = sharedString.transaction(groupOp);
    let endRowId = endPrefix + rowId;
    for (let i = 0, len = prevRow.cells.length; i < len; i++) {
        insertRowCellForColumn(sharedString, endRowId, segmentGroup);
    }
    // flush cache
    table.tableMarker.view = undefined;
}

export function createTableRelative(pos: number, sharedString: SharedString, nrows = 3, ncells = 3) {
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
    idBase += `T${tableIdSuffix++}`;
    let opList = <MergeTree.IMergeTreeInsertMsg[]>[];
    let endTableId = endPrefix + idBase;
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
    opList.push(createRelativeMarkerOp(endTablePos, idBase,
        MergeTree.ReferenceType.NestBegin, ["table"]));
    for (let row = 0; row < nrows; row++) {
        let rowId = idBase + `row${rowIdSuffix++}`;
        opList.push(createRelativeMarkerOp(endTablePos, rowId,
            MergeTree.ReferenceType.NestBegin, ["row"]));
        for (let cell = 0; cell < ncells; cell++) {
            createCellRelative(opList, idBase, endTablePos, false);
        }
        opList.push(createRelativeMarkerOp(endTablePos, endPrefix + rowId,
            MergeTree.ReferenceType.NestEnd, ["row"]));
    }
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    sharedString.transaction(groupOp);
}

export class Table {
    public width: number;
    public renderedHeight: number;
    public deferredHeight: number;
    public minContentWidth = 0;
    public indentPct = 0.0;
    public contentPct = 1.0;
    public rows = <Row[]>[];
    public columns = <ColumnView[]>[];
    constructor(public tableMarker: ITableMarker, public endTableMarker: ITableMarker) {
    }

    public nextcell(cell: Cell) {
        let retNext = false;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            for (let cellIndex = 0, cellCount = row.cells.length; cellIndex < cellCount; cellIndex++) {
                let rowcell = row.cells[cellIndex];
                if (retNext) {
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
                if (retPrev) {
                    return rowcell;
                }
                if (rowcell === cell) {
                    retPrev = true;
                }
            }
        }
    }

    public findPrecedingRow(rowView: Row) {
        let prevRow: Row;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return prevRow;
            }
            if (!rowIsMoribund(row.rowMarker)) {
                prevRow = row;
            }
        }
    }

    public findNextRow(rowView: Row) {
        let nextRow: Row;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return nextRow;
            }
            if (!rowIsMoribund(row.rowMarker)) {
                nextRow = row;
            }
        }
    }

    public updateWidth(w: number) {
        this.width = w;
        let proportionalWidthPerColumn = Math.floor(this.width / this.columns.length);
        // assume remaining width positive for now
        // assume uniform number of columns in rows for now (later update each row separately)
        let abscondedWidth = 0;
        let totalWidth = 0;
        for (let i = 0, len = this.columns.length; i < len; i++) {
            let col = this.columns[i];
            // TODO: borders
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
                cell.specWidth = col.width;
            }
        }
    }
}

export class ColumnView {
    public minContentWidth = 0;
    public width = 0;
    public cells = <Cell[]>[];
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

    public findClosestCell(x: number) {
        let bestcell: Cell;
        let bestDistance = -1;
        for (let cell of this.cells) {
            let bounds = cell.div.getBoundingClientRect();
            let center = bounds.left + (bounds.width / 2);
            let distance = Math.abs(center - x);
            if ((distance < bestDistance) || (bestDistance < 0)) {
                bestcell = cell;
                bestDistance = distance;
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
    constructor(public marker: ICellMarker, public endMarker: ICellMarker) {
    }
}

function getEndCellMarker(mergeTree: MergeTree.MergeTree, cellMarker: ICellMarker) {
    let localId = cellMarker.getLocalId();
    if (localId) {
        return <ICellMarker>mergeTree.getSegmentFromLocalId("end-" + localId);
    } else {
        let gloId = cellMarker.getId();
        if (gloId) {
            return <ICellMarker>mergeTree.getSegmentFromId("end-" + gloId);
        }
    }
}

function parseCell(cellStartPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {
    let mergeTree = sharedString.client.mergeTree;
    let cellMarkerSegOff = mergeTree.getContainingSegment(cellStartPos, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let cellMarker = <ICellMarker>cellMarkerSegOff.segment;
    let endCellMarker = getEndCellMarker(mergeTree, cellMarker);
    let endCellPos = getOffset(sharedString, endCellMarker);
    cellMarker.view = new Cell(cellMarker, endCellMarker);
    let nextPos = cellStartPos + cellMarker.cachedLength;
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
                if (tableMarker.view.minContentWidth > cellMarker.view.minContentWidth) {
                    cellMarker.view.minContentWidth = tableMarker.view.minContentWidth;
                }
                let endTableMarker = tableMarker.view.endTableMarker;
                nextPos = mergeTree.getOffset(
                    endTableMarker, MergeTree.UniversalSequenceNumber, sharedString.client.getClientId());
                nextPos += endTableMarker.cachedLength;
            } else {
                // empty paragraph
                nextPos++;
            }
        } else {
            // text segment
            let tilePos = sharedString.client.mergeTree.findTile(nextPos, sharedString.client.getClientId(),
                "pg", false);
            let pgMarker = <Paragraph.IParagraphMarker>tilePos.tile;
            if (!pgMarker.itemCache) {
                if (fontInfo) {
                    let itemsContext = <Paragraph.IItemsContext>{
                        curPGMarker: pgMarker,
                        fontInfo,
                        itemInfo: { items: [], minWidth: 0 },
                    };
                    let paragraphLexer = new Paragraph.ParagraphLexer(Paragraph.tokenToItems, itemsContext);
                    itemsContext.paragraphLexer = paragraphLexer;

                    mergeTree.mapRange({ leaf: Paragraph.segmentToItems }, MergeTree.UniversalSequenceNumber,
                        sharedString.client.getClientId(), itemsContext, nextPos, tilePos.pos);
                    pgMarker.itemCache = itemsContext.itemInfo;
                }
            }
            nextPos = tilePos.pos + 1;
            if (pgMarker.itemCache) {
                if (pgMarker.itemCache.minWidth > cellMarker.view.minContentWidth) {
                    cellMarker.view.minContentWidth = pgMarker.itemCache.minWidth;
                }
            }
        }
    }
    // console.log(`parsed cell ${cellMarker.getId()}`);
    return cellMarker;
}

function parseRow(rowStartPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {
    let mergeTree = sharedString.client.mergeTree;
    let rowMarkerSegOff = mergeTree.getContainingSegment(rowStartPos, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let rowMarker = <IRowMarker>rowMarkerSegOff.segment;
    let id = rowMarker.getId();
    let endId = "end-" + id;
    let endRowMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let endRowPos = getOffset(sharedString, endRowMarker);
    rowMarker.view = new Row(rowMarker, endRowMarker);
    let nextPos = rowStartPos + rowMarker.cachedLength;
    while (nextPos < endRowPos) {
        let cellMarker = parseCell(nextPos, sharedString, fontInfo);
        rowMarker.view.minContentWidth += cellMarker.view.minContentWidth;
        rowMarker.view.cells.push(cellMarker.view);
        let endcellPos = getOffset(sharedString, cellMarker.view.endMarker);
        nextPos = endcellPos + cellMarker.view.endMarker.cachedLength;
    }
    return rowMarker;
}

export function parseTable(
    tableMarker: ITableMarker, tableMarkerPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {

    let mergeTree = sharedString.client.mergeTree;
    let id = tableMarker.getId();
    let endId = "end-" + id;
    let endTableMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let endTablePos = getOffset(sharedString, endTableMarker);
    let tableView = new Table(tableMarker, endTableMarker);
    tableMarker.view = tableView;
    let nextPos = tableMarkerPos + tableMarker.cachedLength;
    let rowIndex = 0;
    while (nextPos < endTablePos) {
        let rowMarker = parseRow(nextPos, sharedString, fontInfo);
        let rowView = rowMarker.view;
        rowView.table = tableView;
        rowView.pos = nextPos;
        for (let i = 0, len = rowView.cells.length; i < len; i++) {
            let cell = rowView.cells[i];
            if (!tableView.columns[i]) {
                tableView.columns[i] = new ColumnView(i);
            }
            let columnView = tableView.columns[i];
            columnView.cells[rowIndex] = cell;
            if (cell.minContentWidth > columnView.minContentWidth) {
                columnView.minContentWidth = cell.minContentWidth;
            }
        }

        if (rowMarker.view.minContentWidth > tableView.minContentWidth) {
            tableView.minContentWidth = rowMarker.view.minContentWidth;
        }
        let endRowPos = getOffset(sharedString, rowMarker.view.endRowMarker);
        tableView.rows[rowIndex++] = rowView;
        rowView.endPos = endRowPos;
        nextPos = endRowPos + rowMarker.view.endRowMarker.cachedLength;
    }
    return tableView;
}

export function rowIsMoribund(rowMarker: IRowMarker) {
    return rowMarker.properties && rowMarker.properties["moribund"];
}
