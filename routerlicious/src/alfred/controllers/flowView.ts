// tslint:disable:align whitespace no-trailing-whitespace no-string-literal object-literal-sort-keys
import performanceNow = require("performance-now");
import * as url from "url";
import * as API from "../../api";
import * as SharedString from "../../merge-tree";
import * as Geometry from "./geometry";

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
    Q = 81,
    Z = 90,
    space = 0x0020,   // " "
}

interface IParagraphInfo {
    breaks: number[];
    singleLineWidth: number;
    endOffset?: number;
}

interface IListInfo {
    itemCounts: number[];
}

interface IParagraphMarker extends SharedString.Marker {
    cache?: IParagraphInfo;
    listHeadCache?: IListHeadInfo;
    listCache?: IListInfo;
}

// TODO: indent decoration
export interface ILineDiv extends HTMLDivElement {
    linePos?: number;
    lineEnd?: number;
    contentWidth?: number;
    indentWidth?: number;
    indentSymbol?: ISymbol;
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

export function selectionListBoxCreate(textRect: Geometry.Rectangle, container: HTMLElement,
    itemHeight: number, offsetY: number, varHeight?: number): ISelectionListBox {
    let listContainer = document.createElement("div");
    let items: Item[];
    let itemCapacity: number;
    let bubble: HTMLDivElement;
    let bubbleDelta: number;
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
            let listContainerRect = new Geometry.Rectangle(textRect.x, top, width, height);
            listContainerRect.height = itemCapacity * itemHeight;
            listContainerRect.conformElementMaxHeight(listContainer);
        } else {
            let listContainerRect = new Geometry.Rectangle(textRect.x, 0, width, height);
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

    function addScrollbar() {
        let scrollbarWidth = 10;
        let scrollbar = document.createElement("div");
        bubble = document.createElement("div");

        let rect = Geometry.Rectangle.fromClientRect(listContainer.getBoundingClientRect());
        // adjust for 2px border
        rect.x = (rect.width - scrollbarWidth) - 4;
        rect.width = scrollbarWidth;
        rect.y = 0;
        rect.height -= 4;
        rect.conformElement(scrollbar);
        scrollbar.style.backgroundColor = "white";
        rect.y = 0;
        rect.x = 0;
        bubbleDelta = rect.height * (1 / items.length);
        rect.height = Math.round(itemCapacity * bubbleDelta);
        rect.conformElement(bubble);
        bubble.style.backgroundColor = "#cccccc";
        listContainer.appendChild(scrollbar);
        scrollbar.appendChild(bubble);
        scrollbar.style.zIndex = "2";
    }

    function adjustScrollbar() {
        bubble.style.top = Math.round(bubbleDelta * topSelection) + "px";
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
        bubble = undefined;
        if (items.length > itemCapacity) {
            setTimeout(addScrollbar, 0);
        }
        updateSelectionList();

        if (hintSelection) {
            selectItemByKey(hintSelection);
        } else {
            selectItem(0);
        }
    }

    function updateSelectionList() {
        let render = false;
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
                    render = true;
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
        if (bubble) {
            adjustScrollbar();
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
let underlineStringURL = `url(${url.resolve(document.baseURI, "/public/images/underline.gif")}) bottom repeat-x`;
// tslint:disable:max-line-length
let underlinePaulStringURL = `url(${url.resolve(document.baseURI, "/public/images/underline-paul.gif")}) bottom repeat-x`;

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

function makeScrollLosenge(height: number, left: number, top: number) {
    let div = document.createElement("div");
    div.style.width = "12px";
    div.style.height = `${height}px`;
    div.style.left = `${left}px`;
    div.style.top = `${top}px`;
    div.style.backgroundColor = "pink";
    let bordRad = height / 3;
    div.style.borderRadius = `${bordRad}px`;
    div.style.position = "absolute";
    return div;
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

function makeGlue(width: number, text: string, textSegment: SharedString.TextSegment,
    stretch: number, shrink: number) {
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
            blockRunWidth += item.width;
            prevIsGlue = false;
        } else if (item.type === ParagraphItemType.Glue) {
            posInPG++;
            prevIsGlue = true;
        }
        committedItemsWidth += item.width;
    }
    return breaks;
}

function findContainingTile(client: SharedString.Client, pos: number, tileType: string) {
    let tileMarker: SharedString.Marker;
    let tilePos: number;

    function recordPGStart(segment: SharedString.Segment, segpos: number) {
        if (segment.getType() === SharedString.SegmentType.Marker) {
            let marker = <SharedString.Marker>segment;
            if (marker.hasLabel(tileType)) {
                tileMarker = marker;
                tilePos = segpos;
            }
        }
        return false;
    }

    function shift(node: SharedString.Node, segpos: number, refSeq: number, clientId: number, offset: number) {
        if (node.isLeaf()) {
            let seg = <SharedString.Segment>node;
            if ((seg.netLength() > 0) && (seg.getType() === SharedString.SegmentType.Marker)) {
                let marker = <SharedString.Marker>seg;
                if (marker.hasLabel(tileType)) {
                    tileMarker = marker;
                    tilePos = segpos;
                }
            }
        } else {
            let block = <SharedString.HierBlock>node;
            let marker = <SharedString.Marker>block.rightmostTiles[tileType];
            if (marker !== undefined) {
                tileMarker = marker;
            }

        }
        return true;
    }

    client.mergeTree.search(pos, SharedString.UniversalSequenceNumber, client.getClientId(),
        { leaf: recordPGStart, shift });
    // TODO: test using recorded tilePos when defined
    if (tileMarker) {
        tilePos = client.mergeTree.getOffset(tileMarker, SharedString.UniversalSequenceNumber, client.getClientId());
        return { tile: tileMarker, pos: tilePos };
    }
}

const enum ParagraphLexerState {
    AccumBlockChars,
    AccumSpaces,
}

type ParagraphTokenAction = (text: string, type: ParagraphItemType, leadSegment: SharedString.TextSegment) => void;

class ParagraphLexer {
    public state = ParagraphLexerState.AccumBlockChars;
    private spaceCount = 0;
    private textBuf = "";
    private leadSegment: SharedString.TextSegment;

    constructor(public tokenAction: ParagraphTokenAction) {
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
            this.tokenAction(SharedString.internedSpaces(this.spaceCount), ParagraphItemType.Glue, this.leadSegment);
            this.spaceCount = 0;
        }
    }

    private emitBlock() {
        if (this.textBuf.length > 0) {
            this.tokenAction(this.textBuf, ParagraphItemType.Block, this.leadSegment);
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
    pgMarker: IParagraphMarker;
    markerPos: number;
    viewportBounds: Geometry.Rectangle;
}

function renderSegmentIntoLine(segment: SharedString.Segment, segpos: number, refSeq: number,
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
            let cursorX: number;
            if (lineContext.flowView.cursor.pos > textStartPos) {
                let preCursorText = text.substring(0, lineContext.flowView.cursor.pos - textStartPos);
                let temp = lineContext.span.innerText;
                lineContext.span.innerText = preCursorText;
                let cursorBounds = lineContext.span.getBoundingClientRect();
                cursorX = cursorBounds.width + (cursorBounds.left - lineContext.viewportBounds.x);
                lineContext.span.innerText = temp;
            } else {
                let cursorBounds = lineContext.span.getBoundingClientRect();
                cursorX = cursorBounds.left - lineContext.viewportBounds.x;
            }
            lineContext.flowView.cursor.assignToLine(cursorX, lineContext.lineDivHeight, lineContext.lineDiv);
        }
    } else if (segType === SharedString.SegmentType.Marker) {
        let marker = <SharedString.Marker>segment;
        if (marker.hasLabel("pg")) {
            lineContext.pgMarker = marker;
            lineContext.markerPos = segpos;
            if (lineContext.flowView.cursor.pos === segpos) {
                if (lineContext.span) {
                    let cursorBounds = lineContext.span.getBoundingClientRect();
                    let cursorX = cursorBounds.width + (cursorBounds.left - lineContext.viewportBounds.x);
                    lineContext.flowView.cursor.assignToLine(cursorX, lineContext.lineDivHeight, lineContext.lineDiv);
                } else {
                    if (lineContext.lineDiv.indentWidth !== undefined) {
                        lineContext.flowView.cursor.assignToLine(lineContext.lineDiv.indentWidth, lineContext.lineDivHeight, lineContext.lineDiv);
                    } else {
                        lineContext.flowView.cursor.assignToLine(0, lineContext.lineDivHeight, lineContext.lineDiv);
                    }
                }
            }
            return false;
        }
    }
    return true;
}

function findLineDiv(pos: number, flowView: FlowView) {
    return flowView.lineDivSelect((elm) => {
        if ((elm.linePos <= pos) && (elm.lineEnd > pos)) {
            return elm;
        }
    });
}

function decorateLineDiv(lineDiv: ILineDiv, lineFontstr: string, lineDivHeight: number) {
    let indentSymbol = lineDiv.indentSymbol;
    let indentFontstr = lineFontstr;
    if (indentSymbol.font) {
        indentFontstr = indentSymbol.font;
    }
    let em = Math.round(getTextWidth("M", lineFontstr));
    let symbolWidth = getTextWidth(indentSymbol.text, indentFontstr);
    let symbolDiv = makeContentDiv(new Geometry.Rectangle(lineDiv.indentWidth - Math.floor(em + symbolWidth), 0, symbolWidth,
        lineDivHeight), indentFontstr);
    symbolDiv.innerText = indentSymbol.text;
    lineDiv.appendChild(symbolDiv);
}

function reRenderLine(lineDiv: ILineDiv, flowView: FlowView) {
    if (lineDiv) {
        let viewportBounds = Geometry.Rectangle.fromClientRect(flowView.viewportDiv.getBoundingClientRect());
        let lineDivBounds = lineDiv.getBoundingClientRect();
        let lineDivHeight = lineDivBounds.height;
        clearSubtree(lineDiv);
        let contentDiv = lineDiv;
        if (lineDiv.indentSymbol) {
            decorateLineDiv(lineDiv, lineDiv.style.font, lineDivHeight);
        }
        if (lineDiv.indentWidth) {
            contentDiv = makeContentDiv(new Geometry.Rectangle(lineDiv.indentWidth, 0, lineDiv.contentWidth,
                lineDivHeight), lineDiv.style.font);
            lineDiv.appendChild(contentDiv);
        }
        let lineContext = <ILineContext>{
            flowView, lineDiv, span: undefined, pgMarker: undefined, markerPos: 0,
            viewportBounds, lineDivHeight, contentDiv,
        };
        let lineEnd = lineDiv.lineEnd;
        flowView.client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, SharedString.UniversalSequenceNumber,
            flowView.client.getClientId(), lineContext, lineDiv.linePos, lineDiv.lineEnd);
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

function getPrecedingTile(flowView: FlowView, tile: SharedString.Marker, tilePos: number, label: string,
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
        let prevTileInfo = findContainingTile(flowView.client, tilePos, label);
        if (prevTileInfo && filter(prevTileInfo.tile)) {
            return prevTileInfo;
        }
    }
}

function isListTile(tile: IParagraphMarker) {
    return tile.hasLabel("list");
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
    "\u2022", "\u25E6", "\u25A0", "\u2731", "\u272F", "\u2729", "\u273F",
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

function getListCacheInfo(flowView: FlowView, tile: IParagraphMarker, tilePos: number,
    precedingTileCache?: ITilePos[]) {

    if (isListTile(tile)) {
        if (tile.listCache === undefined) {
            if (tile.properties.series) {
                convertToListHead(tile);
            } else {
                let listKind = tile.properties.listKind;
                let precedingTilePos = getPrecedingTile(flowView, tile, tilePos, "list",
                    (t) => isListTile(t) && (t.properties.listKind === listKind), precedingTileCache);
                if (precedingTilePos && ((tilePos - precedingTilePos.pos) < maxListDistance)) {
                    getListCacheInfo(flowView, precedingTilePos.tile, precedingTilePos.pos, precedingTileCache);
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

function makeContentDiv(r: Geometry.Rectangle, lineFontstr) {
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

function renderTree(div: HTMLDivElement, pos: number, client: SharedString.Client, flowView: FlowView) {
    let fontstr = "18px Times";
    let headerFontstr = "22px Times";
    // TODO: for stable viewports cache the geometry and the divs 
    div.id = "renderedTree";

    let viewportBounds = Geometry.Rectangle.fromClientRect(div.getBoundingClientRect());
    let pgCount = 0;
    div.style.font = fontstr;
    let computedStyle = window.getComputedStyle(div);
    let defaultLineHeight = 1.2;
    let viewportHeight = parseInt(div.style.height, 10);
    let viewportWidth = parseInt(div.style.width, 10);
    let h = parseInt(computedStyle.fontSize, 10);
    let defaultLineDivHeight = Math.round(h * defaultLineHeight);
    let pgVspace = Math.round(h * 0.5);
    let headerDivHeight = 32;
    let currentLineTop = 0;
    let wordSpacing = getTextWidth(" ", fontstr);
    let viewportStartPos = -1;
    let lineCount = 0;
    let lastLineDiv = undefined;

    function makeLineDiv(r: Geometry.Rectangle, lineFontstr) {
        let lineDiv = makeContentDiv(r, lineFontstr);
        div.appendChild(lineDiv);
        lineCount++;
        lastLineDiv = lineDiv;
        return lineDiv;
    };

    let items: ParagraphItem[];

    function tokenToItems(text: string, type: ParagraphItemType, leadSegment: SharedString.TextSegment) {
        let lfontstr = fontstr;
        let divHeight = defaultLineDivHeight;
        if (startPGMarker.properties && (startPGMarker.properties.header !== undefined)) {
            lfontstr = headerFontstr;
            divHeight = headerDivHeight;
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
        if (type === ParagraphItemType.Block) {
            let block = makeIPGBlock(textWidth, text, leadSegment);
            if (divHeight !== defaultLineDivHeight) {
                block.height = divHeight;
            }
            items.push(makeIPGBlock(textWidth, text, leadSegment));
        } else {
            items.push(makeGlue(textWidth, text, leadSegment, wordSpacing / 2, wordSpacing / 3));
        }
    }

    let pgMarker: IParagraphMarker;
    let startPGMarker: IParagraphMarker;
    let markerPos: number;
    let paragraphLexer = new ParagraphLexer(tokenToItems);
    textErrorRun = undefined;

    function segmentToItems(segment: SharedString.Segment, segpos: number) {
        if (segment.getType() === SharedString.SegmentType.Text) {
            let textSegment = <SharedString.TextSegment>segment;
            paragraphLexer.lex(textSegment);
        } else if (segment.getType() === SharedString.SegmentType.Marker) {
            let marker = <SharedString.Marker>segment;
            if (marker.hasLabel("pg")) {
                return false;
            }
        }
        return true;
    }

    function renderPG(curPGMarker: IParagraphMarker, curPGPos: number, indentWidth: number, indentSymbol: ISymbol,
        contentWidth: number) {
        let pgBreaks = curPGMarker.cache.breaks;
        let lineDiv: ILineDiv;
        let lineDivHeight = defaultLineDivHeight;
        let span: HTMLSpanElement;

        for (let breakIndex = 0, len = pgBreaks.length; breakIndex < len; breakIndex++) {
            let lineStart = pgBreaks[breakIndex] + curPGPos;
            let lineEnd: number;
            if (breakIndex < (len - 1)) {
                lineEnd = pgBreaks[breakIndex + 1] + curPGPos;
            } else {
                lineEnd = undefined;
            }
            let lineFontstr = fontstr;
            lineDivHeight = defaultLineDivHeight;
            if ((lineEnd === undefined) || (lineEnd > pos)) {
                if (curPGMarker.properties && (curPGMarker.properties.header !== undefined)) {
                    // TODO: header levels
                    lineDivHeight = headerDivHeight;
                    lineFontstr = headerFontstr;
                }
                lineDiv = makeLineDiv(new Geometry.Rectangle(0, currentLineTop, viewportWidth, lineDivHeight),
                    lineFontstr);
                let contentDiv = lineDiv;
                if (indentWidth > 0) {
                    contentDiv = makeContentDiv(new Geometry.Rectangle(indentWidth, 0, contentWidth, lineDivHeight),
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
                    span, lineDiv, lineDivHeight, flowView, pgMarker, markerPos,
                    viewportBounds, contentDiv,
                };
                if (viewportStartPos < 0) {
                    viewportStartPos = lineStart;
                }
                client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, SharedString.UniversalSequenceNumber,
                    client.getClientId(), lineContext, lineStart, lineEnd);
                span = lineContext.span;
                markerPos = lineContext.markerPos;
                pgMarker = lineContext.pgMarker;

                currentLineTop += lineDivHeight;
            }
            if ((viewportHeight - currentLineTop) < defaultLineDivHeight) {
                // no more room for lines
                // TODO: record end viewport char
                break;
            }
        }
    }

    let tileInfo = findContainingTile(client, pos, "pg");
    pgMarker = tileInfo.tile;
    markerPos = tileInfo.pos;

    let startPGPos: number;
    let totalLength = client.getLength();
    do {
        items = [];
        startPGMarker = pgMarker;
        pgMarker = undefined;
        startPGPos = markerPos + 1;
        // TODO: only set this to undefined if text changed
        startPGMarker.listCache = undefined;
        getListCacheInfo(flowView, startPGMarker, markerPos);
        let indentPct = 0.0;
        let contentPct = 1.0;
        let indentWidth = 0;
        let contentWidth = viewportBounds.width;
        let indentSymbol: ISymbol = undefined;

        if (startPGMarker.listCache) {
            indentSymbol = getIndentSymbol(startPGMarker);
        }
        if (indentPct === 0.0) {
            indentPct = getIndentPct(startPGMarker);
        }
        if (contentPct === 1.0) {
            contentPct = getContentPct(startPGMarker);
        }
        if (indentPct !== 0.0) {
            indentWidth = Math.floor(indentPct * viewportBounds.width);
        }
        contentWidth = Math.floor(contentPct * viewportBounds.width) - indentWidth;
        if (contentWidth > viewportBounds.width) {
            console.log(`egregious content width ${contentWidth} bound ${viewportBounds.width}`);
        }
        if ((!startPGMarker.cache) || (startPGMarker.cache.singleLineWidth !== contentWidth)) {
            client.mergeTree.mapRange({ leaf: segmentToItems }, SharedString.UniversalSequenceNumber,
                client.getClientId(), undefined, startPGPos);
            startPGMarker.cache = { breaks: breakPGIntoLinesFF(items, contentWidth), singleLineWidth: contentWidth };
        }
        pgCount++;
        paragraphLexer.reset();
        if (startPGPos < (totalLength - 1)) {
            renderPG(startPGMarker, startPGPos, indentWidth, indentSymbol, contentWidth);
            currentLineTop += pgVspace;
        } else {
            if (lastLineDiv) {
                lastLineDiv.lineEnd = startPGPos + 1;
            }
            pgMarker = undefined;
        }
        if (pgMarker !== undefined) {
            startPGMarker.cache.endOffset = markerPos - startPGPos;
        } else {
            if (lastLineDiv) {
                startPGMarker.cache.endOffset = lastLineDiv.lineEnd - startPGPos;
            } else {
                startPGMarker.cache.endOffset = 1;
            }
        }
    } while ((pgMarker !== undefined) && ((viewportHeight - currentLineTop) >= defaultLineDivHeight));
    flowView.viewportStartPos = viewportStartPos;
    flowView.viewportEndPos = startPGMarker.cache.endOffset + startPGPos;
}

function makeSegSpan(context: FlowView, segText: string, textSegment: SharedString.TextSegment, offsetFromSegpos: number,
    segpos: number) {
    let span = <ISegSpan>document.createElement("span");
    span.innerText = segText;
    span.seg = textSegment;
    span.segPos = segpos;
    let textErr = false;
    if (textSegment.properties) {
        // tslint:disable-next-line
        for (let key in textSegment.properties) {
            if (key === "textError") {
                textErr = true;
                if (textErrorRun === undefined) {
                    textErrorRun = { start: segpos + offsetFromSegpos, end: segpos + offsetFromSegpos + segText.length };
                } else {
                    textErrorRun.end += segText.length;
                }
                let textErrorInfo = <ITextErrorInfo>textSegment.properties[key];
                let slb: ISelectionListBox;
                span.textErrorRun = textErrorRun;
                if (textErrorInfo.color) {
                    span.style.background = underlinePaulStringURL;
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
                            let spanBounds = Geometry.Rectangle.fromClientRect(span.getBoundingClientRect());
                            spanBounds.width = Math.floor(window.innerWidth / 4);
                            slb = selectionListBoxCreate(spanBounds, document.body, 24, 0, 12);
                            slb.showSelectionList(altsToItems(textErrorInfo.alternates));
                            span.onmouseup = cancelIntellisense;
                            document.body.onmouseup = cancelIntellisense;
                            slb.elm.onmouseup = acceptIntellisense;
                            slb.elm.onmousemove = selectItem;
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

export interface IStatus {
    add(key: string, msg: string);
    remove(key: string);
    overlay(msg: string);
    removeOverlay();
    onresize();
}

export interface IComponentContainer {
    div: HTMLDivElement;
    onresize: () => void;
    onkeydown: (e: KeyboardEvent) => void;
    onkeypress: (e: KeyboardEvent) => void;
    status: IStatus;
}

export class Cursor {
    public off = true;
    public parentSpan: HTMLSpanElement;
    public editSpan: HTMLSpanElement;
    private blinkCount = 0;
    private blinkTimer: any;
    private viewportDivBounds: ClientRect;

    constructor(public viewportDiv: HTMLDivElement, public pos = 1) {
        this.makeSpan();
        this.onresize();
    }

    public hide() {
        this.editSpan.style.visibility = "hidden";
    }

    public show() {
        this.editSpan.style.backgroundColor = "blue";
        this.editSpan.style.visibility = "visible";
    }

    public makeSpan() {
        this.editSpan = document.createElement("span");
        this.editSpan.id = "cursor";
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
            let foundLineDiv = findLineDiv(this.pos, flowView);
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

    public onresize() {
        this.viewportDivBounds = this.viewportDiv.getBoundingClientRect();
    }

    public assignToLine(x: number, h: number, lineDiv: HTMLDivElement) {
        this.editSpan.style.left = `${x}px`;
        this.editSpan.style.height = `${h}px`;
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        lineDiv.appendChild(this.editSpan);
        if (this.blinkTimer) {
            clearTimeout(this.blinkTimer);
        }
        this.blinkCursor();
    }

    public assign(parentSpan: HTMLSpanElement) {
        if (this.editSpan.parentElement) {
            this.editSpan.parentElement.removeChild(this.editSpan);
        }
        parentSpan.style.position = "relative";
        parentSpan.appendChild(this.editSpan);
        this.parentSpan = parentSpan;
        // let bounds = parentSpan.getBoundingClientRect();
        // let left = bounds.left - this.viewportDivBounds.left;
        // let top = bounds.top - this.viewportDivBounds.top;

        // this.editSpan.style.left = `${left}px`;
        // this.editSpan.style.top = `${top}px`;
        if (this.blinkTimer) {
            clearTimeout(this.blinkTimer);
        }
        this.blinkCursor();
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
            this.blinkTimer = setTimeout(this.blinker, 500);
        } else {
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

export class FlowView {
    public static scrollAreaWidth = 18;

    public timeToImpression: number;
    public timeToLoad: number;
    public timeToEdit: number;
    public timeToCollab: number;
    public prevTopSegment: SharedString.TextSegment;
    public viewportStartPos: number;
    public viewportEndPos: number;
    public cursorSpan: HTMLSpanElement;
    public containerDiv: HTMLDivElement;
    public viewportDiv: HTMLDivElement;
    public viewportRect: Geometry.Rectangle;
    public scrollDiv: HTMLDivElement;
    public scrollRect: Geometry.Rectangle;
    public statusDiv: HTMLDivElement;
    public statusRect: Geometry.Rectangle;
    public client: SharedString.Client;
    public ticking = false;
    public wheelTicking = false;
    public topChar = 0;
    public cursor: Cursor;
    private lastVerticalX = -1;
    private randWordTimer: any;
    private pendingRender = false;
    private diagCharPort = false;

    constructor(
        public sharedString: SharedString.SharedString,
        public flowContainer: IComponentContainer) {

        this.containerDiv = flowContainer.div;
        this.client = sharedString.client;
        this.viewportDiv = document.createElement("div");
        this.containerDiv.appendChild(this.viewportDiv);
        this.scrollDiv = document.createElement("div");
        this.containerDiv.appendChild(this.scrollDiv);

        this.updateGeometry();
        this.statusMessage("li", " ");
        this.statusMessage("si", " ");
        sharedString.on("op", (msg: API.ISequencedObjectMessage) => {
            this.queueRender(msg);
        });

        this.cursor = new Cursor(this.viewportDiv);
    }

    public updateGeometry() {
        let bounds = Geometry.Rectangle.fromClientRect(this.containerDiv.getBoundingClientRect());
        Geometry.Rectangle.conformElementToRect(this.containerDiv, bounds);
        let panelScroll = bounds.nipHorizRight(FlowView.scrollAreaWidth);
        this.scrollRect = panelScroll[1];
        Geometry.Rectangle.conformElementToRect(this.scrollDiv, this.scrollRect);
        this.viewportRect = panelScroll[0].inner(0.92);
        Geometry.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
    }

    public statusMessage(key: string, msg: string) {
        this.flowContainer.status.add(key, msg);
    }

    public firstLineDiv() {
        return this.lineDivSelect((elm) => (elm));
    }

    public lastLineDiv() {
        return this.lineDivSelect((elm) => (elm), true);
    }

    public lineDivSelect(fn: (lineDiv: ILineDiv) => ILineDiv, rev?: boolean) {
        if (rev) {
            let elm = <ILineDiv>this.viewportDiv.lastElementChild;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        return lineDiv;
                    }
                }
                elm = <ILineDiv>elm.previousElementSibling;
            }

        } else {
            let elm = <ILineDiv>this.viewportDiv.firstElementChild;
            while (elm) {
                if (elm.linePos !== undefined) {
                    let lineDiv = fn(elm);
                    if (lineDiv) {
                        return lineDiv;
                    }
                }
                elm = <ILineDiv>elm.nextElementSibling;
            }
        }
    }

    // TODO: handle symbol div
    public setCursorPosFromPixels(targetLineDiv: ILineDiv) {
        if (targetLineDiv && (targetLineDiv.linePos)) {
            let cursorRect = this.cursor.rect();
            let x: number;
            if (this.lastVerticalX >= 0) {
                x = this.lastVerticalX;
            } else {
                x = Math.floor(cursorRect.left);
                this.lastVerticalX = x;
            }
            let y: number;
            let targetLineBounds = targetLineDiv.getBoundingClientRect();
            y = targetLineBounds.top + Math.floor(targetLineBounds.height / 2);
            let elm = document.elementFromPoint(x, y);
            if (elm.tagName === "DIV") {
                if ((targetLineDiv.lineEnd - targetLineDiv.linePos) === 1) {
                    // empty line
                    this.cursor.pos = targetLineDiv.linePos;
                } else if (targetLineDiv === elm) {
                    if (targetLineDiv.indentWidth !== undefined) {
                        let relX = x - targetLineBounds.left;
                        if (relX <= targetLineDiv.indentWidth) {
                            this.cursor.pos = targetLineDiv.linePos;
                        } else {
                            this.cursor.pos = targetLineDiv.lineEnd;
                        }
                    } else {
                        this.cursor.pos = targetLineDiv.lineEnd;
                    }
                } else {
                    // content div                        
                    this.cursor.pos = targetLineDiv.lineEnd;
                }
                return true;
            } else if (elm.tagName === "SPAN") {
                let span = <ISegSpan>elm;
                let elmOff = pointerToElementOffsetWebkit(x, y);
                if (elmOff) {
                    let computed = elmOffToSegOff(elmOff, span);
                    if (span.offset) {
                        computed += span.offset;
                    }
                    this.cursor.pos = span.segPos + computed;
                    return true;
                }
            }
        }
        return false;
    }

    public verticalMove(lineCount: number) {
        let lineDiv = this.cursor.lineDiv();
        let targetLineDiv: ILineDiv;
        if (lineCount < 0) {
            targetLineDiv = <ILineDiv>lineDiv.previousElementSibling;
        } else {
            targetLineDiv = <ILineDiv>lineDiv.nextElementSibling;
        }
        return this.setCursorPosFromPixels(targetLineDiv);
    }

    public viewportCharCount() {
        return this.viewportEndPos - this.viewportStartPos;
    }

    public setEdit() {
        let preventD = (e) => {
            e.returnValue = false;
            e.preventDefault();
            return false;
        };

        window.oncontextmenu = preventD;
        this.containerDiv.onmousemove = preventD;
        this.containerDiv.onmouseup = preventD;
        this.containerDiv.onselectstart = preventD;

        this.containerDiv.onmousedown = (e) => {
            if (e.button === 0) {
                if (!this.diagCharPort) {
                    return;
                }
                let span = <ISegSpan>e.target;
                let segspan: ISegSpan;
                if (span.seg) {
                    segspan = span;
                } else {
                    segspan = <ISegSpan>span.parentElement;
                }
                if (segspan && segspan.seg) {
                    let segOffset = this.client.mergeTree.getOffset(segspan.seg, this.client.getCurrentSeq(),
                        this.client.getClientId());
                    let elmOff = pointerToElementOffsetWebkit(e.clientX, e.clientY);
                    let computed = elmOffToSegOff(elmOff, segspan);
                    // tslint:disable:max-line-length
                    let diag = `segPos: ${segOffset} cxy: (${e.clientX}, ${e.clientY}) within: ${elmOff.offset} computed: (${computed}, ${computed + segOffset})`;
                    if (this.diagCharPort) {
                        this.statusMessage("segclick", diag);
                    }
                    console.log(diag);
                }
            } else if (e.button === 2) {
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };

        this.containerDiv.onmousewheel = (e) => {
            if (!this.wheelTicking) {
                let factor = 20;
                let inputDelta = e.wheelDelta;
                if (Math.abs(e.wheelDelta) === 120) {
                    inputDelta = e.wheelDelta / 6;
                } else {
                    inputDelta = e.wheelDelta / 2;
                }
                let delta = factor * inputDelta;
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
        this.flowContainer.onresize = () => {
            this.updateGeometry();
            // this.cursor.onresize();
            this.render(this.topChar, true);
        };
        let keydownHandler = (e: KeyboardEvent) => {
            let saveLastVertX = this.lastVerticalX;
            let specialKey = true;
            this.lastVerticalX = -1;
            if (e.ctrlKey && (e.keyCode !== 17)) {
                this.keyCmd(e.keyCode);
            } else if (e.keyCode === KeyCode.TAB) {
                this.increaseIndent(e.shiftKey);
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
                this.cursor.pos = 1;
                this.render(1);
            } else if (e.keyCode === KeyCode.end) {
                let halfport = Math.floor(this.viewportCharCount() / 2);
                let topChar = this.client.getLength() - halfport;
                this.cursor.pos = topChar;
                this.render(topChar);
            } else if (e.keyCode === KeyCode.rightArrow) {
                if (this.cursor.pos < (this.client.getLength() - 1)) {
                    if (this.cursor.pos === this.viewportEndPos) {
                        this.scroll(false, true);
                    }
                    this.cursor.pos++;
                    this.cursor.updateView(this);
                }
            } else if (e.keyCode === KeyCode.leftArrow) {
                if (this.cursor.pos > 1) {
                    if (this.cursor.pos === this.viewportStartPos) {
                        this.scroll(true, true);
                    }
                    this.cursor.pos--;
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
                // TODO: pg properties on marker                
                let prevTilePos = findContainingTile(this.client, pos - 1, "pg");
                if (prevTilePos) {
                    let prevTile = <IParagraphMarker>prevTilePos.tile;
                    if (isListTile(prevTile)) {
                        this.sharedString.insertMarker(pos, SharedString.MarkerBehaviors.Tile, {
                            [SharedString.reservedMarkerLabelsKey]: ["pg", "list"],
                            indentLevel: prevTile.properties.indentLevel,
                            listKind: prevTile.properties.listKind,
                        });
                    }
                } else {
                    this.sharedString.insertMarker(pos, SharedString.MarkerBehaviors.Tile,
                        { [SharedString.reservedMarkerLabelsKey]: ["pg"] });
                }
                this.updatePGInfo(pos - 1);
            } else {
                this.sharedString.insertText(String.fromCharCode(code), pos);
            }
            this.localQueueRender(this.cursor.pos);

        };
        this.flowContainer.onkeydown = keydownHandler;
        this.flowContainer.onkeypress = keypressHandler;
    }

    public viewTileProps() {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        let tileInfo = findContainingTile(this.client, searchPos, "pg");
        if (tileInfo) {
            let buf = "";
            if (tileInfo.tile.properties) {
                // tslint:disable:forin
                for (let key in tileInfo.tile.properties) {
                    buf += ` { ${key}: ${tileInfo.tile.properties[key]} }`;
                }
            }
            let lc = !!(<IParagraphMarker>tileInfo.tile).listCache;
            console.log(`tile at pos ${tileInfo.pos} with props${buf} and list cache: ${lc}`);
        }
    }

    public setList(listKind = 0) {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        let tileInfo = findContainingTile(this.client, searchPos, "pg");
        if (tileInfo) {
            let tile = <IParagraphMarker>tileInfo.tile;
            let listStatus = false;
            if (tile.hasLabel("list")) {
                listStatus = true;
            }
            let curLabels = <string[]>tile.properties[SharedString.reservedMarkerLabelsKey];

            if (listStatus) {
                let remainingLabels = curLabels.filter((l) => l !== "list");
                this.sharedString.annotateRange({
                    [SharedString.reservedMarkerLabelsKey]: remainingLabels,
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
                    [SharedString.reservedMarkerLabelsKey]: augLabels,
                    indentLevel,
                    listKind,
                }, tileInfo.pos, tileInfo.pos + 1);
            }
            tile.listCache = undefined;
            this.localQueueRender(this.cursor.pos);
        }
    }

    public increaseIndent(decrease = false) {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        let tileInfo = findContainingTile(this.client, searchPos, "pg");
        if (tileInfo) {
            let tile = <IParagraphMarker>tileInfo.tile;
            tile.listCache = undefined;
            if (decrease && tile.properties.indentLevel > 0) {
                this.sharedString.annotateRange({ indentLevel: -1 },
                    tileInfo.pos, tileInfo.pos + 1, { name: "incr", defaultValue: 1, minValue: 0 });
            } else if (!decrease) {
                this.sharedString.annotateRange({ indentLevel: 1 }, tileInfo.pos, tileInfo.pos + 1,
                    { name: "incr", defaultValue: 0 });
            }
            this.localQueueRender(this.cursor.pos);
        }
    }

    public toggleBlockquote() {
        let tileInfo = findContainingTile(this.client, this.cursor.pos, "pg");
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

    public keyCmd(charCode: number) {
        switch (charCode) {
            case CharacterCodes.K:
                this.toggleBlockquote();
                break;
            case CharacterCodes.L:
                this.setList();
                break;
            case CharacterCodes.B:
                this.setList(1);
                break;
            case CharacterCodes.G:
                this.viewTileProps();
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
            if (up) {
                this.setCursorPosFromPixels(this.firstLineDiv());
            } else {
                this.setCursorPosFromPixels(this.lastLineDiv());
            }
            this.cursor.updateView(this);
        }
    }

    public scroll(up: boolean, one = false) {
        let scrollTo = this.topChar;
        if (one) {
            if (up) {
                let firstLineDiv = this.firstLineDiv();
                scrollTo = firstLineDiv.linePos - 2;
                if (scrollTo < 1) {
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
        if (topChar !== undefined) {
            if (((this.topChar === topChar) || ((this.topChar === 0) && (topChar <= 0)))
                && (!changed)) {
                return;
            }
            this.topChar = topChar;
            if (this.topChar >= len) {
                this.topChar = len - (this.viewportCharCount() / 2);
            }
            if (this.topChar < 1) {
                this.topChar = 1;
            }
        }
        let clk = Date.now();
        let frac = this.topChar / len;
        clearSubtree(this.viewportDiv);
        // this.viewportDiv.appendChild(this.cursor.editSpan);
        renderTree(this.viewportDiv, this.topChar, this.client, this);
        clearSubtree(this.scrollDiv);
        let bubbleHeight = Math.max(3, Math.floor((this.viewportCharCount() / len) * this.scrollRect.height));
        let bubbleTop = Math.floor(frac * this.scrollRect.height);
        let bubbleLeft = 3;
        let bubbleDiv = makeScrollLosenge(bubbleHeight, bubbleLeft, bubbleTop);
        this.scrollDiv.appendChild(bubbleDiv);
        if (this.diagCharPort || true) {
            this.statusMessage("render", `&nbsp ${Date.now() - clk}ms`);
        }
        if (this.diagCharPort) {
            this.statusMessage("diagCharPort",
                `&nbsp sp: (${this.topChar}) ep: ${this.viewportEndPos} cp: ${this.cursor.pos}`);
        }
    }

    public loadFinished(clockStart = 0) {
        this.render(0, true);
        if (clockStart > 0) {
            // tslint:disable-next-line:max-line-length
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()} - ${performanceNow()}`);
        }
        // this.testWordInfo();
    }

    public randomWordMove() {
        let client = this.sharedString.client;
        let word1 = SharedString.findRandomWord(client.mergeTree, client.getClientId());
        if (word1) {
            let removeStart = word1.pos;
            let removeEnd = removeStart + word1.text.length;
            this.sharedString.removeText(removeStart, removeEnd);
            let word2 = SharedString.findRandomWord(client.mergeTree, client.getClientId());
            while (!word2) {
                word2 = SharedString.findRandomWord(client.mergeTree, client.getClientId());
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

    public localQueueRender(updatePos: number) {
        this.updatePGInfo(updatePos);
        this.pendingRender = true;
        window.requestAnimationFrame(() => {
            this.pendingRender = false;
            this.render(this.topChar, true);
        });
    }

    public trackInsights(insights: API.IMap) {
        this.updateInsights(insights);
        insights.on("valueChanged", () => {
            this.updateInsights(insights);
        });
    }

    public updatePGInfo(changePos: number) {
        let tileInfo = findContainingTile(this.client, changePos, "pg");
        if (tileInfo) {
            let tile = <IParagraphMarker>tileInfo.tile;
            tile.cache = undefined;
        }
    }

    // TODO: paragraph spanning changes and annotations
    private applyOp(delta: SharedString.IMergeTreeOp) {
        if (delta.type === SharedString.MergeTreeDeltaType.INSERT) {
            if (delta.marker) {
                this.updatePGInfo(delta.pos1 - 1);
            } else if (delta.pos1 <= this.cursor.pos) {
                this.cursor.pos += delta.text.length;
            }
            this.updatePGInfo(delta.pos1);
        } else if (delta.type === SharedString.MergeTreeDeltaType.REMOVE) {
            if (delta.pos2 <= this.cursor.pos) {
                this.cursor.pos -= (delta.pos2 - delta.pos1);
            } else if (this.cursor.pos >= delta.pos1) {
                this.cursor.pos = delta.pos1;
            }
            this.updatePGInfo(delta.pos1);
        } else if (delta.type === SharedString.MergeTreeDeltaType.GROUP) {
            for (let groupOp of delta.ops) {
                this.applyOp(groupOp);
            }
        }
    }

    private queueRender(msg: API.ISequencedObjectMessage) {
        if ((!this.pendingRender) && msg && msg.contents) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                if (msg.clientId !== this.client.longClientId) {
                    let delta = <SharedString.IMergeTreeOp>msg.contents;
                    this.applyOp(delta);
                }
                this.render(this.topChar, true);
            });
        }
    }

    private async updateInsights(insights: API.IMap) {
        const view = await insights.getView();

        if (view.has("ResumeAnalytics")) {
            const resume = view.get("ResumeAnalytics");
            const probability = parseFloat(resume.resumeAnalyticsResult);
            if (probability !== 1 && probability > 0.7) {
                this.flowContainer.status.overlay(`${Math.round(probability * 100)}% sure I found a resume!`);
            }
        }

        if (view.has("TextAnalytics")) {
            const analytics = view.get("TextAnalytics");
            if (analytics.language) {
                this.statusMessage("li", analytics.language);
            }

            if (analytics.sentiment) {
                const sentimentEmoji = analytics.sentiment > 0.7
                    ? "🙂"
                    : analytics.sentiment < 0.3 ? "🙁" : "😐";
                this.statusMessage("si", sentimentEmoji);
            }
        }
    }
}
