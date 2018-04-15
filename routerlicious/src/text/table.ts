// tslint:disable
import * as core from "../api-core";
import * as MergeTree from "../merge-tree";
import { SharedString } from "../merge-tree";
import * as Paragraph from "./paragraph";

export interface ITableMarker extends MergeTree.Marker {
    view?: TableModel;
}

export interface ICellMarker extends MergeTree.Marker {
    view?: CellModel;
}

export interface IRowMarker extends MergeTree.Marker {
    view?: RowModel;
}

let tableIdSuffix = 0;
let cellIdSuffix = 0;
let rowIdSuffix = 0;
let columnIdSuffix = 0;

function createRelativeMarkerOp(
    relativePos1: MergeTree.IRelativePosition, id: string,
    refType: MergeTree.ReferenceType, rangeLabels: string[],
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
        marker: { refType },
        relativePos1,
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

function createCellRelative(opList: MergeTree.IMergeTreeOp[], idBase: string,
    relpos: MergeTree.IRelativePosition, cellId?: string,
    extraProperties?: MergeTree.PropertySet) {
    if (!cellId) {
        cellId = idBase + `cell${cellIdSuffix++}`;
    }
    let cellEndId = endPrefix + cellId;
    let endExtraProperties: Object;
    if (extraProperties) {
        endExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOp(relpos, cellEndId,
        MergeTree.ReferenceType.NestEnd, ["cell"], undefined, endExtraProperties));
    let cellEndRelPos = <MergeTree.IRelativePosition>{
        before: true,
        id: cellEndId,
    };
    let startExtraProperties: Object;
    if (extraProperties) {
        startExtraProperties = MergeTree.extend(MergeTree.createMap(), extraProperties);
    }
    opList.push(createRelativeMarkerOp(cellEndRelPos, cellId,
        MergeTree.ReferenceType.NestBegin, ["cell"], undefined, startExtraProperties));
    let pgOp = createRelativeMarkerOp(cellEndRelPos, cellId + "C",
        MergeTree.ReferenceType.Tile, [], ["pg"]);
    opList.push(pgOp);
}

function createColumnCellOp(sharedString: SharedString, rowView: RowModel, prevcellView: CellModel, colId: string,
    extraProperties?: MergeTree.PropertySet) {
    let opList = <MergeTree.IMergeTreeInsertMsg[]>[];
    let rowId = rowView.rowMarker.getId();
    let cellId = rowId + "X" + colId;
    createCellRelative(opList, undefined, { id: prevcellView.endMarker.getId() }, cellId,
        extraProperties);
    let groupOp = <MergeTree.IMergeTreeGroupMsg>{
        ops: opList,
        type: MergeTree.MergeTreeDeltaType.GROUP,
    };
    if (extraProperties) {
        groupOp.intent = <MergeTree.IIntentSpec>{
            name: "insertColumn",
            params: {
                cellId: cellId,
            },
        };
    }
    return groupOp;
}

export interface IContentModel {
    exec(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage);
}

export function contentModelCreate(sharedString: SharedString): IContentModel {
    function insertColumn(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage) {
        finishInsertedColumn(op.intent.params["cellId"], msg, sharedString);
    }

    function exec(op: MergeTree.IMergeTreeGroupMsg, msg: core.ISequencedObjectMessage) {
        switch (op.intent.name) {
            case "insertColumn":
                insertColumn(op, msg);
                break;
        }
    }
    return {
        exec,
    };
}

const newColumnProp = "newColumnId";
function insertColumnCellForRow(sharedString: SharedString, rowView: RowModel,
    columnOffset: number, colId: string, segmentGroup: MergeTree.SegmentGroup, shared = false) {
    if (columnOffset < rowView.cells.length) {
        let prevcellView = rowView.cells[columnOffset];
        let groupOp = createColumnCellOp(sharedString, rowView, prevcellView, colId);
        sharedString.client.localTransaction(groupOp, segmentGroup);
    }
    // REVIEW: place cell at end of row even if not enough cells preceding
}

function finishInsertedColumn(cellId: string, msg: core.ISequencedObjectMessage,
    sharedString: SharedString) {
    // TODO: error checking
    let cellMarker = <ICellMarker>sharedString.client.mergeTree.getSegmentFromId(cellId);
    let cellPos = sharedString.client.mergeTree.getOffset(cellMarker, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let cellPosStack =
        sharedString.client.mergeTree.getStackContext(cellPos, sharedString.client.getClientId(), ["table", "cell", "row"]);
    let tableMarker = <ITableMarker>cellPosStack["table"].top();
    let tableMarkerPos = sharedString.client.mergeTree.getOffset(tableMarker, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
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

export function insertColumn(sharedString: SharedString, prevcellView: CellModel, rowView: RowModel,
    tableView: TableModel) {
    let columnOffset = 0;
    while (columnOffset < rowView.cells.length) {
        if (rowView.cells[columnOffset] === prevcellView) {
            break;
        }
        columnOffset++;
    }
    let colId = `${sharedString.client.longClientId}Col${columnIdSuffix++}`;
    let groupOp = createColumnCellOp(sharedString, rowView, prevcellView, colId,
        { [newColumnProp]: colId });
    let segmentGroup = sharedString.transaction(groupOp);
    // fill cell into other rows
    for (let otherRowView of tableView.rows) {
        if (otherRowView !== rowView) {
            insertColumnCellForRow(sharedString, otherRowView, columnOffset, colId,
                segmentGroup);
        }
    }
    // flush cache
    tableView.tableMarker.view = undefined;
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
        pos++;
        for (let cell = 0; cell < ncells; cell++) {
            createCellRelative(opList, idBase, endTablePos);
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

export class TableModel {
    public width: number;
    public renderedHeight: number;
    public deferredHeight: number;
    public minContentWidth = 0;
    public indentPct = 0.0;
    public contentPct = 1.0;
    public rows = <RowModel[]>[];
    public columns = <ColumnView[]>[];
    constructor(public tableMarker: ITableMarker, public endTableMarker: ITableMarker) {
    }

    public nextcell(cell: CellModel) {
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

    public prevcell(cell: CellModel) {
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

    public findPrecedingRow(rowView: RowModel) {
        let prevRow: RowModel;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return prevRow;
            }
            prevRow = row;
        }
    }

    public findNextRow(rowView: RowModel) {
        let nextRow: RowModel;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return nextRow;
            }
            nextRow = row;
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
    public cells = <CellModel[]>[];
    constructor(public columnIndex: number) {
    }
}


export class RowModel {
    public table: TableModel;
    public pos: number;
    public endPos: number;
    public minContentWidth = 0;
    public cells = <CellModel[]>[];
    constructor(public rowMarker: IRowMarker, public endRowMarker: IRowMarker) {

    }

    public findClosestCell(x: number) {
        let bestcell: CellModel;
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

export class CellModel {
    public minContentWidth = 0;
    public specWidth = 0;
    public renderedHeight: number;
    public div: HTMLDivElement;
    constructor(public marker: ICellMarker, public endMarker: ICellMarker) {
    }
}

function parseCell(cellStartPos: number, sharedString: SharedString, fontInfo?: Paragraph.IFontInfo) {
    let mergeTree = sharedString.client.mergeTree;
    let cellMarkerSegOff = mergeTree.getContainingSegment(cellStartPos, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let cellMarker = <ICellMarker>cellMarkerSegOff.segment;
    let id = cellMarker.getId();
    let endId = "end-" + id;
    let endCellMarker = <MergeTree.Marker>mergeTree.getSegmentFromId(endId);
    let endCellPos = mergeTree.getOffset(endCellMarker, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    cellMarker.view = new CellModel(cellMarker, endCellMarker);
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
    let endRowPos = mergeTree.getOffset(endRowMarker, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    rowMarker.view = new RowModel(rowMarker, endRowMarker);
    let nextPos = rowStartPos + rowMarker.cachedLength;
    while (nextPos < endRowPos) {
        let cellMarker = parseCell(nextPos, sharedString, fontInfo);
        rowMarker.view.minContentWidth += cellMarker.view.minContentWidth;
        rowMarker.view.cells.push(cellMarker.view);
        let endcellPos = mergeTree.getOffset(cellMarker.view.endMarker, MergeTree.UniversalSequenceNumber,
            sharedString.client.getClientId());
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
    let endTablePos = mergeTree.getOffset(endTableMarker, MergeTree.UniversalSequenceNumber,
        sharedString.client.getClientId());
    let tableView = new TableModel(tableMarker, endTableMarker);
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
        let endRowPos = mergeTree.getOffset(rowMarker.view.endRowMarker, MergeTree.UniversalSequenceNumber,
            sharedString.client.getClientId());
        tableView.rows[rowIndex++] = rowView;
        rowView.endPos = endRowPos;
        nextPos = endRowPos + rowMarker.view.endRowMarker.cachedLength;
    }
    return tableView;
}

