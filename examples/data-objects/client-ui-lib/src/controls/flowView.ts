/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { performance } from "@fluidframework/common-utils";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import * as types from "@fluidframework/map";
import * as MergeTree from "@fluidframework/merge-tree";
import { IClient, ISequencedDocumentMessage, IUser } from "@fluidframework/protocol-definitions";
import { IInboundSignalMessage } from "@fluidframework/runtime-definitions";
import * as Sequence from "@fluidframework/sequence";
import { SharedSegmentSequenceUndoRedoHandler, UndoRedoStackManager } from "@fluidframework/undo-redo";
import React from "react";
import ReactDOM from "react-dom";
import { CharacterCodes, Paragraph, Table } from "../text";
import * as ui from "../ui";
import { CommandBox } from "./commandBox";
import { Cursor, IRange } from "./cursor";
import * as domutils from "./domutils";
import { KeyCode } from "./keycode";
import {
    CursorDirection,
    IViewCursor,
} from "./layout";

interface IFlowViewUser extends IUser {
    name: string;
}

interface IOverlayMarker {
    id: string;
    position: number;
}

interface ILineDiv extends HTMLDivElement {
    linePos?: number;
    lineEnd?: number;
    contentWidth?: number;
    indentWidth?: number;
    indentSymbol?: Paragraph.ISymbol;
    endPGMarker?: Paragraph.IParagraphMarker;
    breakIndex?: number;
}

interface IRowDiv extends ILineDiv {
    rowView: Table.Row;
}

function findRowParent(lineDiv: ILineDiv) {
    let parent = lineDiv.parentElement as IRowDiv;
    while (parent) {
        if (parent.rowView) {
            return parent;
        }
        parent = parent.parentElement as IRowDiv;
    }
}
interface IRefInclusion {
    marker: MergeTree.Marker;
    exclu: IExcludedRectangle;
}

interface IRefDiv extends HTMLDivElement, IRefInclusion {
}

interface ISegSpan extends HTMLSpanElement {
    seg: MergeTree.TextSegment;
    segPos?: number;
    offset?: number;
    clipOffset?: number;
    textErrorRun?: IRange;
}

interface IRangeInfo {
    elm: HTMLElement;
    node: Node;
    offset: number;
}

type Alt = MergeTree.ProxString<number>;
// TODO: mechanism for intelligent services to publish interfaces like this
interface ITextErrorInfo {
    text: string;
    alternates: Alt[];
    color?: string;
}

function elmOffToSegOff(elmOff: IRangeInfo, span: HTMLSpanElement) {
    if ((elmOff.elm !== span) && (elmOff.elm.parentElement !== span)) {
        console.log("did not hit span");
    }
    let offset = elmOff.offset;
    let prevSib = elmOff.node.previousSibling;
    if ((!prevSib) && (elmOff.elm !== span)) {
        prevSib = elmOff.elm.previousSibling;
    }
    while (prevSib) {
        switch (prevSib.nodeType) {
            case Node.ELEMENT_NODE:
                const innerSpan = prevSib as HTMLSpanElement;
                offset += innerSpan.innerText.length;
                break;
            case Node.TEXT_NODE:
                offset += prevSib.nodeValue.length;
                break;
            default:
                break;
        }
        prevSib = prevSib.previousSibling;
    }
    return offset;
}

const baseURI = typeof document !== "undefined" ? document.location.origin : "";
const underlineStringURL = `url("${baseURI}/public/images/underline.gif") bottom repeat-x`;
const underlinePaulStringURL = `url("${baseURI}/public/images/underline-paul.gif") bottom repeat-x`;
const underlinePaulGrammarStringURL = `url("${baseURI}/public/images/underline-paulgrammar.gif") bottom repeat-x`;
const underlinePaulGoldStringURL = `url("${baseURI}/public/images/underline-gold.gif") bottom repeat-x`;

// global until remove old render
let textErrorRun: IRange;

interface ILineContext {
    lineDiv: ILineDiv;
    contentDiv: HTMLDivElement;
    lineDivHeight: number;
    flowView: FlowView;
    span: ISegSpan;
    deferredAttach?: boolean;
    reRenderList?: ILineDiv[];
    pgMarker: Paragraph.IParagraphMarker;
}

export interface IDocumentContext {
    wordSpacing: number;
    headerFontstr: string;
    headerDivHeight: number;
    fontstr: string;
    defaultLineDivHeight: number;
    pgVspace: number;
    cellVspace: number;
    cellHMargin: number;
    cellTopMargin: number;
    tableVspace: number;
    indentWidthThreshold: number;
    viewportDiv: HTMLDivElement;
}

function buildDocumentContext(viewportDiv: HTMLDivElement) {
    const fontstr = "18px Times";
    viewportDiv.style.font = fontstr;
    const headerFontstr = "22px Times";
    const wordSpacing = domutils.getTextWidth(" ", fontstr);
    const headerDivHeight = 32;
    const computedStyle = window.getComputedStyle(viewportDiv);
    const defaultLineHeight = 1.2;
    const h = parseInt(computedStyle.fontSize, 10);
    const defaultLineDivHeight = Math.round(h * defaultLineHeight);
    const pgVspace = Math.round(h * 0.5);
    const cellVspace = 3;
    const tableVspace = pgVspace;
    const cellTopMargin = 3;
    const cellHMargin = 3;
    const indentWidthThreshold = 600;
    return {
        cellHMargin, cellTopMargin, cellVspace, defaultLineDivHeight, fontstr, headerDivHeight, headerFontstr,
        indentWidthThreshold, pgVspace, tableVspace, viewportDiv, wordSpacing,
    } as IDocumentContext;
}

function showPresence(presenceX: number, lineContext: ILineContext, presenceInfo: ILocalPresenceInfo) {
    if (!presenceInfo.cursor) {
        presenceInfo.cursor = new FlowCursor(lineContext.flowView.viewportDiv, presenceInfo.xformPos);
        presenceInfo.cursor.addPresenceInfo(presenceInfo);
    }
    presenceInfo.cursor.assignToLine(presenceX, lineContext.lineDivHeight, lineContext.lineDiv);
    presenceInfo.fresh = false;
}

function showPositionEndOfLine(lineContext: ILineContext, presenceInfo?: ILocalPresenceInfo) {
    if (lineContext.deferredAttach) {
        addToRerenderList(lineContext);
    } else {
        if (lineContext.span) {
            const cursorBounds = lineContext.span.getBoundingClientRect();
            const lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
            const cursorX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
            if (!presenceInfo) {
                lineContext.flowView.cursor.assignToLine(cursorX, lineContext.lineDivHeight, lineContext.lineDiv);
            } else {
                showPresence(cursorX, lineContext, presenceInfo);
            }
        } else {
            if (lineContext.lineDiv.indentWidth !== undefined) {
                if (!presenceInfo) {
                    lineContext.flowView.cursor.assignToLine(
                        lineContext.lineDiv.indentWidth, lineContext.lineDivHeight, lineContext.lineDiv);
                } else {
                    showPresence(lineContext.lineDiv.indentWidth, lineContext, presenceInfo);
                }
            } else {
                if (!presenceInfo) {
                    lineContext.flowView.cursor.assignToLine(0, lineContext.lineDivHeight, lineContext.lineDiv);
                } else {
                    showPresence(0, lineContext, presenceInfo);
                }
            }
        }
    }
}

function addToRerenderList(lineContext: ILineContext) {
    if (!lineContext.reRenderList) {
        lineContext.reRenderList = [lineContext.lineDiv];
    } else {
        lineContext.reRenderList.push(lineContext.lineDiv);
    }
}

function showPositionInLine(
    lineContext: ILineContext,
    textStartPos: number,
    text: string,
    cursorPos: number,
    presenceInfo?: ILocalPresenceInfo) {
    if (lineContext.deferredAttach) {
        addToRerenderList(lineContext);
    } else {
        let posX: number;
        const lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
        if (cursorPos > textStartPos) {
            const preCursorText = text.substring(0, cursorPos - textStartPos);
            const temp = lineContext.span.innerText;
            lineContext.span.innerText = preCursorText;
            const cursorBounds = lineContext.span.getBoundingClientRect();
            posX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
            // Console.log(`cbounds w ${cursorBounds.width} posX ${posX} ldb ${lineDivBounds.left}`);
            lineContext.span.innerText = temp;
        } else {
            const cursorBounds = lineContext.span.getBoundingClientRect();
            posX = cursorBounds.left - lineDivBounds.left;
            // Console.log(`cbounds whole l ${cursorBounds.left} posX ${posX} ldb ${lineDivBounds.left}`);
        }
        if (!presenceInfo) {
            lineContext.flowView.cursor.assignToLine(posX, lineContext.lineDivHeight, lineContext.lineDiv);
        } else {
            showPresence(posX, lineContext, presenceInfo);
        }
    }
}

function endRenderSegments(marker: MergeTree.Marker) {
    return (marker.hasTileLabel("pg") ||
        ((marker.hasRangeLabel("cell") &&
            (marker.refType & MergeTree.ReferenceType.NestEnd))));
}

const wordHeadingColor = "rgb(47, 84, 150)";

function renderSegmentIntoLine(
    segment: MergeTree.ISegment, segpos: number, refSeq: number,
    clientId: number, start: number, end: number, lineContext: ILineContext) {
    let _start = start;
    let _end = end;

    if (lineContext.lineDiv.linePos === undefined) {
        lineContext.lineDiv.linePos = segpos + _start;
        lineContext.lineDiv.lineEnd = lineContext.lineDiv.linePos;
    }
    if (MergeTree.TextSegment.is(segment)) {
        if (_start < 0) {
            _start = 0;
        }
        if (_end > segment.cachedLength) {
            _end = segment.cachedLength;
        }
        const text = segment.text.substring(_start, _end);
        const textStartPos = segpos + _start;
        const textEndPos = segpos + _end;
        lineContext.span = makeSegSpan(lineContext.flowView, text, segment, _start, segpos);
        if ((lineContext.lineDiv.endPGMarker) && (lineContext.lineDiv.endPGMarker.properties.header)) {
            lineContext.span.style.color = wordHeadingColor;
        }
        lineContext.contentDiv.appendChild(lineContext.span);
        lineContext.lineDiv.lineEnd += text.length;
        if ((lineContext.flowView.cursor.pos >= textStartPos) && (lineContext.flowView.cursor.pos <= textEndPos)) {
            showPositionInLine(lineContext, textStartPos, text, lineContext.flowView.cursor.pos);
        }
        const presenceInfo = lineContext.flowView.presenceInfoInRange(textStartPos, textEndPos);
        if (presenceInfo) {
            showPositionInLine(lineContext, textStartPos, text, presenceInfo.xformPos, presenceInfo);
        }
    } else if (MergeTree.Marker.is(segment)) {
        // Console.log(`marker pos: ${segpos}`);

        if (endRenderSegments(segment)) {
            if (lineContext.flowView.cursor.pos === segpos) {
                showPositionEndOfLine(lineContext);
            } else {
                const presenceInfo = lineContext.flowView.presenceInfoInRange(segpos, segpos);
                if (presenceInfo) {
                    showPositionEndOfLine(lineContext, presenceInfo);
                }
            }
            return false;
        } else {
            lineContext.lineDiv.lineEnd++;
        }
    }
    return true;
}

function findLineDiv(pos: number, flowView: FlowView, dive = false) {
    return flowView.lineDivSelect((elm) => {
        if ((elm.linePos <= pos) && (elm.lineEnd > pos)) {
            return elm;
        }
    }, flowView.viewportDiv, dive);
}

function decorateLineDiv(lineDiv: ILineDiv, lineFontstr: string, lineDivHeight: number) {
    const indentSymbol = lineDiv.indentSymbol;
    let indentFontstr = lineFontstr;
    if (indentSymbol.font) {
        indentFontstr = indentSymbol.font;
    }
    const em = Math.round(domutils.getTextWidth("M", lineFontstr));
    const symbolWidth = domutils.getTextWidth(indentSymbol.text, indentFontstr);
    const symbolDiv = makeContentDiv(
        new ui.Rectangle(
            lineDiv.indentWidth - Math.floor(em + symbolWidth), 0, symbolWidth, lineDivHeight), indentFontstr);
    symbolDiv.innerText = indentSymbol.text;
    lineDiv.appendChild(symbolDiv);
}

function reRenderLine(lineDiv: ILineDiv, flowView: FlowView) {
    if (lineDiv) {
        const outerViewportBounds = ui.Rectangle.fromClientRect(flowView.viewportDiv.getBoundingClientRect());
        const lineDivBounds = lineDiv.getBoundingClientRect();
        const lineDivHeight = lineDivBounds.height;
        domutils.clearSubtree(lineDiv);
        let contentDiv = lineDiv;
        if (lineDiv.indentSymbol) {
            decorateLineDiv(lineDiv, lineDiv.style.font, lineDivHeight);
        }
        if (lineDiv.indentWidth) {
            contentDiv = makeContentDiv(new ui.Rectangle(lineDiv.indentWidth, 0, lineDiv.contentWidth,
                lineDivHeight), lineDiv.style.font);
            lineDiv.appendChild(contentDiv);
        }
        const lineContext = {
            contentDiv,
            flowView,
            lineDiv,
            lineDivHeight,
            markerPos: 0,
            outerViewportBounds,
            pgMarker: undefined,
            span: undefined,
        } as ILineContext;
        const lineEnd = lineDiv.lineEnd;
        let end = lineEnd;
        if (end === lineDiv.linePos) {
            end++;
        }
        flowView.sharedString.walkSegments(renderSegmentIntoLine, lineDiv.linePos, end, lineContext);
        lineDiv.lineEnd = lineEnd;
    }
}

function makeContentDiv(r: ui.Rectangle, lineFontstr) {
    const contentDiv = document.createElement("div");
    contentDiv.style.font = lineFontstr;
    contentDiv.style.whiteSpace = "pre";
    contentDiv.onclick = (e) => {
        const targetDiv = e.target as HTMLDivElement;
        if (targetDiv.lastElementChild) {
            // eslint-disable-next-line max-len
            console.log(`div click at ${e.clientX},${e.clientY} rightmost span with text ${targetDiv.lastElementChild.innerHTML}`);
        }
    };
    r.conformElement(contentDiv);
    return contentDiv;
}

function isInnerCell(cellView: ICellView, layoutInfo: ILayoutContext) {
    return (!layoutInfo.startingPosStack) || (!layoutInfo.startingPosStack.cell) ||
        (layoutInfo.startingPosStack.cell.empty()) ||
        (layoutInfo.startingPosStack.cell.items.length === (layoutInfo.stackIndex + 1));
}

interface ICellView extends Table.Cell {
    viewport: Viewport;
    renderOutput: IRenderOutput;
    borderRect: HTMLElement;
    svgElm: HTMLElement;
}

const svgNS = "http://www.w3.org/2000/svg";

function createSVGWrapper(w: number, h: number) {
    const svg = document.createElementNS(svgNS, "svg") as any as HTMLElement;
    svg.style.zIndex = "-1";
    svg.setAttribute("width", w.toString());
    svg.setAttribute("height", h.toString());
    return svg;
}

function createSVGRect(r: ui.Rectangle) {
    const rect = document.createElementNS(svgNS, "rect") as any as HTMLElement;
    rect.setAttribute("x", r.x.toString());
    rect.setAttribute("y", r.y.toString());
    rect.setAttribute("width", r.width.toString());
    rect.setAttribute("height", r.height.toString());
    rect.setAttribute("stroke", "darkgrey");
    rect.setAttribute("stroke-width", "1px");
    rect.setAttribute("fill", "none");
    return rect;
}

function layoutCell(
    cellView: ICellView, layoutInfo: ILayoutContext,
    leftmost = false, top = false) {
    const cellRect = new ui.Rectangle(0, 0, cellView.specWidth, 0);
    const cellViewportWidth = cellView.specWidth - (2 * layoutInfo.docContext.cellHMargin);
    const cellViewportRect = new ui.Rectangle(layoutInfo.docContext.cellHMargin, 0,
        cellViewportWidth, 0);
    const cellDiv = document.createElement("div");
    cellView.div = cellDiv;
    cellRect.conformElementOpenHeight(cellDiv);
    const transferDeferredHeight = false;

    cellView.viewport = new Viewport(layoutInfo.viewport.remainingHeight(),
        document.createElement("div"), cellViewportWidth);
    cellViewportRect.conformElementOpenHeight(cellView.viewport.div);
    cellDiv.appendChild(cellView.viewport.div);
    cellView.viewport.vskip(layoutInfo.docContext.cellTopMargin);

    const cellLayoutInfo = {
        deferredAttach: true,
        docContext: layoutInfo.docContext,
        endMarker: cellView.endMarker,
        flowView: layoutInfo.flowView,
        requestedPosition: layoutInfo.requestedPosition,
        stackIndex: layoutInfo.stackIndex,
        startingPosStack: layoutInfo.startingPosStack,
        viewport: cellView.viewport,
    } as ILayoutContext;
    // TODO: deferred height calculation for starting in middle of box
    if (isInnerCell(cellView, layoutInfo)) {
        const cellPos = getPosition(layoutInfo.flowView.sharedString, cellView.marker);
        cellLayoutInfo.startPos = cellPos + cellView.marker.cachedLength;
    } else {
        const nextTable = layoutInfo.startingPosStack.table.items[layoutInfo.stackIndex + 1];
        cellLayoutInfo.startPos = getPosition(layoutInfo.flowView.sharedString, nextTable as MergeTree.Marker);
        cellLayoutInfo.stackIndex = layoutInfo.stackIndex + 1;
    }
    if (!cellView.emptyCell) {
        cellView.renderOutput = renderFlow(cellLayoutInfo);
        if (cellView.additionalCellMarkers) {
            for (const cellMarker of cellView.additionalCellMarkers) {
                cellLayoutInfo.endMarker = cellMarker.cell.endMarker;
                const cellPos = getPosition(layoutInfo.flowView.sharedString, cellMarker);
                cellLayoutInfo.startPos = cellPos + cellMarker.cachedLength;
                const auxRenderOutput = renderFlow(cellLayoutInfo);
                cellView.renderOutput.deferredHeight += auxRenderOutput.deferredHeight;
                cellView.renderOutput.overlayMarkers =
                    cellView.renderOutput.overlayMarkers.concat(auxRenderOutput.overlayMarkers);
                cellView.renderOutput.viewportEndPos = auxRenderOutput.viewportEndPos;
            }
        }
        cellView.viewport.vskip(layoutInfo.docContext.cellVspace);
        if (transferDeferredHeight && (cellView.renderOutput.deferredHeight > 0)) {
            layoutInfo.deferUntilHeight = cellView.renderOutput.deferredHeight;
        }
    } else {
        cellView.viewport.vskip(layoutInfo.docContext.defaultLineDivHeight);
        cellView.viewport.vskip(layoutInfo.docContext.cellVspace);
        cellView.renderOutput = {
            deferredHeight: 0, overlayMarkers: [],
            viewportEndPos: cellLayoutInfo.startPos + 3,
            viewportStartPos: cellLayoutInfo.startPos,
        };
    }
    cellView.renderedHeight = cellLayoutInfo.viewport.getLineTop();
    cellView.svgElm = createSVGWrapper(cellRect.width, cellView.renderedHeight);
    cellView.borderRect = createSVGRect(new ui.Rectangle(0, 0, cellRect.width, cellView.renderedHeight));
    cellView.svgElm.appendChild(cellView.borderRect);
    cellView.div.appendChild(cellView.svgElm);
    if (cellLayoutInfo.reRenderList) {
        if (!layoutInfo.reRenderList) {
            layoutInfo.reRenderList = [];
        }
        for (const lineDiv of cellLayoutInfo.reRenderList) {
            layoutInfo.reRenderList.push(lineDiv);
        }
    }
}

function renderTable(
    table: Table.ITableMarker,
    docContext: IDocumentContext,
    layoutInfo: ILayoutContext,
) {
    const flowView = layoutInfo.flowView;
    const sharedString = flowView.sharedString;
    const tablePos = sharedString.getPosition(table);
    let tableView = table.table;
    if (!tableView) {
        tableView = Table.parseTable(table, tablePos, flowView.sharedString, makeFontInfo(docContext));
    }
    if (!tableView) {
        return;
    }
    // Let docContext = buildDocumentContext(viewportDiv);
    const viewportWidth = parseInt(layoutInfo.viewport.div.style.width, 10);

    const tableWidth = Math.floor(tableView.contentPct * viewportWidth);
    tableView.updateWidth(tableWidth);
    const tableIndent = Math.floor(tableView.indentPct * viewportWidth);
    let startRow: Table.Row;
    let startCell: ICellView;

    if (layoutInfo.startingPosStack) {
        if (layoutInfo.startingPosStack.row &&
            (layoutInfo.startingPosStack.row.items.length > layoutInfo.stackIndex)) {
            const startRowMarker = layoutInfo.startingPosStack.row.items[layoutInfo.stackIndex] as Table.IRowMarker;
            startRow = startRowMarker.row;
        }
        if (layoutInfo.startingPosStack.cell &&
            (layoutInfo.startingPosStack.cell.items.length > layoutInfo.stackIndex)) {
            const startCellMarker = layoutInfo.startingPosStack.cell.items[layoutInfo.stackIndex] as Table.ICellMarker;
            startCell = startCellMarker.cell as ICellView;
        }
    }

    let foundStartRow = (startRow === undefined);
    let tableHeight = 0;
    let deferredHeight = 0;
    let firstRendered = true;
    let prevRenderedRow: Table.Row;
    let prevCellCount;
    let topRow = (layoutInfo.startingPosStack !== undefined) && (layoutInfo.stackIndex === 0);
    for (let rowIndex = 0, rowCount = tableView.rows.length; rowIndex < rowCount; rowIndex++) {
        let cellCount = 0;
        const rowView = tableView.rows[rowIndex];
        let rowHeight = 0;
        if (startRow === rowView) {
            foundStartRow = true;
        }
        const renderRow = (deferredHeight >= layoutInfo.deferUntilHeight) &&
            foundStartRow && (!Table.rowIsMoribund(rowView.rowMarker));
        let rowDiv: IRowDiv;
        if (renderRow) {
            const y = layoutInfo.viewport.getLineTop();
            const rowRect = new ui.Rectangle(tableIndent, y, tableWidth, 0);
            rowDiv = document.createElement("div") as IRowDiv;
            rowDiv.rowView = rowView;
            rowRect.conformElementOpenHeight(rowDiv);
            if (topRow && startCell) {
                layoutCell(
                    startCell,
                    layoutInfo,
                    startCell === rowView.cells[0],
                    firstRendered);
                deferredHeight += startCell.renderOutput.deferredHeight;
                rowHeight = startCell.renderedHeight;
                cellCount++;
            }
        }
        let cellX = 0;
        for (let cellIndex = 0, cellsLen = rowView.cells.length; cellIndex < cellsLen; cellIndex++) {
            const cell = rowView.cells[cellIndex] as ICellView;
            if ((!topRow || (cell !== startCell)) && (!Table.cellIsMoribund(cell.marker))) {
                let noCellAbove = false;
                if (prevRenderedRow) {
                    if (prevCellCount <= cellIndex) {
                        noCellAbove = true;
                    }
                }
                layoutCell(cell, layoutInfo,
                    cell === rowView.cells[0],
                    firstRendered || noCellAbove);
                cellCount++;
                if (rowHeight < cell.renderedHeight) {
                    rowHeight = cell.renderedHeight;
                }
                deferredHeight += cell.renderOutput.deferredHeight;
                if (renderRow) {
                    cell.viewport.div.style.height = `${cell.renderedHeight}px`;
                    cell.div.style.height = `${cell.renderedHeight}px`;
                    cell.div.style.left = `${cellX}px`;
                    rowDiv.appendChild(cell.div);
                }
                cellX += (cell.specWidth - 1);
            }
        }
        firstRendered = false;
        if (renderRow) {
            const heightVal = `${rowHeight}px`;
            let adjustRowWidth = 0;
            for (let cellIndex = 0, cellsLen = rowView.cells.length; cellIndex < cellsLen; cellIndex++) {
                const cell = rowView.cells[cellIndex] as ICellView;
                if (cell.div) {
                    cell.div.style.height = heightVal;
                    cell.svgElm.setAttribute("height", heightVal);
                    cell.borderRect.setAttribute("height", heightVal);
                } else {
                    adjustRowWidth += tableView.logicalColumns[cellIndex].width;
                }
            }
            if (rowView.cells.length < tableView.logicalColumns.length) {
                for (let col = rowView.cells.length; col < tableView.logicalColumns.length; col++) {
                    adjustRowWidth += tableView.logicalColumns[col].width;
                }
            }
            let heightAdjust = 0;
            if (!firstRendered) {
                heightAdjust = 1;
            }
            tableHeight += (rowHeight - heightAdjust);
            layoutInfo.viewport.commitLineDiv(rowDiv, rowHeight - heightAdjust);
            rowDiv.style.height = heightVal;
            if (adjustRowWidth) {
                rowDiv.style.width = `${tableWidth - adjustRowWidth}px`;
            }
            rowDiv.linePos = rowView.pos;
            rowDiv.lineEnd = rowView.endPos;
            prevRenderedRow = rowView;
            prevCellCount = cellCount;
            layoutInfo.viewport.div.appendChild(rowDiv);
        }
        if (topRow) {
            topRow = false;
            layoutInfo.startingPosStack = undefined;
        }
    }
    if (layoutInfo.reRenderList) {
        for (const lineDiv of layoutInfo.reRenderList) {
            reRenderLine(lineDiv, flowView);
        }
        layoutInfo.reRenderList = undefined;
    }
    tableView.deferredHeight = deferredHeight;
    tableView.renderedHeight = tableHeight;
}

function showCell(pos: number, flowView: FlowView) {
    const startingPosStack = flowView.sharedString.getStackContext(pos, ["cell"]);
    if (startingPosStack.cell && (!startingPosStack.cell.empty())) {
        const cellMarker = startingPosStack.cell.top() as Table.ICellMarker;
        const start = getPosition(flowView.sharedString, cellMarker);
        const endMarker = cellMarker.cell.endMarker;
        const end = getPosition(flowView.sharedString, endMarker) + 1;
        // eslint-disable-next-line max-len
        console.log(`cell ${cellMarker.getId()} seq ${cellMarker.seq} clid ${cellMarker.clientId} at [${start},${end})`);
        console.log(`cell contents: ${flowView.sharedString.getTextRangeWithMarkers(start, end)}`);
    }
}

function showTable(pos: number, flowView: FlowView) {
    const startingPosStack = flowView.sharedString.getStackContext(pos, ["table"]);
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        const tableMarker = startingPosStack.table.top() as Table.ITableMarker;
        const start = getPosition(flowView.sharedString, tableMarker);
        const endMarker = tableMarker.table.endTableMarker;
        const end = getPosition(flowView.sharedString, endMarker) + 1;
        console.log(`table ${tableMarker.getId()} at [${start},${end})`);
        console.log(`table contents: ${flowView.sharedString.getTextRangeWithMarkers(start, end)}`);
    }
}

function renderTree(
    viewportDiv: HTMLDivElement, requestedPosition: number, flowView: FlowView) {
    const docContext = buildDocumentContext(viewportDiv);
    flowView.lastDocContext = docContext;
    const outerViewportHeight = parseInt(viewportDiv.style.height, 10);
    const outerViewportWidth = parseInt(viewportDiv.style.width, 10);
    const outerViewport = new Viewport(outerViewportHeight, viewportDiv, outerViewportWidth);
    const startingPosStack = flowView.sharedString.getStackContext(requestedPosition, ["table", "cell", "row"]);
    const layoutContext = {
        docContext,
        flowView,
        requestedPosition,
        viewport: outerViewport,
    } as ILayoutContext;
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        const outerTable = startingPosStack.table.items[0];
        const outerTablePos = flowView.sharedString.getPosition(outerTable as MergeTree.Marker);
        layoutContext.startPos = outerTablePos;
        layoutContext.stackIndex = 0;
        layoutContext.startingPosStack = startingPosStack;
    } else {
        const previousTileInfo = findTile(flowView.sharedString, requestedPosition, "pg", true);
        if (previousTileInfo) {
            layoutContext.startPos = previousTileInfo.pos + 1;
        } else {
            layoutContext.startPos = 0;
        }
    }
    return renderFlow(layoutContext);
}

function gatherOverlayLayer(
    segment: MergeTree.ISegment,
    segpos: number,
    refSeq: number,
    clientId: number,
    start: number,
    end: number,
    context: IOverlayMarker[]) {
    if (MergeTree.Marker.is(segment)) {
        if ((segment.refType === MergeTree.ReferenceType.Simple) &&
            (segment.hasSimpleType("inkOverlay"))) {
            context.push({ id: segment.getId(), position: segpos });
        }
    }

    return true;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IViewportDiv extends HTMLDivElement {
}

function closestNorth(lineDivs: ILineDiv[], y: number) {
    let best = -1;
    let lo = 0;
    let hi = lineDivs.length - 1;
    while (lo <= hi) {
        let bestBounds: ClientRect;
        const mid = lo + Math.floor((hi - lo) / 2);
        const lineDiv = lineDivs[mid];
        const bounds = lineDiv.getBoundingClientRect();
        if (bounds.bottom <= y) {
            if (!bestBounds || (best < 0) || (bestBounds.bottom < bounds.bottom)) {
                best = mid;
                bestBounds = bounds;
            }
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

function closestSouth(lineDivs: ILineDiv[], y: number) {
    let best = -1;
    let lo = 0;
    let hi = lineDivs.length - 1;
    while (lo <= hi) {
        let bestBounds: ClientRect;
        const mid = lo + Math.floor((hi - lo) / 2);
        const lineDiv = lineDivs[mid];
        const bounds = lineDiv.getBoundingClientRect();
        if (bounds.bottom >= y) {
            if (!bestBounds || (best < 0) || (bestBounds.bottom > bounds.bottom)) {
                best = mid;
                bestBounds = bounds;
            }
            lo = mid + 1;
        } else {
            hi = mid - 1;
        }
    }
    return best;
}

interface IExcludedRectangle extends ui.Rectangle {
    left: boolean;
    curY: number;
    id?: string;
    // What do the below parameters mean?
    requiresUL?: boolean;
    floatL?: boolean;
}

function makeExcludedRectangle(x: number, y: number, w: number, h: number, id?: string) {
    const r = new ui.Rectangle(x, y, w, h) as IExcludedRectangle;
    r.id = id;
    r.left = true;
    r.curY = 0;
    return r;
}

interface ILineRect {
    e?: IExcludedRectangle;
    h: number;
    w: number;
    x: number;
    y: number;
}

function lineIntersectsRect(y: number, rect: IExcludedRectangle) {
    return (y >= rect.y) && (y <= (rect.y + rect.height));
}

class Viewport {
    // Keep the line divs in order
    private lineDivs: ILineDiv[] = [];
    private lineTop = 0;
    private excludedRects = <IExcludedRectangle[]>[];
    private lineX = 0;
    private readonly inclusions: Map<string, HTMLVideoElement> = new Map<string, HTMLVideoElement>();

    constructor(private maxHeight: number, public div: IViewportDiv, private width: number) {
    }

    // Remove inclusions that are not in the excluded rect list
    public removeInclusions() {
        if (this.div) {
            // TODO: sabroner fix skip issue
            for (let i = 0; i < this.div.children.length; i++) {
                const child = this.div.children.item(i);
                if ((child.classList).contains("preserve")) {
                    if (this.excludedRects.every((e) => e.id !== child.classList[1])) {
                        this.div.removeChild(child);
                    }
                }
            }
        }
    }

    private viewHasInclusion(sha: string): HTMLDivElement {
        for (let i = 0; i < this.div.children.length; i++) {
            const child = this.div.children.item(i);
            if ((child.classList).contains(sha)) {
                return child as HTMLDivElement;
            }
        }

        return null;
    }

    public addInclusion(
        flowView: FlowView,
        marker: MergeTree.Marker,
        x: number, y: number,
        lineHeight: number,
        movingMarker = false) {
        let _x = x;
        let _y = y;
        const irdoc = <IReferenceDoc>marker.properties.ref;
        if (irdoc) {
            const borderSize = 4;
            // For now always an image
            const minX = Math.floor(this.width / 5);
            const w = Math.floor(this.width / 3);
            let h = w;
            if (irdoc.layout) {
                h = Math.floor(w * irdoc.layout.ar);
            }
            if ((_x + w) > this.width) {
                _x -= w;
            }
            if (_x < minX) {
                _x = 0;
            }
            _y += lineHeight;
            const exclu = makeExcludedRectangle(_x, _y, w, h, irdoc.referenceDocId);
            // This logic eventually triggers the marker to get moved based on the requiresUL property
            if (movingMarker) {
                exclu.requiresUL = true;
                if (exclu.x === 0) {
                    exclu.floatL = true;
                }
            }
            let excluDiv = this.viewHasInclusion(irdoc.referenceDocId) as IRefDiv;

            // Move the inclusion
            if (excluDiv) {
                exclu.conformElement(excluDiv);
                excluDiv.exclu = exclu;
                excluDiv.marker = marker;

                this.excludedRects = this.excludedRects.filter((e) => e.id !== exclu.id);
                this.excludedRects.push(exclu);
            } else {
                // Create inclusion for first time

                excluDiv = <IRefDiv>document.createElement("div");
                excluDiv.classList.add("preserve");
                excluDiv.classList.add(irdoc.referenceDocId);
                const innerDiv = document.createElement("div");
                exclu.conformElement(excluDiv);
                excluDiv.style.backgroundColor = "#DDDDDD";
                const toHlt = (e: MouseEvent) => {
                    excluDiv.style.backgroundColor = "green";
                };
                const toOrig = (e: MouseEvent) => {
                    excluDiv.style.backgroundColor = "#DDDDDD";
                };
                excluDiv.onmouseleave = toOrig;
                innerDiv.onmouseenter = toOrig;
                excluDiv.onmouseenter = toHlt;
                innerDiv.onmouseleave = toHlt;

                const excluView = exclu.innerAbs(borderSize);
                excluView.x = borderSize;
                excluView.y = borderSize;
                excluView.conformElement(innerDiv);
                excluDiv.exclu = exclu;
                excluDiv.marker = marker;
                this.div.appendChild(excluDiv);
                excluDiv.appendChild(innerDiv);

                // Excluded Rects is checked when remaking paragraphs in getLineRect
                this.excludedRects.push(exclu);
                if (irdoc.type.name === "image") {
                    const showImage = document.createElement("img");
                    innerDiv.appendChild(showImage);
                    excluView.conformElement(showImage);
                    showImage.style.left = "0px";
                    showImage.style.top = "0px";
                    showImage.src = irdoc.url;
                } else if (irdoc.type.name === "video") {
                    let showVideo: HTMLVideoElement;
                    if (irdoc.referenceDocId && this.inclusions.has(irdoc.referenceDocId)) {
                        showVideo = this.inclusions.get(irdoc.referenceDocId);
                    } else {
                        showVideo = document.createElement("video");
                    }
                    innerDiv.appendChild(showVideo);
                    excluView.conformElement(showVideo);
                    showVideo.style.left = "0px";
                    showVideo.style.top = "0px";
                    showVideo.src = irdoc.url;
                    showVideo.controls = true;
                    showVideo.muted = true;
                    showVideo.load();
                    this.inclusions.set(irdoc.referenceDocId, showVideo);
                }
            }
        }
    }

    private horizIntersect(h: number, rect: IExcludedRectangle) {
        return lineIntersectsRect(this.lineTop, rect) || (lineIntersectsRect(this.lineTop + h, rect));
    }

    public firstLineDiv() {
        if (this.lineDivs.length > 0) {
            return this.lineDivs[0];
        }
    }

    public lastLineDiv() {
        if (this.lineDivs.length > 0) {
            return this.lineDivs[this.lineDivs.length - 1];
        }
    }

    public endOfParagraph(h: number) {
        if (this.lineX !== 0) {
            this.lineX = 0;
            this.lineTop += h;
        }
    }

    public getLineRect(h: number) {
        let x = this.lineX;
        let w = this.width;
        let rectHit = false;
        const y = this.lineTop;
        let e: IExcludedRectangle;
        for (const exclu of this.excludedRects) {
            if ((exclu.x >= x) && this.horizIntersect(h, exclu)) {
                if ((this.lineX === 0) && (exclu.x === 0)) {
                    x = exclu.x + exclu.width;
                    // TODO: assume for now only one rect across
                    this.lineX = 0;
                    w = this.width - x;
                } else {
                    this.lineX = exclu.x + exclu.width;
                    w = exclu.x - x;
                }
                if (exclu.requiresUL) {
                    e = exclu;
                    exclu.requiresUL = false;
                }
                rectHit = true;
                break;
            }
        }
        if (!rectHit) {
            // Hit right edge
            w = this.width - x;
            this.lineX = 0;
        }

        return <ILineRect>{ e, h, w, x, y };
    }

    public currentLineWidth(h?: number) {
        return this.width;
    }

    public vskip(h: number) {
        this.lineTop += h;
    }

    public getLineX() {
        return this.lineX;
    }

    public getLineTop() {
        return this.lineTop;
    }

    public resetTop() {
        // TODO: update rect y to 0 and h to h-(deltaY-y)
        this.lineTop = 0;
        this.lineX = 0;
    }

    public setLineTop(v: number) {
        this.lineTop = v;
    }

    public commitLineDiv(lineDiv: ILineDiv, h: number, eol = true) {
        if (eol) {
            this.lineTop += h;
        }
        this.lineDivs.push(lineDiv);
    }

    public findClosestLineDiv(up = true, y: number) {
        let bestIndex = -1;
        if (up) {
            bestIndex = closestNorth(this.lineDivs, y);
        } else {
            bestIndex = closestSouth(this.lineDivs, y);
        }
        if (bestIndex >= 0) {
            return this.lineDivs[bestIndex];
        }
    }

    public remainingHeight() {
        return this.maxHeight - this.lineTop;
    }
}

interface ILayoutContext {
    containingPGMarker?: Paragraph.IParagraphMarker;
    viewport: Viewport;
    deferredAttach?: boolean;
    reRenderList?: ILineDiv[];
    deferUntilHeight?: number;
    docContext: IDocumentContext;
    requestedPosition?: number;
    startPos: number;
    endMarker?: MergeTree.Marker;
    flowView: FlowView;
    stackIndex?: number;
    startingPosStack?: MergeTree.RangeStackMap;
}

interface IRenderOutput {
    deferredHeight: number;
    overlayMarkers: IOverlayMarker[];
    // TODO: make this an array for tables that extend past bottom of viewport
    viewportStartPos: number;
    viewportEndPos: number;
}

function makeFontInfo(docContext: IDocumentContext): Paragraph.IFontInfo {
    const gtw = (text: string, fontstr: string) => domutils.getTextWidth(text, fontstr);

    const glh = (fontstr: string, lineHeight?: string) => domutils.getLineHeight(fontstr, lineHeight);

    function getFont(pg: Paragraph.IParagraphMarker) {
        if (pg.properties.header) {
            return docContext.headerFontstr;
        } else {
            return docContext.fontstr;
        }
    }

    return {
        getFont,
        getLineHeight: glh,
        getTextWidth: gtw,
    };
}

interface IFlowBreakInfo extends Paragraph.IBreakInfo {
    lineY?: number;
    lineX?: number;
    lineWidth?: number;
    lineHeight?: number;
    movingExclu?: IExcludedRectangle;
}

function breakPGIntoLinesFFVP(
    flowView: FlowView,
    itemInfo: Paragraph.IParagraphItemInfo,
    defaultLineHeight: number,
    viewport: Viewport,
    startOffset = 0) {
    const items = itemInfo.items;
    const savedTop = viewport.getLineTop();
    let lineRect = viewport.getLineRect(itemInfo.maxHeight);
    let breakInfo: IFlowBreakInfo = {
        lineHeight: defaultLineHeight,
        lineWidth: lineRect.w,
        lineX: lineRect.x, lineY: lineRect.y,
        movingExclu: lineRect.e,
        posInPG: 0, startItemIndex: 0,
    };
    const breaks = [breakInfo];
    let posInPG = 0;
    let committedItemsWidth = 0;
    let blockRunWidth = 0;
    let blockRunHeight = 0;
    let blockRunPos = -1;
    let prevIsGlue = true;
    let committedItemsHeight = 0;

    function checkViewportFirstLine(pos: number) {
        if (pos <= startOffset) {
            viewport.resetTop();
            return true;
        }
        return false;
    }

    for (let i = 0, len = items.length; i < len; i++) {
        const item = items[i];
        if (item.type === Paragraph.ParagraphItemType.Block) {
            item.pos = posInPG;
            if (prevIsGlue) {
                blockRunPos = posInPG;
                blockRunWidth = 0;
            }
            if ((committedItemsWidth + item.width) > lineRect.w) {
                if (viewport.getLineX() === 0) {
                    viewport.vskip(committedItemsHeight);
                }
                checkViewportFirstLine(blockRunPos);
                lineRect = viewport.getLineRect(itemInfo.maxHeight);
                breakInfo = {
                    lineHeight: committedItemsHeight,
                    lineWidth: lineRect.w,
                    lineX: lineRect.x, lineY: lineRect.y,
                    movingExclu: lineRect.e,
                    posInPG: blockRunPos, startItemIndex: i,
                };
                breaks.push(breakInfo);
                committedItemsWidth = blockRunWidth;
                committedItemsHeight = blockRunHeight;
            }
            posInPG += item.text.length;
            if (committedItemsWidth > lineRect.w) {
                if (viewport.getLineX() === 0) {
                    viewport.vskip(committedItemsHeight);
                }
                checkViewportFirstLine(posInPG);
                lineRect = viewport.getLineRect(itemInfo.maxHeight);
                breakInfo = {
                    lineHeight: committedItemsHeight,
                    lineWidth: lineRect.w,
                    lineX: lineRect.x, lineY: lineRect.y,
                    movingExclu: lineRect.e,
                    posInPG, startItemIndex: i,
                };
                breaks.push(breakInfo);
                committedItemsWidth = 0;
                committedItemsHeight = 0;
                blockRunHeight = 0;
                blockRunWidth = 0;
                blockRunPos = posInPG;
            } else {
                blockRunWidth += item.width;
                blockRunHeight = Math.max(blockRunHeight,
                    item.height ? item.height : defaultLineHeight);
            }
            prevIsGlue = false;
        } else if (item.type === Paragraph.ParagraphItemType.Glue) {
            posInPG++;
            prevIsGlue = true;
        } else if (item.type === Paragraph.ParagraphItemType.Marker) {
            viewport.addInclusion(flowView, item.segment,
                lineRect.x + committedItemsWidth,
                viewport.getLineTop(), committedItemsHeight);
        }
        committedItemsWidth += item.width;
        if (item.type !== Paragraph.ParagraphItemType.Marker) {
            committedItemsHeight = Math.max(committedItemsHeight,
                item.height ? item.height : defaultLineHeight);
        }
    }
    viewport.endOfParagraph(itemInfo.maxHeight);
    viewport.setLineTop(savedTop);
    return breaks;
}

function renderFlow(layoutContext: ILayoutContext): IRenderOutput {
    const flowView = layoutContext.flowView;
    const sharedString = flowView.sharedString;
    // TODO: for stable viewports cache the geometry and the divs
    // TODO: cache all this pre-amble in style blocks; override with pg properties
    const docContext = layoutContext.docContext;
    let viewportStartPos = -1;

    function makeLineDiv(r: ui.Rectangle, lineFontstr) {
        const lineDiv = makeContentDiv(r, lineFontstr);
        layoutContext.viewport.div.appendChild(lineDiv);
        return lineDiv;
    }

    let currentPos = layoutContext.startPos;
    let curPGMarker: Paragraph.IParagraphMarker;
    let curPGMarkerPos: number;

    // TODO: Should lift into a component-standard layout/render context instead
    //       of using 'services' to smuggle context to components.
    const itemsContext = {
        fontInfo: makeFontInfo(layoutContext.docContext),
    } as Paragraph.IItemsContext;
    if (layoutContext.deferUntilHeight === undefined) {
        layoutContext.deferUntilHeight = 0;
    }
    let deferredHeight = 0;
    const paragraphLexer = new Paragraph.ParagraphLexer({
        markerToken: Paragraph.markerToItems,
        textToken: Paragraph.textTokenToItems,
    }, itemsContext);
    itemsContext.paragraphLexer = paragraphLexer;
    textErrorRun = undefined;

    function renderPG(
        endPGMarker: Paragraph.IParagraphMarker,
        pgStartPos: number,
        indentPct: number,
        indentSymbol: Paragraph.ISymbol,
        contentPct: number) {
        const pgBreaks = <IFlowBreakInfo[]>endPGMarker.cache.breaks;
        let lineDiv: ILineDiv;
        let lineDivHeight = docContext.defaultLineDivHeight;
        let span: ISegSpan;
        let lineWidth: number;
        let lineX = 0;
        let lineY: number;
        let lineFontstr = docContext.fontstr;
        lineDivHeight = docContext.defaultLineDivHeight;
        if (endPGMarker.properties && (endPGMarker.properties.header !== undefined)) {
            // TODO: header levels etc.
            lineDivHeight = docContext.headerDivHeight;
            lineFontstr = docContext.headerFontstr;
        }
        let lineHeight = lineDivHeight;
        for (let breakIndex = 0, len = pgBreaks.length; breakIndex < len; breakIndex++) {
            const breakInfo = pgBreaks[breakIndex];
            lineY = layoutContext.viewport.getLineTop();
            if (endPGMarker.cache.isUniformWidth) {
                lineWidth = layoutContext.viewport.currentLineWidth();
            } else {
                lineWidth = breakInfo.lineWidth;
                lineHeight = breakInfo.lineHeight;
                lineX = breakInfo.lineX;
                lineY = breakInfo.lineY;
            }
            let indentWidth = 0;
            let contentWidth = lineWidth;
            if (indentPct !== 0.0) {
                indentWidth = Math.floor(indentPct * lineWidth);
                if (docContext.indentWidthThreshold >= lineWidth) {
                    const em2 = Math.round(2 * domutils.getTextWidth("M", docContext.fontstr));
                    indentWidth = em2 + indentWidth;
                }
            }
            contentWidth = Math.floor(contentPct * lineWidth) - indentWidth;
            if (contentWidth > lineWidth) {
                console.log(`egregious content width ${contentWidth} bound ${lineWidth}`);
            }

            const lineStart = breakInfo.posInPG + pgStartPos;
            let lineEnd: number;
            if (breakIndex < (len - 1)) {
                lineEnd = pgBreaks[breakIndex + 1].posInPG + pgStartPos;
            } else {
                lineEnd = undefined;
            }
            const lineOK = (layoutContext.deferUntilHeight <= deferredHeight);
            if (lineOK && ((lineEnd === undefined) || (lineEnd > layoutContext.requestedPosition))) {
                lineDiv = makeLineDiv(new ui.Rectangle(lineX, lineY, lineWidth, lineHeight), lineFontstr);
                lineDiv.endPGMarker = endPGMarker;
                lineDiv.breakIndex = breakIndex;
                let contentDiv = lineDiv;
                if (indentWidth > 0) {
                    contentDiv = makeContentDiv(new ui.Rectangle(indentWidth, 0, contentWidth, lineDivHeight),
                        lineFontstr);
                    lineDiv.indentWidth = indentWidth;
                    lineDiv.contentWidth = indentWidth;
                    if (indentSymbol && (breakIndex === 0)) {
                        lineDiv.indentSymbol = indentSymbol;
                        decorateLineDiv(lineDiv, lineFontstr, lineDivHeight);
                    }
                    lineDiv.appendChild(contentDiv);
                }
                const lineContext = {
                    contentDiv, deferredAttach: layoutContext.deferredAttach, flowView: layoutContext.flowView,
                    lineDiv, lineDivHeight, pgMarker: endPGMarker, span,
                } as ILineContext;
                if (viewportStartPos < 0) {
                    viewportStartPos = lineStart;
                }
                sharedString.walkSegments(renderSegmentIntoLine, lineStart, lineEnd, lineContext);
                span = lineContext.span;
                if (lineContext.reRenderList) {
                    if (!layoutContext.reRenderList) {
                        layoutContext.reRenderList = [];
                    }
                    for (const ldiv of lineContext.reRenderList) {
                        layoutContext.reRenderList.push(ldiv);
                    }
                }
                let eol = (lineX + lineWidth) >= layoutContext.viewport.currentLineWidth();
                eol = eol || (lineEnd === undefined);
                layoutContext.viewport.commitLineDiv(lineDiv, lineDivHeight, eol);
            } else {
                deferredHeight += lineDivHeight;
            }

            if (layoutContext.viewport.remainingHeight() < docContext.defaultLineDivHeight) {
                // No more room for lines
                break;
            }
        }
        return lineDiv.lineEnd;
    }

    const fetchLog = false;
    let segoff: ISegmentOffset;
    const totalLength = sharedString.getLength();
    let viewportEndPos = currentPos;
    // TODO: use end of doc marker
    do {
        if (!segoff) {
            segoff = getContainingSegment(flowView.sharedString, currentPos);
        }
        if (fetchLog) {
            console.log(`got segment ${segoff.segment.toString()}`);
        }
        if (!segoff.segment) {
            break;
        }

        const asMarker = MergeTree.Marker.is(segoff.segment)
            ? segoff.segment
            : undefined;

        if (asMarker && asMarker.hasRangeLabel("table")) {
            let tableView: Table.Table;
            if (asMarker.removedSeq === undefined) {
                renderTable(asMarker, docContext, layoutContext);
                tableView = (asMarker as Table.ITableMarker).table;
                deferredHeight += tableView.deferredHeight;
                layoutContext.viewport.vskip(layoutContext.docContext.tableVspace);
            } else {
                tableView = Table.parseTable(asMarker, currentPos, flowView.sharedString,
                    makeFontInfo(layoutContext.docContext));
            }
            const endTablePos = getPosition(layoutContext.flowView.sharedString, tableView.endTableMarker);
            currentPos = endTablePos + 1;
            segoff = undefined;
            // TODO: if reached end of viewport, get pos ranges
        } else {
            if (asMarker) {
                // Empty paragraph
                curPGMarker = segoff.segment as Paragraph.IParagraphMarker;
                if (fetchLog) {
                    console.log("empty pg");
                    if (curPGMarker.itemCache) {
                        console.log(`length items ${curPGMarker.itemCache.items.length}`);
                    }
                }
                curPGMarkerPos = currentPos;
            } else {
                const curTilePos = findTile(flowView.sharedString, currentPos, "pg", false);
                curPGMarker = curTilePos.tile as Paragraph.IParagraphMarker;
                curPGMarkerPos = curTilePos.pos;
            }
            itemsContext.curPGMarker = curPGMarker;
            // TODO: only set this to undefined if text changed
            curPGMarker.listCache = undefined;
            Paragraph.getListCacheInfo(layoutContext.flowView.sharedString, curPGMarker, curPGMarkerPos);
            let indentSymbol: Paragraph.ISymbol;
            const indentPct = Paragraph.getIndentPct(curPGMarker);
            const contentPct = Paragraph.getContentPct(curPGMarker);

            if (curPGMarker.listCache) {
                indentSymbol = Paragraph.getIndentSymbol(curPGMarker);
            }
            if (!curPGMarker.itemCache) {
                itemsContext.itemInfo = { items: [], minWidth: 0 };
                sharedString.walkSegments(Paragraph.segmentToItems, currentPos, curPGMarkerPos + 1, itemsContext);
                curPGMarker.itemCache = itemsContext.itemInfo;
            } else {
                itemsContext.itemInfo = curPGMarker.itemCache;
            }
            let startOffset = 0;
            if (layoutContext.requestedPosition > currentPos) {
                startOffset = layoutContext.requestedPosition - currentPos;
            }
            const breaks = breakPGIntoLinesFFVP(
                layoutContext.flowView,
                itemsContext.itemInfo,
                docContext.defaultLineDivHeight,
                layoutContext.viewport,
                startOffset);
            curPGMarker.cache = { breaks, isUniformWidth: false };
            paragraphLexer.reset();
            // TODO: more accurate end of document reasoning

            if (currentPos < totalLength) {
                const lineEnd = renderPG(curPGMarker, currentPos, indentPct, indentSymbol, contentPct);
                viewportEndPos = lineEnd;
                currentPos = curPGMarkerPos + curPGMarker.cachedLength;

                if (currentPos < totalLength) {
                    segoff = getContainingSegment(flowView.sharedString, currentPos);
                    if (MergeTree.Marker.is(segoff.segment)) {
                        // eslint-disable-next-line max-len
                        if (segoff.segment.hasRangeLabel("cell") && (segoff.segment.refType & MergeTree.ReferenceType.NestEnd)) {
                            break;
                        }
                    }
                } else {
                    break;
                }
                layoutContext.viewport.vskip(docContext.pgVspace);
            } else {
                break;
            }
        }
    } while (layoutContext.viewport.remainingHeight() >= docContext.defaultLineDivHeight);

    // Find overlay annotations

    const overlayMarkers: IOverlayMarker[] = [];
    sharedString.walkSegments(gatherOverlayLayer, viewportStartPos, viewportEndPos, overlayMarkers);

    layoutContext.viewport.removeInclusions();

    return {
        deferredHeight,
        overlayMarkers,
        viewportEndPos,
        viewportStartPos,
    };
}

function makeSegSpan(
    context: FlowView, segText: string, textSegment: MergeTree.TextSegment, offsetFromSegpos: number,
    segpos: number) {
    const span = document.createElement("span") as ISegSpan;
    span.innerText = segText;
    span.seg = textSegment;
    span.segPos = segpos;
    let textErr = false;
    if (textSegment.properties) {
        // eslint-disable-next-line no-restricted-syntax
        for (const key in textSegment.properties) {
            if (key === "textError") {
                textErr = true;
                if (textErrorRun === undefined) {
                    textErrorRun = {
                        end: segpos + offsetFromSegpos + segText.length,
                        start: segpos + offsetFromSegpos,
                    };
                } else {
                    textErrorRun.end += segText.length;
                }
                const textErrorInfo = textSegment.properties[key] as ITextErrorInfo;
                span.textErrorRun = textErrorRun;
                if (textErrorInfo.color === "paul") {
                    span.style.background = underlinePaulStringURL;
                } else if (textErrorInfo.color === "paulgreen") {
                    span.style.background = underlinePaulGrammarStringURL;
                } else if (textErrorInfo.color === "paulgolden") {
                    span.style.background = underlinePaulGoldStringURL;
                } else {
                    span.style.background = underlineStringURL;
                }
            } else {
                span.style[key] = textSegment.properties[key];
            }
        }
    }
    if (!textErr) {
        textErrorRun = undefined;
    }
    if (offsetFromSegpos > 0) {
        span.offset = offsetFromSegpos;
    }
    return span;
}

function pointerToElementOffsetWebkit(x: number, y: number): IRangeInfo {
    const range = document.caretRangeFromPoint(x, y);
    if (range) {
        const result = {
            elm: range.startContainer.parentElement,
            node: range.startContainer,
            offset: range.startOffset,
        };
        range.detach();
        return result;
    }
}

const Nope = -1;

const presenceColors = ["darkgreen", "sienna", "olive", "purple", "lightseagreen"];

class FlowCursor extends Cursor {
    private presenceDiv: HTMLDivElement;
    public presenceInfo: ILocalPresenceInfo;
    public presenceInfoUpdated = true;

    constructor(public viewportDiv: HTMLDivElement, public pos = 0) {
        super(viewportDiv, pos);
    }

    public hide(hidePresenceDiv: boolean = false) {
        this.editSpan.style.visibility = "hidden";

        if (hidePresenceDiv && this.presenceInfo) {
            this.presenceDiv.style.visibility = "hidden";
        }
    }

    public show() {
        if (!this.enabled) {
            return;
        }

        this.editSpan.style.backgroundColor = this.bgColor;
        this.editSpan.style.visibility = "visible";

        if (this.presenceInfo) {
            this.presenceDiv.style.visibility = "visible";
        }
    }

    /**
     * Refreshes the cursor
     * It will enable / disable the cursor depending on if the client is connected
     */
    public refresh() {
        if (this.presenceInfo) {
            if (this.presenceInfo.shouldShowCursor()) {
                this.enable();
            } else {
                this.disable();
            }
        }
    }
    public addPresenceInfo(presenceInfo: ILocalPresenceInfo) {
        // For now, color
        this.bgColor = presenceInfo.presenceColor;
        this.presenceInfo = presenceInfo;
        this.makePresenceDiv();

        this.refresh();

        if (this.enabled) {
            this.show();
        } else {
            this.hide(true);
        }
    }

    private setPresenceDivEvents(div: HTMLDivElement) {
        this.presenceDiv.onmouseenter = (e) => {
            div.innerText = (this.presenceInfo.user as IFlowViewUser).name;
        };
        this.presenceDiv.onmouseleave = (e) => {
            div.innerText = this.getUserDisplayString(this.presenceInfo.user as IFlowViewUser);
        };
    }

    private makePresenceDiv() {
        this.presenceDiv = document.createElement("div");
        // TODO callback to go from UID to display information
        this.presenceDiv.innerText = this.getUserDisplayString(this.presenceInfo.user as IFlowViewUser);
        this.presenceDiv.style.zIndex = "1";
        this.presenceDiv.style.position = "absolute";
        this.presenceDiv.style.color = "white";
        this.presenceDiv.style.backgroundColor = this.bgColor;
        this.presenceDiv.style.font = "10px Arial";
        this.presenceDiv.style.border = `2px solid ${this.bgColor}`;
        this.presenceDiv.style.borderTopRightRadius = "1em";
        this.setPresenceDivEvents(this.presenceDiv);
        // Go underneath local cursor
        this.editSpan.style.zIndex = "1";
    }

    public onLine(pos: number) {
        const lineDiv = this.lineDiv();
        return lineDiv && (pos >= lineDiv.linePos) && (pos < lineDiv.lineEnd);
    }

    public lineDiv() {
        return this.editSpan.parentElement as ILineDiv;
    }

    public updateView(flowView: FlowView) {
        if (this.getSelection()) {
            flowView.render(flowView.topChar, true);
        } else {
            const lineDiv = this.lineDiv();
            if (lineDiv && (lineDiv.linePos <= this.pos) && (lineDiv.lineEnd > this.pos)) {
                reRenderLine(lineDiv, flowView);
            } else {
                const foundLineDiv = findLineDiv(this.pos, flowView, true);
                if (foundLineDiv) {
                    reRenderLine(foundLineDiv, flowView);
                } else {
                    flowView.render(flowView.topChar, true);
                }
            }
        }
    }

    public assignToLine(x: number, h: number, lineDiv: HTMLDivElement, show = true) {
        this.editSpan.style.left = `${x}px`;
        this.editSpan.style.height = `${h}px`;
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        lineDiv.appendChild(this.editSpan);
        if (this.presenceInfo) {
            const bannerHeight = 16;
            const halfBannerHeight = bannerHeight / 2;
            this.presenceDiv.style.left = `${x}px`;
            this.presenceDiv.style.height = `${bannerHeight}px`;
            this.presenceDiv.style.top = `-${halfBannerHeight}px`;
            if (this.presenceDiv.parentElement) {
                this.presenceDiv.parentElement.removeChild(this.presenceDiv);
            }
            lineDiv.appendChild(this.presenceDiv);
            this.setPresenceDivEvents(this.presenceDiv);
        }
        if ((!this.presenceInfo) || (this.presenceInfo.fresh)) {
            if (this.presenceInfo) {
                this.editSpan.style.opacity = "0.6";
                this.presenceDiv.style.opacity = "0.6";
            }
            if (show) {
                this.show();
                this.blinkCursor();
            } else {
                this.hide();
            }
        }
    }

    protected blinkCursor() {
        if (this.presenceDiv) {
            // This.editSpan.classList.add("brieflyBlinking");
            // this.presenceDiv.classList.add("brieflyBlinking");
        } else {
            super.blinkCursor();
        }
    }

    private getUserDisplayString(user: IFlowViewUser): string {
        // TODO - callback to client code to provide mapping from user -> display
        // this would allow a user ID to be put on the wire which can then be mapped
        // back to an email, name, etc...
        const name = user.name;
        const nameParts = name.split(" ");
        let initials = "";
        for (const part of nameParts) {
            initials += part.substring(0, 1);
        }
        return initials;
    }
}

interface IRemotePresenceBase {
    type: string;
}
interface ILocalPresenceInfo {
    localRef?: MergeTree.LocalReference;
    markLocalRef?: MergeTree.LocalReference;
    xformPos?: number;
    markXformPos?: number;
    clientId: string;
    presenceColor: string;
    user: IUser;
    cursor?: FlowCursor;
    fresh: boolean;
    shouldShowCursor: () => boolean;
}

interface IRemotePresenceInfo extends IRemotePresenceBase {
    type: "selection";
    origPos: number;
    origMark: number;
    refseq: number;
}

interface ISegmentOffset {
    segment: MergeTree.ISegment;
    offset: number;
}

interface IWordRange {
    wordStart: number;
    wordEnd: number;
}

function getCurrentWord(pos: number, sharedString: Sequence.SharedString) {
    let wordStart = -1;
    let wordEnd = -1;

    function maximalWord(textSegment: MergeTree.TextSegment, offset: number) {
        let segWordStart = offset;
        let segWordEnd = offset;

        let epos = offset;
        const nonWord = /\W/;
        while (epos < textSegment.text.length) {
            if (nonWord.test(textSegment.text.charAt(epos))) {
                break;
            }
            epos++;
        }
        segWordEnd = epos;
        if (segWordEnd > offset) {
            let spos = offset - 1;
            while (spos >= 0) {
                if (nonWord.test(textSegment.text.charAt(spos))) {
                    break;
                }
                spos--;
            }
            segWordStart = spos + 1;
        }
        return { wordStart: segWordStart, wordEnd: segWordEnd } as IWordRange;
    }

    const segoff = sharedString.getContainingSegment(pos);
    if (segoff.segment && (MergeTree.TextSegment.is(segoff.segment))) {
        const maxWord = maximalWord(segoff.segment, segoff.offset);
        if (maxWord.wordStart < maxWord.wordEnd) {
            const segStartPos = pos - segoff.offset;
            wordStart = segStartPos + maxWord.wordStart;
            wordEnd = segStartPos + maxWord.wordEnd;
            if (maxWord.wordStart === 0) {
                // Expand word backward
                let leftPos = segStartPos;
                while (leftPos > 0 && leftPos === wordStart) {
                    const leftSeg = sharedString.getContainingSegment(leftPos - 1).segment;
                    if (MergeTree.TextSegment.is(leftSeg)) {
                        const mword = maximalWord(leftSeg, leftSeg.cachedLength - 1);
                        wordStart -= mword.wordEnd - mword.wordStart;
                    }
                    leftPos -= leftSeg.cachedLength;
                }
            }
            if (maxWord.wordEnd === segoff.segment.text.length) {
                // Expand word forward
                let rightPos = segStartPos + segoff.segment.cachedLength;
                while (rightPos < sharedString.getLength() && rightPos === wordEnd) {
                    const rightSeg = sharedString.getContainingSegment(rightPos).segment;
                    if (MergeTree.TextSegment.is(rightSeg)) {
                        const mword = maximalWord(rightSeg, 0);
                        wordEnd += mword.wordEnd;
                    }
                    rightPos += rightSeg.cachedLength;
                }
            }
        }
        if (wordStart >= 0) {
            return { wordStart, wordEnd } as IWordRange;
        }
    }
}

function getLocalRefPos(sharedString: Sequence.SharedString, localRef: MergeTree.LocalReference) {
    return sharedString.getPosition(localRef.segment) + localRef.offset;
}

function getContainingSegment(sharedString: Sequence.SharedString, pos: number): ISegmentOffset {
    return sharedString.getContainingSegment(pos);
}

function findTile(sharedString: Sequence.SharedString, startPos: number, tileType: string, preceding: boolean) {
    return sharedString.findTile(startPos, tileType, preceding);
}

function getPosition(sharedString: Sequence.SharedString, segment: MergeTree.ISegment) {
    return sharedString.getPosition(segment);
}

function preventD(e: Event) {
    e.returnValue = false;
    e.preventDefault();
    return false;
}

interface IReferenceDocType {
    name: string;
}

interface IRefLayoutSpec {
    inline?: boolean;
    minWidth?: number;
    minHeight?: number;
    reqWidth?: number;
    reqHeight?: number;
    heightPct?: number;
    heightLines?: number;
    ar?: number;
    dx?: number;
    dy?: number;
}

interface IReferenceDoc {
    type: IReferenceDocType;
    referenceDocId?: string;
    url: string;
    layout?: IRefLayoutSpec;
}

const presenceSignalType = "presence";

export class FlowView extends ui.Component {
    public static docStartPosition = 0;
    public timeToImpression: number;
    public timeToEdit: number;
    public viewportStartPos: number;
    public viewportEndPos: number;
    public childCursor: IViewCursor;
    public viewportDiv: HTMLDivElement;
    public viewportRect: ui.Rectangle;
    public ticking = false;
    public wheelTicking = false;
    public topChar = -1;
    public cursor: FlowCursor;
    public presenceVector: Map<string, ILocalPresenceInfo> = new Map();
    public curPG: MergeTree.Marker;
    public lastDocContext: IDocumentContext;
    public focusChild: FlowView;
    public parentFlow: FlowView;
    public keypressHandler: (e: KeyboardEvent) => void;
    public keydownHandler: (e: KeyboardEvent) => void;

    public srcLanguage = "en";

    private lastVerticalX = -1;
    private pendingRender = false;
    private activeCommandBox: boolean;
    private formatRegister: MergeTree.PropertySet;

    // A list of Marker segments modified by the most recently processed op.  (Reset on each
    // sequenceDelta event.)  Used by 'updatePgInfo()' to determine if table information
    // may have been invalidated.
    private modifiedMarkers = [];

    private readonly undoRedoManager: UndoRedoStackManager;

    private showCommandBox: () => void = () => {};

    constructor(
        element: HTMLDivElement,
        public readonly runtime: IFluidDataStoreRuntime,
        public sharedString: Sequence.SharedString,
    ) {
        super(element);

        // Enable element to receive focus (see Example 1):
        // https://www.w3.org/WAI/GL/WCAG20/WD-WCAG20-TECHS/SCR29.html
        this.element.tabIndex = 0;

        // Disable visible focus outline when FlowView is focused.
        this.element.style.outline = "0px solid transparent";

        // Clip children of FlowView to the bounds of the FlowView's root div.
        this.element.style.overflow = "hidden";

        this.viewportDiv = document.createElement("div");
        this.element.appendChild(this.viewportDiv);

        this.undoRedoManager = new UndoRedoStackManager();
        const sequenceHandler = new SharedSegmentSequenceUndoRedoHandler(this.undoRedoManager);
        sequenceHandler.attachSequence(sharedString);

        sharedString.on("sequenceDelta", (event, target) => {
            // For each incoming delta, save any referenced Marker segments.
            // (see comments at 'modifiedMarkers' decl for more info.)
            this.modifiedMarkers = event
                .ranges
                .filter((range) => MergeTree.Marker.is(range.segment));

            this.handleSharedStringDelta(event, target);
        });

        // Refresh cursors when clients join or leave
        runtime.getQuorum().on("addMember", () => {
            this.updatePresenceCursors();
            this.broadcastPresence();
        });
        runtime.getQuorum().on("removeMember", () => {
            this.updatePresenceCursors();
        });
        runtime.getAudience().on("addMember", () => {
            this.updatePresenceCursors();
            this.broadcastPresence();
        });
        runtime.getAudience().on("removeMember", () => {
            this.updatePresenceCursors();
        });

        this.cursor = new FlowCursor(this.viewportDiv);

        // Not great construction -- this slack wrapper div lets the command box use the flow-view div above act as
        // its containing box while remaining out of the way for hit testing, etc.  Once FlowView is also React, it
        // should be easier to coordinate the layout.
        const commandBoxDiv = document.createElement("div");
        commandBoxDiv.classList.add("command-box-wrapper");
        this.element.appendChild(commandBoxDiv);

        const registerShowListener = (callback: () => void) => {
            this.showCommandBox = callback;
        };
        const onCommandBoxDismiss = () => {
            this.activeCommandBox = false;
        };
        const commandBoxCommands = [
            {
                friendlyName: "copy format",
                exec: () => {
                    this.copyFormat();
                },
            },
            {
                friendlyName: "paint format",
                exec: () => {
                    this.paintFormat();
                },
            },
            {
                friendlyName: "blockquote",
                exec: () => {
                    this.toggleBlockquote();
                },
            },
            {
                friendlyName: "bold",
                exec: () => {
                    this.toggleBold();
                },
            },
            {
                friendlyName: "red",
                exec: () => {
                    this.setColor("red");
                },
            },
            {
                friendlyName: "green",
                exec: () => {
                    this.setColor("green");
                },
            },
            {
                friendlyName: "gold",
                exec: () => {
                    this.setColor("gold");
                },
            },
            {
                friendlyName: "pink",
                exec: () => {
                    this.setColor("pink");
                },
            },
            {
                friendlyName: "Courier font",
                exec: () => {
                    this.setFont("courier new", "18px");
                },
            },
            {
                friendlyName: "Tahoma",
                exec: () => {
                    this.setFont("tahoma", "18px");
                },
            },
            {
                friendlyName: "Heading 2",
                exec: () => {
                    this.setPGProps({ header: true });
                },
            },
            {
                friendlyName: "Normal",
                exec: () => {
                    this.setPGProps({ header: null });
                },
            },
            {
                friendlyName: "Georgia font",
                exec: () => {
                    this.setFont("georgia", "18px");
                },
            },
            {
                friendlyName: "sans font",
                exec: () => {
                    this.setFont("sans-serif", "18px");
                },
            },
            {
                friendlyName: "cursive font",
                exec: () => {
                    this.setFont("cursive", "18px");
                },
            },
            {
                friendlyName: "italic",
                exec: () => {
                    this.toggleItalic();
                },
            },
            {
                friendlyName: "list ... 1.)",
                exec: () => {
                    this.setList();
                },
            },
            {
                friendlyName: "list ... \u2022",
                exec: () => {
                    this.setList(1);
                },
            },
            {
                friendlyName: "cell info",
                exec: () => {
                    showCell(this.cursor.pos, this);
                },
            },
            {
                friendlyName: "table info",
                exec: () => {
                    showTable(this.cursor.pos, this);
                },
            },
            {
                friendlyName: "table summary",
                exec: () => {
                    this.tableSummary();
                },
            },
            {
                friendlyName: "table test",
                exec: () => {
                    this.updatePGInfo(this.cursor.pos - 1);
                    Table.createTable(this.cursor.pos, this.sharedString, this.runtime.clientId);
                    this.hostSearchMenu(this.cursor.pos);
                },
            },
            {
                friendlyName: "insert column",
                exec: () => {
                    this.insertColumn();
                },
            },
            {
                friendlyName: "insert row",
                exec: () => {
                    this.insertRow();
                },
            },
            {
                friendlyName: "delete row",
                exec: () => {
                    this.deleteRow();
                },
            },
            {
                friendlyName: "delete column",
                exec: () => {
                    this.deleteColumn();
                },
            },
            {
                friendlyName: "underline",
                exec: () => {
                    this.toggleUnderline();
                },
            },
        ];

        const commandBoxElement = React.createElement(
            CommandBox,
            {
                registerShowListener,
                dismissCallback: onCommandBoxDismiss,
                commands: commandBoxCommands,
            },
        );

        ReactDOM.render(
            commandBoxElement,
            commandBoxDiv,
        );
    }

    private updatePresenceCursors() {
        for (const presenceInfo of this.presenceVector.values()) {
            if (presenceInfo && presenceInfo.cursor) {
                presenceInfo.cursor.refresh();
            }
        }
    }

    public presenceInfoInRange(start: number, end: number) {
        for (const presenceInfo of this.presenceVector.values()) {
            if (presenceInfo) {
                if ((start <= presenceInfo.xformPos) && (presenceInfo.xformPos <= end)) {
                    return presenceInfo;
                }
            }
        }
    }

    private updatePresencePosition(localPresenceInfo: ILocalPresenceInfo) {
        if (localPresenceInfo) {
            localPresenceInfo.xformPos = getLocalRefPos(this.sharedString, localPresenceInfo.localRef);
            if (localPresenceInfo.markLocalRef) {
                localPresenceInfo.markXformPos = getLocalRefPos(this.sharedString, localPresenceInfo.markLocalRef);
            } else {
                localPresenceInfo.markXformPos = localPresenceInfo.xformPos;
            }
        }
    }

    private updatePresencePositions() {
        for (const presenceInfo of this.presenceVector.values()) {
            this.updatePresencePosition(presenceInfo);
        }
    }

    private updatePresenceVector(localPresenceInfo: ILocalPresenceInfo) {
        this.updatePresencePosition(localPresenceInfo);
        const presentPresence = this.presenceVector[localPresenceInfo.clientId];
        let tempXformPos = -1;
        let tempMarkXformPos = -2;

        if (presentPresence) {
            if (presentPresence.cursor) {
                localPresenceInfo.cursor = presentPresence.cursor;
                localPresenceInfo.cursor.presenceInfo = localPresenceInfo;
                localPresenceInfo.cursor.presenceInfoUpdated = true;
            }
            if (presentPresence.markLocalRef) {
                this.sharedString.removeLocalReference(presentPresence.markLocalRef);
            }
            this.sharedString.removeLocalReference(presentPresence.localRef);
            tempXformPos = presentPresence.xformPos;
            tempMarkXformPos = presentPresence.markXformPos;
        }
        this.presenceVector.set(localPresenceInfo.clientId, localPresenceInfo);
        if ((localPresenceInfo.xformPos !== tempXformPos) ||
            (localPresenceInfo.markXformPos !== tempMarkXformPos)) {
            const sameLine = localPresenceInfo.cursor &&
                localPresenceInfo.cursor.onLine(tempXformPos) &&
                localPresenceInfo.cursor.onLine(tempMarkXformPos) &&
                localPresenceInfo.cursor.onLine(localPresenceInfo.xformPos) &&
                localPresenceInfo.cursor.onLine(localPresenceInfo.markXformPos);
            this.presenceQueueRender(localPresenceInfo, sameLine);
        }
    }

    public firstLineDiv() {
        return this.lineDivSelect((elm) => (elm), this.viewportDiv, false);
    }

    public lastLineDiv() {
        return this.lineDivSelect((elm) => (elm), this.viewportDiv, false, true);
    }

    /**
     * Returns the (x, y) coordinate of the given position relative to the FlowView's coordinate system or null
     * if the position is not visible.
     */
    private getPositionLocation(position: number): ui.IPoint {
        const lineDiv = findLineDiv(position, this, true);
        if (!lineDiv) {
            return null;
        }

        // Estimate placement location
        const text = this.sharedString.getText(lineDiv.linePos, position);
        const textWidth = domutils.getTextWidth(text, lineDiv.style.font);
        const lineDivRect = lineDiv.getBoundingClientRect();

        const location = { x: lineDivRect.left + textWidth, y: lineDivRect.bottom };

        return location;
    }

    /**
     * Retrieves the nearest sequence position relative to the given viewport location
     */
    public getNearestPosition(location: ui.IPoint): number {
        const lineDivs: ILineDiv[] = [];
        this.lineDivSelect(
            (lineDiv) => {
                lineDivs.push(lineDiv);
                return null;
            },
            this.viewportDiv,
            false);

        // Search for the nearest line divs to the element
        const closestUp = closestNorth(lineDivs, location.y);
        const closestDown = closestSouth(lineDivs, location.y);

        // And then the nearest location within them
        let distance = Number.MAX_VALUE;
        let position: number;

        if (closestUp !== -1) {
            const upPosition = this.getPosFromPixels(lineDivs[closestUp], location.x);
            const upLocation = this.getPositionLocation(upPosition);
            distance = ui.distanceSquared(location, upLocation);
            position = upPosition;
        }

        if (closestDown !== -1) {
            const downPosition = this.getPosFromPixels(lineDivs[closestDown], location.x);
            const downLocation = this.getPositionLocation(downPosition);
            const downDistance = ui.distanceSquared(location, downLocation);

            if (downDistance < distance) {
                distance = downDistance;
                position = downPosition;
            }
        }

        return position;
    }

    private checkRow(lineDiv: ILineDiv, fn: (lineDiv: ILineDiv) => ILineDiv, rev?: boolean) {
        let _lineDiv = lineDiv;
        let rowDiv = _lineDiv as IRowDiv;
        let oldRowDiv: IRowDiv;
        while (rowDiv && (rowDiv !== oldRowDiv) && rowDiv.rowView) {
            oldRowDiv = rowDiv;
            _lineDiv = undefined;
            for (const cell of rowDiv.rowView.cells) {
                if (cell.div) {
                    const innerDiv = this.lineDivSelect(fn, (cell as ICellView).viewport.div, true, rev);
                    if (innerDiv) {
                        _lineDiv = innerDiv;
                        rowDiv = innerDiv as IRowDiv;
                        break;
                    }
                }
            }
        }
        return _lineDiv;
    }

    public lineDivSelect(fn: (lineDiv: ILineDiv) => ILineDiv, viewportDiv: IViewportDiv, dive = false, rev?: boolean) {
        if (rev) {
            let elm = viewportDiv.lastElementChild as ILineDiv;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        if (dive) {
                            lineDiv = this.checkRow(lineDiv, fn, rev);
                        }
                        return lineDiv;
                    }
                }
                elm = elm.previousElementSibling as ILineDiv;
            }
        } else {
            let elm = viewportDiv.firstElementChild as ILineDiv;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        if (dive) {
                            lineDiv = this.checkRow(lineDiv, fn, rev);
                        }
                        return lineDiv;
                    }
                } else {
                    console.log(`elm in fwd line search is ${elm.tagName}`);
                }
                elm = elm.nextElementSibling as ILineDiv;
            }
        }
    }

    private clickSpan(x: number, y: number, elm: HTMLSpanElement) {
        const span = elm as ISegSpan;
        const elmOff = pointerToElementOffsetWebkit(x, y);
        if (elmOff) {
            let computed = elmOffToSegOff(elmOff, span);
            if (span.offset) {
                computed += span.offset;
            }
            this.cursor.pos = span.segPos + computed;
            this.cursor.enable();
            if (this.childCursor) {
                this.childCursor.leave(CursorDirection.Airlift);
                this.childCursor = undefined;
            }
            const tilePos = findTile(this.sharedString, this.cursor.pos, "pg", false);
            if (tilePos) {
                this.curPG = tilePos.tile as MergeTree.Marker;
            }
            this.broadcastPresence();
            this.cursor.updateView(this);
            if (this.parentFlow) {
                this.parentFlow.focusChild = this;
            }
            this.focusChild = undefined;
            return true;
        }
    }

    private getSegSpan(span: ISegSpan): ISegSpan {
        let _span = span;
        while (_span.tagName === "SPAN") {
            if (_span.segPos) {
                return _span;
            } else {
                _span = _span.parentElement as ISegSpan;
            }
        }
    }

    private getPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        let position: number;

        if (targetLineDiv && (targetLineDiv.linePos !== undefined)) {
            const targetLineBounds = targetLineDiv.getBoundingClientRect();
            const y = targetLineBounds.top + Math.floor(targetLineBounds.height / 2);
            const elm = document.elementFromPoint(x, y);
            if (elm.tagName === "DIV") {
                if ((targetLineDiv.lineEnd - targetLineDiv.linePos) === 1) {
                    // Empty line
                    position = targetLineDiv.linePos;
                } else if (targetLineDiv === elm) {
                    if (targetLineDiv.indentWidth !== undefined) {
                        const relX = x - targetLineBounds.left;
                        if (relX <= targetLineDiv.indentWidth) {
                            position = targetLineDiv.linePos;
                        } else {
                            position = targetLineDiv.lineEnd;
                        }
                    } else {
                        position = targetLineDiv.lineEnd;
                    }
                } else {
                    // Content div
                    if (x <= targetLineBounds.left) {
                        position = targetLineDiv.linePos;
                    } else {
                        position = targetLineDiv.lineEnd;
                    }
                }
            } else if (elm.tagName === "SPAN") {
                const span = this.getSegSpan(elm as ISegSpan);
                if (span) {
                    const elmOff = pointerToElementOffsetWebkit(x, y);
                    if (elmOff) {
                        let computed = elmOffToSegOff(elmOff, span);
                        if (span.offset) {
                            computed += span.offset;
                        }
                        position = span.segPos + computed;
                        if (position === targetLineDiv.lineEnd) {
                            position--;
                        }
                    }
                } else {
                    position = 0;
                }
            }
        }

        return position;
    }

    // TODO: handle symbol div
    private setCursorPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        const position = this.getPosFromPixels(targetLineDiv, x);
        if (position !== undefined) {
            this.cursor.enable();
            if (this.childCursor) {
                this.childCursor.leave(CursorDirection.Airlift);
                this.childCursor = undefined;
            }
            this.cursor.pos = position;
            return true;
        } else {
            return false;
        }
    }

    private getCanonicalX() {
        const rect = this.cursor.rect();
        let x: number;
        if (this.lastVerticalX >= 0) {
            x = this.lastVerticalX;
        } else {
            x = Math.floor(rect.left);
            this.lastVerticalX = x;
        }
        return x;
    }

    private cursorRev(skipFirstRev = false) {
        if (this.cursor.pos > FlowView.docStartPosition) {
            if (!skipFirstRev) {
                this.cursor.pos--;
            }
            const segoff = getContainingSegment(this.sharedString, this.cursor.pos);
            if (MergeTree.Marker.is(segoff.segment)) {
                const marker = segoff.segment;
                if (marker.refType & MergeTree.ReferenceType.Tile) {
                    if (marker.hasTileLabel("pg")) {
                        if (marker.hasRangeLabel("table") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                            this.cursorRev();
                        }
                    }
                } else if ((marker.refType === MergeTree.ReferenceType.NestEnd) && (marker.hasRangeLabel("cell"))) {
                    const cellMarker = marker as Table.ICellMarker;
                    const endId = cellMarker.getId();
                    let beginMarker: Table.ICellMarker;
                    if (endId) {
                        const id = Table.idFromEndId(endId);
                        beginMarker = this.sharedString.getMarkerFromId(id) as Table.ICellMarker;
                    }
                    if (beginMarker && Table.cellIsMoribund(beginMarker)) {
                        this.tryMoveCell(this.cursor.pos, true);
                    } else {
                        this.cursorRev();
                    }
                } else {
                    this.cursorRev();
                }
            }
        }
    }

    private cursorFwd() {
        if (this.cursor.pos < (this.sharedString.getLength() - 1)) {
            this.cursor.pos++;

            const segoff = this.sharedString.getContainingSegment(this.cursor.pos);
            if (MergeTree.Marker.is(segoff.segment)) {
                // REVIEW: assume marker for now
                const marker = segoff.segment;
                if (marker.refType & MergeTree.ReferenceType.Tile) {
                    if (marker.hasTileLabel("pg")) {
                        if (marker.hasRangeLabel("table") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                            this.cursorFwd();
                        } else {
                            return;
                        }
                    }
                } else if (marker.refType & MergeTree.ReferenceType.NestBegin) {
                    if (marker.hasRangeLabel("table")) {
                        this.cursor.pos += 3;
                    } else if (marker.hasRangeLabel("row")) {
                        this.cursor.pos += 2;
                    } else if (marker.hasRangeLabel("cell")) {
                        if (Table.cellIsMoribund(marker)) {
                            this.tryMoveCell(this.cursor.pos);
                        } else {
                            this.cursor.pos += 1;
                        }
                    } else {
                        this.cursorFwd();
                    }
                } else if (marker.refType & MergeTree.ReferenceType.NestEnd) {
                    if (marker.hasRangeLabel("row")) {
                        this.cursorFwd();
                    } else if (marker.hasRangeLabel("table")) {
                        this.cursor.pos += 2;
                    } else {
                        this.cursorFwd();
                    }
                } else {
                    this.cursorFwd();
                }
            }
        }
    }

    private verticalMove(lineCount: number) {
        const up = lineCount < 0;
        const lineDiv = this.cursor.lineDiv();
        let targetLineDiv = lineDiv;
        if (lineCount < 0) {
            do {
                targetLineDiv = targetLineDiv.previousElementSibling as ILineDiv;
            } while (targetLineDiv && (targetLineDiv.linePos === undefined));
        } else {
            do {
                targetLineDiv = targetLineDiv.nextElementSibling as ILineDiv;
            } while (targetLineDiv && (targetLineDiv.linePos === undefined));
        }
        const x = this.getCanonicalX();

        // If line div is row, then find line in box closest to x
        function checkInTable() {
            let rowDiv = targetLineDiv as IRowDiv;
            while (rowDiv && rowDiv.rowView) {
                if (rowDiv.rowView) {
                    const cell = rowDiv.rowView.findClosestCell(x) as ICellView;
                    if (cell) {
                        if (up) {
                            targetLineDiv = cell.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = cell.viewport.firstLineDiv();
                        }
                        rowDiv = targetLineDiv as IRowDiv;
                    } else {
                        break;
                    }
                }
            }
        }

        if (targetLineDiv) {
            checkInTable();
            return this.setCursorPosFromPixels(targetLineDiv, x);
        } else {
            // TODO: handle nested tables
            // go out to row containing this line (line may be at top or bottom of box)
            const rowDiv = findRowParent(lineDiv);
            if (rowDiv && rowDiv.rowView) {
                const rowView = rowDiv.rowView;
                const tableView = rowView.table;
                let targetRow: Table.Row;
                if (up) {
                    targetRow = tableView.findPrecedingRow(rowView);
                } else {
                    targetRow = tableView.findNextRow(rowView);
                }
                if (targetRow) {
                    const cell = targetRow.findClosestCell(x) as ICellView;
                    if (cell) {
                        if (up) {
                            targetLineDiv = cell.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = cell.viewport.firstLineDiv();
                        }
                    }
                    return this.setCursorPosFromPixels(targetLineDiv, x);
                } else {
                    // Top or bottom row of table
                    if (up) {
                        targetLineDiv = rowDiv.previousElementSibling as ILineDiv;
                    } else {
                        targetLineDiv = rowDiv.nextElementSibling as ILineDiv;
                    }
                    if (targetLineDiv) {
                        checkInTable();
                        return this.setCursorPosFromPixels(targetLineDiv, x);
                    }
                }
            }
        }
    }

    private viewportCharCount() {
        return this.viewportEndPos - this.viewportStartPos;
    }

    private clearSelection(render = true) {
        // TODO: only rerender line if selection on one line
        if (this.cursor.getSelection()) {
            this.cursor.clearSelection();
            this.broadcastPresence();
            if (render) {
                this.hostSearchMenu(this.cursor.pos);
            }
        }
    }

    public setEdit() {
        window.oncontextmenu = preventD;
        this.element.onmousemove = preventD;
        this.element.onmouseup = preventD;
        // TODO onmousewheel does not appear on DOM d.ts
        (this.element as any).onselectstart = preventD;
        let prevX = Nope;
        let prevY = Nope;
        let freshDown = false;

        const moveObjects = (e: MouseEvent, fresh = false) => {
            if (e.button === 0) {
                prevX = e.clientX;
                prevY = e.clientY;
                const elm = document.elementFromPoint(prevX, prevY);
                if (elm) {
                    const span = elm as ISegSpan;
                    let segspan: ISegSpan;
                    if (span.seg) {
                        segspan = span;
                    } else {
                        segspan = span.parentElement as ISegSpan;
                    }
                    if (segspan && segspan.seg) {
                        this.clickSpan(e.clientX, e.clientY, segspan);
                    }
                }
            }
        };

        const mousemove = (e: MouseEvent) => {
            if (e.button === 0) {
                if ((prevX !== e.clientX) || (prevY !== e.clientY)) {
                    if (freshDown) {
                        this.cursor.tryMark();
                        freshDown = false;
                    }
                    moveObjects(e);
                }
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };

        this.element.onmousedown = (e) => {
            this.element.focus();
            if (e.button === 0) {
                freshDown = true;
                moveObjects(e, true);
                if (!e.shiftKey) {
                    this.clearSelection();
                }
                this.element.onmousemove = mousemove;
            }
            e.stopPropagation();
            e.preventDefault();
            e.returnValue = false;
            return false;
        };

        this.element.onmouseup = (e) => {
            this.element.onmousemove = preventD;
            if (e.button === 0) {
                freshDown = false;
                const elm = <HTMLElement>document.elementFromPoint(prevX, prevY);
                const span = elm as ISegSpan;
                let segspan: ISegSpan;
                if (span.seg) {
                    segspan = span;
                } else {
                    segspan = span.parentElement as ISegSpan;
                }
                if (segspan && segspan.seg) {
                    this.clickSpan(e.clientX, e.clientY, segspan);
                    if (this.cursor.emptySelection()) {
                        this.clearSelection();
                    }
                }
                e.stopPropagation();
                e.preventDefault();
                e.returnValue = false;
                return false;
            } else if (e.button === 2) {
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };

        this.element.onblur = (e) => {
            // TODO: doesn't actually stop timer.
            this.cursor.hide();
        };

        this.element.onfocus = (e) => {
            // TODO: doesn't actually start timer.
            this.cursor.show();
        };

        // TODO onmousewheel does not appear on DOM d.ts
        (this.element as any).onmousewheel = (e) => {
            if (!this.wheelTicking) {
                const factor = 20;
                let inputDelta = e.wheelDelta;
                if (Math.abs(e.wheelDelta) === 120) {
                    inputDelta = e.wheelDelta / 6;
                } else {
                    inputDelta = e.wheelDelta / 2;
                }
                const delta = factor * inputDelta;
                // eslint-disable-next-line max-len
                // console.log(`top char: ${this.topChar - delta} factor ${factor}; delta: ${delta} wheel: ${e.wheelDeltaY} ${e.wheelDelta} ${e.detail}`);
                setTimeout(() => {
                    this.render(Math.floor(this.topChar - delta));
                    this.apresScroll(delta < 0);
                    this.wheelTicking = false;
                }, 20);
                this.wheelTicking = true;
            }
            e.stopPropagation();
            e.preventDefault();
            e.returnValue = false;
        };

        const keydownHandler = (e: KeyboardEvent) => {
            if (this.focusChild) {
                this.focusChild.keydownHandler(e);
            } else if (!this.activeCommandBox) {
                const saveLastVertX = this.lastVerticalX;
                let specialKey = true;
                this.lastVerticalX = -1;
                if (e.ctrlKey && (e.keyCode !== 17)) {
                    this.keyCmd(e.keyCode, e.shiftKey);
                } else if (e.keyCode === KeyCode.TAB) {
                    this.onTAB(e.shiftKey);
                } else if (e.keyCode === KeyCode.esc) {
                    this.clearSelection();
                } else if (e.keyCode === KeyCode.backspace) {
                    let toRemove = this.cursor.getSelection();
                    if (toRemove) {
                        // If there was a selected range, use it as range to remove below.  In preparation, clear
                        // the FlowView's selection and set the cursor to the start of the range to be deleted.
                        this.clearSelection();
                        this.cursor.pos = toRemove.start;
                    } else {
                        // Otherwise, construct the range to remove by moving the cursor once in the reverse
                        // direction. Below we will remove the positions spanned by the current and previous cursor
                        // positions.
                        const removeEnd = this.cursor.pos;
                        this.cursorRev();
                        toRemove = {
                            end: removeEnd,
                            start: this.cursor.pos,
                        };
                    }
                    this.sharedString.removeText(toRemove.start, toRemove.end);
                } else if (((e.keyCode === KeyCode.pageUp) || (e.keyCode === KeyCode.pageDown)) && (!this.ticking)) {
                    setTimeout(() => {
                        this.scroll(e.keyCode === KeyCode.pageUp);
                        this.ticking = false;
                    }, 20);
                    this.ticking = true;
                } else if (e.keyCode === KeyCode.home) {
                    this.cursor.pos = FlowView.docStartPosition;
                    this.render(FlowView.docStartPosition);
                } else if (e.keyCode === KeyCode.end) {
                    const halfport = Math.floor(this.viewportCharCount() / 2);
                    const topChar = this.sharedString.getLength() - halfport;
                    this.cursor.pos = topChar;
                    this.broadcastPresence();
                    this.render(topChar);
                } else if (e.keyCode === KeyCode.rightArrow) {
                    this.undoRedoManager.closeCurrentOperation();
                    if (this.cursor.pos < (this.sharedString.getLength() - 1)) {
                        if (this.cursor.pos === this.viewportEndPos) {
                            this.scroll(false, true);
                        }
                        if (e.shiftKey) {
                            this.cursor.tryMark();
                        } else {
                            this.clearSelection();
                        }
                        this.cursorFwd();
                        this.broadcastPresence();
                        this.cursor.updateView(this);
                    }
                } else if (e.keyCode === KeyCode.leftArrow) {
                    this.undoRedoManager.closeCurrentOperation();
                    if (this.cursor.pos > FlowView.docStartPosition) {
                        if (this.cursor.pos === this.viewportStartPos) {
                            this.scroll(true, true);
                        }
                        if (e.shiftKey) {
                            this.cursor.tryMark();
                        } else {
                            this.clearSelection();
                        }
                        this.cursorRev();
                        this.broadcastPresence();
                        this.cursor.updateView(this);
                    }
                } else if ((e.keyCode === KeyCode.upArrow) || (e.keyCode === KeyCode.downArrow)) {
                    this.undoRedoManager.closeCurrentOperation();
                    this.lastVerticalX = saveLastVertX;
                    let lineCount = 1;
                    if (e.keyCode === KeyCode.upArrow) {
                        lineCount = -1;
                    }
                    if (e.shiftKey) {
                        this.cursor.tryMark();
                    } else {
                        this.clearSelection();
                    }
                    const maxPos = this.sharedString.getLength() - 1;
                    if (this.viewportEndPos > maxPos) {
                        this.viewportEndPos = maxPos;
                    }
                    const vpEnd = this.viewportEndPos;
                    if ((this.cursor.pos < maxPos) || (lineCount < 0)) {
                        if (!this.verticalMove(lineCount)) {
                            if (((this.viewportStartPos > 0) && (lineCount < 0)) ||
                                ((this.viewportEndPos < maxPos) && (lineCount > 0))) {
                                this.scroll(lineCount < 0, true);
                                if (lineCount > 0) {
                                    while (vpEnd === this.viewportEndPos) {
                                        if (this.cursor.pos > maxPos) {
                                            this.cursor.pos = maxPos;
                                            break;
                                        }
                                        this.scroll(lineCount < 0, true);
                                    }
                                }
                                this.verticalMove(lineCount);
                            }
                        }
                        if (this.cursor.pos > maxPos) {
                            this.cursor.pos = maxPos;
                        }
                        this.broadcastPresence();
                        this.cursor.updateView(this);
                    }
                } else {
                    if (!e.ctrlKey) {
                        specialKey = false;
                    }
                }
                if (specialKey) {
                    e.preventDefault();
                    e.returnValue = false;
                }
            }
        };

        const keypressHandler = (e: KeyboardEvent) => {
            if (this.focusChild) {
                this.focusChild.keypressHandler(e);
            } else if (!this.activeCommandBox) {
                const pos = this.cursor.pos;
                const code = e.charCode;
                if (code === CharacterCodes.cr) {
                    // TODO: other labels; for now assume only list/pg tile labels
                    this.insertParagraph(this.cursor.pos++);
                } else {
                    this.sharedString.insertText(pos, String.fromCharCode(code));
                    if (code === CharacterCodes.space) {
                        this.undoRedoManager.closeCurrentOperation();
                    }

                    this.clearSelection();
                }
            }
        };

        // Register for keyboard messages
        this.on("keydown", keydownHandler);
        this.on("keypress", keypressHandler);
        this.keypressHandler = keypressHandler;
        this.keydownHandler = keydownHandler;
    }

    private viewTileProps() {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        const tileInfo = findTile(this.sharedString, searchPos, "pg", false);
        if (tileInfo) {
            let buf = "";
            if (tileInfo.tile.properties) {
                // eslint-disable-next-line guard-for-in, no-restricted-syntax
                for (const key in tileInfo.tile.properties) {
                    buf += ` { ${key}: ${tileInfo.tile.properties[key]} }`;
                }
            }

            const lc = !!(tileInfo.tile as Paragraph.IParagraphMarker).listCache;
            console.log(`tile at pos ${tileInfo.pos} with props${buf} and list cache: ${lc}`);
        }
    }

    private setList(listKind = 0) {
        this.undoRedoManager.closeCurrentOperation();
        const searchPos = this.cursor.pos;
        const tileInfo = findTile(this.sharedString, searchPos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile as Paragraph.IParagraphMarker;
            let listStatus = false;
            if (tile.hasTileLabel("list")) {
                listStatus = true;
            }
            const curLabels = tile.properties[MergeTree.reservedTileLabelsKey] as string[];

            if (listStatus) {
                const remainingLabels = curLabels.filter((l) => l !== "list");
                this.sharedString.annotateRange(
                    tileInfo.pos, tileInfo.pos + 1,
                    {
                        [MergeTree.reservedTileLabelsKey]: remainingLabels,
                        series: null,
                    });
            } else {
                const augLabels = curLabels.slice();
                augLabels.push("list");
                let indentLevel = 1;
                if (tile.properties && tile.properties.indentLevel) {
                    indentLevel = tile.properties.indentLevel;
                }
                this.sharedString.annotateRange(
                    tileInfo.pos, tileInfo.pos + 1,
                    {
                        [MergeTree.reservedTileLabelsKey]: augLabels,
                        indentLevel,
                        listKind,
                    });
            }
            tile.listCache = undefined;
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    private tryMoveCell(pos: number, shift = false) {
        const cursorContext =
            this.sharedString.getStackContext(pos, ["table", "cell", "row"]);
        if (cursorContext.table && (!cursorContext.table.empty())) {
            const tableMarker = cursorContext.table.top() as Table.ITableMarker;
            const tableView = tableMarker.table;
            if (cursorContext.cell && (!cursorContext.cell.empty())) {
                const cell = cursorContext.cell.top() as Table.ICellMarker;
                let toCell: Table.Cell;
                if (shift) {
                    toCell = tableView.prevcell(cell.cell);
                } else {
                    toCell = tableView.nextcell(cell.cell);
                }
                if (toCell) {
                    const position = this.sharedString.getPosition(toCell.marker);
                    this.cursor.pos = position + 1;
                } else {
                    if (shift) {
                        const position = this.sharedString.getPosition(tableView.tableMarker);
                        this.cursor.pos = position - 1;
                    } else {
                        const endPosition = this.sharedString.getPosition(tableView.endTableMarker);
                        this.cursor.pos = endPosition + 1;
                    }
                }
                this.broadcastPresence();
                this.cursor.updateView(this);
            }
            return true;
        } else {
            return false;
        }
    }

    // TODO: tab stops in non-list, non-table paragraphs
    private onTAB(shift = false) {
        const searchPos = this.cursor.pos;
        const tileInfo = findTile(this.sharedString, searchPos, "pg", false);
        if (tileInfo) {
            if (!this.tryMoveCell(tileInfo.pos, shift)) {
                const tile = tileInfo.tile as Paragraph.IParagraphMarker;
                this.increaseIndent(tile, tileInfo.pos, shift);
            }
        }
    }

    private toggleBlockquote() {
        const tileInfo = findTile(this.sharedString, this.cursor.pos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile;
            const props = tile.properties;
            this.undoRedoManager.closeCurrentOperation();
            if (props && props.blockquote) {
                this.sharedString.annotateRange(tileInfo.pos, tileInfo.pos + 1, { blockquote: false });
            } else {
                this.sharedString.annotateRange(tileInfo.pos, tileInfo.pos + 1, { blockquote: true });
            }
            this.undoRedoManager.closeCurrentOperation();
        }
    }

    private toggleBold() {
        this.toggleWordOrSelection("fontWeight", "bold", null);
    }

    private toggleItalic() {
        this.toggleWordOrSelection("fontStyle", "italic", "normal");
    }

    private toggleUnderline() {
        this.toggleWordOrSelection("textDecoration", "underline", null);
    }

    private copyFormat() {
        const segoff = getContainingSegment(this.sharedString, this.cursor.pos);
        if (segoff.segment && MergeTree.TextSegment.is((segoff.segment))) {
            this.formatRegister = MergeTree.extend(MergeTree.createMap(), segoff.segment.properties);
        }
    }

    private setProps(props: MergeTree.PropertySet) {
        const sel = this.cursor.getSelection();
        this.undoRedoManager.closeCurrentOperation();
        if (sel) {
            this.clearSelection(false);
            this.sharedString.annotateRange(sel.start, sel.end, props);
        } else {
            const wordRange = getCurrentWord(this.cursor.pos, this.sharedString);
            if (wordRange) {
                this.sharedString.annotateRange(wordRange.wordStart, wordRange.wordEnd, props);
            }
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    private paintFormat() {
        if (this.formatRegister) {
            this.setProps(this.formatRegister);
        }
    }

    private setFont(family: string, size = "18px") {
        this.setProps({ fontFamily: family, fontSize: size });
    }

    private setColor(color: string) {
        this.setProps({ color });
    }

    private toggleWordOrSelection(name: string, valueOn: string, valueOff: string) {
        const sel = this.cursor.getSelection();
        if (sel) {
            this.clearSelection(false);
            this.toggleRange(name, valueOn, valueOff, sel.start, sel.end);
        } else {
            const wordRange = getCurrentWord(this.cursor.pos, this.sharedString);
            if (wordRange) {
                this.toggleRange(name, valueOn, valueOff, wordRange.wordStart, wordRange.wordEnd);
            }
        }
    }

    private toggleRange(name: string, valueOn: string, valueOff: string, start: number, end: number) {
        let someSet = false;
        const findPropSet = (segment: MergeTree.ISegment) => {
            if (MergeTree.TextSegment.is(segment)) {
                if (segment.properties && segment.properties[name] === valueOn) {
                    someSet = true;
                }
                return !someSet;
            }
        };
        this.sharedString.walkSegments(findPropSet, start, end);
        this.undoRedoManager.closeCurrentOperation();
        if (someSet) {
            this.sharedString.annotateRange(start, end, { [name]: valueOff });
        } else {
            this.sharedString.annotateRange(start, end, { [name]: valueOn });
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    private deleteRow() {
        const stack = this.sharedString.getStackContext(this.cursor.pos, ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getPosition(this.sharedString, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteRow(this.sharedString, rowMarker.row, tableMarker.table);
        }
    }

    public deleteCellShiftLeft() {
        const stack = this.sharedString.getStackContext(this.cursor.pos, ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getPosition(this.sharedString, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteCellShiftLeft(this.sharedString, cellMarker.cell, tableMarker.table);
        }
    }

    private deleteColumn() {
        const stack = this.sharedString.getStackContext(this.cursor.pos, ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getPosition(this.sharedString, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteColumn(this.sharedString, this.runtime.clientId,
                cellMarker.cell, rowMarker.row, tableMarker.table);
        }
    }

    private insertRow() {
        const stack = this.sharedString.getStackContext(this.cursor.pos, ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getPosition(this.sharedString, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertRow(
                this.sharedString,
                this.runtime.clientId,
                rowMarker.row,
                tableMarker.table,
            );
        }
    }

    private tableSummary() {
        const stack = this.sharedString.getStackContext(this.cursor.pos, ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const tableMarkerPos = getPosition(this.sharedString, tableMarker);
            if (!tableMarker.table) {
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.succinctPrintTable(tableMarker, tableMarkerPos, this.sharedString);
        }
    }

    private insertColumn() {
        const stack = this.sharedString.getStackContext(this.cursor.pos, ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getPosition(this.sharedString, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertColumn(
                this.sharedString,
                this.runtime.clientId,
                cellMarker.cell,
                rowMarker.row,
                tableMarker.table);
        }
    }

    private setPGProps(props: MergeTree.PropertySet) {
        const tileInfo = findTile(this.sharedString, this.cursor.pos, "pg", false);
        if (tileInfo) {
            const pgMarker = tileInfo.tile as Paragraph.IParagraphMarker;
            this.sharedString.annotateRange(tileInfo.pos,
                pgMarker.cachedLength + tileInfo.pos, props);
            Paragraph.clearContentCaches(pgMarker);
        }
    }

    private selectAll() {
        this.cursor.clearSelection();
        this.cursor.mark = 0;
        this.cursor.pos = this.sharedString.getLength();
    }

    private keyCmd(charCode: number, shift = false) {
        switch (charCode) {
            case CharacterCodes.A:
                this.selectAll();
                break;
            case CharacterCodes.R: {
                this.updatePGInfo(this.cursor.pos - 1);
                Table.createTable(this.cursor.pos, this.sharedString, this.runtime.clientId);
                break;
            }
            case CharacterCodes.M: {
                this.activeCommandBox = true;
                this.showCommandBox();
                break;
            }
            case CharacterCodes.L:
                this.setList();
                break;
            case CharacterCodes.B: {
                this.toggleBold();
                break;
            }
            case CharacterCodes.I: {
                this.toggleItalic();
                break;
            }
            case CharacterCodes.U: {
                this.toggleUnderline();
                break;
            }
            case CharacterCodes.D:
                this.setList(1);
                break;
            case CharacterCodes.G:
                this.viewTileProps();
                this.hostSearchMenu(this.cursor.pos);
                break;
            case CharacterCodes.Y:
                this.undoRedoManager.undoOperation();
                break;
            case CharacterCodes.Z:
                this.undoRedoManager.redoOperation();
                break;
            default:
                console.log(`got command key ${String.fromCharCode(charCode)} code: ${charCode}`);
                break;
        }
    }

    private preScroll() {
        if (this.lastVerticalX === -1) {
            const rect = this.cursor.rect();
            this.lastVerticalX = rect.left;
        }
    }

    private apresScroll(up: boolean) {
        if ((this.cursor.pos < this.viewportStartPos) ||
            (this.cursor.pos >= this.viewportEndPos)) {
            const x = this.getCanonicalX();
            if (up) {
                this.setCursorPosFromPixels(this.firstLineDiv(), x);
            } else {
                this.setCursorPosFromPixels(this.lastLineDiv(), x);
            }
            this.broadcastPresence();
            this.cursor.updateView(this);
        }
    }

    private scroll(up: boolean, one = false) {
        let scrollTo = this.topChar;
        if (one) {
            if (up) {
                const firstLineDiv = this.firstLineDiv();
                scrollTo = firstLineDiv.linePos - 2;
                if (scrollTo < 0) {
                    return;
                }
            } else {
                const nextFirstLineDiv = this.firstLineDiv().nextElementSibling as ILineDiv;
                if (nextFirstLineDiv) {
                    scrollTo = nextFirstLineDiv.linePos;
                } else {
                    return;
                }
            }
        } else {
            const len = this.sharedString.getLength();
            const halfport = Math.floor(this.viewportCharCount() / 2);
            if ((up && (this.topChar === 0)) || ((!up) && (this.topChar > (len - halfport)))) {
                return;
            }
            if (up) {
                scrollTo -= halfport;
            } else {
                scrollTo += halfport;
            }
            if (scrollTo >= len) {
                scrollTo = len - 1;
            }
        }
        this.preScroll();
        this.render(scrollTo);
        this.apresScroll(up);
    }

    public render(topChar?: number, changed = false) {
        const len = this.sharedString.getLength();
        if (len === 0) {
            return;
        }
        if (topChar !== undefined) {
            if (((this.topChar === topChar) || ((this.topChar === -1) && (topChar < 0)))
                && (!changed)) {
                return;
            }
            this.topChar = topChar;
            if (this.topChar < 0) {
                this.topChar = 0;
            }
            if (this.topChar >= len) {
                this.topChar = len - (this.viewportCharCount() / 2);
            }
        }

        // TODO: consider using markers for presence info once splice segments during pg render
        this.updatePresencePositions();
        domutils.clearSubtree(this.viewportDiv);
        // This.viewportDiv.appendChild(this.cursor.editSpan);
        const renderOutput = renderTree(this.viewportDiv, this.topChar, this);
        this.viewportStartPos = renderOutput.viewportStartPos;
        this.viewportEndPos = renderOutput.viewportEndPos;

        this.emit("render", {
            overlayMarkers: renderOutput.overlayMarkers,
            range: { min: 1, max: this.sharedString.getLength(), value: this.viewportStartPos },
            viewportEndPos: this.viewportEndPos,
            viewportStartPos: this.viewportStartPos,
        });
    }

    public loadFinished(clockStart = 0) {
        this.render(0, true);
        if (clockStart > 0) {
            // eslint-disable-next-line max-len
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.getLength()} - ${performance.now()}`);
        }

        // Set up for presence carets
        this.runtime.on("signal", (message: IInboundSignalMessage, local: boolean) => {
            if (message.type === presenceSignalType) {
                this.remotePresenceUpdate(message, local);
            }
        });
        this.broadcastPresence();

        this.sharedString.on("valueChanged", (delta: types.IValueChanged) => {
            this.queueRender(undefined, true);
        });
    }

    private updateTableInfo(changePos: number) {
        const stack = this.sharedString.getStackContext(changePos, ["table"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            tableMarker.table = undefined;
        }
    }

    private updatePGInfo(changePos: number) {
        const tileInfo = findTile(this.sharedString, changePos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile as Paragraph.IParagraphMarker;
            Paragraph.clearContentCaches(tile);
        } else {
            console.log("did not find pg to clear");
        }
        if (this.modifiedMarkers.length > 0) {
            this.updateTableInfo(changePos);
        }
    }

    public hostSearchMenu(updatePos: number) {
        if (this.parentFlow) {
            this.parentFlow.hostSearchMenu(updatePos);
        } else {
            if (updatePos >= 0) {
                this.updatePGInfo(updatePos);
            }
            if (!this.pendingRender) {
                this.pendingRender = true;
                window.requestAnimationFrame(() => {
                    this.pendingRender = false;
                    this.render(this.topChar, true);
                });
            }
        }
    }

    protected resizeCore(bounds: ui.Rectangle) {
        this.viewportRect = bounds.inner(0.92);
        if (this.viewportRect.height >= 0) {
            ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
            if (this.sharedString.getLength() > 0) {
                this.render(this.topChar, true);
            }
            if (this.viewportDiv.style.backgroundSize !== undefined) {
                const rect = this.viewportDiv.getBoundingClientRect();
                this.viewportDiv.style.backgroundSize = `${rect.width}px ${rect.height}px`;
            }
        }
    }

    private insertParagraph(pos: number) {
        const curTilePos = findTile(this.sharedString, pos, "pg", false);
        const pgMarker = curTilePos.tile as Paragraph.IParagraphMarker;
        const pgPos = curTilePos.pos;
        Paragraph.clearContentCaches(pgMarker);
        const curProps = pgMarker.properties;
        const newProps = MergeTree.createMap<any>();
        const newLabels = ["pg"];

        // TODO: Should merge w/all existing tile labels?
        if (Paragraph.isListTile(pgMarker)) {
            newLabels.push("list");
            newProps.indentLevel = curProps.indentLevel;
            newProps.listKind = curProps.listKind;
        }

        newProps[MergeTree.reservedTileLabelsKey] = newLabels;
        if (this.srcLanguage !== "en") {
            newProps.fromLanguage = this.srcLanguage;
        }
        // TODO: place in group op
        // old marker gets new props
        this.sharedString.annotateRange(pgPos, pgPos + 1, newProps, { name: "rewrite" });
        // New marker gets existing props
        this.sharedString.insertMarker(pos, MergeTree.ReferenceType.Tile, curProps);
        this.undoRedoManager.closeCurrentOperation();
    }

    private remotePresenceUpdate(message: IInboundSignalMessage, local: boolean) {
        if (local) {
            return;
        }

        const remotePresenceBase = message.content as IRemotePresenceBase;

        if (remotePresenceBase.type === "selection") {
            this.remotePresenceToLocal(message.clientId, remotePresenceBase as IRemotePresenceInfo);
        }
    }

    private remotePresenceFromEdit(
        clientId: string,
        refseq: number,
        oldpos: number,
        posAdjust = 0) {
        const remotePosInfo: IRemotePresenceInfo = {
            origMark: -1,
            origPos: oldpos + posAdjust,
            refseq,
            type: "selection",
        };

        this.remotePresenceToLocal(clientId, remotePosInfo);
    }

    private remotePresenceToLocal(clientId: string, remotePresenceInfo: IRemotePresenceInfo, posAdjust = 0) {
        const rempos = this.sharedString.resolveRemoteClientPosition(
            remotePresenceInfo.origPos,
            remotePresenceInfo.refseq,
            clientId);
        const segoff = this.sharedString.getContainingSegment(rempos);

        if (segoff.segment) {
            const clientInfo = this.getRemoteClientInfo(clientId);
            if (clientInfo) {
                const localPresenceInfo = {
                    clientId,
                    fresh: true,
                    localRef: this.sharedString.createPositionReference(
                        segoff.segment, segoff.offset, MergeTree.ReferenceType.SlideOnRemove),
                    presenceColor: this.presenceVector.has(clientId) ?
                        this.presenceVector.get(clientId).presenceColor :
                        presenceColors[this.presenceVector.size % presenceColors.length],
                    shouldShowCursor: () => this.runtime.clientId !== clientId &&
                        this.getRemoteClientInfo(clientId) !== undefined,
                    user: clientInfo.user,
                } as ILocalPresenceInfo;
                if (remotePresenceInfo.origMark >= 0) {
                    const markSegoff = this.sharedString.getContainingSegment(remotePresenceInfo.origMark);
                    if (markSegoff.segment) {
                        localPresenceInfo.markLocalRef =
                            this.sharedString.createPositionReference(markSegoff.segment,
                                markSegoff.offset, MergeTree.ReferenceType.SlideOnRemove);
                    }
                }
                this.updatePresenceVector(localPresenceInfo);
            }
        }
    }

    private getRemoteClientInfo(clientId: string): IClient {
        const quorumClient = this.runtime.getQuorum().getMember(clientId);
        if (quorumClient) {
            return quorumClient.client;
        } else {
            const audience = this.runtime.getAudience().getMembers();
            return audience.get(clientId);
        }
    }

    private broadcastPresence() {
        if (this.runtime.connected) {
            const presenceInfo: IRemotePresenceInfo = {
                origMark: this.cursor.mark,
                origPos: this.cursor.pos,
                refseq: this.sharedString.getCurrentSeq(),
                type: "selection",
            };
            this.runtime.submitSignal(presenceSignalType, presenceInfo);
        }
    }

    private increaseIndent(tile: Paragraph.IParagraphMarker, pos: number, decrease = false) {
        tile.listCache = undefined;
        this.undoRedoManager.closeCurrentOperation();
        if (decrease && tile.properties.indentLevel > 0) {
            this.sharedString.annotateRange(pos, pos + 1,
                { indentLevel: -1 }, { name: "incr", defaultValue: 1, minValue: 0 });
        } else if (!decrease) {
            this.sharedString.annotateRange(pos, pos + 1,
                { indentLevel: 1 }, { name: "incr", defaultValue: 0 });
        }
        this.undoRedoManager.closeCurrentOperation();
    }

    private handleSharedStringDelta(event: Sequence.SequenceDeltaEvent, target: Sequence.SharedString) {
        let opCursorPos: number;
        event.ranges.forEach((range) => {
            if (MergeTree.Marker.is(range.segment)) {
                this.updatePGInfo(range.position - 1);
            } else if (MergeTree.TextSegment.is(range.segment)) {
                if (range.operation === MergeTree.MergeTreeDeltaType.REMOVE) {
                    opCursorPos = range.position;
                } else {
                    const insertOrAnnotateEnd = range.position + range.segment.cachedLength;
                    this.updatePGInfo(insertOrAnnotateEnd);
                    if (range.operation === MergeTree.MergeTreeDeltaType.INSERT) {
                        opCursorPos = insertOrAnnotateEnd;
                    }
                }
            }
            // If it was a remote op before the local cursor, we need to adjust
            // the local cursor
            if (!event.isLocal && range.position <= this.cursor.pos) {
                let adjust = range.segment.cachedLength;
                // We might not need to use the full length if
                // the range crosses the curors position
                if (range.position + adjust > this.cursor.pos) {
                    adjust -= range.position + adjust - this.cursor.pos;
                }

                // Do nothing for annotate, as it doesn't affect position
                if (range.operation === MergeTree.MergeTreeDeltaType.REMOVE) {
                    this.cursor.pos -= adjust;
                } else if (range.operation === MergeTree.MergeTreeDeltaType.INSERT) {
                    this.cursor.pos += adjust;
                }
            }
        });

        if (event.isLocal) {
            if (opCursorPos !== undefined) {
                this.cursor.pos = opCursorPos;
            }
            this.hostSearchMenu(this.cursor.pos);
        } else {
            if (opCursorPos !== undefined) {
                this.remotePresenceFromEdit(
                    event.opArgs.sequencedMessage.clientId,
                    event.opArgs.sequencedMessage.referenceSequenceNumber,
                    opCursorPos);
            }
            this.queueRender(undefined, this.posInViewport(event.first.position) || this.posInViewport(opCursorPos));
        }
    }

    private posInViewport(pos: number) {
        return ((this.viewportEndPos > pos) && (pos >= this.viewportStartPos));
    }

    private presenceQueueRender(localPresenceInfo: ILocalPresenceInfo, sameLine = false) {
        if ((!this.pendingRender) &&
            (this.posInViewport(localPresenceInfo.xformPos) ||
                (this.posInViewport(localPresenceInfo.markXformPos)))) {
            if (!sameLine) {
                this.pendingRender = true;
                window.requestAnimationFrame(() => {
                    this.pendingRender = false;
                    this.render(this.topChar, true);
                });
            } else {
                reRenderLine(localPresenceInfo.cursor.lineDiv(), this);
            }
        }
    }

    private queueRender(msg: ISequencedDocumentMessage, go = false) {
        if ((!this.pendingRender) && (go || (msg && msg.contents))) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                this.render(this.topChar, true);
            });
        }
    }
}
