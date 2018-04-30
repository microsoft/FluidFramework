// tslint:disable
import * as core from "../api-core";
import * as MergeTree from "../merge-tree";
import { SharedString } from "../shared-string";
import * as Paragraph from "./paragraph";
import { MergeTreeDeltaType, IMergeTreeGroupMsg } from "../merge-tree";

export interface ITableMarker extends MergeTree.Marker {
    table?: Table;
}

export interface IRowMarker extends MergeTree.Marker {
    row?: Row;
}

export interface ICellMarker extends MergeTree.Marker {
    cell?: Cell;
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

function createBubbleNest(relativePos1: MergeTree.IRelativePosition, props?: MergeTree.PropertySet) {
    return <MergeTree.IMergeTreeInsertMsg>{
        marker: { refType: MergeTree.ReferenceType.NestBegin },
        pairedMarker: {
            props: MergeTree.extend(MergeTree.createMap, props),
            refType: MergeTree.ReferenceType.NestEnd,
            relativePos1,
        },
        relativePos1,
        props,
        type: MergeTree.MergeTreeDeltaType.INSERT,
    };

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

export function idFromEndId(endId: string) {
    return endId.substring(endPrefix.length);
}

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

function createFirstColumnCellOp(sharedString: SharedString, row: Row, colId: string) {
    let opList = <MergeTree.IMergeTreeInsertMsg[]>[];
    let rowId = row.rowMarker.getId();
    let cellId = rowId + "X" + colId;
    createCellRelative(opList, undefined, { id: rowId }, false, cellId);
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
    liveColumnOffset: number, colId: string, segmentGroup: MergeTree.SegmentGroup, shared = false) {
    if (liveColumnOffset < rowView.cells.length) {
        let prevcellView = rowView.cells[liveColumnOffset];
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
    if (traceOps) {
        console.log(`finish insert row id: ${rowId} prev id: ${prevRowId} seq: ${msg.sequenceNumber}`);
    }
    let endRowId = endPrefix + rowId;
    let prevRow = prevRowMarker.row;
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
            sharedString.client.setLocalSequenceNumber(msg.sequenceNumber);
            sharedString.client.localTransaction(groupOp, tempSegmentGroup);
            let updateBlock: MergeTree.IMergeBlock;
            for (let segment of tempSegmentGroup.segments) {
                segment.segmentGroup = undefined;
                segment.clientId = clid;
                // TODO: coalesce parent blocks
                if (segment.parent !== updateBlock) {
                    sharedString.client.mergeTree.blockUpdatePathLengths(segment.parent,
                        msg.sequenceNumber, clid, true);
                }
                updateBlock = segment.parent;
            }
            sharedString.client.resetLocalSequenceNumber();
        }
    }

    // flush cache
    tableMarker.table = undefined;
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
    let enclosingRowView = rowMarker.row;
    if (traceOps) {
        console.log(`finish insert col cell id: ${cellId} seq: ${msg.sequenceNumber}`);
    }
    let colId = cellMarker.properties[newColumnProp];
    let prevLiveColumnOffset = cellMarker.cell.liveColumnOffset - 1;
    for (let rowView of tableView.rows) {
        if (rowView !== enclosingRowView) {
            if (rowView.cells.length > prevLiveColumnOffset) {
                let groupOp: IMergeTreeGroupMsg;
                if (prevLiveColumnOffset >= 0) {
                    let prevcellView = rowView.cells[prevLiveColumnOffset];
                    groupOp = createColumnCellOp(sharedString, rowView, prevcellView, colId);
                } else {
                    groupOp = createFirstColumnCellOp(sharedString, rowView, colId);
                }
                if ((rowView.rowMarker.seq === MergeTree.UnassignedSequenceNumber) &&
                    (rowView.rowMarker.segmentGroup)) {
                    sharedString.client.localTransaction(groupOp, rowView.rowMarker.segmentGroup);
                } else {
                    let tempSegmentGroup = <MergeTree.SegmentGroup>{ segments: [] };
                    let clid = sharedString.client.getShortClientId(msg.clientId);
                    sharedString.client.setLocalSequenceNumber(msg.sequenceNumber);
                    let updateBlock: MergeTree.IMergeBlock;
                    for (let segment of tempSegmentGroup.segments) {
                        segment.segmentGroup = undefined;
                        segment.clientId = clid;
                        // TODO: coalesce parent blocks
                        if (segment.parent !== updateBlock) {
                            sharedString.client.mergeTree.blockUpdatePathLengths(segment.parent,
                                msg.sequenceNumber, clid, true);
                        }
                        updateBlock = segment.parent;
                    }
                    sharedString.client.localTransaction(groupOp, tempSegmentGroup);
                    sharedString.client.resetLocalSequenceNumber();
                }
            }
        }
        // REVIEW: place cell at end of row even if not enough cells preceding
    }
    // clear cache
    tableMarker.table = undefined;
}
let traceOps = true;

export function insertColumn(sharedString: SharedString, prevCell: Cell, row: Row,
    table: Table) {
    let liveColumnOffset = prevCell.liveColumnOffset;
    let colId = `${sharedString.client.longClientId}Col${columnIdSuffix++}`;
    if (traceOps) {
        console.log(`insert col prev ${prevCell.marker.toString()} id: ${colId}`);
    }
    let groupOp = createColumnCellOp(sharedString, row, prevCell, colId,
        { [newColumnProp]: colId });
    let segmentGroup = sharedString.transaction(groupOp);
    // fill cell into other rows
    for (let otherRowView of table.rows) {
        if (otherRowView !== row) {
            insertColumnCellForRow(sharedString, otherRowView, liveColumnOffset, colId,
                segmentGroup);
        }
    }
    // flush cache
    table.tableMarker.table = undefined;
}

export function insertRowCellForColumn(sharedString: SharedString,
    endRowId: string, segmentGroup: MergeTree.SegmentGroup) {
    let localCellId = `cellId${localCellIdSuffix++}`;
    let groupOp = createRowCellOp(sharedString, endRowId, localCellId);
    sharedString.client.localTransaction(groupOp, segmentGroup);
}

export function moribundToGoneRow(sharedString: SharedString, rowMarker: IRowMarker, tableMarker: ITableMarker,
    seq: number, origClientId: number) {
    console.log(`perm removing row ${rowMarker.getId()}`);
    let physicalRemove = false;
    if (physicalRemove) {
        if (!tableMarker.table) {
            let tableMarkerPos = getOffset(sharedString, tableMarker);
            parseTable(tableMarker, tableMarkerPos, sharedString);
        }
        let start = getOffset(sharedString, rowMarker);
        let row = rowMarker.row;
        let end = getOffset(sharedString, row.endRowMarker) + row.endRowMarker.cachedLength;
        let tempSegmentGroup = <MergeTree.SegmentGroup>{ segments: [] };
        sharedString.client.mergeTree.markRangeRemoved(start, end, MergeTree.UniversalSequenceNumber,
            sharedString.client.getClientId(), seq, true);
        for (let segment of tempSegmentGroup.segments) {
            segment.clientId = origClientId;
            segment.segmentGroup = undefined;
        }
        tableMarker.table = undefined;
    }
}

export function moribundToGoneCell(sharedString: SharedString, cellMarker: ICellMarker, tableMarker: ITableMarker,
    seq: number, origClientId: number) {
    let physicalRemove = false;
    if (physicalRemove) {
        if (!tableMarker.table) {
            let tableMarkerPos = getOffset(sharedString, tableMarker);
            parseTable(tableMarker, tableMarkerPos, sharedString);
        }
        let start = getOffset(sharedString, cellMarker);
        let cell = cellMarker.cell;
        let end = getOffset(sharedString, cell.endMarker) + cell.endMarker.cachedLength;
        let tempSegmentGroup = <MergeTree.SegmentGroup>{ segments: [] };
        sharedString.client.mergeTree.markRangeRemoved(start, end, MergeTree.UniversalSequenceNumber,
            sharedString.client.getClientId(), seq, true);
        for (let segment of tempSegmentGroup.segments) {
            segment.clientId = origClientId;
            segment.segmentGroup = undefined;
        }
        tableMarker.table = undefined;
    }
}

export function finishDeletedCell(cellPosRemote: number, msg: core.ISequencedObjectMessage,
    sharedString: SharedString) {
    // msg op marked cell moribund
    let clid = sharedString.client.getShortClientId(msg.clientId);
    let cellPos = sharedString.client.mergeTree.tardisPositionFromClient(cellPosRemote, msg.referenceSequenceNumber,
        sharedString.client.getCurrentSeq(), clid, sharedString.client.getClientId());
    let cellPosStack =
        sharedString.client.mergeTree.getStackContext(cellPos, sharedString.client.getClientId(), ["table", "row", "cell"]);
    let tableMarker = <ITableMarker>cellPosStack["table"].top();
    let cellMarker = <ICellMarker>cellPosStack["cell"].top();
    let tableMarkerPos = getOffset(sharedString, tableMarker);
    parseTable(tableMarker, tableMarkerPos, sharedString);
    sharedString.client.mergeTree.addMinSeqListener(msg.sequenceNumber, (minSeq) => {
        moribundToGoneCell(sharedString, cellMarker, tableMarker, msg.sequenceNumber, clid);
    });
}

export function finishDeletedColumn(cellPosRemote: number, rowId: string, msg: core.ISequencedObjectMessage,
    sharedString: SharedString) {

    // msg op marked cell moribund
    let clid = sharedString.client.getShortClientId(msg.clientId);
    let cellPos = sharedString.client.mergeTree.tardisPositionFromClient(cellPosRemote, msg.referenceSequenceNumber,
        sharedString.client.getCurrentSeq(), clid, sharedString.client.getClientId());
    let cellPosStack =
        sharedString.client.mergeTree.getStackContext(cellPos, sharedString.client.getClientId(), ["table", "row", "cell"]);
    let tableMarker = <ITableMarker>cellPosStack["table"].top();
    let cellMarker = <ICellMarker>cellPosStack["cell"].top();
    if (traceOps) {
        console.log(`finish delete column from cell ${cellMarker.toString()}`);
    }
    let tableMarkerPos = getOffset(sharedString, tableMarker);
    parseTable(tableMarker, tableMarkerPos, sharedString);
    let table = tableMarker.table;
    let moribundCellMarkers = [cellMarker];
    let rowMarker = <IRowMarker>sharedString.client.mergeTree.getSegmentFromId(rowId);
    let row = rowMarker.row;
    cellMarker.addProperties({ moribundSeq: msg.sequenceNumber });
    let liveColumnOffset = 0;
    if (cellMarker.cell.prevLive) {
        liveColumnOffset = cellMarker.cell.prevLive.liveColumnOffset + 1;
    }
    for (let otherRow of table.rows) {
        if (otherRow !== row) {
            if (liveColumnOffset < otherRow.cells.length) {
                let otherCell = otherRow.cells[liveColumnOffset];
                if (otherCell && !(otherCell.marker.hasProperty("moribundSeq"))) {
                    otherCell.marker.addProperties({
                        moribund: true, wholeColumn: true,
                        moribundSeq: msg.sequenceNumber
                    });
                    moribundCellMarkers.push(otherCell.marker);
                }
            }
        }
    }
    sharedString.client.mergeTree.addMinSeqListener(msg.sequenceNumber, (minSeq) => {
        for (let moribundCellMarker of moribundCellMarkers) {
            moribundToGoneCell(sharedString, moribundCellMarker, tableMarker, msg.sequenceNumber, clid);
        }
    });
    tableMarker.table = undefined;
}

export function finishDeletedRow(rowId: string, msg: core.ISequencedObjectMessage,
    sharedString: SharedString) {
    // msg op marked row moribund
    if (traceOps) {
        console.log(`finish delete row ${rowId} seq: ${msg.sequenceNumber}`);
    }
    let rowMarker = <IRowMarker>sharedString.client.mergeTree.getSegmentFromId(rowId);
    if (rowMarker.properties.moribundSeq) {
        console.log(`overlapping delete of ${rowId}`);
        return;
    }
    rowMarker.addProperties({ moribundSeq: msg.sequenceNumber });
    let rowPos = getOffset(sharedString, rowMarker);
    let rowPosStack =
        sharedString.client.mergeTree.getStackContext(rowPos, sharedString.client.getClientId(), ["table", "row"]);
    let tableMarker = <ITableMarker>rowPosStack["table"].top();
    let tableMarkerPos = getOffset(sharedString, tableMarker);
    parseTable(tableMarker, tableMarkerPos, sharedString);
    sharedString.client.mergeTree.addMinSeqListener(msg.sequenceNumber, (minSeq) => {
        let clid = sharedString.client.getShortClientId(msg.clientId);
        moribundToGoneRow(sharedString, rowMarker, tableMarker, msg.sequenceNumber, clid);
    });
    tableMarker.table = undefined;
}

export function deleteColumn(sharedString: SharedString, cell: Cell, row: Row,
    table: Table) {
    if (traceOps) {
        console.log(`delete column from cell ${cell.marker.toString()}`);
    }
    let cellPos = getOffset(sharedString, cell.marker);
    let annotOp = <MergeTree.IMergeTreeAnnotateMsg>{
        pos1: cellPos,
        pos2: cellPos + cell.marker.cachedLength,
        props: { moribund: true, wholeColumn: true },
        type: MergeTreeDeltaType.ANNOTATE,
    };
    let opList = [annotOp];
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        macroOp: {
            name: "deleteColumn",
            params: {
                cellPos: cellPos,
                rowId: row.rowMarker.getId(),
            }
        },
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    let segmentGroup = sharedString.transaction(groupOp);
    cell.marker.addProperties({ moribundSeq: MergeTree.UnassignedSequenceNumber });
    let moribundCellMarkers = <ICellMarker[]>[];
    let liveColumnOffset = 0;
    if (cell.prevLive) {
        liveColumnOffset = cell.prevLive.liveColumnOffset + 1;
    }
    for (let otherRow of table.rows) {
        if (otherRow !== row) {
            if (liveColumnOffset < otherRow.cells.length) {
                let otherCell = otherRow.cells[liveColumnOffset];
                if (otherCell) {
                    otherCell.marker.addProperties({
                        moribund: true,
                        wholeColumn: true, moribundSeq: MergeTree.UnassignedSequenceNumber
                    });
                    moribundCellMarkers.push(otherCell.marker);
                }
            }
        } else {
            moribundCellMarkers.push(cell.marker);
        }
    }
    segmentGroup.onAck = (seq) => {
        sharedString.client.mergeTree.addMinSeqListener(seq, (minSeq) => {
            for (let cellMarker of moribundCellMarkers)
                moribundToGoneCell(sharedString, cellMarker, table.tableMarker,
                    seq, sharedString.client.getClientId());
        });
    };
    table.tableMarker.table = undefined;
}

export function deleteCellShiftLeft(sharedString: SharedString, cell: Cell,
    table: Table) {
    let cellPos = getOffset(sharedString, cell.marker);
    let annotOp = <MergeTree.IMergeTreeAnnotateMsg>{
        pos1: cellPos,
        pos2: cellPos + cell.marker.cachedLength,
        props: { moribund: true },
        type: MergeTreeDeltaType.ANNOTATE,
    };
    let opList = [annotOp];
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        macroOp: {
            name: "deleteCellShiftLeft",
            params: {
                cellPos: cellPos,
            }
        },
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    let segmentGroup = sharedString.transaction(groupOp);
    cell.marker.addProperties({ moribundSeq: MergeTree.UnassignedSequenceNumber });
    segmentGroup.onAck = (seq) => {
        sharedString.client.mergeTree.addMinSeqListener(seq, (minSeq) => {
            moribundToGoneCell(sharedString, cell.marker, table.tableMarker,
                seq, sharedString.client.getClientId());
        });
    };
    table.tableMarker.table = undefined;
}


export function deleteRow(sharedString: SharedString, row: Row, table: Table) {
    if (traceOps) {
        console.log(`delete row ${row.rowMarker.getId()}`);
    }
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
    row.rowMarker.addProperties({ moribundSeq: MergeTree.UnassignedSequenceNumber });
    segmentGroup.onAck = (seq) => {
        sharedString.client.mergeTree.addMinSeqListener(seq, (minSeq) => {
            moribundToGoneRow(sharedString, row.rowMarker, table.tableMarker,
                seq, sharedString.client.getClientId());
        });
    };
    table.tableMarker.table = undefined;
}

export function insertRow(sharedString: SharedString, prevRow: Row, table: Table) {
    let rowId = `${sharedString.client.longClientId}Row${rowIdSuffix++}`;
    if (traceOps) {
        console.log(`insert row id: ${rowId} prev: ${prevRow.rowMarker.getId()}`);
    }
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
    table.tableMarker.table = undefined;
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
    public columns = <Column[]>[];
    constructor(public tableMarker: ITableMarker, public endTableMarker: ITableMarker) {
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
        for (let i = 0, len = this.columns.length; i < len; i++) {
            let col = this.columns[i];
            if (!col.moribund) {
                liveColumnCount++;
            }
        }
        let proportionalWidthPerColumn = Math.floor(this.width / liveColumnCount);
        // assume remaining width positive for now
        // assume uniform number of columns in rows for now (later update each row separately)
        let abscondedWidth = 0;
        let totalWidth = 0;
        for (let i = 0, len = this.columns.length; i < len; i++) {
            let col = this.columns[i];
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
    public columnOffset: number;
    public liveColumnOffset: number;
    public prevLive: Cell;

    constructor(public marker: ICellMarker, public endMarker: ICellMarker) {
    }
}

function getEndCellMarker(mergeTree: MergeTree.MergeTree, cellMarker: ICellMarker) {
    let localId = cellMarker.getLocalId();
    if (localId) {
        return <ICellMarker>mergeTree.getSegmentFromLocalId(endPrefix + localId);
    } else {
        let gloId = cellMarker.getId();
        if (gloId) {
            return <ICellMarker>mergeTree.getSegmentFromId(endPrefix + gloId);
        }
    }
}

function parseCell(cellStartPos: number, sharedString: SharedString, columnOffset: number, fontInfo?: Paragraph.IFontInfo) {
    let mergeTree = sharedString.client.mergeTree;
    let cellMarkerSegOff = mergeTree.getContainingSegment(cellStartPos, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let cellMarker = <ICellMarker>cellMarkerSegOff.segment;
    let endCellMarker = getEndCellMarker(mergeTree, cellMarker);
    if (!endCellMarker) {
        console.log(`ut-oh: no end for ${cellMarker.toString()}`);
    }
    let endCellPos = getOffset(sharedString, endCellMarker);
    cellMarker.cell = new Cell(cellMarker, endCellMarker);
    cellMarker.cell.columnOffset = columnOffset;
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
                if (pgMarker.itemCache.minWidth > cellMarker.cell.minContentWidth) {
                    cellMarker.cell.minContentWidth = pgMarker.itemCache.minWidth;
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
    let endId = endPrefix + id;
    let endRowMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let endRowPos = getOffset(sharedString, endRowMarker);
    rowMarker.row = new Row(rowMarker, endRowMarker);
    let nextPos = rowStartPos + rowMarker.cachedLength;
    let columnOffset = 0;
    let liveColumnCount = 0;
    let prevLive: Cell;
    while (nextPos < endRowPos) {
        let cellMarker = parseCell(nextPos, sharedString, columnOffset, fontInfo);
        if (!cellIsMoribund(cellMarker)) {
            rowMarker.row.minContentWidth += cellMarker.cell.minContentWidth;
            rowMarker.row.cells.push(cellMarker.cell);
            cellMarker.cell.liveColumnOffset = liveColumnCount++;
            cellMarker.cell.prevLive = prevLive;
            prevLive = cellMarker.cell;
        }
        let endcellPos = getOffset(sharedString, cellMarker.cell.endMarker);
        nextPos = endcellPos + cellMarker.cell.endMarker.cachedLength;
        columnOffset++;
    }
    return rowMarker;
}

export function parseTable(
    tableMarker: ITableMarker, tableMarkerPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {

    let mergeTree = sharedString.client.mergeTree;
    let id = tableMarker.getId();
    let endId = endPrefix + id;
    let endTableMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let endTablePos = getOffset(sharedString, endTableMarker);
    let tableView = new Table(tableMarker, endTableMarker);
    tableMarker.table = tableView;
    let nextPos = tableMarkerPos + tableMarker.cachedLength;
    let rowIndex = 0;
    while (nextPos < endTablePos) {
        let rowMarker = parseRow(nextPos, sharedString, fontInfo);
        let rowView = rowMarker.row;
        rowView.table = tableView;
        rowView.pos = nextPos;
        if (!rowIsMoribund(rowMarker)) {
            for (let i = 0, len = rowView.cells.length; i < len; i++) {
                let cell = rowView.cells[i];
                if (!tableView.columns[i]) {
                    tableView.columns[i] = new Column(i);
                }
                let columnView = tableView.columns[i];
                columnView.cells[rowIndex] = cell;
                if (cell.minContentWidth > columnView.minContentWidth) {
                    columnView.minContentWidth = cell.minContentWidth;
                }
                if (cellIsMoribund(cell.marker) && (cell.marker.properties.wholeColumn)) {
                    columnView.moribund = true;
                }
            }

            if (rowMarker.row.minContentWidth > tableView.minContentWidth) {
                tableView.minContentWidth = rowMarker.row.minContentWidth;
            }
            tableView.rows[rowIndex++] = rowView;
        }
        let endRowPos = getOffset(sharedString, rowMarker.row.endRowMarker);
        rowView.endPos = endRowPos;
        nextPos = endRowPos + rowMarker.row.endRowMarker.cachedLength;
    }
    return tableView;
}

export function rowIsMoribund(rowMarker: IRowMarker) {
    return rowMarker.properties && rowMarker.properties["moribund"];
}

export function cellIsMoribund(cellMarker: ICellMarker) {
    return cellMarker.properties && cellMarker.properties["moribund"];
}

// QTable

let qTableMarkerType = "qTableMarkerType";
let qTableRow = "qTableRow";
let qTableColumn = "qTableCol";

export function createQTable(pos: number, sharedString: SharedString, nrows = 3, ncolumns = 3) {
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
    // end-T
    opList.push(createMarkerOp(pos, endTableId,
        MergeTree.ReferenceType.NestEnd |
        MergeTree.ReferenceType.Tile, ["table"], ["pg"]));
    let endTablePos = <MergeTree.IRelativePosition>{
        before: true,
        id: endTableId,
    };
    // [pg] end-T
    if (pgAtStart) {
        // TODO: copy pg properties from pg marker after pos
        let pgOp = createRelativeMarkerOp(endTablePos, "",
            MergeTree.ReferenceType.Tile, [], ["pg"]);
        opList.push(pgOp);
    }
    // [pg] T end-T
    opList.push(createRelativeMarkerOp(endTablePos, idBase,
        MergeTree.ReferenceType.NestBegin, ["table"]));
    // [pg] T rows end-T
    let rowProps = { [qTableMarkerType]: "row" };
    let rowIds = <string[]>[];
    for (let i = 0; i < nrows; i++) {
        rowIds[i] = `${idBase}R${rowIdSuffix++}`;
        opList.push(createRelativeMarkerOp(endTablePos, rowIds[i],
            MergeTree.ReferenceType.Simple, [], undefined, rowProps));
    }
    // [pg] T rows columns end-T    
    let colProps = { [qTableMarkerType]: "column" };
    let colIds = <string[]>[];
    for (let i = 0; i < ncolumns; i++) {
        colIds[i] = `${idBase}C${columnIdSuffix++}`;
        opList.push(createRelativeMarkerOp(endTablePos, colIds[i],
            MergeTree.ReferenceType.Simple, [], undefined, colProps));
    }
    // [pg] T rows columns CC end-T
    opList.push(createRelativeMarkerOp(endTablePos, `${idBase}Content`,
        MergeTree.ReferenceType.NestBegin, ["content"]));
    // [pg] T rows columns TC bubbles (each rc pair) end-T
    for (let r = 0; r < nrows; r++) {
        for (let c = 0; c < ncolumns; c++) {
            let props = {
                [qTableMarkerType]: "bubble",
                [qTableRow]: rowIds[r],
                [qTableColumn]: colIds[c],
            };
            opList.push(createBubbleNest(endTablePos, props));
        }
    }
    // [pg] T rows columns TC bubbles (each rc pair) end-TC end-T
    opList.push(createRelativeMarkerOp(endTablePos, `${endPrefix}${idBase}Content`,
        MergeTree.ReferenceType.NestEnd, ["content"]));
}

export class QGap {
    constructor(public gapMarker: IQGapMarker) {
        gapMarker.gap = this;
    }
}

export class QTable {
    rcMap = new Map<string, QCell>();
    rMap = new Map<string, QRow>();
    cMap = new Map<string, QColumn>();
    rows = <QRow[]>[];
    columns = <QColumn[]>[];
    constructor(public tableMarker: IQTableMarker) {
        tableMarker.table=this;
    }
    addBubble(bubble: QContentBubble) {
        let rowId = bubble.bubbleMarker.properties[qTableRow];
        let columnId = bubble.bubbleMarker.properties[qTableColumn];
        let cellId = rowId + "X" + columnId;
        let cell = this.rcMap.get(cellId);
        cell.addBubble(bubble);
    }

    addGap(gap: QGap) {
        let rowId = gap.gapMarker.properties[qTableRow];
        let columnId = gap.gapMarker.properties[qTableColumn];
        let cellId = rowId + "X" + columnId;
        let cell = this.rcMap.get(cellId);
        cell.skip=true;
    }

    addCells() {
        for (let row of this.rows) {
            let rowId = row.rowMarker.getId();
            for (let column of this.columns) {
                let columnId = column.columnMarker.getId();
                let cellId = rowId + "X" + columnId;
                let cell = new QCell(row, column);
                this.rcMap.set(cellId, cell);
                row.cells.push(cell);
                column.cells.push(cell);
            }
        }
    }
}

export class QRow {
    cells = <QCell[]>[];
    constructor(public rowMarker: IQRowMarker) {
        rowMarker.row = this;
    }
}

export class QColumn {
    cells = <QCell[]>[];
    constructor(public columnMarker: IQColumnMarker) {
        columnMarker.column = this;
    }
}

export class QContentBubble {
    constructor(public bubbleMarker: IQBubbleMarker) {
        bubbleMarker.bubble = this;
    }
}

export class QCell {
    skip = false;
    bubbles:MergeTree.List<QContentBubble> = MergeTree.ListMakeHead<QContentBubble>();
    constructor(public row: QRow, public column: QColumn) {
    }
    addBubble(bubble: QContentBubble) {
        this.bubbles.add(bubble);
    }
}

export interface IQGapMarker extends MergeTree.Marker {
    gap?: QGap;
}

export interface IQBubbleMarker extends MergeTree.Marker {
    bubble?: QContentBubble;
}

export interface IQTableMarker extends MergeTree.Marker {
    table?: QTable;
}

export interface IQRowMarker extends MergeTree.Marker {
    row?: QRow;
}

export interface IQColumnMarker extends MergeTree.Marker {
    column?: QColumn;
}

export interface IContentBubbleMarker extends MergeTree.Marker {
    contentBubble?: QContentBubble;
}

enum QTableParseState {
    Start,
    Structure,
    Rows,
    Columns,
    Gaps,
    Content,
    Bubble,
    ContentEnd
}

export function parseQTable(
    tableMarker: IQTableMarker, tableMarkerPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {
    let mergeTree = sharedString.client.mergeTree;
    let id = tableMarker.getId();
    let endId = endPrefix + id;
    let endTableMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let rowMarkers = <IQRowMarker[]>[];
    let columnMarkers = <IQColumnMarker[]>[];
    let state = QTableParseState.Start;
    let table = new QTable(tableMarker);
    tableMarker.table = table;
    let rowCount = 0;
    let columnCount = 0;

    function parseSegment(segment: MergeTree.Segment) {
        if (segment === endTableMarker) {
            if (state !== QTableParseState.ContentEnd) {
                console.log(`table parse error: unexpected end of table in state ${QTableParseState[state]}`);
            }
            return false;
        } else {
            if (segment.getType() === MergeTree.SegmentType.Marker) {
                let marker = <MergeTree.Marker>segment;
                if (marker.refType === MergeTree.ReferenceType.Simple) {
                    switch (marker.properties[qTableMarkerType]) {
                        case "row":
                            switch (state) {
                                case QTableParseState.Structure:
                                    state = QTableParseState.Rows;
                                case QTableParseState.Rows:
                                    let rowMarker = <IQRowMarker>marker;
                                    rowMarker.row = new QRow(rowMarker);
                                    table.rows[rowCount++] = rowMarker.row;
                                    rowMarkers.push(marker);
                                    break;
                                default:
                                    console.log("table parse error: unexpected row");
                                    break;
                            }
                        case "column":
                            if (state === QTableParseState.Rows) {
                                state = QTableParseState.Columns;
                            }
                            if (state === QTableParseState.Columns) {
                                let columnMarker = <IQColumnMarker>marker;
                                columnMarker.column = new QColumn(columnMarker);
                                table.columns[columnCount++] = columnMarker.column;
                                columnMarkers.push(marker);
                            } else {
                                console.log("table parse error: unexpected column");
                            }
                            break;
                        case "gap":
                            if (state === QTableParseState.Columns) {
                                state = QTableParseState.Gaps;
                                table.addCells();
                            }
                            if (state === QTableParseState.Gaps) {
                                table.addGap(new QGap(marker));
                            } else {
                                console.log(`unexpected gap marker ${marker.toString()} in state ${QTableParseState[state]}`);
                            }
                            break;
                        default:
                            console.log(`unexpected marker ${marker.toString()} in state ${QTableParseState[state]}`);
                            break;
                    }
                } else if (marker.refType === MergeTree.ReferenceType.NestBegin) {
                    switch (marker.getRangeLabels()[0]) {
                        case "table":
                            switch (state) {
                                case QTableParseState.Start:
                                    state = QTableParseState.Structure;
                                    break;
                                case QTableParseState.Content:
                                    // TODO: nested table
                                    break;
                                default:
                                    console.log(`table parse error: unexpected table begin in state ${QTableParseState[state]}`);
                                    break;
                            }
                            break;
                        case "bubble":
                            if (state === QTableParseState.Content) {
                                state = QTableParseState.Bubble;
                                let bubble = new QContentBubble(marker);
                                table.addBubble(bubble);
                            } else {
                                console.log(`table parse error: unexpected bubble start in state ${QTableParseState[state]}`);
                            }
                            break;
                        case "content":
                            if (state === QTableParseState.Columns) {
                                table.addCells();
                                state = QTableParseState.Gaps;
                            }
                            if (state === QTableParseState.Gaps) {
                                state = QTableParseState.Content;
                            } else {
                                console.log(`table parse error: unexpected content start in state ${QTableParseState[state]}`);
                            }
                            break;
                        default:
                            if (state !== QTableParseState.Bubble) {
                                console.log(`table parse error: unexpected nest start marker in state ${QTableParseState[state]}`);
                            }
                            break;
                    }
                } else if (marker.refType === MergeTree.ReferenceType.NestEnd) {
                    switch (marker.getRangeLabels()[0]) {
                        case "bubble":
                            if (state === QTableParseState.Bubble) {
                                state = QTableParseState.Content;
                            } else {
                                console.log(`table parse error: unexpected bubble end in state ${QTableParseState[state]}`);
                            }
                            break;
                        case "content":
                            if (state === QTableParseState.Content) {
                                state = QTableParseState.ContentEnd;
                            } else {
                                console.log(`table parse error: unexpected content end in state ${QTableParseState[state]}`);
                            }
                            break;
                        default:
                            if (state !== QTableParseState.Bubble) {
                                console.log(`table parse error: unexpected nest end marker in state ${QTableParseState[state]}`);
                            }
                            break;
                    }
                }
            }
            return true;
        }
    }
    sharedString.client.mergeTree.mapRange({ leaf: parseSegment }, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId(), undefined, tableMarkerPos);

}