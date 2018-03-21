// tslint:disable:no-bitwise whitespace align switch-default no-string-literal
import performanceNow = require("performance-now");
import { api, core, MergeTree as SharedString, types } from "../client-api";
import { IAuthenticatedUser } from "../core-utils";
import { findRandomWord } from "../merge-tree-utils";
import { SharedIntervalCollection } from "../merge-tree/intervalCollection";
import * as ui from "../ui";
import { Status } from "./status";

enum CharacterCodes {
    _ = 95,
    $ = 36,

    ampersand = 38,             // &
    asterisk = 42,              // *
    at = 64,                    // @
    backslash = 92,             // \
    bar = 124,                  // |
    caret = 94,                 // ^
    closeBrace = 125,           // }
    closeBracket = 93,          // ]
    closeParen = 41,            // )
    colon = 58,                 // :
    comma = 44,                 // ,
    dot = 46,                   // .
    doubleQuote = 34,           // "
    equals = 61,                // =
    exclamation = 33,           // !
    hash = 35,                  // #
    greaterThan = 62,           // >
    lessThan = 60,              // <
    minus = 45,                 // -
    openBrace = 123,            // {
    openBracket = 91,           // [
    openParen = 40,             // (
    percent = 37,               // %
    plus = 43,                  // +
    question = 63,              // ?
    semicolon = 59,             // ;
    singleQuote = 39,           // '
    slash = 47,                 // /
    tilde = 126,                // ~
    linefeed = 10,              // \n
    cr = 13,                    // \r
    _0 = 48,
    _9 = 57,
    a = 97,
    b = 98,
    g = 103,
    l = 108,
    z = 122,

    A = 65,
    B = 66, C = 67, D = 68, E = 69, F = 70,
    G = 71, H = 72, I = 73, J = 74, K = 75,
    L = 76, M = 77, N = 78, O = 79, P = 80,
    Q = 81, R = 82, S = 83, T = 84, U = 85,
    V = 86, W = 87, X = 88, Y = 89, Z = 90,
    space = 0x0020,   // " "
}

export interface IOverlayMarker {
    id: string;
    position: number;
}

interface IParagraphInfo {
    breaks: number[];
    singleLineWidth: number;
}

interface IParagraphItemInfo {
    minWidth: number;
    items: ParagraphItem[];
}

interface IListInfo {
    itemCounts: number[];
}

interface IParagraphMarker extends SharedString.Marker {
    cache?: IParagraphInfo;
    itemCache?: IParagraphItemInfo;
    listHeadCache?: IListHeadInfo;
    listCache?: IListInfo;
}

function clearContentCaches(pgMarker: IParagraphMarker) {
    pgMarker.cache = undefined;
    pgMarker.itemCache = undefined;
}

// TODO: indent decoration
export interface ILineDiv extends HTMLDivElement {
    linePos?: number;
    lineEnd?: number;
    contentWidth?: number;
    indentWidth?: number;
    indentSymbol?: ISymbol;
}

interface IRowDiv extends ILineDiv {
    rowView: RowView;
}

interface ISegSpan extends HTMLSpanElement {
    seg: SharedString.TextSegment;
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

export interface Item {
    key: string;
    div?: HTMLDivElement;
    iconURL?: string;
}

let viewOptions: Object;

export function namesToItems(names: string[]): Item[] {
    let items: Item[] = new Array(names.length);

    for (let i = 0, len = names.length; i < len; i++) {
        items[i] = { key: names[i] };
    }

    return items;
}

function altsToItems(alts: Alt[]) {
    return alts.map((v) => ({ key: v.text }));
}

type Alt = SharedString.Collections.ProxString<number>;
// TODO: mechanism for intelligent services to publish interfaces like this
interface ITextErrorInfo {
    text: string;
    alternates: Alt[];
    color?: string;
}

export interface ISelectionListBox {
    elm: HTMLDivElement;
    show();
    hide();
    prevItem();
    nextItem();
    removeHighlight();
    showSelectionList(selectionItems: Item[], hintSelection?: string);
    selectItem(key: string);
    items(): Item[];
    getSelectedKey(): string;
}

export function selectionListBoxCreate(
    textRect: ui.Rectangle,
    container: HTMLElement,
    itemHeight: number,
    offsetY: number,
    varHeight?: number): ISelectionListBox {

    let listContainer = document.createElement("div");
    let items: Item[];
    let itemCapacity: number;
    let selectionIndex = -1;
    let topSelection = 0;

    init();

    return {
        elm: listContainer,
        getSelectedKey,
        hide: () => {
            listContainer.style.visibility = "hidden";
        },
        items: () => items,
        prevItem,
        nextItem,
        removeHighlight,
        selectItem: selectItemByKey,
        show: () => {
            listContainer.style.visibility = "visible";
        },
        showSelectionList,
    };

    function selectItemByKey(key: string) {
        key = key.trim();
        if (selectionIndex >= 0) {
            if (items[selectionIndex].key === key) {
                return;
            }
        }
        for (let i = 0, len = items.length; i < len; i++) {
            if (items[i].key === key) {
                selectItem(i);
                break;
            }
        }
    }

    function getSelectedKey() {
        if (selectionIndex >= 0) {
            return items[selectionIndex].key;
        }
    }

    function prevItem() {
        if (selectionIndex > 0) {
            selectItem(selectionIndex - 1);
        }
    }

    function nextItem() {
        if (selectionIndex < (items.length - 1)) {
            selectItem(selectionIndex + 1);
        }
    }

    function init() {
        listContainer.style.boxShadow = "0px 3px 2px #bbbbbb";
        listContainer.style.backgroundColor = "white";
        listContainer.style.border = "#e5e5e5 solid 2px";

        updateRectangles();
        container.appendChild(listContainer);
    }

    function updateRectangles() {
        let width = textRect.width;
        let height = window.innerHeight / 3;
        let top: number;
        let bottom: number;
        let right: number;
        if ((textRect.x + textRect.width) > window.innerWidth) {
            right = textRect.x;
        }
        // TODO: use container div instead of window/doc body
        // TODO: right/left (for now assume go right)
        if ((height + textRect.y + offsetY + textRect.height) >= window.innerHeight) {
            bottom = window.innerHeight - textRect.y;
        } else {
            top = textRect.y + textRect.height;
        }
        itemCapacity = Math.floor(height / itemHeight);
        if (top !== undefined) {
            let listContainerRect = new ui.Rectangle(textRect.x, top, width, height);
            listContainerRect.height = itemCapacity * itemHeight;
            listContainerRect.conformElementMaxHeight(listContainer);
        } else {
            let listContainerRect = new ui.Rectangle(textRect.x, 0, width, height);
            listContainerRect.height = itemCapacity * itemHeight;
            listContainerRect.conformElementMaxHeightFromBottom(listContainer, bottom);
        }
        if (right !== undefined) {
            listContainer.style.right = (window.innerWidth - right) + "px";
            listContainer.style.left = "";
        }
        if (varHeight) {
            listContainer.style.paddingBottom = varHeight + "px";
        }
    }

    function removeHighlight() {
        if (selectionIndex >= 0) {
            if (items[selectionIndex].div) {
                items[selectionIndex].div.style.backgroundColor = "white";
            }
        }
    }

    function selectItem(indx: number) {
        // then scroll if necessary
        if (indx < topSelection) {
            topSelection = indx;
        } else if ((indx - topSelection) >= itemCapacity) {
            topSelection = (indx - itemCapacity) + 1;
        }
        if (selectionIndex !== indx) {
            selectionIndex = indx;
            updateSelectionList();
        }
    }

    function makeItemDiv(i: number, div: HTMLDivElement) {
        let item = items[i];
        let itemDiv = div;
        itemDiv.style.fontSize = "18px";
        itemDiv.style.fontFamily = "Segoe UI";
        itemDiv.style.lineHeight = itemHeight + "px";
        itemDiv.style.whiteSpace = "pre";
        items[i].div = itemDiv;
        let itemSpan = document.createElement("span");
        itemSpan.innerText = "  " + item.key;
        itemDiv.appendChild(itemSpan);

        if (item.iconURL) {
            let icon = document.createElement("img");
            icon.style.cssFloat = "left";
            icon.style.height = itemHeight + "px";
            icon.style.width = itemHeight + "px";
            icon.setAttribute("src", item.iconURL);
            itemDiv.insertBefore(icon, itemSpan);
        }
        return itemDiv;
    }

    function showSelectionList(selectionItems: Item[], hintSelection?: string) {
        topSelection = 0;
        items = selectionItems;
        clearSubtree(listContainer);
        selectionIndex = -1;
        if (selectionItems.length === 0) {
            return;
        }

        updateSelectionList();

        if (hintSelection) {
            selectItemByKey(hintSelection);
        } else {
            selectItem(0);
        }
    }

    function updateSelectionList() {
        clearSubtree(listContainer);
        let len = items.length;
        for (let i = 0; i < itemCapacity; i++) {
            let indx = i + topSelection;
            if (indx === len) {
                break;
            } else {
                let item = items[indx];
                if (!item.div) {
                    item.div = document.createElement("div");
                    listContainer.appendChild(item.div);
                    makeItemDiv(indx, item.div);
                } else {
                    listContainer.appendChild(item.div);
                }
                if (indx === selectionIndex) {
                    item.div.style.backgroundColor = "#aaaaff";
                } else {
                    item.div.style.backgroundColor = "white";
                }
            }
        }
    }
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
                let innerSpan = <HTMLSpanElement>prevSib;
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

let cachedCanvas: HTMLCanvasElement;
const baseURI = typeof document !== "undefined" ? document.location.origin : "";
let underlineStringURL = `url("${baseURI}/public/images/underline.gif") bottom repeat-x`;
let underlinePaulStringURL = `url("${baseURI}/public/images/underline-paul.gif") bottom repeat-x`;
let underlinePaulGrammarStringURL = `url("${baseURI}/public/images/underline-paulgrammar.gif") bottom repeat-x`;
let underlinePaulGoldStringURL = `url("${baseURI}/public/images/underline-gold.gif") bottom repeat-x`;

function getTextWidth(text: string, font: string) {
    // re-use canvas object for better performance
    const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    const metrics = context.measureText(text);
    return metrics.width;
}

function getMultiTextWidth(texts: string[], font: string) {
    // re-use canvas object for better performance
    const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
    const context = canvas.getContext("2d");
    context.font = font;
    let sum = 0;
    for (let text of texts) {
        const metrics = context.measureText(text);
        sum += metrics.width;
    }
    return sum;
}

interface IRange {
    start: number;
    end: number;
}

enum ParagraphItemType {
    Block,
    Glue,
    Penalty,
}

interface IParagraphItem {
    type: ParagraphItemType;
    width: number;
    textSegment: SharedString.TextSegment;
    // present if not default height
    height?: number;
}

interface IPGBlock extends IParagraphItem {
    type: ParagraphItemType.Block;
    text: string;
}

function makeIPGBlock(width: number, text: string, textSegment: SharedString.TextSegment) {
    return <IPGBlock>{ type: ParagraphItemType.Block, width, text, textSegment };
}

function makeGlue(
    width: number,
    text: string,
    textSegment: SharedString.TextSegment,
    stretch: number,
    shrink: number) {

    return <IPGGlue>{ type: ParagraphItemType.Glue, width, text, textSegment, stretch, shrink };
}

interface IPGGlue extends IParagraphItem {
    type: ParagraphItemType.Glue;
    text: string;
    stretch: number;
    shrink: number;
}

interface IPGPenalty extends IParagraphItem {
    type: ParagraphItemType.Penalty;
    cost: number;
}

type ParagraphItem = IPGBlock | IPGGlue | IPGPenalty;

// for now assume uniform line widths
function breakPGIntoLinesFF(items: ParagraphItem[], lineWidth: number) {
    let breaks = [0];
    let posInPG = 0;
    let committedItemsWidth = 0;
    let blockRunWidth = 0;
    let blockRunPos = -1;
    let prevIsGlue = true;
    for (let item of items) {
        if (item.type === ParagraphItemType.Block) {
            if (prevIsGlue) {
                blockRunPos = posInPG;
                blockRunWidth = 0;
            }
            if ((committedItemsWidth + item.width) > lineWidth) {
                breaks.push(blockRunPos);
                committedItemsWidth = blockRunWidth;
            }
            posInPG += item.text.length;
            if (committedItemsWidth > lineWidth) {
                breaks.push(posInPG);
                committedItemsWidth = 0;
                blockRunWidth = 0;
                blockRunPos = posInPG;
            } else {
                blockRunWidth += item.width;
            }
            prevIsGlue = false;
        } else if (item.type === ParagraphItemType.Glue) {
            posInPG++;
            prevIsGlue = true;
        }
        committedItemsWidth += item.width;
    }
    return breaks;
}

const enum ParagraphLexerState {
    AccumBlockChars,
    AccumSpaces,
}

type ParagraphTokenAction<TContext> =
    (text: string, type: ParagraphItemType, leadSegment: SharedString.TextSegment, context?: TContext) => void;

class ParagraphLexer<TContext> {
    public state = ParagraphLexerState.AccumBlockChars;
    private spaceCount = 0;
    private textBuf = "";
    private leadSegment: SharedString.TextSegment;

    constructor(public tokenAction: ParagraphTokenAction<TContext>, public actionContext?: TContext) {
    }

    public reset() {
        this.state = ParagraphLexerState.AccumBlockChars;
        this.spaceCount = 0;
        this.textBuf = "";
        this.leadSegment = undefined;
    }

    public lex(textSegment: SharedString.TextSegment) {
        if (this.leadSegment && (!this.leadSegment.matchProperties(textSegment))) {
            this.emit();
            this.leadSegment = textSegment;
        } else if (!this.leadSegment) {
            this.leadSegment = textSegment;
        }
        let segText = textSegment.text;
        for (let i = 0, len = segText.length; i < len; i++) {
            let c = segText.charAt(i);
            if (c === " ") {
                if (this.state === ParagraphLexerState.AccumBlockChars) {
                    this.emitBlock();
                }
                this.state = ParagraphLexerState.AccumSpaces;
                this.spaceCount++;
            } else {
                if (this.state === ParagraphLexerState.AccumSpaces) {
                    this.emitGlue();
                }
                this.state = ParagraphLexerState.AccumBlockChars;
                this.textBuf += c;
            }
        }
        this.emit();
    }

    private emit() {
        if (this.state === ParagraphLexerState.AccumBlockChars) {
            this.emitBlock();
        } else {
            this.emitGlue();
        }
    }

    private emitGlue() {
        if (this.spaceCount > 0) {
            this.tokenAction(SharedString.internedSpaces(this.spaceCount), ParagraphItemType.Glue,
                this.leadSegment, this.actionContext);
            this.spaceCount = 0;
        }
    }

    private emitBlock() {
        if (this.textBuf.length > 0) {
            this.tokenAction(this.textBuf, ParagraphItemType.Block, this.leadSegment, this.actionContext);
            this.textBuf = "";
        }
    }

}
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
}

interface IDocumentContext {
    wordSpacing: number;
    headerFontstr: string;
    headerDivHeight: number;
    fontstr: string;
    defaultLineDivHeight: number;
    pgVspace: number;
    boxVspace: number;
    boxHMargin: number;
    boxTopMargin: number;
    tableVspace: number;
    indentWidthThreshold: number;
}

interface IItemsContext {
    docContext?: IDocumentContext;
    curPGMarker: IParagraphMarker;
    nextPGPos: number;
    itemInfo: IParagraphItemInfo;
    paragraphLexer: ParagraphLexer<IItemsContext>;
}

function buildDocumentContext(viewportDiv: HTMLDivElement) {
    let fontstr = "18px Times";
    viewportDiv.style.font = fontstr;
    let headerFontstr = "22px Times";
    let wordSpacing = getTextWidth(" ", fontstr);
    let headerDivHeight = 32;
    let computedStyle = window.getComputedStyle(viewportDiv);
    let defaultLineHeight = 1.2;
    let h = parseInt(computedStyle.fontSize, 10);
    let defaultLineDivHeight = Math.round(h * defaultLineHeight);
    let pgVspace = Math.round(h * 0.5);
    let boxVspace = 3;
    let tableVspace = pgVspace;
    let boxTopMargin = 3;
    let boxHMargin = 3;
    let indentWidthThreshold = 600;
    return <IDocumentContext>{
        fontstr, headerFontstr, wordSpacing, headerDivHeight, defaultLineDivHeight,
        pgVspace, boxVspace, boxHMargin, boxTopMargin, tableVspace, indentWidthThreshold,
    };
}

function showPresence(presenceX: number, lineContext: ILineContext, presenceInfo: ILocalPresenceInfo) {
    if (!presenceInfo.cursor) {
        presenceInfo.cursor = new Cursor(lineContext.flowView.viewportDiv, presenceInfo.xformPos);
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
            let cursorBounds = lineContext.span.getBoundingClientRect();
            let lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
            let cursorX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
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
        let lineDivBounds = lineContext.lineDiv.getBoundingClientRect();
        if (cursorPos > textStartPos) {
            let preCursorText = text.substring(0, cursorPos - textStartPos);
            let temp = lineContext.span.innerText;
            lineContext.span.innerText = preCursorText;
            let cursorBounds = lineContext.span.getBoundingClientRect();
            posX = cursorBounds.width + (cursorBounds.left - lineDivBounds.left);
            // console.log(`cbounds w ${cursorBounds.width} posX ${posX} ldb ${lineDivBounds.left}`);
            lineContext.span.innerText = temp;
        } else {
            let cursorBounds = lineContext.span.getBoundingClientRect();
            posX = cursorBounds.left - lineDivBounds.left;
            // console.log(`cbounds whole l ${cursorBounds.left} posX ${posX} ldb ${lineDivBounds.left}`);
        }
        if (!presenceInfo) {
            lineContext.flowView.cursor.assignToLine(posX, lineContext.lineDivHeight, lineContext.lineDiv);
        } else {
            showPresence(posX, lineContext, presenceInfo);
        }
    }
}

function endRenderSegments(marker: SharedString.Marker) {
    return (marker.hasTileLabel("pg") ||
        ((marker.hasRangeLabel("box") &&
            (marker.refType & SharedString.ReferenceType.NestEnd))));
}

function renderSegmentIntoLine(
    segment: SharedString.Segment, segpos: number, refSeq: number,
    clientId: number, start: number, end: number, lineContext: ILineContext) {
    if (lineContext.lineDiv.linePos === undefined) {
        lineContext.lineDiv.linePos = segpos + start;
        lineContext.lineDiv.lineEnd = lineContext.lineDiv.linePos;
    }
    let segType = segment.getType();
    if (segType === SharedString.SegmentType.Text) {
        if (start < 0) {
            start = 0;
        }
        if (end > segment.cachedLength) {
            end = segment.cachedLength;
        }
        let textSegment = <SharedString.TextSegment>segment;
        let text = textSegment.text.substring(start, end);
        let textStartPos = segpos + start;
        let textEndPos = segpos + end;
        lineContext.span = makeSegSpan(lineContext.flowView, text, textSegment, start, segpos);
        lineContext.contentDiv.appendChild(lineContext.span);
        lineContext.lineDiv.lineEnd += text.length;
        if ((lineContext.flowView.cursor.pos >= textStartPos) && (lineContext.flowView.cursor.pos <= textEndPos)) {
            showPositionInLine(lineContext, textStartPos, text, lineContext.flowView.cursor.pos);
        }
        let presenceInfo = lineContext.flowView.presenceInfoInRange(textStartPos, textEndPos);
        if (presenceInfo && (presenceInfo.xformPos !== lineContext.flowView.cursor.pos)) {
            showPositionInLine(lineContext, textStartPos, text, presenceInfo.xformPos, presenceInfo);
        }
    } else if (segType === SharedString.SegmentType.Marker) {
        let marker = <SharedString.Marker>segment;
        // console.log(`marker pos: ${segpos}`);
        if (endRenderSegments(marker)) {
            if (lineContext.flowView.cursor.pos === segpos) {
                showPositionEndOfLine(lineContext);
            } else {
                let presenceInfo = lineContext.flowView.presenceInfoInRange(segpos, segpos);
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
        if ((elm.linePos <= pos) && (elm.lineEnd >= pos)) {
            return elm;
        }
    }, flowView.viewportDiv, dive);
}

function decorateLineDiv(lineDiv: ILineDiv, lineFontstr: string, lineDivHeight: number) {
    let indentSymbol = lineDiv.indentSymbol;
    let indentFontstr = lineFontstr;
    if (indentSymbol.font) {
        indentFontstr = indentSymbol.font;
    }
    let em = Math.round(getTextWidth("M", lineFontstr));
    let symbolWidth = getTextWidth(indentSymbol.text, indentFontstr);
    let symbolDiv = makeContentDiv(
        new ui.Rectangle(
            lineDiv.indentWidth - Math.floor(em + symbolWidth), 0, symbolWidth, lineDivHeight), indentFontstr);
    symbolDiv.innerText = indentSymbol.text;
    lineDiv.appendChild(symbolDiv);
}

function reRenderLine(lineDiv: ILineDiv, flowView: FlowView) {
    if (lineDiv) {
        let outerViewportBounds = ui.Rectangle.fromClientRect(flowView.viewportDiv.getBoundingClientRect());
        let lineDivBounds = lineDiv.getBoundingClientRect();
        let lineDivHeight = lineDivBounds.height;
        clearSubtree(lineDiv);
        let contentDiv = lineDiv;
        if (lineDiv.indentSymbol) {
            decorateLineDiv(lineDiv, lineDiv.style.font, lineDivHeight);
        }
        if (lineDiv.indentWidth) {
            contentDiv = makeContentDiv(new ui.Rectangle(lineDiv.indentWidth, 0, lineDiv.contentWidth,
                lineDivHeight), lineDiv.style.font);
            lineDiv.appendChild(contentDiv);
        }
        let lineContext = <ILineContext>{
            contentDiv,
            flowView,
            lineDiv,
            lineDivHeight,
            markerPos: 0,
            pgMarker: undefined,
            span: undefined,
            outerViewportBounds,
        };
        let lineEnd = lineDiv.lineEnd;
        let end = lineEnd;
        if (end === lineDiv.linePos) {
            end++;
        }
        flowView.client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, SharedString.UniversalSequenceNumber,
            flowView.client.getClientId(), lineContext, lineDiv.linePos, end);
        lineDiv.lineEnd = lineEnd;
    }
}

let randomIndent = false;
function getIndentPct(pgMarker: IParagraphMarker) {
    if (pgMarker.properties && (pgMarker.properties.indentLevel !== undefined)) {
        return pgMarker.properties.indentLevel * 0.05;
    } else if (pgMarker.properties && pgMarker.properties.blockquote) {
        return 0.10;
    } else {
        if (randomIndent) {
            return 0.2 * Math.random();
        } else {
            return 0.0;
        }
    }
}

function getIndentSymbol(pgMarker: IParagraphMarker) {
    let indentLevel = pgMarker.properties.indentLevel;
    indentLevel = indentLevel % pgMarker.listHeadCache.series.length;
    let series = pgMarker.listHeadCache.series[indentLevel];
    let seriesSource = listSeries;
    if (pgMarker.properties.listKind === 1) {
        seriesSource = symbolSeries;
    }
    series = series % seriesSource.length;
    return seriesSource[series](pgMarker.listCache.itemCounts[indentLevel]);
}

interface IListHeadInfo {
    series?: number[];
    tile: IParagraphMarker;
}

interface ITilePos {
    tile: SharedString.Marker;
    pos: number;
}

function getPrecedingTile(
    flowView: FlowView, tile: SharedString.Marker, tilePos: number, label: string,
    filter: (candidate: SharedString.Marker) => boolean, precedingTileCache?: ITilePos[]) {
    if (precedingTileCache) {
        for (let i = precedingTileCache.length - 1; i >= 0; i--) {
            let candidate = precedingTileCache[i];
            if (filter(candidate.tile)) {
                return candidate;
            }
        }
    }
    while (tilePos > 0) {
        tilePos = tilePos - 1;
        let prevTileInfo = findTile(flowView, tilePos, label);
        if (prevTileInfo && filter(<SharedString.Marker>prevTileInfo.tile)) {
            return prevTileInfo;
        }
    }
}

function isListTile(tile: IParagraphMarker) {
    return tile.hasTileLabel("list");
}

export interface ISymbol {
    font?: string;
    text: string;
}

function numberSuffix(itemIndex: number, suffix: string): ISymbol {
    return { text: itemIndex.toString() + suffix };
}

// TODO: more than 26
function alphaSuffix(itemIndex: number, suffix: string, little = false) {
    let code = (itemIndex - 1) + CharacterCodes.A;
    if (little) {
        code += 32;
    }
    let prefix = String.fromCharCode(code);
    return { text: prefix + suffix };
}

// TODO: more than 10
let romanNumbers = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function roman(itemIndex: number, little = false) {
    let text = romanNumbers[itemIndex - 1] + ".";
    if (little) {
        text = text.toLowerCase();
    }
    return { text };
}

// let wingdingLetters = ["l", "m", "n", "R", "S", "T", "s","w"];
let unicodeBullets = [
    "\u2022", "\u25E6", "\u25AA", "\u2731", "\u272F", "\u2729", "\u273F",
    "\u2745", "\u2739", "\u2720", "\u2722",
];

function itemSymbols(itemIndex: number, indentLevel: number) {
    //    let wingdingLetter = wingdingLetters[indentLevel - 1];
    let wingdingLetter = unicodeBullets[indentLevel - 1];
    //    return { text: wingdingLetter, font: "12px Wingdings" };
    return { text: wingdingLetter };
}

let listSeries = [
    (itemIndex) => numberSuffix(itemIndex, "."),
    (itemIndex) => numberSuffix(itemIndex, ")"),
    (itemIndex) => alphaSuffix(itemIndex, ".", true),
    (itemIndex) => alphaSuffix(itemIndex, ")", true),
    (itemIndex) => alphaSuffix(itemIndex, "."),
    (itemIndex) => alphaSuffix(itemIndex, ")"),
    (itemIndex) => roman(itemIndex, true),
    (itemIndex) => roman(itemIndex),
];

let symbolSeries = [
    (itemIndex) => itemSymbols(itemIndex, 1),
    (itemIndex) => itemSymbols(itemIndex, 2),
    (itemIndex) => itemSymbols(itemIndex, 3),
    (itemIndex) => itemSymbols(itemIndex, 4),
    (itemIndex) => itemSymbols(itemIndex, 5),
    (itemIndex) => itemSymbols(itemIndex, 6),
    (itemIndex) => itemSymbols(itemIndex, 7),
    (itemIndex) => itemSymbols(itemIndex, 8),
    (itemIndex) => itemSymbols(itemIndex, 9),
    (itemIndex) => itemSymbols(itemIndex, 10),
    (itemIndex) => itemSymbols(itemIndex, 11),
];

function convertToListHead(tile: IParagraphMarker) {
    tile.listHeadCache = {
        series: <number[]>tile.properties.series,
        tile,
    };
    tile.listCache = { itemCounts: [0, 1] };
}

/**
 * maximum number of characters before a preceding list paragraph deemed irrelevant
 */
let maxListDistance = 400;

function getListCacheInfo(
    flowView: FlowView, tile: IParagraphMarker, tilePos: number, precedingTileCache?: ITilePos[]) {

    if (isListTile(tile)) {
        if (tile.listCache === undefined) {
            if (tile.properties.series) {
                convertToListHead(tile);
            } else {
                let listKind = tile.properties.listKind;
                let precedingTilePos = getPrecedingTile(flowView, tile, tilePos, "list",
                    (t) => isListTile(t) && (t.properties.listKind === listKind), precedingTileCache);
                if (precedingTilePos && ((tilePos - precedingTilePos.pos) < maxListDistance)) {
                    getListCacheInfo(flowView, <SharedString.Marker>precedingTilePos.tile,
                        precedingTilePos.pos, precedingTileCache);
                    let precedingTile = <IParagraphMarker>precedingTilePos.tile;
                    tile.listHeadCache = precedingTile.listHeadCache;
                    let indentLevel = tile.properties.indentLevel;
                    let precedingItemCount = precedingTile.listCache.itemCounts[indentLevel];
                    let itemCounts = precedingTile.listCache.itemCounts.slice();
                    if (indentLevel < itemCounts.length) {
                        itemCounts[indentLevel] = precedingItemCount + 1;
                    } else {
                        itemCounts[indentLevel] = 1;
                    }
                    for (let i = indentLevel + 1; i < itemCounts.length; i++) {
                        itemCounts[i] = 0;
                    }
                    tile.listCache = { itemCounts };
                } else {
                    // doesn't race because re-render is deferred
                    let series: number[];
                    if (tile.properties.listKind === 0) {
                        series = [0, 0, 2, 6, 3, 7, 2, 6, 3, 7];
                    } else {
                        series = [0, 0, 1, 2, 0, 1, 2, 3, 4, 5, 6, 0, 1, 2, 3, 4, 5, 6];
                    }
                    flowView.sharedString.annotateRange({ series },
                        tilePos, tilePos + 1);
                    convertToListHead(tile);
                }
            }
        }
    }
}

function getContentPct(pgMarker: IParagraphMarker) {
    if (pgMarker.properties && pgMarker.properties.contentWidth) {
        return pgMarker.properties.contentWidth;
    } else if (pgMarker.properties && pgMarker.properties.blockquote) {
        return 0.8;
    } else {
        if (randomIndent) {
            return 0.5 + (0.5 * Math.random());
        } else {
            return 1.0;
        }
    }
}

function buildIntervalTieStyle(b: SharedString.Interval, startX: number, endX: number,
    lineDivHeight: number, leftInBounds: boolean, rightInBounds: boolean,
    contentDiv: HTMLDivElement, client: SharedString.Client) {
    let bookmarkDiv = document.createElement("div");
    let bookmarkRect: ui.Rectangle;
    let bookendDiv1 = document.createElement("div");
    let bookendDiv2 = document.createElement("div");
    let tenthHeight = Math.max(1, Math.floor(lineDivHeight / 10));
    let halfHeight = Math.floor(lineDivHeight >> 1);
    bookmarkRect = new ui.Rectangle(startX, halfHeight - tenthHeight,
        endX - startX, 2 * tenthHeight);
    bookmarkRect.conformElement(bookmarkDiv);
    contentDiv.appendChild(bookmarkDiv);
    new ui.Rectangle(startX, 0, 3, lineDivHeight).conformElement(bookendDiv1);
    if (leftInBounds) {
        contentDiv.appendChild(bookendDiv1);
    }
    new ui.Rectangle(endX - 3, 0, 3, lineDivHeight).conformElement(bookendDiv2);
    if (rightInBounds) {
        contentDiv.appendChild(bookendDiv2);
    }
    bookmarkDiv.style.backgroundColor = "blue";
    bookendDiv1.style.backgroundColor = "blue";
    bookendDiv2.style.backgroundColor = "blue";
    if (b.properties && b.properties["clid"]) {
        let clientId = client.getOrAddShortClientId(b.properties["clid"], b.properties["user"]);
        let bgColor = presenceColors[clientId % presenceColors.length];
        bookmarkDiv.style.backgroundColor = bgColor;
        bookendDiv1.style.backgroundColor = bgColor;
        bookendDiv2.style.backgroundColor = bgColor;
    }
    bookmarkDiv.style.opacity = "0.5";
    bookmarkDiv.style.zIndex = "3";
    bookendDiv1.style.opacity = "0.5";
    bookendDiv1.style.zIndex = "3";
    bookendDiv2.style.opacity = "0.5";
    bookendDiv2.style.zIndex = "3";
}

function makeContentDiv(r: ui.Rectangle, lineFontstr) {
    let contentDiv = document.createElement("div");
    contentDiv.style.font = lineFontstr;
    contentDiv.style.whiteSpace = "pre";
    contentDiv.onclick = (e) => {
        let targetDiv = <HTMLDivElement>e.target;
        if (targetDiv.lastElementChild) {
            // tslint:disable-next-line:max-line-length
            console.log(`div click at ${e.clientX},${e.clientY} rightmost span with text ${targetDiv.lastElementChild.innerHTML}`);
        }
    };
    r.conformElement(contentDiv);
    return contentDiv;
}

interface ITableMarker extends SharedString.Marker {
    view?: TableView;
}

interface IBoxMarker extends SharedString.Marker {
    view?: BoxView;
}

interface IRowMarker extends SharedString.Marker {
    view?: RowView;
}

let tableIdSuffix = 0;
let boxIdSuffix = 0;
let rowIdSuffix = 0;

function createMarkerOp(
    pos1: number, id: string, refType: SharedString.ReferenceType, rangeLabels: string[], tileLabels?: string[]) {

    let props = <SharedString.MapLike<any>>{
    };
    if (id.length > 0) {
        props[SharedString.reservedMarkerIdKey] = id;
    }
    if (rangeLabels.length > 0) {
        props[SharedString.reservedRangeLabelsKey] = rangeLabels;
    }
    if (tileLabels) {
        props[SharedString.reservedTileLabelsKey] = tileLabels;
    }
    return <SharedString.IMergeTreeInsertMsg>{
        marker: { refType },
        pos1,
        props,
        type: SharedString.MergeTreeDeltaType.INSERT,
    };
}

// linear search for now (can stash column index on box but then need to invalidate)
/*function insertColumn(table: TableView, box: BoxView) {
    for (let columnIndex = 0, colCount = table.columns.length; columnIndex < colCount; columnIndex++) {
        let column = table.columns[columnIndex];
        for (let colBox of column.boxes) {
            if (colBox === box) {
                table.insertColumnRight(box, columnIndex);
            }
        }
    }
}
*/
let endPrefix = "end-";

function createBox(opList: SharedString.IMergeTreeOp[], idBase: string, pos: number, word?: string) {
    let boxId = idBase + `box${boxIdSuffix++}`;
    opList.push(createMarkerOp(pos, boxId,
        SharedString.ReferenceType.NestBegin, ["box"]));
    pos++;
    if (word) {
        let insertStringOp = <SharedString.IMergeTreeInsertMsg>{
            pos1: pos,
            text: word,
            type: SharedString.MergeTreeDeltaType.INSERT,
        };
        opList.push(insertStringOp);
        pos += word.length;
    }
    let pgOp = createMarkerOp(pos, boxId + "C",
        SharedString.ReferenceType.Tile, [], ["pg"]);
    opList.push(pgOp);
    pos++;
    opList.push(createMarkerOp(pos, endPrefix + boxId,
        SharedString.ReferenceType.NestEnd, ["box"]));
    pos++;
    return pos;
}

function createTable(pos: number, flowView: FlowView, nrows = 3, nboxes = 3) {
    let pgAtStart = true;
    if (pos > 0) {
        let segoff = flowView.client.mergeTree.getContainingSegment(pos - 1, SharedString.UniversalSequenceNumber,
            flowView.client.getClientId());
        if (segoff.segment.getType() === SharedString.SegmentType.Marker) {
            let marker = <SharedString.Marker>segoff.segment;
            if (marker.hasTileLabel("pg")) {
                pgAtStart = false;
            }
        }
    }
    let content = ["aardvark", "racoon", "jackelope", "springbok", "tiger", "lion", "eland", "anaconda", "fox"];
    let idBase = flowView.client.longClientId;
    idBase += `T${tableIdSuffix++}`;
    let opList = <SharedString.IMergeTreeInsertMsg[]>[];
    if (pgAtStart) {
        // TODO: copy pg properties from pg marker after pos
        let pgOp = createMarkerOp(pos, "",
            SharedString.ReferenceType.Tile, [], ["pg"]);
        opList.push(pgOp);
        pos++;
    }
    opList.push(createMarkerOp(pos, idBase,
        SharedString.ReferenceType.NestBegin, ["table"]));
    pos++;
    for (let row = 0; row < nrows; row++) {
        let rowId = idBase + `row${rowIdSuffix++}`;
        opList.push(createMarkerOp(pos, rowId,
            SharedString.ReferenceType.NestBegin, ["row"]));
        pos++;
        for (let box = 0; box < nboxes; box++) {
            pos = createBox(opList, idBase, pos, content[(box + (nboxes * row)) % content.length]);
        }
        opList.push(createMarkerOp(pos, endPrefix + rowId,
            SharedString.ReferenceType.NestEnd, ["row"]));
        pos++;
    }
    opList.push(createMarkerOp(pos, endPrefix + idBase,
        SharedString.ReferenceType.NestEnd |
        SharedString.ReferenceType.Tile, ["table"], ["pg"]));
    pos++;
    let groupOp = <SharedString.IMergeTreeGroupMsg>{
        ops: opList,
        type: SharedString.MergeTreeDeltaType.GROUP,
    };
    flowView.sharedString.transaction(groupOp);
}

class TableView {
    public width: number;
    public renderedHeight: number;
    public deferredHeight: number;
    public minContentWidth = 0;
    public indentPct = 0.0;
    public contentPct = 1.0;
    public rows = <RowView[]>[];
    public columns = <ColumnView[]>[];
    constructor(public tableMarker: ITableMarker, public endTableMarker: ITableMarker) {
    }

    public nextBox(box: BoxView) {
        let retNext = false;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            for (let boxIndex = 0, boxCount = row.boxes.length; boxIndex < boxCount; boxIndex++) {
                let rowBox = row.boxes[boxIndex];
                if (retNext) {
                    return rowBox;
                }
                if (rowBox === box) {
                    retNext = true;
                }
            }
        }
    }

    public prevBox(box: BoxView) {
        let retPrev = false;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            let row = this.rows[rowIndex];
            for (let boxIndex = row.boxes.length - 1; boxIndex >= 0; boxIndex--) {
                let rowBox = row.boxes[boxIndex];
                if (retPrev) {
                    return rowBox;
                }
                if (rowBox === box) {
                    retPrev = true;
                }
            }
        }
    }

    public findPrecedingRow(rowView: RowView) {
        let prevRow: RowView;
        for (let rowIndex = 0, rowCount = this.rows.length; rowIndex < rowCount; rowIndex++) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return prevRow;
            }
            prevRow = row;
        }
    }

    public findNextRow(rowView: RowView) {
        let nextRow: RowView;
        for (let rowIndex = this.rows.length - 1; rowIndex >= 0; rowIndex--) {
            let row = this.rows[rowIndex];
            if (row === rowView) {
                return nextRow;
            }
            nextRow = row;
        }
    }

    /*
        public insertColumnRight(requestingBox: BoxView, columnIndex: number, flowView: FlowView) {
            let column = this.columns[columnIndex];
            let opList = <SharedString.IMergeTreeOp[]>[];
            let client = flowView.client;
            let mergeTree = client.mergeTree;
            let tablePos = mergeTree.getOffset(this.tableMarker, SharedString.UniversalSequenceNumber,
                client.getClientId());
            let horizVersion = this.tableMarker.properties["horizVersion"];
            let versionIncr = <SharedString.IMergeTreeAnnotateMsg>{
                combiningOp: { name: "incr", defaultValue: 0 },
                pos1: tablePos,
                pos2: tablePos + 1,
                props: { horizVersion: 1 },
                type: SharedString.MergeTreeDeltaType.ANNOTATE,
                when: { props: { horizVersion } },
            };
            opList.push(versionIncr);
            let idBase = this.tableMarker.getId();
            for (let rowIndex = 0, len = column.boxes.length; rowIndex < len; rowIndex++) {
                let box = column.boxes[rowIndex];
                opList.push(<SharedString.Inser)
            }
        }
    */
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
            for (let box of col.boxes) {
                box.specWidth = col.width;
            }
        }
    }
}

class ColumnView {
    public minContentWidth = 0;
    public width = 0;
    public boxes = <BoxView[]>[];
    constructor(public columnIndex: number) {
    }
}

function findRowParent(lineDiv: ILineDiv) {
    let parent = <IRowDiv>lineDiv.parentElement;
    while (parent) {
        if (parent.rowView) {
            return parent;
        }
        parent = <IRowDiv>parent.parentElement;
    }
}

class RowView {
    public table: TableView;
    public pos: number;
    public endPos: number;
    public minContentWidth = 0;
    public boxes = <BoxView[]>[];
    constructor(public rowMarker: IRowMarker, public endRowMarker: IRowMarker) {

    }

    public findClosestBox(x: number) {
        let bestBox: BoxView;
        let bestDistance = -1;
        for (let box of this.boxes) {
            let bounds = box.div.getBoundingClientRect();
            let center = bounds.left + (bounds.width / 2);
            let distance = Math.abs(center - x);
            if ((distance < bestDistance) || (bestDistance < 0)) {
                bestBox = box;
                bestDistance = distance;
            }
        }
        return bestBox;
    }
}

class BoxView {
    public renderOutput: IRenderOutput;
    public minContentWidth = 0;
    public specWidth = 0;
    public renderedHeight: number;
    public div: HTMLDivElement;
    public viewport: Viewport;
    constructor(public marker: IBoxMarker, public endMarker: IBoxMarker) {
    }
}

function parseBox(boxStartPos: number, docContext: IDocumentContext, flowView: FlowView) {
    let mergeTree = flowView.client.mergeTree;
    let boxMarkerSegOff = mergeTree.getContainingSegment(boxStartPos, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId());
    let boxMarker = <IBoxMarker>boxMarkerSegOff.segment;
    let id = boxMarker.getId();
    let endId = "end-" + id;
    let endBoxMarker = <SharedString.Marker>mergeTree.getSegmentFromId(endId);
    let endBoxPos = mergeTree.getOffset(endBoxMarker, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId());
    boxMarker.view = new BoxView(boxMarker, endBoxMarker);
    let nextPos = boxStartPos + boxMarker.cachedLength;
    while (nextPos < endBoxPos) {
        let segoff = mergeTree.getContainingSegment(nextPos, SharedString.UniversalSequenceNumber,
            flowView.client.getClientId());
        // TODO: model error checking
        let segment = segoff.segment;
        if (segment.getType() === SharedString.SegmentType.Marker) {
            let marker = <SharedString.Marker>segoff.segment;
            if (marker.hasRangeLabel("table")) {
                let tableMarker = <ITableMarker>marker;
                parseTable(tableMarker, nextPos, docContext, flowView);
                if (tableMarker.view.minContentWidth > boxMarker.view.minContentWidth) {
                    boxMarker.view.minContentWidth = tableMarker.view.minContentWidth;
                }
                let endTableMarker = tableMarker.view.endTableMarker;
                nextPos = mergeTree.getOffset(
                    endTableMarker, SharedString.UniversalSequenceNumber, flowView.client.getClientId());
                nextPos += endTableMarker.cachedLength;
            } else {
                // empty paragraph
                nextPos++;
            }
        } else {
            // text segment
            let tilePos = findTile(flowView, nextPos, "pg", false);
            let pgMarker = <IParagraphMarker>tilePos.tile;
            if (!pgMarker.itemCache) {
                let itemsContext = <IItemsContext>{
                    curPGMarker: pgMarker,
                    docContext,
                    itemInfo: { items: [], minWidth: 0 },
                };
                let paragraphLexer = new ParagraphLexer(tokenToItems, itemsContext);
                itemsContext.paragraphLexer = paragraphLexer;

                mergeTree.mapRange({ leaf: segmentToItems }, SharedString.UniversalSequenceNumber,
                    flowView.client.getClientId(), itemsContext, nextPos, tilePos.pos);
                pgMarker.itemCache = itemsContext.itemInfo;
            }
            nextPos = tilePos.pos + 1;
            if (pgMarker.itemCache.minWidth > boxMarker.view.minContentWidth) {
                boxMarker.view.minContentWidth = pgMarker.itemCache.minWidth;
            }
        }
    }

    // console.log(`parsed box ${boxMarker.getId()}`);
    return boxMarker;
}

function parseRow(rowStartPos: number, docContext: IDocumentContext, flowView: FlowView) {
    let mergeTree = flowView.client.mergeTree;
    let rowMarkerSegOff = mergeTree.getContainingSegment(rowStartPos, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId());
    let rowMarker = <IRowMarker>rowMarkerSegOff.segment;
    let id = rowMarker.getId();
    let endId = "end-" + id;
    let endRowMarker = <SharedString.Marker>mergeTree.getSegmentFromId(endId);
    let endRowPos = mergeTree.getOffset(endRowMarker, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId());
    rowMarker.view = new RowView(rowMarker, endRowMarker);
    let nextPos = rowStartPos + rowMarker.cachedLength;
    while (nextPos < endRowPos) {
        let boxMarker = parseBox(nextPos, docContext, flowView);
        rowMarker.view.minContentWidth += boxMarker.view.minContentWidth;
        rowMarker.view.boxes.push(boxMarker.view);
        let endBoxPos = mergeTree.getOffset(boxMarker.view.endMarker, SharedString.UniversalSequenceNumber,
            flowView.client.getClientId());
        nextPos = endBoxPos + boxMarker.view.endMarker.cachedLength;
    }
    return rowMarker;
}

function parseTable(
    tableMarker: ITableMarker, tableMarkerPos: number, docContext: IDocumentContext, flowView: FlowView) {

    let mergeTree = flowView.client.mergeTree;
    let id = tableMarker.getId();
    let endId = "end-" + id;
    let endTableMarker = <SharedString.Marker>mergeTree.getSegmentFromId(endId);
    let endTablePos = mergeTree.getOffset(endTableMarker, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId());
    let tableView = new TableView(tableMarker, endTableMarker);
    tableMarker.view = tableView;
    let nextPos = tableMarkerPos + tableMarker.cachedLength;
    let rowIndex = 0;
    while (nextPos < endTablePos) {
        let rowMarker = parseRow(nextPos, docContext, flowView);
        let rowView = rowMarker.view;
        rowView.table = tableView;
        rowView.pos = nextPos;
        for (let i = 0, len = rowView.boxes.length; i < len; i++) {
            let box = rowView.boxes[i];
            if (!tableView.columns[i]) {
                tableView.columns[i] = new ColumnView(i);
            }
            let columnView = tableView.columns[i];
            columnView.boxes[rowIndex] = box;
            if (box.minContentWidth > columnView.minContentWidth) {
                columnView.minContentWidth = box.minContentWidth;
            }
        }

        if (rowMarker.view.minContentWidth > tableView.minContentWidth) {
            tableView.minContentWidth = rowMarker.view.minContentWidth;
        }
        let endRowPos = mergeTree.getOffset(rowMarker.view.endRowMarker, SharedString.UniversalSequenceNumber,
            flowView.client.getClientId());
        tableView.rows[rowIndex++] = rowView;
        rowView.endPos = endRowPos;
        nextPos = endRowPos + rowMarker.view.endRowMarker.cachedLength;
    }
    return tableView;
}

function isInnerBox(boxView: BoxView, layoutInfo: ILayoutContext) {
    return (!layoutInfo.startingPosStack) || (!layoutInfo.startingPosStack.box) ||
        (layoutInfo.startingPosStack.box.empty()) ||
        (layoutInfo.startingPosStack.box.items.length === (layoutInfo.stackIndex + 1));
}

function renderBox(
    boxView: BoxView, layoutInfo: ILayoutContext, targetTranslation: string, defer = false, rightmost = false) {
    let boxRect = new ui.Rectangle(0, 0, boxView.specWidth, 0);
    let boxViewportWidth = boxView.specWidth - (2 * layoutInfo.docContext.boxHMargin);
    let boxViewportRect = new ui.Rectangle(layoutInfo.docContext.boxHMargin, 0,
        boxViewportWidth, 0);
    let boxDiv = document.createElement("div");
    boxView.div = boxDiv;
    boxRect.conformElementOpenHeight(boxDiv);
    if (!rightmost) {
        boxDiv.style.borderRight = "1px solid black";
    }
    let client = layoutInfo.flowView.client;
    let mergeTree = client.mergeTree;
    let transferDeferredHeight = false;

    boxView.viewport = new Viewport(layoutInfo.viewport.remainingHeight(),
        document.createElement("div"), boxViewportWidth);
    boxViewportRect.conformElementOpenHeight(boxView.viewport.div);
    boxDiv.appendChild(boxView.viewport.div);
    boxView.viewport.vskip(layoutInfo.docContext.boxTopMargin);

    let boxLayoutInfo = <ILayoutContext>{
        deferredAttach: true,
        docContext: layoutInfo.docContext,
        endMarker: boxView.endMarker,
        flowView: layoutInfo.flowView,
        requestedPosition: layoutInfo.requestedPosition,
        stackIndex: layoutInfo.stackIndex,
        startingPosStack: layoutInfo.startingPosStack,
        viewport: boxView.viewport,
    };
    // TODO: deferred height calculation for starting in middle of box
    if (isInnerBox(boxView, layoutInfo)) {
        let boxPos = mergeTree.getOffset(boxView.marker, SharedString.UniversalSequenceNumber, client.getClientId());
        boxLayoutInfo.startPos = boxPos + boxView.marker.cachedLength;
    } else {
        let nextTable = layoutInfo.startingPosStack.table.items[layoutInfo.stackIndex + 1];
        boxLayoutInfo.startPos = getOffset(layoutInfo.flowView, <SharedString.Marker>nextTable);
        boxLayoutInfo.stackIndex = layoutInfo.stackIndex + 1;
    }
    boxView.renderOutput = renderFlow(boxLayoutInfo, targetTranslation, defer);
    if (transferDeferredHeight && (boxView.renderOutput.deferredHeight > 0)) {
        layoutInfo.deferUntilHeight = boxView.renderOutput.deferredHeight;
    }
    boxView.renderedHeight = boxLayoutInfo.viewport.getLineTop();
    if (boxLayoutInfo.reRenderList) {
        if (!layoutInfo.reRenderList) {
            layoutInfo.reRenderList = [];
        }
        for (let lineDiv of boxLayoutInfo.reRenderList) {
            layoutInfo.reRenderList.push(lineDiv);
        }
    }
}

function setRowBorders(rowDiv: HTMLDivElement, top = false) {
    rowDiv.style.borderLeft = "1px solid black";
    rowDiv.style.borderRight = "1px solid black";
    if (top) {
        rowDiv.style.borderTop = "1px solid black";
    }
    rowDiv.style.borderBottom = "1px solid black";
}

function renderTable(
    table: ITableMarker,
    docContext: IDocumentContext,
    layoutInfo: ILayoutContext,
    targetTranslation: string,
    defer = false) {

    let flowView = layoutInfo.flowView;
    let mergeTree = flowView.client.mergeTree;
    let tablePos = mergeTree.getOffset(table, SharedString.UniversalSequenceNumber, flowView.client.getClientId());
    let tableView = parseTable(table, tablePos, docContext, flowView);
    // let docContext = buildDocumentContext(viewportDiv);
    let viewportWidth = parseInt(layoutInfo.viewport.div.style.width, 10);

    let tableWidth = Math.floor(tableView.contentPct * viewportWidth);
    tableView.updateWidth(tableWidth);
    let tableIndent = Math.floor(tableView.indentPct * viewportWidth);
    let startRow: RowView;
    let startBox: BoxView;

    if (layoutInfo.startingPosStack) {
        if (layoutInfo.startingPosStack.row &&
            (layoutInfo.startingPosStack.row.items.length > layoutInfo.stackIndex)) {
            let startRowMarker = <IRowMarker>layoutInfo.startingPosStack.row.items[layoutInfo.stackIndex];
            startRow = startRowMarker.view;
        }
        if (layoutInfo.startingPosStack.box &&
            (layoutInfo.startingPosStack.box.items.length > layoutInfo.stackIndex)) {
            let startBoxMarker = <IBoxMarker>layoutInfo.startingPosStack.box.items[layoutInfo.stackIndex];
            startBox = startBoxMarker.view;
        }
    }

    let foundStartRow = (startRow === undefined);
    let tableHeight = 0;
    let deferredHeight = 0;
    let topRow = (layoutInfo.startingPosStack !== undefined) && (layoutInfo.stackIndex === 0);
    let firstRendered = true;
    for (let rowIndex = 0, rowCount = tableView.rows.length; rowIndex < rowCount; rowIndex++) {
        let rowView = tableView.rows[rowIndex];
        let rowHeight = 0;
        if (startRow === rowView) {
            foundStartRow = true;
        }
        let renderRow = (!defer) && (deferredHeight >= layoutInfo.deferUntilHeight) && foundStartRow;
        let rowDiv: IRowDiv;
        if (renderRow) {
            let rowRect = new ui.Rectangle(tableIndent, layoutInfo.viewport.getLineTop(), tableWidth, 0);
            rowDiv = <IRowDiv>document.createElement("div");
            rowDiv.rowView = rowView;
            setRowBorders(rowDiv, firstRendered);
            firstRendered = false;
            rowRect.conformElementOpenHeight(rowDiv);
            if (topRow && startBox) {
                renderBox(
                    startBox,
                    layoutInfo,
                    targetTranslation,
                    defer,
                    startBox === rowView.boxes[rowView.boxes.length - 1]);
                deferredHeight += startBox.renderOutput.deferredHeight;
                rowHeight = startBox.renderedHeight;
            }
        }
        let boxX = 0;
        for (let boxIndex = 0, boxCount = rowView.boxes.length; boxIndex < boxCount; boxIndex++) {
            let box = rowView.boxes[boxIndex];
            if (!topRow || (box !== startBox)) {
                renderBox(box, layoutInfo, targetTranslation, defer, box === rowView.boxes[rowView.boxes.length - 1]);
                if (rowHeight < box.renderedHeight) {
                    rowHeight = box.renderedHeight;
                }
                deferredHeight += box.renderOutput.deferredHeight;
                if (renderRow) {
                    box.viewport.div.style.height = `${box.renderedHeight}px`;
                    box.div.style.height = `${box.renderedHeight}px`;
                    box.div.style.left = `${boxX}px`;
                    rowDiv.appendChild(box.div);
                }
                boxX += box.specWidth;
            }
        }
        if (renderRow) {
            let heightVal = `${rowHeight}px`;
            for (let boxIndex = 0, boxCount = rowView.boxes.length; boxIndex < boxCount; boxIndex++) {
                let box = rowView.boxes[boxIndex];
                box.div.style.height = heightVal;
            }
            tableHeight += rowHeight;
            layoutInfo.viewport.commitLineDiv(rowDiv, rowHeight);
            rowDiv.style.height = heightVal;
            rowDiv.linePos = rowView.pos;
            rowDiv.lineEnd = rowView.endPos;
            layoutInfo.viewport.div.appendChild(rowDiv);
        }
        if (topRow) {
            topRow = false;
            layoutInfo.startingPosStack = undefined;
        }
    }
    if (layoutInfo.reRenderList) {
        for (let lineDiv of layoutInfo.reRenderList) {
            reRenderLine(lineDiv, flowView);
        }
        layoutInfo.reRenderList = undefined;
    }
    tableView.deferredHeight = deferredHeight;
    tableView.renderedHeight = tableHeight;
}

function renderTree(
    viewportDiv: HTMLDivElement, requestedPosition: number, flowView: FlowView, targetTranslation: string) {
    let client = flowView.client;
    let docContext = buildDocumentContext(viewportDiv);
    let outerViewportHeight = parseInt(viewportDiv.style.height, 10);
    let outerViewportWidth = parseInt(viewportDiv.style.width, 10);
    let outerViewport = new Viewport(outerViewportHeight, viewportDiv, outerViewportWidth);
    let startingPosStack =
        client.mergeTree.getStackContext(requestedPosition, client.getClientId(), ["table", "box", "row"]);
    let layoutContext = <ILayoutContext>{
        docContext,
        flowView,
        requestedPosition,
        viewport: outerViewport,
    };
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        let outerTable = startingPosStack.table.items[0];
        let outerTablePos = flowView.client.mergeTree.getOffset(<SharedString.Marker>outerTable,
            SharedString.UniversalSequenceNumber, flowView.client.getClientId());
        layoutContext.startPos = outerTablePos;
        layoutContext.stackIndex = 0;
        layoutContext.startingPosStack = startingPosStack;
    } else {
        let previousTileInfo = findTile(flowView, requestedPosition, "pg");
        if (previousTileInfo) {
            layoutContext.startPos = previousTileInfo.pos + 1;
        } else {
            layoutContext.startPos = 0;
        }
    }
    return renderFlow(layoutContext, targetTranslation);
}

function tokenToItems(
    text: string, type: ParagraphItemType, leadSegment: SharedString.TextSegment, itemsContext: IItemsContext) {
    let docContext = itemsContext.docContext;
    let lfontstr = docContext.fontstr;
    let divHeight = docContext.defaultLineDivHeight;
    if (itemsContext.curPGMarker.properties && (itemsContext.curPGMarker.properties.header !== undefined)) {
        lfontstr = docContext.headerFontstr;
        divHeight = docContext.headerDivHeight;
    }
    if (leadSegment.properties) {
        let fontSize = leadSegment.properties.fontSize;
        if (fontSize !== undefined) {
            lfontstr = `${fontSize} Times`;
            divHeight = +fontSize;
        }
        let lineHeight = leadSegment.properties.lineHeight;
        if (lineHeight !== undefined) {
            divHeight = +lineHeight;
        }
        let fontStyle = leadSegment.properties.fontStyle;
        if (fontStyle) {
            lfontstr = fontStyle + " " + lfontstr;
        }
    }

    let textWidth = getTextWidth(text, lfontstr);
    if (textWidth > itemsContext.itemInfo.minWidth) {
        itemsContext.itemInfo.minWidth = textWidth;
    }
    if (type === ParagraphItemType.Block) {
        let block = makeIPGBlock(textWidth, text, leadSegment);
        if (divHeight !== itemsContext.docContext.defaultLineDivHeight) {
            block.height = divHeight;
        }
        itemsContext.itemInfo.items.push(block);
    } else {
        itemsContext.itemInfo.items.push(makeGlue(textWidth, text, leadSegment,
            docContext.wordSpacing / 2, docContext.wordSpacing / 3));
    }
}

function isEndBox(marker: SharedString.Marker) {
    return (marker.refType & SharedString.ReferenceType.NestEnd) &&
        marker.hasRangeLabel("box");
}

function segmentToItems(
    segment: SharedString.Segment, segpos: number, refSeq: number, clientId: number,
    start: number, end: number, context: IItemsContext) {
    if (segment.getType() === SharedString.SegmentType.Text) {
        let textSegment = <SharedString.TextSegment>segment;
        context.paragraphLexer.lex(textSegment);
    } else if (segment.getType() === SharedString.SegmentType.Marker) {
        let marker = <SharedString.Marker>segment;
        if (marker.hasTileLabel("pg") || isEndBox(marker)) {
            context.nextPGPos = segpos;
            return false;
        }
    }
    return true;
}

function gatherOverlayLayer(
    segment: SharedString.Segment,
    segpos: number,
    refSeq: number,
    clientId: number,
    start: number,
    end: number,
    context: IOverlayMarker[]) {

    if (segment.getType() === SharedString.SegmentType.Marker) {
        let marker = <SharedString.Marker>segment;
        if (marker.refType === SharedString.ReferenceType.Simple) {
            context.push({ id: marker.getId(), position: segpos });
        }
    }

    return true;
}

export interface IViewportDiv extends HTMLDivElement {
}

function closestNorth(lineDivs: ILineDiv[], y: number) {
    let best = -1;
    let lo = 0;
    let hi = lineDivs.length - 1;
    while (lo <= hi) {
        let bestBounds: ClientRect;
        let mid = lo + Math.floor((hi - lo) / 2);
        let lineDiv = lineDivs[mid];
        let bounds = lineDiv.getBoundingClientRect();
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
        let mid = lo + Math.floor((hi - lo) / 2);
        let lineDiv = lineDivs[mid];
        let bounds = lineDiv.getBoundingClientRect();
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

class Viewport {
    // keep these in order
    public lineDivs: ILineDiv[] = [];
    public visibleRanges: IRange[] = [];
    public currentLineStart = -1;
    private lineTop = 0;

    constructor(public maxHeight: number, public div: IViewportDiv, private width: number) {
    }

    public startLine(heightEstimate?: number) {
        // TODO: update width relative to started line
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

    public currentLineWidth() {
        return this.width;
    }

    public vskip(h: number) {
        this.lineTop += h;
    }

    public getLineTop() {
        return this.lineTop;
    }

    public setLineTop(v: number) {
        this.lineTop = v;
    }

    public commitLineDiv(lineDiv: ILineDiv, h: number) {
        this.lineTop += h;
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

    public setWidth(w: number) {
        this.width = w;
    }
}

interface ILayoutContext {
    containingPGMarker?: IParagraphMarker;
    viewport: Viewport;
    deferredAttach?: boolean;
    reRenderList?: ILineDiv[];
    deferUntilHeight?: number;
    docContext: IDocumentContext;
    requestedPosition?: number;
    startPos: number;
    endMarker?: SharedString.Marker;
    flowView: FlowView;
    stackIndex?: number;
    startingPosStack?: SharedString.RangeStackMap;
}

interface IRenderOutput {
    deferredHeight: number;
    overlayMarkers: IOverlayMarker[];
    // TODO: make this an array for tables that extend past bottom of viewport
    viewportStartPos: number;
    viewportEndPos: number;
}

function renderFlow(layoutContext: ILayoutContext, targetTranslation: string, deferWhole = false): IRenderOutput {
    let flowView = layoutContext.flowView;
    let client = flowView.client;
    // TODO: for stable viewports cache the geometry and the divs
    // TODO: cache all this pre-amble in style blocks; override with pg properties
    let docContext = layoutContext.docContext;
    let viewportStartPos = -1;
    let lastLineDiv = undefined;

    function makeLineDiv(r: ui.Rectangle, lineFontstr) {
        let lineDiv = makeContentDiv(r, lineFontstr);
        layoutContext.viewport.div.appendChild(lineDiv);
        lastLineDiv = lineDiv;
        return lineDiv;
    }

    let currentPos = layoutContext.startPos;
    let curPGMarker: IParagraphMarker;
    let curPGMarkerPos: number;

    let itemsContext = <IItemsContext>{
        docContext,
    };
    if (layoutContext.deferUntilHeight === undefined) {
        layoutContext.deferUntilHeight = 0;
    }
    let deferredHeight = 0;
    let deferredPGs = (layoutContext.containingPGMarker !== undefined);
    let paragraphLexer = new ParagraphLexer(tokenToItems, itemsContext);
    itemsContext.paragraphLexer = paragraphLexer;
    textErrorRun = undefined;

    function makeAnnotDiv(x: number, y: number, width: number, fontstr: string) {
        let annotDiv = document.createElement("div");
        annotDiv.style.font = fontstr;
        annotDiv.style.fontStyle = "italic";
        let rect = new ui.Rectangle(x, y, width, 0);
        rect.conformElementOpenHeight(annotDiv);
        layoutContext.viewport.div.appendChild(annotDiv);
        return annotDiv;
    }

    function renderPGAnnotation(endPGMarker: IParagraphMarker, indentWidth: number, contentWidth: number) {
        let annotDiv = makeAnnotDiv(indentWidth, layoutContext.viewport.getLineTop(),
            contentWidth, docContext.fontstr);
        let text = endPGMarker.properties[targetTranslation];
        annotDiv.innerHTML = text;
        let clientRect = annotDiv.getBoundingClientRect();
        return clientRect.height;
    }

    function renderPG(
        endPGMarker: IParagraphMarker,
        pgStartPos: number,
        indentWidth: number,
        indentSymbol: ISymbol,
        contentWidth: number) {

        let pgBreaks = endPGMarker.cache.breaks;
        let lineDiv: ILineDiv;
        let lineDivHeight = docContext.defaultLineDivHeight;
        let span: ISegSpan;

        for (let breakIndex = 0, len = pgBreaks.length; breakIndex < len; breakIndex++) {
            let lineStart = pgBreaks[breakIndex] + pgStartPos;
            let lineEnd: number;
            if (breakIndex < (len - 1)) {
                lineEnd = pgBreaks[breakIndex + 1] + pgStartPos;
            } else {
                lineEnd = undefined;
            }
            let lineFontstr = docContext.fontstr;
            lineDivHeight = docContext.defaultLineDivHeight;
            if (endPGMarker.properties && (endPGMarker.properties.header !== undefined)) {
                // TODO: header levels etc.
                lineDivHeight = docContext.headerDivHeight;
                lineFontstr = docContext.headerFontstr;
            }
            let lineOK = (!(deferredPGs || deferWhole)) && (layoutContext.deferUntilHeight <= deferredHeight);
            if (lineOK && ((lineEnd === undefined) || (lineEnd > layoutContext.requestedPosition))) {
                lineDiv = makeLineDiv(new ui.Rectangle(0, layoutContext.viewport.getLineTop(),
                    layoutContext.viewport.currentLineWidth(), lineDivHeight),
                    lineFontstr);
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
                let lineContext = <ILineContext>{
                    contentDiv, deferredAttach: layoutContext.deferredAttach, flowView: layoutContext.flowView,
                    lineDiv, lineDivHeight, span,
                };
                if (viewportStartPos < 0) {
                    viewportStartPos = lineStart;
                }
                client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, SharedString.UniversalSequenceNumber,
                    client.getClientId(), lineContext, lineStart, lineEnd);
                if (layoutContext.flowView.bookmarks) {
                    let computedEnd = lineEnd;
                    if (!computedEnd) {
                        computedEnd = client.mergeTree.getOffset(endPGMarker, client.getCurrentSeq(),
                            client.getClientId());
                    }
                    let bookmarks = layoutContext.flowView.bookmarks.findOverlappingIntervals(lineStart, computedEnd);
                    if (bookmarks) {
                        let lineText = client.getText(lineStart, computedEnd);
                        for (let b of bookmarks) {
                            let start = b.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                                client.getClientId());
                            let end = b.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                                client.getClientId());
                            let startX: number;
                            if (start >= lineStart) {
                                startX = getTextWidth(lineText.substring(0, start - lineStart), lineFontstr);
                            } else {
                                startX = 0;
                            }
                            let endX: number;
                            if (end <= computedEnd) {
                                endX = getTextWidth(lineText.substring(0, end - lineStart), lineFontstr);
                            } else {
                                endX = getTextWidth(lineText, lineFontstr);
                            }
                            buildIntervalTieStyle(b, startX, endX, lineDivHeight,
                                start >= lineStart, end <= computedEnd, contentDiv, client);
                            /*
                            console.log(`line [${lineStart},${lineEnd}) matched interval [${start},${end})`);
                            if ((lineStart>end)||(lineEnd<=start)) {
                                console.log("disturbing match");
                            }
                            */
                        }
                    }
                }
                span = lineContext.span;
                if (lineContext.reRenderList) {
                    if (!layoutContext.reRenderList) {
                        layoutContext.reRenderList = [];
                    }
                    for (let ldiv of lineContext.reRenderList) {
                        layoutContext.reRenderList.push(ldiv);
                    }
                }

                layoutContext.viewport.commitLineDiv(lineDiv, lineDivHeight);
            } else {
                deferredHeight += lineDivHeight;
            }

            if (layoutContext.viewport.remainingHeight() < docContext.defaultLineDivHeight) {
                // no more room for lines
                // TODO: record end viewport char
                break;
            }
        }
    }

    let fetchLog = false;
    let segoff: ISegmentOffset;
    let totalLength = client.getLength();
    // TODO: use end of doc marker
    do {
        if (!segoff) {
            segoff = getContainingSegment(flowView, currentPos);
        }
        if (fetchLog) {
            console.log(`got segment ${segoff.segment.toString()}`);
        }
        if (!segoff.segment) {
            break;
        }
        if ((segoff.segment.getType() === SharedString.SegmentType.Marker) &&
            ((<SharedString.Marker>segoff.segment).hasRangeLabel("table"))) {
            let marker = <SharedString.Marker>segoff.segment;
            // TODO: branches
            let tableView: TableView;
            if (marker.removedSeq === undefined) {
                renderTable(marker, docContext, layoutContext, targetTranslation, deferredPGs);
                tableView = (<ITableMarker>marker).view;
                deferredHeight += tableView.deferredHeight;
                layoutContext.viewport.vskip(layoutContext.docContext.tableVspace);
            } else {
                tableView = parseTable(marker, currentPos, docContext, flowView);
            }
            let endTablePos = getOffset(layoutContext.flowView, tableView.endTableMarker);
            currentPos = endTablePos + 1;
            segoff = undefined;
            // TODO: if reached end of viewport, get pos ranges
        } else {
            if (segoff.segment.getType() === SharedString.SegmentType.Marker) {
                // empty paragraph
                curPGMarker = <IParagraphMarker>segoff.segment;
                if (fetchLog) {
                    console.log("empty pg");
                    if (curPGMarker.itemCache) {
                        console.log(`length items ${curPGMarker.itemCache.items.length}`);
                    }
                }
                curPGMarkerPos = currentPos;
            } else {
                let curTilePos = findTile(flowView, currentPos, "pg", false);
                curPGMarker = <IParagraphMarker>curTilePos.tile;
                curPGMarkerPos = curTilePos.pos;
            }
            itemsContext.curPGMarker = curPGMarker;
            // TODO: only set this to undefined if text changed
            curPGMarker.listCache = undefined;
            getListCacheInfo(layoutContext.flowView, curPGMarker, curPGMarkerPos);
            let indentPct = 0.0;
            let contentPct = 1.0;
            let indentWidth = 0;
            let contentWidth = layoutContext.viewport.currentLineWidth();
            let indentSymbol: ISymbol = undefined;

            if (curPGMarker.listCache) {
                indentSymbol = getIndentSymbol(curPGMarker);
            }
            if (indentPct === 0.0) {
                indentPct = getIndentPct(curPGMarker);
            }
            if (contentPct === 1.0) {
                contentPct = getContentPct(curPGMarker);
            }
            if (indentPct !== 0.0) {
                indentWidth = Math.floor(indentPct * layoutContext.viewport.currentLineWidth());
                if (docContext.indentWidthThreshold >= layoutContext.viewport.currentLineWidth()) {
                    let em2 = Math.round(2 * getTextWidth("M", docContext.fontstr));
                    indentWidth = em2 + indentWidth;
                }
            }
            contentWidth = Math.floor(contentPct * layoutContext.viewport.currentLineWidth()) - indentWidth;
            if (contentWidth > layoutContext.viewport.currentLineWidth()) {
                // tslint:disable:max-line-length
                console.log(`egregious content width ${contentWidth} bound ${layoutContext.viewport.currentLineWidth()}`);
            }
            if (flowView.historyClient) {
                clearContentCaches(curPGMarker);
            }
            if ((!curPGMarker.cache) || (curPGMarker.cache.singleLineWidth !== contentWidth)) {
                if (!curPGMarker.itemCache) {
                    itemsContext.itemInfo = { items: [], minWidth: 0 };
                    client.mergeTree.mapRange({ leaf: segmentToItems }, SharedString.UniversalSequenceNumber,
                        client.getClientId(), itemsContext, currentPos, curPGMarkerPos + 1);
                    curPGMarker.itemCache = itemsContext.itemInfo;
                } else {
                    itemsContext.itemInfo = curPGMarker.itemCache;
                }
                let breaks = breakPGIntoLinesFF(itemsContext.itemInfo.items, contentWidth);
                curPGMarker.cache = { breaks, singleLineWidth: contentWidth };
            }
            paragraphLexer.reset();
            // TODO: more accurate end of document reasoning
            if (currentPos < totalLength) {
                renderPG(curPGMarker, currentPos, indentWidth, indentSymbol, contentWidth);
                currentPos = curPGMarkerPos + curPGMarker.cachedLength;

                if (!deferredPGs) {
                    if (curPGMarker.properties[targetTranslation]) {
                        // layoutContext.viewport.vskip(Math.floor(docContext.pgVspace/2));
                        let height = renderPGAnnotation(curPGMarker, indentWidth, contentWidth);
                        layoutContext.viewport.vskip(height);
                    }
                }
                if (lastLineDiv) {
                    lastLineDiv.lineEnd = curPGMarkerPos;
                }
                if (currentPos < totalLength) {
                    segoff = getContainingSegment(flowView, currentPos);
                    if (segoff.segment.getType() === SharedString.SegmentType.Marker) {
                        let marker = <SharedString.Marker>segoff.segment;
                        if (marker.hasRangeLabel("box") && (marker.refType & SharedString.ReferenceType.NestEnd)) {
                            layoutContext.viewport.vskip(layoutContext.docContext.boxVspace);
                            break;
                        }
                    }
                } else {
                    break;
                }
                if (!deferredPGs) {
                    layoutContext.viewport.vskip(docContext.pgVspace);
                }
            } else {
                break;
            }
        }
    } while (layoutContext.viewport.remainingHeight() >= docContext.defaultLineDivHeight);

    // Find overlay annotations
    const viewportEndPos = currentPos;

    const overlayMarkers: IOverlayMarker[] = [];
    client.mergeTree.mapRange(
        { leaf: gatherOverlayLayer },
        SharedString.UniversalSequenceNumber,
        client.getClientId(),
        overlayMarkers,
        viewportStartPos,
        viewportEndPos);

    return {
        deferredHeight,
        overlayMarkers,
        viewportStartPos,
        viewportEndPos,
    };
}

function makeSegSpan(
    context: FlowView, segText: string, textSegment: SharedString.TextSegment, offsetFromSegpos: number,
    segpos: number) {
    let span = <ISegSpan>document.createElement("span");
    span.innerText = segText;
    span.seg = textSegment;
    span.segPos = segpos;
    let textErr = false;
    const spellOption = "spellchecker";
    if (textSegment.properties) {
        // tslint:disable-next-line
        for (let key in textSegment.properties) {
            if (key === "textError" && (viewOptions === undefined || viewOptions[spellOption] !== "disabled")) {
                textErr = true;
                if (textErrorRun === undefined) {
                    textErrorRun = {
                        end: segpos + offsetFromSegpos + segText.length,
                        start: segpos + offsetFromSegpos,
                    };
                } else {
                    textErrorRun.end += segText.length;
                }
                let textErrorInfo = <ITextErrorInfo>textSegment.properties[key];
                let slb: ISelectionListBox;
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
                if (textErrorInfo.alternates.length > 0) {
                    span.onmousedown = (e) => {
                        function cancelIntellisense(ev: MouseEvent) {
                            if (slb) {
                                document.body.removeChild(slb.elm);
                                slb = undefined;
                            }
                        }
                        function acceptIntellisense(ev: MouseEvent) {
                            cancelIntellisense(ev);
                            let itemElm = <HTMLElement>ev.target;
                            let text = itemElm.innerText.trim();
                            context.sharedString.removeText(span.textErrorRun.start, span.textErrorRun.end);
                            context.sharedString.insertText(text, span.textErrorRun.start);
                            context.localQueueRender(span.textErrorRun.start);
                        }
                        function selectItem(ev: MouseEvent) {
                            let itemElm = <HTMLElement>ev.target;
                            if (slb) {
                                slb.selectItem(itemElm.innerText);
                            }
                            // console.log(`highlight ${itemElm.innerText}`);
                        }
                        console.log(`button ${e.button}`);
                        if ((e.button === 2) || ((e.button === 0) && (e.ctrlKey))) {
                            let spanBounds = ui.Rectangle.fromClientRect(span.getBoundingClientRect());
                            spanBounds.width = Math.floor(window.innerWidth / 4);
                            slb = selectionListBoxCreate(spanBounds, document.body, 24, 0, 12);
                            slb.showSelectionList(altsToItems(textErrorInfo.alternates));
                            span.onmouseup = cancelIntellisense;
                            document.body.onmouseup = cancelIntellisense;
                            slb.elm.onmouseup = acceptIntellisense;
                            slb.elm.onmousemove = selectItem;
                        } else if (e.button === 0) {
                            context.clickSpan(e.clientX, e.clientY, span);
                        }
                    };
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
    let range = document.caretRangeFromPoint(x, y);
    if (range) {
        let result = {
            elm: <HTMLElement>range.startContainer.parentElement,
            node: range.startContainer,
            offset: range.startOffset,
        };
        range.detach();
        return result;
    }
}

export function clearSubtree(elm: HTMLElement) {
    while (elm.lastChild) {
        elm.removeChild(elm.lastChild);
    }
}

let presenceColors = ["darkgreen", "sienna", "olive", "purple"];

export class Cursor {
    public off = true;
    public parentSpan: HTMLSpanElement;
    public editSpan: HTMLSpanElement;
    public presenceDiv: HTMLDivElement;
    public presenceInfo: ILocalPresenceInfo;
    public presenceInfoUpdated = true;

    private blinkCount = 0;
    private blinkTimer: any;
    private bgColor = "blue";

    constructor(public viewportDiv: HTMLDivElement, public pos = 0) {
        this.makeSpan();
    }

    public addPresenceInfo(presenceInfo: ILocalPresenceInfo) {
        // for now, color
        let presenceColorIndex = presenceInfo.clientId % presenceColors.length;
        this.bgColor = presenceColors[presenceColorIndex];
        this.presenceInfo = presenceInfo;
        this.makePresenceDiv();
        this.show();
    }

    public hide() {
        this.editSpan.style.visibility = "hidden";
    }

    public show() {
        this.editSpan.style.backgroundColor = this.bgColor;
        this.editSpan.style.visibility = "visible";
        if (this.presenceInfo) {
            this.presenceDiv.style.visibility = "visible";
        }
    }

    public makePresenceDiv() {
        this.presenceDiv = document.createElement("div");
        this.presenceDiv.innerText = this.presenceInfo.key;
        this.presenceDiv.style.zIndex = "1";
        this.presenceDiv.style.position = "absolute";
        this.presenceDiv.style.color = "white";
        this.presenceDiv.style.backgroundColor = this.bgColor;
        this.presenceDiv.style.font = "14px Arial";
        this.presenceDiv.style.border = `3px solid ${this.bgColor}`;
        this.presenceDiv.style.borderTopRightRadius = "1em";
    }

    public makeSpan() {
        this.editSpan = document.createElement("span");
        this.editSpan.innerText = "\uFEFF";
        this.editSpan.style.zIndex = "1";
        this.editSpan.style.position = "absolute";
        this.editSpan.style.left = "0px";
        this.editSpan.style.top = "0px";
        this.editSpan.style.width = "2px";
        this.show();
    }

    public lineDiv() {
        return <ILineDiv>this.editSpan.parentElement;
    }

    public updateView(flowView: FlowView) {
        let lineDiv = this.lineDiv();
        if (lineDiv && (lineDiv.linePos <= this.pos) && (lineDiv.lineEnd > this.pos)) {
            reRenderLine(lineDiv, flowView);
        } else {
            let foundLineDiv = findLineDiv(this.pos, flowView, true);
            if (foundLineDiv) {
                reRenderLine(foundLineDiv, flowView);
            } else {
                flowView.render(flowView.topChar, true);
            }
        }
    }

    public rect() {
        return this.editSpan.getBoundingClientRect();
    }

    public assignToLine(x: number, h: number, lineDiv: HTMLDivElement) {
        this.editSpan.style.left = `${x}px`;
        this.editSpan.style.height = `${h}px`;
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        lineDiv.appendChild(this.editSpan);
        if (this.presenceInfo) {
            let bannerHeight = 20;
            let halfBannerHeight = bannerHeight / 2;
            this.presenceDiv.style.left = `${x}px`;
            this.presenceDiv.style.height = `${bannerHeight}px`;
            this.presenceDiv.style.top = `-${halfBannerHeight}px`;
            if (this.presenceDiv.parentElement) {
                this.presenceDiv.parentElement.removeChild(this.presenceDiv);
            }
            lineDiv.appendChild(this.presenceDiv);
        }
        if ((!this.presenceInfo) || (this.presenceInfo.fresh)) {
            if (this.presenceInfo) {
                this.presenceDiv.style.opacity = "1.0";
            }
            if (this.blinkTimer) {
                clearTimeout(this.blinkTimer);
            }
            this.blinkCursor();
        }
    }

    private blinker = () => {
        if (this.off) {
            this.show();
        } else {
            this.hide();
        }
        this.off = !this.off;
        if (this.blinkCount > 0) {
            this.blinkCount--;
            if (this.presenceInfo) {
                let opacity = 0.5 + (0.5 * Math.exp(-0.05 * (30 - this.blinkCount)));
                if (this.blinkCount <= 20) {
                    opacity = 0.0;
                } else if (this.blinkCount > 26) {
                    opacity = 1.0;
                }
                this.presenceDiv.style.opacity = `${opacity}`;
            }
            this.blinkTimer = setTimeout(this.blinker, 500);
        } else {
            if (this.presenceInfo) {
                this.presenceDiv.style.opacity = "0.0";
            }
            this.show();
        }
    }

    private blinkCursor() {
        this.blinkCount = 30;
        this.off = true;
        this.blinkTimer = setTimeout(this.blinker, 20);
    }
}

enum KeyCode {
    backspace = 8,
    TAB = 9,
    esc = 27,
    pageUp = 33,
    pageDown = 34,
    end = 35,
    home = 36,
    leftArrow = 37,
    upArrow = 38,
    rightArrow = 39,
    downArrow = 40,
    letter_a = 65,
    letter_z = 90,
}

export interface IRemotePresenceInfo {
    origPos: number;
    refseq: number;
    key?: string;
    clientId?: number;
}

export interface ILocalPresenceInfo {
    localRef?: SharedString.LocalReference;
    xformPos?: number;
    clientId: number;
    key?: string;
    cursor?: Cursor;
    fresh: boolean;
}

interface ISegmentOffset {
    segment: SharedString.Segment;
    offset: number;
}

interface IWordRange {
    wordStart: number;
    wordEnd: number;
}

function getCurrentWord(pos: number, mergeTree: SharedString.MergeTree) {
    let wordStart = -1;
    let wordEnd = -1;

    function maximalWord(textSegment: SharedString.TextSegment, offset: number) {
        let segWordStart = offset;
        let segWordEnd = offset;

        let epos = offset;
        let nonWord = /\W/;
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
        return <IWordRange>{ wordStart: segWordStart, wordEnd: segWordEnd };
    }

    let expandWordBackward = (segment: SharedString.Segment) => {
        if (mergeTree.localNetLength(segment)) {
            switch (segment.getType()) {
                case SharedString.SegmentType.Marker:
                    return false;
                case SharedString.SegmentType.Text:
                    let textSegment = <SharedString.TextSegment>segment;
                    let innerOffset = textSegment.text.length - 1;
                    let maxWord = maximalWord(textSegment, innerOffset);
                    if (maxWord.wordStart < maxWord.wordEnd) {
                        wordStart -= (maxWord.wordEnd - maxWord.wordStart);
                        return (maxWord.wordStart === 0);
                    } else {
                        return false;
                    }
            }
        }
        return true;
    };

    let expandWordForward = (segment: SharedString.Segment) => {
        if (mergeTree.localNetLength(segment)) {
            switch (segment.getType()) {
                case SharedString.SegmentType.Marker:
                    return false;
                case SharedString.SegmentType.Text:
                    let textSegment = <SharedString.TextSegment>segment;
                    let innerOffset = 0;
                    let maxWord = maximalWord(textSegment, innerOffset);
                    if (maxWord.wordEnd > innerOffset) {
                        wordEnd += (maxWord.wordEnd - innerOffset);
                    }
                    return (maxWord.wordEnd === textSegment.text.length);
            }
        }
        return true;
    };

    let segoff = mergeTree.getContainingSegment(pos,
        SharedString.UniversalSequenceNumber, mergeTree.collabWindow.clientId);
    if (segoff.segment && (segoff.segment.getType() === SharedString.SegmentType.Text)) {
        let textSegment = <SharedString.TextSegment>segoff.segment;
        let maxWord = maximalWord(textSegment, segoff.offset);
        if (maxWord.wordStart < maxWord.wordEnd) {
            let segStartPos = pos - segoff.offset;
            wordStart = segStartPos + maxWord.wordStart;
            wordEnd = segStartPos + maxWord.wordEnd;
            if (maxWord.wordStart === 0) {
                mergeTree.leftExcursion(segoff.segment, expandWordBackward);
            }
            if (maxWord.wordEnd === textSegment.text.length) {
                mergeTree.rightExcursion(segoff.segment, expandWordForward);
            }
        }
        if (wordStart >= 0) {
            return <IWordRange>{ wordStart, wordEnd };
        }
    }
}

function getLocalRefPos(flowView: FlowView, localRef: SharedString.LocalReference) {
    return flowView.client.mergeTree.getOffset(localRef.segment, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId()) + localRef.offset;
}

function getContainingSegment(flowView: FlowView, pos: number): ISegmentOffset {
    return flowView.client.mergeTree.getContainingSegment(pos, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId());
}

function findTile(flowView: FlowView, startPos: number, tileType: string, preceding = true) {
    return flowView.client.mergeTree.findTile(startPos, flowView.client.getClientId(), tileType, preceding);
}

function getOffset(flowView: FlowView, segment: SharedString.Segment) {
    return flowView.client.mergeTree.getOffset(segment, SharedString.UniversalSequenceNumber,
        flowView.client.getClientId());
}

function preventD(e: Event) {
    e.returnValue = false;
    e.preventDefault();
    return false;
}

export class FlowView extends ui.Component {
    public static docStartPosition = 0;
    public timeToImpression: number;
    public timeToLoad: number;
    public timeToEdit: number;
    public timeToCollab: number;
    public prevTopSegment: SharedString.TextSegment;
    public viewportStartPos: number;
    public viewportEndPos: number;
    public cursorSpan: HTMLSpanElement;
    public viewportDiv: HTMLDivElement;
    public viewportRect: ui.Rectangle;
    public client: SharedString.Client;
    public historyClient: SharedString.Client;
    public historyWidget: HTMLDivElement;
    public historyBubble: HTMLDivElement;
    public historyVersion: HTMLSpanElement;
    public savedClient: SharedString.Client;
    public ticking = false;
    public wheelTicking = false;
    public topChar = -1;
    public cursor: Cursor;
    public bookmarks: SharedIntervalCollection;
    public comments: SharedIntervalCollection;
    public presenceMapView: types.IMapView;
    public userMapView: types.IMapView;
    public presenceVector: ILocalPresenceInfo[] = [];
    public docRoot: types.IMapView;
    public curPG: SharedString.Marker;
    private lastVerticalX = -1;
    private randWordTimer: any;
    private pendingRender = false;
    private diagCharPort = false;
    private targetTranslation: string;

    constructor(
        element: HTMLDivElement,
        public collabDocument: api.Document,
        public sharedString: SharedString.SharedString,
        public status: Status,
        public options: Object = undefined) {

        super(element);

        this.client = sharedString.client;
        this.viewportDiv = document.createElement("div");
        this.element.appendChild(this.viewportDiv);
        const translationLanguage = "translationLanguage";
        this.targetTranslation = options[translationLanguage]
            ? `translation-${options[translationLanguage]}`
            : undefined;

        this.statusMessage("li", " ");
        this.statusMessage("si", " ");
        sharedString.on("op", (msg: core.ISequencedObjectMessage) => {
            if (msg.clientId !== this.client.longClientId) {
                let delta = <SharedString.IMergeTreeOp>msg.contents;
                if (this.applyOp(delta, msg)) {
                    this.queueRender(msg);
                }
            }
        });

        this.cursor = new Cursor(this.viewportDiv);
        this.setViewOption(this.options);
    }

    public treeForViewport() {
        console.log(this.sharedString.client.mergeTree.rangeToString(this.viewportStartPos, this.viewportEndPos));
    }

    public measureClone() {
        let clock = Date.now();
        this.client.cloneFromSegments();
        console.log(`clone took ${Date.now() - clock}ms`);
    }

    public createBookmarks(k: number) {
        let len = this.sharedString.client.getLength();
        for (let i = 0; i < k; i++) {
            let pos1 = Math.floor(Math.random() * (len - 1));
            let intervalLen = Math.max(1, Math.floor(Math.random() * Math.min(len - pos1, 150)));
            let props = { clid: this.sharedString.client.longClientId, user: this.sharedString.client.userInfo };
            this.bookmarks.add(pos1, pos1 + intervalLen, SharedString.IntervalType.Simple,
                props);
        }
        this.localQueueRender(-1);
    }

    public xUpdateHistoryBubble(x: number) {
        let widgetDivBounds = this.historyWidget.getBoundingClientRect();
        let w = widgetDivBounds.width - 14;
        let diffX = x - (widgetDivBounds.left + 7);
        if (diffX <= 0) {
            diffX = 0;
        }
        let pct = diffX / w;
        let l = 7 + Math.floor(pct * w);
        let seq = this.client.historyToPct(pct);
        this.historyVersion.innerText = `Version @${seq}`;
        this.historyBubble.style.left = `${l}px`;
        this.cursor.pos = FlowView.docStartPosition;
        this.localQueueRender(FlowView.docStartPosition);
    }

    public updateHistoryBubble(seq: number) {
        let widgetDivBounds = this.historyWidget.getBoundingClientRect();
        let w = widgetDivBounds.width - 14;
        let count = this.client.undoSegments.length + this.client.redoSegments.length;
        let pct = this.client.undoSegments.length / count;
        let l = 7 + Math.floor(pct * w);
        this.historyBubble.style.left = `${l}px`;
        this.historyVersion.innerText = `Version @${seq}`;
    }

    public makeHistoryWidget() {
        let bounds = ui.Rectangle.fromClientRect(this.status.element.getBoundingClientRect());
        let x = Math.floor(bounds.width / 2);
        let y = 2;
        let widgetRect = new ui.Rectangle(x, y, Math.floor(bounds.width * 0.4),
            (bounds.height - 4));
        let widgetDiv = document.createElement("div");
        widgetRect.conformElement(widgetDiv);
        widgetDiv.style.zIndex = "3";
        let bubble = document.createElement("div");
        widgetDiv.style.borderRadius = "6px";
        bubble.style.position = "absolute";
        bubble.style.width = "8px";
        bubble.style.height = `${bounds.height - 6}px`;
        bubble.style.borderRadius = "5px";
        bubble.style.top = "1px";
        bubble.style.left = `${widgetRect.width - 7}px`;
        bubble.style.backgroundColor = "pink";
        widgetDiv.style.backgroundColor = "rgba(179,179,179,0.3)";
        widgetDiv.appendChild(bubble);
        let versionSpan = document.createElement("span");
        widgetDiv.appendChild(versionSpan);
        versionSpan.innerText = "History";
        versionSpan.style.padding = "3px";
        this.historyVersion = versionSpan;
        this.historyWidget = widgetDiv;
        this.historyBubble = bubble;
        let clickHistory = (ev: MouseEvent) => {
            this.xUpdateHistoryBubble(ev.clientX);
        };
        let mouseDownBubble = (ev: MouseEvent) => {
            widgetDiv.onmousemove = clickHistory;
        };
        let cancelHistory = (ev: MouseEvent) => {
            widgetDiv.onmousemove = preventD;
        };
        bubble.onmousedown = mouseDownBubble;
        widgetDiv.onmouseup = cancelHistory;
        widgetDiv.onmousemove = preventD;
        bubble.onmouseup = cancelHistory;
        this.status.addSlider(this.historyWidget);
    }
    public goHistorical() {
        if (!this.historyClient) {
            this.historyClient = this.client.cloneFromSegments();
            this.savedClient = this.client;
            this.client = this.historyClient;
            this.makeHistoryWidget();
        }
    }

    public backToTheFuture() {
        if (this.historyClient) {
            this.client = this.savedClient;
            this.historyClient = undefined;
            this.status.removeSlider();
            this.topChar = 0;
            this.localQueueRender(0);
        }
    }

    public historyBack() {
        this.goHistorical();
        if (this.client.undoSegments.length > 0) {
            let seq = this.client.undo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }

    public historyForward() {
        this.goHistorical();
        if (this.client.redoSegments.length > 0) {
            let seq = this.client.redo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }

    public addPresenceMap(presenceMap: types.IMap) {
        presenceMap.on("valueChanged", (delta: types.IValueChanged) => {
            this.remotePresenceUpdate(delta);
        });
        presenceMap.getView().then((v) => {
            this.presenceMapView = v;
            this.updatePresence();
        });
    }

    public addUserMap(userMap: types.IMap) {
        userMap.on("valueChanged", (delta: types.IValueChanged) => {
            this.remoteUserUpdate(delta);
        });
        userMap.getView().then((v) => {
            this.userMapView = v;
            this.updateUser();
        });
    }

    public presenceInfoInRange(start: number, end: number) {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            let presenceInfo = this.presenceVector[i];
            if (presenceInfo) {
                if ((start <= presenceInfo.xformPos) && (presenceInfo.xformPos <= end)) {
                    return presenceInfo;
                }
            }
        }
    }

    public updatePresencePositions() {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            let remotePresenceInfo = this.presenceVector[i];
            if (remotePresenceInfo) {
                remotePresenceInfo.xformPos = getLocalRefPos(this, remotePresenceInfo.localRef);
            }
        }
    }

    public updatePresenceVector(localPresenceInfo: ILocalPresenceInfo) {
        localPresenceInfo.xformPos = getLocalRefPos(this, localPresenceInfo.localRef);
        let presentPresence = this.presenceVector[localPresenceInfo.clientId];
        let tempXformPos = -1;

        if (presentPresence) {
            if (presentPresence.cursor) {
                localPresenceInfo.cursor = presentPresence.cursor;
                localPresenceInfo.cursor.presenceInfo = localPresenceInfo;
                localPresenceInfo.cursor.presenceInfoUpdated = true;
            }
            let baseSegment = <SharedString.BaseSegment>presentPresence.localRef.segment;
            this.client.mergeTree.removeLocalReference(baseSegment, presentPresence.localRef);
            tempXformPos = presentPresence.xformPos;
        }
        this.client.mergeTree.addLocalReference(localPresenceInfo.localRef);
        this.presenceVector[localPresenceInfo.clientId] = localPresenceInfo;
        if (localPresenceInfo.xformPos !== tempXformPos) {
            this.presenceQueueRender(localPresenceInfo);
        }
    }

    public remotePresenceFromEdit(longClientId: string, userInfo: IAuthenticatedUser, refseq: number, oldpos: number, posAdjust = 0) {
        let remotePosInfo = <IRemotePresenceInfo>{
            clientId: this.client.getOrAddShortClientId(longClientId, userInfo),
            key: userInfo === null ? longClientId : userInfo.user.id,
            origPos: oldpos + posAdjust,
            refseq,
        };
        this.remotePresenceToLocal(remotePosInfo, posAdjust);
    }

    public remotePresenceToLocal(remotePresenceInfo: IRemotePresenceInfo, posAdjust = 0) {
        let segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos,
            remotePresenceInfo.refseq, remotePresenceInfo.clientId);
        if (segoff.segment === undefined) {
            if (remotePresenceInfo.origPos === this.client.getLength()) {
                segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos,
                    remotePresenceInfo.refseq, remotePresenceInfo.clientId);
                if (segoff.segment) {
                    segoff.offset++;
                }
            }
        }
        if (segoff.segment) {
            let localPresenceInfo = <ILocalPresenceInfo>{
                clientId: remotePresenceInfo.clientId,
                fresh: true,
                key: remotePresenceInfo.key,
                localRef: new SharedString.LocalReference(<SharedString.BaseSegment>segoff.segment, segoff.offset,
                    SharedString.ReferenceType.SlideOnRemove),
            };

            this.updatePresenceVector(localPresenceInfo);
        }
    }
    public remotePresenceUpdate(delta: types.IValueChanged) {
        if (delta.key !== this.client.longClientId) {
            let remotePresenceInfo = <IRemotePresenceInfo>this.presenceMapView.get(delta.key);
            remotePresenceInfo.clientId = this.client.getOrAddShortClientId(delta.key, null);
            const userInfo = this.client.getUserInfo(remotePresenceInfo.clientId);
            remotePresenceInfo.key = (userInfo === null) ? delta.key : userInfo.user.id;
            this.remotePresenceToLocal(remotePresenceInfo);
        }
    }

    public updatePresence() {
        if (this.presenceMapView) {
            let presenceInfo = <IRemotePresenceInfo>{
                origPos: this.cursor.pos,
                refseq: this.client.getCurrentSeq(),
            };
            this.presenceMapView.set(this.client.longClientId, presenceInfo);
        }
    }

    public updateUser() {
        this.client.getOrAddShortClientId(this.client.longClientId, this.client.userInfo);
        if (this.userMapView) {
            for (let remoteClientId of this.userMapView.keys()) {
                this.remoteUserUpdate({ key: remoteClientId});
            }
            this.userMapView.set(this.client.longClientId, this.client.userInfo);
        }
    }

    public remoteUserUpdate(delta: types.IValueChanged) {
        if (delta.key !== this.client.longClientId) {
            let remoteUserInfo = <IAuthenticatedUser>this.userMapView.get(delta.key);
            this.client.getOrAddShortClientId(delta.key, remoteUserInfo);
        }

    }

    public statusMessage(key: string, msg: string) {
        this.status.add(key, msg);
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
    public getPositionLocation(position: number): ui.IPoint {
        const lineDiv = findLineDiv(position, this, true);
        if (!lineDiv) {
            return null;
        }

        // Estimate placement location
        const text = this.client.getText(lineDiv.linePos, position);
        const textWidth = getTextWidth(text, lineDiv.style.font);
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

    public checkRow(lineDiv: ILineDiv, fn: (lineDiv: ILineDiv) => ILineDiv, rev?: boolean) {
        let rowDiv = <IRowDiv>lineDiv;
        let oldRowDiv: IRowDiv;
        while (rowDiv && (rowDiv !== oldRowDiv) && rowDiv.rowView) {
            oldRowDiv = rowDiv;
            lineDiv = undefined;
            for (let box of rowDiv.rowView.boxes) {
                let innerDiv = this.lineDivSelect(fn, box.viewport.div, true, rev);
                if (innerDiv) {
                    lineDiv = innerDiv;
                    rowDiv = <IRowDiv>innerDiv;
                    break;
                }
            }
        }
        return lineDiv;
    }

    public lineDivSelect(fn: (lineDiv: ILineDiv) => ILineDiv, viewportDiv: IViewportDiv, dive = false, rev?: boolean) {
        if (rev) {
            let elm = <ILineDiv>viewportDiv.lastElementChild;
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
                elm = <ILineDiv>elm.previousElementSibling;
            }

        } else {
            let elm = <ILineDiv>viewportDiv.firstElementChild;
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
                elm = <ILineDiv>elm.nextElementSibling;
            }
        }
    }

    public clickSpan(x: number, y: number, elm: HTMLSpanElement) {
        let span = <ISegSpan>elm;
        let elmOff = pointerToElementOffsetWebkit(x, y);
        if (elmOff) {
            let computed = elmOffToSegOff(elmOff, span);
            if (span.offset) {
                computed += span.offset;
            }
            this.cursor.pos = span.segPos + computed;
            let tilePos = findTile(this, this.cursor.pos, "pg", false);
            if (tilePos) {
                this.curPG = <SharedString.Marker>tilePos.tile;
            }
            this.updatePresence();
            this.cursor.updateView(this);
            return true;
        }
    }

    public getPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        let position: number = undefined;

        if (targetLineDiv && (targetLineDiv.linePos !== undefined)) {
            let y: number;
            let targetLineBounds = targetLineDiv.getBoundingClientRect();
            y = targetLineBounds.top + Math.floor(targetLineBounds.height / 2);
            let elm = document.elementFromPoint(x, y);
            if (elm.tagName === "DIV") {
                if ((targetLineDiv.lineEnd - targetLineDiv.linePos) === 1) {
                    // empty line
                    position = targetLineDiv.linePos;
                } else if (targetLineDiv === elm) {
                    if (targetLineDiv.indentWidth !== undefined) {
                        let relX = x - targetLineBounds.left;
                        if (relX <= targetLineDiv.indentWidth) {
                            position = targetLineDiv.linePos;
                        } else {
                            position = targetLineDiv.lineEnd;
                        }
                    } else {
                        position = targetLineDiv.lineEnd;
                    }
                } else {
                    // content div
                    if (x <= targetLineBounds.left) {
                        position = targetLineDiv.linePos;
                    } else {
                        position = targetLineDiv.lineEnd;
                    }
                }

            } else if (elm.tagName === "SPAN") {
                let span = <ISegSpan>elm;
                let elmOff = pointerToElementOffsetWebkit(x, y);
                if (elmOff) {
                    let computed = elmOffToSegOff(elmOff, span);
                    if (span.offset) {
                        computed += span.offset;
                    }
                    position = span.segPos + computed;
                }
            }
        }

        return position;
    }

    // TODO: handle symbol div
    public setCursorPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        const position = this.getPosFromPixels(targetLineDiv, x);
        if (position) {
            this.cursor.pos = position;
            return true;
        } else {
            return false;
        }
    }

    public getCanonicalX() {
        let cursorRect = this.cursor.rect();
        let x: number;
        if (this.lastVerticalX >= 0) {
            x = this.lastVerticalX;
        } else {
            x = Math.floor(cursorRect.left);
            this.lastVerticalX = x;
        }
        return x;
    }

    public cursorRev() {
        if (this.cursor.pos > FlowView.docStartPosition) {
            this.cursor.pos--;
            let segoff = getContainingSegment(this, this.cursor.pos);
            if (segoff.segment.getType() !== SharedString.SegmentType.Text) {
                // REVIEW: assume marker for now (could be external later)
                let marker = <SharedString.Marker>segoff.segment;
                if ((marker.refType & SharedString.ReferenceType.Tile) &&
                    (marker.hasTileLabel("pg"))) {
                    if (marker.hasRangeLabel("table") && (marker.refType & SharedString.ReferenceType.NestEnd)) {
                        this.cursorRev();
                    }
                } else {
                    this.cursorRev();
                }
            }
        }
    }

    public cursorFwd() {
        if (this.cursor.pos < (this.client.getLength() - 1)) {
            this.cursor.pos++;

            let segoff = this.client.mergeTree.getContainingSegment(this.cursor.pos, SharedString.UniversalSequenceNumber,
                this.client.getClientId());
            if (segoff.segment.getType() !== SharedString.SegmentType.Text) {
                // REVIEW: assume marker for now
                let marker = <SharedString.Marker>segoff.segment;
                if ((marker.refType & SharedString.ReferenceType.Tile) &&
                    (marker.hasTileLabel("pg"))) {
                    if (marker.hasRangeLabel("table") && (marker.refType & SharedString.ReferenceType.NestEnd)) {
                        this.cursorFwd();
                    } else {
                        return;
                    }
                } else if (marker.refType & SharedString.ReferenceType.NestBegin) {
                    if (marker.hasRangeLabel("table")) {
                        this.cursor.pos += 3;
                    } else if (marker.hasRangeLabel("row")) {
                        this.cursor.pos += 2;
                    } else if (marker.hasRangeLabel("box")) {
                        this.cursor.pos += 1;
                    } else {
                        this.cursorFwd();
                    }
                } else if (marker.refType & SharedString.ReferenceType.NestEnd) {
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

    public verticalMove(lineCount: number) {
        let up = lineCount < 0;
        let lineDiv = this.cursor.lineDiv();
        let targetLineDiv: ILineDiv;
        if (lineCount < 0) {
            targetLineDiv = <ILineDiv>lineDiv.previousElementSibling;
        } else {
            targetLineDiv = <ILineDiv>lineDiv.nextElementSibling;
        }
        let x = this.getCanonicalX();

        // if line div is row, then find line in box closest to x
        function checkInTable() {
            let rowDiv = <IRowDiv>targetLineDiv;
            while (rowDiv && rowDiv.rowView) {
                if (rowDiv.rowView) {
                    let box = rowDiv.rowView.findClosestBox(x);
                    if (box) {
                        if (up) {
                            targetLineDiv = box.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = box.viewport.firstLineDiv();
                        }
                        rowDiv = <IRowDiv>targetLineDiv;
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
            let rowDiv = findRowParent(lineDiv);
            if (rowDiv && rowDiv.rowView) {
                let rowView = rowDiv.rowView;
                let tableView = rowView.table;
                let targetRow: RowView;
                if (up) {
                    targetRow = tableView.findPrecedingRow(rowView);
                } else {
                    targetRow = tableView.findNextRow(rowView);
                }
                if (targetRow) {
                    let box = targetRow.findClosestBox(x);
                    if (box) {
                        if (up) {
                            targetLineDiv = box.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = box.viewport.firstLineDiv();
                        }
                    }
                    return this.setCursorPosFromPixels(targetLineDiv, x);
                } else {
                    // top or bottom row of table
                    if (up) {
                        targetLineDiv = <ILineDiv>rowDiv.previousElementSibling;
                    } else {
                        targetLineDiv = <ILineDiv>rowDiv.nextElementSibling;
                    }
                    if (targetLineDiv) {
                        checkInTable();
                        return this.setCursorPosFromPixels(targetLineDiv, x);
                    }
                }
            }
        }
    }

    public viewportCharCount() {
        return this.viewportEndPos - this.viewportStartPos;
    }

    public setEdit(docRoot: types.IMapView) {
        this.docRoot = docRoot;

        window.oncontextmenu = preventD;
        this.element.onmousemove = preventD;
        this.element.onmouseup = preventD;
        this.element.onselectstart = preventD;

        this.element.onmousedown = (e) => {
            if (e.button === 0) {
                let span = <ISegSpan>e.target;
                let segspan: ISegSpan;
                if (span.seg) {
                    segspan = span;
                } else {
                    segspan = <ISegSpan>span.parentElement;
                }
                if (segspan && segspan.seg) {
                    this.clickSpan(e.clientX, e.clientY, segspan);
                }
                e.preventDefault();
                e.returnValue = false;
                return false;
            } else if (e.button === 2) {
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };

        this.element.onmousewheel = (e) => {
            if (!this.wheelTicking) {
                let factor = 20;
                let inputDelta = e.wheelDelta;
                if (Math.abs(e.wheelDelta) === 120) {
                    inputDelta = e.wheelDelta / 6;
                } else {
                    inputDelta = e.wheelDelta / 2;
                }
                let delta = factor * inputDelta;
                // tslint:disable-next-line:max-line-length
                // console.log(`top char: ${this.topChar - delta} factor ${factor}; delta: ${delta} wheel: ${e.wheelDeltaY} ${e.wheelDelta} ${e.detail}`);
                setTimeout(() => {
                    this.render(Math.floor(this.topChar - delta));
                    this.apresScroll(delta < 0);
                    this.wheelTicking = false;
                }, 20);
                this.wheelTicking = true;
            }
            e.preventDefault();
            e.returnValue = false;
        };

        let keydownHandler = (e: KeyboardEvent) => {
            let saveLastVertX = this.lastVerticalX;
            let specialKey = true;
            this.lastVerticalX = -1;
            if (e.ctrlKey && (e.keyCode !== 17)) {
                this.keyCmd(e.keyCode);
            } else if (e.keyCode === KeyCode.TAB) {
                this.handleTAB(e.shiftKey);
            } else if (e.keyCode === KeyCode.backspace) {
                this.cursor.pos--;
                this.sharedString.removeText(this.cursor.pos, this.cursor.pos + 1);
                this.localQueueRender(this.cursor.pos);
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
                let halfport = Math.floor(this.viewportCharCount() / 2);
                let topChar = this.client.getLength() - halfport;
                this.cursor.pos = topChar;
                this.updatePresence();
                this.render(topChar);
            } else if (e.keyCode === KeyCode.rightArrow) {
                if (this.cursor.pos < (this.client.getLength() - 1)) {
                    if (this.cursor.pos === this.viewportEndPos) {
                        this.scroll(false, true);
                    }
                    this.cursorFwd();
                    this.updatePresence();
                    this.cursor.updateView(this);
                }
            } else if (e.keyCode === KeyCode.leftArrow) {
                if (this.cursor.pos > FlowView.docStartPosition) {
                    if (this.cursor.pos === this.viewportStartPos) {
                        this.scroll(true, true);
                    }
                    this.cursorRev();
                    this.updatePresence();
                    this.cursor.updateView(this);
                }
            } else if ((e.keyCode === KeyCode.upArrow) || (e.keyCode === KeyCode.downArrow)) {
                this.lastVerticalX = saveLastVertX;
                let lineCount = 1;
                if (e.keyCode === KeyCode.upArrow) {
                    lineCount = -1;
                }
                let vpEnd = this.viewportEndPos;
                let maxPos = this.client.getLength() - 1;
                if (vpEnd < maxPos) {
                    if (!this.verticalMove(lineCount)) {
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
                    if (this.cursor.pos > maxPos) {
                        this.cursor.pos = maxPos;
                    }
                    this.updatePresence();
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
        };

        let keypressHandler = (e: KeyboardEvent) => {
            let pos = this.cursor.pos;
            this.cursor.pos++;
            let code = e.charCode;
            if (code === CharacterCodes.cr) {
                // TODO: other labels; for now assume only list/pg tile labels
                let curTilePos = findTile(this, pos, "pg", false);
                let pgMarker = <IParagraphMarker>curTilePos.tile;
                let pgPos = curTilePos.pos;
                clearContentCaches(pgMarker);
                let curProps = pgMarker.properties;
                let newProps = SharedString.createMap<any>();
                let newLabels = ["pg"];
                if (isListTile(pgMarker)) {
                    newLabels.push("list");
                    newProps.indentLevel = curProps.indentLevel;
                    newProps.listKind = curProps.listKind;
                }
                newProps[SharedString.reservedTileLabelsKey] = newLabels;
                // TODO: place in group op
                // old marker gets new props
                this.sharedString.annotateRange(newProps, pgPos, pgPos + 1,
                    { name: "rewrite" });
                // new marker gets existing props
                this.sharedString.insertMarker(pos, SharedString.ReferenceType.Tile, curProps);
            } else {
                this.sharedString.insertText(String.fromCharCode(code), pos);
                this.updatePGInfo(pos);
            }
            this.localQueueRender(this.cursor.pos);

        };

        // Register for keyboard messages
        this.on("keydown", keydownHandler);
        this.on("keypress", keypressHandler);
    }

    public viewTileProps() {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        let tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let buf = "";
            if (tileInfo.tile.properties) {
                // tslint:disable:forin
                for (let key in tileInfo.tile.properties) {
                    buf += ` { ${key}: ${tileInfo.tile.properties[key]} }`;
                }
            }

            const translationLangauge = "translation-en";
            tileInfo.tile.properties[translationLangauge] =
                "Do not ask for whom the bell tolls; it tolls for thee! A stitch in time saves nine! You can't tell which way the train went by looking at the tracks!";
            let lc = !!(<IParagraphMarker>tileInfo.tile).listCache;
            console.log(`tile at pos ${tileInfo.pos} with props${buf} and list cache: ${lc}`);
        }
    }

    public setList(listKind = 0) {
        let searchPos = this.cursor.pos;
        let tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let tile = <IParagraphMarker>tileInfo.tile;
            let listStatus = false;
            if (tile.hasTileLabel("list")) {
                listStatus = true;
            }
            let curLabels = <string[]>tile.properties[SharedString.reservedTileLabelsKey];

            if (listStatus) {
                let remainingLabels = curLabels.filter((l) => l !== "list");
                this.sharedString.annotateRange({
                    [SharedString.reservedTileLabelsKey]: remainingLabels,
                    series: null,
                }, tileInfo.pos, tileInfo.pos + 1);
            } else {
                let augLabels = curLabels.slice();
                augLabels.push("list");
                let indentLevel = 1;
                if (tile.properties && tile.properties.indentLevel) {
                    indentLevel = tile.properties.indentLevel;
                }
                this.sharedString.annotateRange({
                    [SharedString.reservedTileLabelsKey]: augLabels,
                    indentLevel,
                    listKind,
                }, tileInfo.pos, tileInfo.pos + 1);
            }
            tile.listCache = undefined;
            this.localQueueRender(this.cursor.pos);
        }
    }

    // TODO: tab stops in non-list, non-table paragraphs
    public handleTAB(shift = false) {
        let searchPos = this.cursor.pos;
        let tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let cursorContext =
                this.client.mergeTree.getStackContext(tileInfo.pos, this.client.getClientId(), ["table", "box", "row"]);
            if (cursorContext.table && (!cursorContext.table.empty())) {
                let tableMarker = <ITableMarker>cursorContext.table.top();
                let tableView = tableMarker.view;
                if (cursorContext.box && (!cursorContext.box.empty())) {
                    let box = <IBoxMarker>cursorContext.box.top();
                    let toBox: BoxView;
                    if (shift) {
                        toBox = tableView.prevBox(box.view);
                    } else {
                        toBox = tableView.nextBox(box.view);
                    }
                    if (toBox) {
                        let offset = this.client.mergeTree.getOffset(toBox.marker,
                            SharedString.UniversalSequenceNumber, this.client.getClientId());
                        this.cursor.pos = offset + 1;
                    } else {
                        if (shift) {
                            let offset = this.client.mergeTree.getOffset(tableView.tableMarker,
                                SharedString.UniversalSequenceNumber, this.client.getClientId());
                            this.cursor.pos = offset - 1;
                        } else {
                            let endOffset = this.client.mergeTree.getOffset(tableView.endTableMarker,
                                SharedString.UniversalSequenceNumber, this.client.getClientId());
                            this.cursor.pos = endOffset + 1;
                        }
                    }
                    this.updatePresence();
                    this.cursor.updateView(this);
                }
            } else {
                let tile = <IParagraphMarker>tileInfo.tile;
                this.increaseIndent(tile, tileInfo.pos, shift);
            }
        }
    }

    public toggleBlockquote() {
        let tileInfo = findTile(this, this.cursor.pos, "pg", false);
        if (tileInfo) {
            let tile = tileInfo.tile;
            let props = tile.properties;
            if (props && props.blockquote) {
                this.sharedString.annotateRange({ blockquote: false }, tileInfo.pos, tileInfo.pos + 1);
            } else {
                this.sharedString.annotateRange({ blockquote: true }, tileInfo.pos, tileInfo.pos + 1);
            }
            this.localQueueRender(this.cursor.pos);
        }
    }

    public toggleBold() {
        let propToggle = (textSegment: SharedString.TextSegment, startPos: number, endPos: number) => {
            if (textSegment.properties && textSegment.properties["font-weight"] &&
                (textSegment.properties["font-weight"] === "bold")) {
                this.sharedString.annotateRange({ "font-weight": null }, startPos, endPos);
            } else {
                this.sharedString.annotateRange({ "font-weight": "bold" }, startPos, endPos);
            }
        };
        this.toggleCurrentWord(propToggle);
    }

    public toggleUnderline() {
        let propToggle = (textSegment: SharedString.TextSegment, startPos: number, endPos: number) => {
            if (textSegment.properties && textSegment.properties["text-decoration"] &&
                (textSegment.properties["text-decoration"] === "underline")) {
                this.sharedString.annotateRange({ "text-decoration": null }, startPos, endPos);
            } else {
                this.sharedString.annotateRange({ "text-decoration": "underline" }, startPos, endPos);
            }
        };
        this.toggleCurrentWord(propToggle);
    }

    public toggleCurrentWord(propToggle: (textSegment: SharedString.TextSegment,
        startPos: number, endPos: number) => void) {
        let wordRange = getCurrentWord(this.cursor.pos, this.sharedString.client.mergeTree);
        if (wordRange) {
            let mrToggle = (segment: SharedString.Segment, segpos: number,
                refSeq: number, clientId: number, start: number, end: number) => {
                if (segment.getType() === SharedString.SegmentType.Text) {
                    let textSegment = <SharedString.TextSegment>segment;
                    // TODO: have combining op for css toggle
                    let startPos = segpos;
                    if ((start > 0) && (start < textSegment.text.length)) {
                        startPos += start;
                    }
                    let endPos = segpos + textSegment.text.length;
                    if (end < textSegment.text.length) {
                        endPos = segpos + end;
                    }
                    propToggle(textSegment, startPos, endPos);
                }
                return true;
            };
            let text = this.sharedString.client.getText(wordRange.wordStart, wordRange.wordEnd);
            console.log(`Word at cursor: [${wordRange.wordStart},${wordRange.wordEnd}) is ${text}`);
            this.sharedString.client.mergeTree.mapRange({ leaf: mrToggle }, SharedString.UniversalSequenceNumber,
                this.sharedString.client.getClientId(), undefined, wordRange.wordStart, wordRange.wordEnd);
            this.localQueueRender(this.cursor.pos);
        }

    }

    public keyCmd(charCode: number) {
        switch (charCode) {
            case CharacterCodes.K:
                this.historyBack();
                break;
            case CharacterCodes.J:
                this.historyForward();
                break;
            case CharacterCodes.Q:
                this.backToTheFuture();
                break;
            case CharacterCodes.R:
                this.updatePGInfo(this.cursor.pos - 1);
                createTable(this.cursor.pos, this);
                this.localQueueRender(this.cursor.pos);
                break;
            case CharacterCodes.L:
                this.setList();
                break;
            case CharacterCodes.B: {
                // this.toggleBold();
                this.createBookmarks(5000);
                break;
            }
            case CharacterCodes.I: {
                // this.toggleItalic("italic");
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
                this.localQueueRender(this.cursor.pos);
                break;
            case CharacterCodes.S:
                this.collabDocument.save();
                break;
            default:
                console.log(`got command key ${String.fromCharCode(charCode)}`);
                break;
        }
    }

    public testWordInfo() {
        let text = this.sharedString.client.getText();
        let nonWhitespace = text.split(/\s+/g);
        console.log(`non ws count: ${nonWhitespace.length}`);
        let obj = new Object();
        for (let nws of nonWhitespace) {
            if (!obj[nws]) {
                obj[nws] = 1;
            } else {
                obj[nws]++;
            }
        }
        let count = 0;
        let uniques = <string[]>[];
        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                count++;
                uniques.push(key);
            }
        }
        console.log(`${count} unique`);
        let clock = Date.now();
        getMultiTextWidth(uniques, "18px Times");
        console.log(`unique pp cost: ${Date.now() - clock}ms`);
    }

    public preScroll() {
        if (this.lastVerticalX === -1) {
            let rect = this.cursor.rect();
            this.lastVerticalX = rect.left;
        }
    }

    public apresScroll(up: boolean) {
        if ((this.cursor.pos < this.viewportStartPos) ||
            (this.cursor.pos >= this.viewportEndPos)) {
            let x = this.getCanonicalX();
            if (up) {
                this.setCursorPosFromPixels(this.firstLineDiv(), x);
            } else {
                this.setCursorPosFromPixels(this.lastLineDiv(), x);
            }
            this.updatePresence();
            this.cursor.updateView(this);
        }
    }

    public scroll(up: boolean, one = false) {
        let scrollTo = this.topChar;
        if (one) {
            if (up) {
                let firstLineDiv = this.firstLineDiv();
                scrollTo = firstLineDiv.linePos - 2;
                if (scrollTo < 0) {
                    return;
                }
            } else {
                let nextFirstLineDiv = <ILineDiv>this.firstLineDiv().nextElementSibling;
                if (nextFirstLineDiv) {
                    scrollTo = nextFirstLineDiv.linePos;
                } else {
                    return;
                }
            }
        } else {
            let len = this.client.getLength();
            let halfport = Math.floor(this.viewportCharCount() / 2);
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
        let len = this.client.getLength();
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

        let clk = Date.now();
        // TODO: consider using markers for presence info once splice segments during pg render
        this.updatePresencePositions();
        clearSubtree(this.viewportDiv);
        // this.viewportDiv.appendChild(this.cursor.editSpan);
        let renderOutput = renderTree(this.viewportDiv, this.topChar, this, this.targetTranslation);
        this.viewportStartPos = renderOutput.viewportStartPos;
        this.viewportEndPos = renderOutput.viewportEndPos;
        if (this.diagCharPort || true) {
            this.statusMessage("render", `&nbsp ${Date.now() - clk}ms`);
        }
        if (this.diagCharPort) {
            this.statusMessage("diagCharPort",
                `&nbsp sp: (${this.topChar}) ep: ${this.viewportEndPos} cp: ${this.cursor.pos}`);
        }

        this.emit("render", {
            overlayMarkers: renderOutput.overlayMarkers,
            range: { min: 1, max: this.client.getLength(), value: this.viewportStartPos },
            viewportEndPos: this.viewportEndPos,
            viewportStartPos: this.viewportStartPos,
        });
    }

    public loadFinished(clockStart = 0) {
        this.bookmarks = this.sharedString.getSharedIntervalCollection("bookmarks");
        this.comments = this.sharedString.getSharedIntervalCollection("comments");
        this.comments.add(0, 4, SharedString.IntervalType.Simple,
            { story: this.sharedString });
        this.render(0, true);
        if (clockStart > 0) {
            // tslint:disable-next-line:max-line-length
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()} - ${performanceNow()}`);
        }
        const userMap = this.docRoot.get("users") as types.IMap;
        this.addUserMap(userMap);
        const presenceMap = this.docRoot.get("presence") as types.IMap;
        this.addPresenceMap(presenceMap);
        let intervalMap = this.sharedString.intervalCollections.getMap();
        intervalMap.on("valueChanged", (delta: types.IValueChanged) => {
            this.queueRender(undefined, true);
        });
        // this.testWordInfo();
    }

    public randomWordMove() {
        let client = this.sharedString.client;
        let word1 = findRandomWord(client.mergeTree, client.getClientId());
        if (word1) {
            let removeStart = word1.pos;
            let removeEnd = removeStart + word1.text.length;
            this.sharedString.removeText(removeStart, removeEnd);
            let word2 = findRandomWord(client.mergeTree, client.getClientId());
            while (!word2) {
                word2 = findRandomWord(client.mergeTree, client.getClientId());
            }
            let pos = word2.pos + word2.text.length;
            this.sharedString.insertText(word1.text, pos);
        }
    }

    public randomWordMoveStart() {
        this.randWordTimer = setInterval(() => {
            for (let i = 0; i < 3; i++) {
                this.randomWordMove();
            }
        }, 10);
    }

    public randomWordMoveEnd() {
        clearInterval(this.randWordTimer);
    }

    public updatePGInfo(changePos: number) {
        let tileInfo = findTile(this, changePos, "pg", false);
        if (tileInfo) {
            let tile = <IParagraphMarker>tileInfo.tile;
            clearContentCaches(tile);
        } else {
            console.log("did not find pg to clear");
        }
    }

    public localQueueRender(updatePos: number) {
        if (updatePos >= 0) {
            this.updatePGInfo(updatePos);
        }
        this.pendingRender = true;
        window.requestAnimationFrame(() => {
            this.pendingRender = false;
            this.render(this.topChar, true);
        });
    }

    public setViewOption(options: Object) {
        viewOptions = options;
    }

    protected resizeCore(bounds: ui.Rectangle) {
        this.viewportRect = bounds.inner(0.92);
        ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
        if (this.client.getLength() > 0) {
            this.render(this.topChar, true);
        }
    }

    private increaseIndent(tile: IParagraphMarker, pos: number, decrease = false) {
        tile.listCache = undefined;
        if (decrease && tile.properties.indentLevel > 0) {
            this.sharedString.annotateRange({ indentLevel: -1 },
                pos, pos + 1, { name: "incr", defaultValue: 1, minValue: 0 });
        } else if (!decrease) {
            this.sharedString.annotateRange({ indentLevel: 1 }, pos, pos + 1,
                { name: "incr", defaultValue: 0 });
        }
        this.localQueueRender(this.cursor.pos);
    }

    // TODO: paragraph spanning changes and annotations
    // TODO: generalize this by using transform fwd
    private applyOp(delta: SharedString.IMergeTreeOp, msg: core.ISequencedObjectMessage) {
        // tslint:disable:switch-default
        switch (delta.type) {
            case SharedString.MergeTreeDeltaType.INSERT:
                let adjLength = 1;
                if (delta.marker) {
                    this.updatePGInfo(delta.pos1 - 1);
                } else if (delta.pos1 <= this.cursor.pos) {
                    adjLength = delta.text.length;
                    this.cursor.pos += delta.text.length;
                }
                this.remotePresenceFromEdit(msg.clientId, msg.user, msg.referenceSequenceNumber, delta.pos1, adjLength);
                this.updatePGInfo(delta.pos1);
                return true;
            case SharedString.MergeTreeDeltaType.REMOVE:
                if (delta.pos2 <= this.cursor.pos) {
                    this.cursor.pos -= (delta.pos2 - delta.pos1);
                } else if (this.cursor.pos >= delta.pos1) {
                    this.cursor.pos = delta.pos1;
                }
                this.remotePresenceFromEdit(msg.clientId, msg.user, msg.referenceSequenceNumber, delta.pos1);
                this.updatePGInfo(delta.pos1);
                return true;
            case SharedString.MergeTreeDeltaType.GROUP: {
                let opAffectsViewport = false;
                for (let groupOp of delta.ops) {
                    opAffectsViewport = opAffectsViewport || this.applyOp(groupOp, msg);
                }
                return opAffectsViewport;
            }
            case SharedString.MergeTreeDeltaType.ANNOTATE: {
                return this.posInViewport(delta.pos1) || this.posInViewport(delta.pos2 - 1);
            }
        }
    }

    private posInViewport(pos: number) {
        return ((this.viewportEndPos > pos) && (pos >= this.viewportStartPos));
    }

    private presenceQueueRender(remotePosInfo: ILocalPresenceInfo) {
        if ((!this.pendingRender) && (this.posInViewport(remotePosInfo.xformPos))) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                this.render(this.topChar, true);
            });
        }
    }

    private queueRender(msg: core.ISequencedObjectMessage, go = false) {
        if ((!this.pendingRender) && (go || (msg && msg.contents))) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                this.render(this.topChar, true);
            });
        }
    }
}
