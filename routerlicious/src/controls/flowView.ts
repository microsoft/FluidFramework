// tslint:disable:no-bitwise whitespace align switch-default no-string-literal
import performanceNow = require("performance-now");
import {
    api, CharacterCodes, core, MergeTree,
    Paragraph, Table, types,
} from "../client-api";
import { findRandomWord } from "../merge-tree-utils";
import { Interval, SharedIntervalCollection, SharedString } from "../shared-string";
import * as ui from "../ui";
import { Status } from "./status";

export interface IOverlayMarker {
    id: string;
    position: number;
}

export interface ILineDiv extends HTMLDivElement {
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
    let parent = <IRowDiv>lineDiv.parentElement;
    while (parent) {
        if (parent.rowView) {
            return parent;
        }
        parent = <IRowDiv>parent.parentElement;
    }
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

type Alt = MergeTree.ProxString<number>;
// TODO: mechanism for intelligent services to publish interfaces like this
interface ITextErrorInfo {
    text: string;
    alternates: Alt[];
    color?: string;
}

export interface ICmd extends Item {
    exec?: (flowView: FlowView) => void;
    enabled?: (flowView: FlowView) => boolean;
}

let commands: ICmd[] = [
    {
        exec: (f) => {
            f.copyFormat();
        },
        key: "copy format",
    },
    {
        exec: (f) => {
            f.paintFormat();
        },
        key: "paint format",
    },
    {
        exec: (f) => {
            f.toggleBlockquote();
        },
        key: "blockquote",
    },
    {
        exec: (f) => {
            f.toggleBold();
        },
        key: "bold",
    },
    {
        exec: (f) => {
            f.createBookmarks(5000);
        },
        key: "bookmark test: 5000",
    },
    {
        exec: (f) => {
            f.createComment();
        },
        key: "comment",
    },
    {
        exec: (f) => {
            f.showCommentText();
        },
        key: "comment text",
    },
    {
        exec: (f) => {
            f.setColor("red");
        },
        key: "red",
    },
    {
        exec: (f) => {
            f.setColor("green");
        },
        key: "green",
    },
    {
        exec: (f) => {
            f.setColor("gold");
        },
        key: "gold",
    },
    {
        exec: (f) => {
            f.setFont("courier new", "18px");
        },
        key: "Courier font",
    },
    {
        exec: (f) => {
            f.setFont("tahoma", "18px");
        },
        key: "Tahoma font",
    },
    {
        exec: (f) => {
            f.setPGProps({ header: true });
        },
        key: "Heading 2",
    },
    {
        exec: (f) => {
            f.setPGProps({ header: null });
        },
        key: "Normal",
    },
    {
        exec: (f) => {
            f.setFont("georgia", "18px");
        },
        key: "Georgia font",
    },
    {
        exec: (f) => {
            f.setFont("sans-serif", "18px");
        },
        key: "sans font",
    },
    {
        exec: (f) => {
            f.setFont("cursive", "18px");
        },
        key: "cursive font",
    },
    {
        exec: (f) => {
            f.toggleItalic();
        },
        key: "italic",
    },
    {
        exec: (f) => {
            f.setList();
        },
        key: "list ... 1.)",
    },
    {
        exec: (f) => {
            f.setList(1);
        },
        key: "list ... \u2022",
    },
    {
        exec: (f) => {
            showCell(f.cursor.pos, f);
        },
        key: "cell info",
    },
    {
        exec: (f) => {
            showTable(f.cursor.pos, f);
        },
        key: "table info",
    },
    {
        exec: (f) => {
            f.showAdjacentBookmark();
        },
        key: "previous bookmark",
    },
    {
        exec: (f) => {
            f.showAdjacentBookmark(false);
        },
        key: "next bookmark",
    },
    {
        enabled: (f) => {
            return !f.modes.showBookmarks;
        },
        exec: (f) => {
            f.modes.showBookmarks = true;
            f.tempBookmarks = undefined;
            f.localQueueRender(f.cursor.pos);
        },
        key: "show bookmarks",
    },
    {
        enabled: (f) => {
            return !f.modes.showCursorLocation;
        },
        exec: (f) => {
            f.modes.showCursorLocation = true;
            f.cursorLocation();
        },
        key: "show cursor location",
    },
    {
        enabled: (f) => {
            return f.modes.showCursorLocation;
        },
        exec: (f) => {
            f.modes.showCursorLocation = false;
            f.status.remove("cursor");
        },
        key: "hide cursor location",
    },
    {
        enabled: (f) => {
            return f.modes.showBookmarks;
        },
        exec: (f) => {
            f.modes.showBookmarks = false;
            f.tempBookmarks = undefined;
            f.localQueueRender(f.cursor.pos);
        },
        key: "hide bookmarks",
    },
    {
        enabled: (f) => {
            return !f.modes.showComments;
        },
        exec: (f) => {
            f.modes.showComments = true;
            f.localQueueRender(f.cursor.pos);
        },
        key: "show comments",
    },
    {
        enabled: (f) => {
            return f.modes.showComments;
        },
        exec: (f) => {
            f.modes.showComments = false;
            f.localQueueRender(f.cursor.pos);
        },
        key: "hide comments",
    },
    {
        exec: (f) => {
            f.updatePGInfo(f.cursor.pos - 1);
            Table.createTable(f.cursor.pos, f.sharedString);
            f.localQueueRender(f.cursor.pos);
        },
        key: "table test",
    },
    {
        exec: (f) => {
            f.insertColumn();
        },
        key: "insert column",
    },
    {
        exec: (f) => {
            f.insertRow();
        },
        key: "insert row",
    },
    {
        exec: (f) => {
            f.insertRow();
            f.insertColumn();
        },
        key: "insert row then col",
    },
    {
        exec: (f) => {
            f.crazyTable(40);
        },
        key: "crazy table",
    },
    {
        exec: (f) => {
            f.insertColumn();
            f.insertRow();
        },
        key: "insert col then row",
    },
    {
        exec: (f) => {
            f.deleteRow();
        },
        key: "delete row",
    },
    {
        exec: (f) => {
            f.deleteCellShiftLeft();
        },
        key: "delete cell shift left",
    },
    {
        exec: (f) => {
            f.deleteColumn();
        },
        key: "delete column",
    },
    {
        exec: (f) => {
            f.toggleUnderline();
        },
        key: "underline",
    },
];

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
    getSelectedItem(): Item;
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
        getSelectedItem,
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

    function getSelectedItem() {
        if (selectionIndex >= 0) {
            return items[selectionIndex];
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

export interface ISearchBox {
    showSelectionList(selectionItems: Item[]);
    dismiss();
    keydown(e: KeyboardEvent);
    keypress(e: KeyboardEvent);
    getSearchString(): string;
    getSelectedKey(): string;
    getSelectedItem(): Item;
    updateText();
}

export interface IInputBox {
    elm: HTMLDivElement;
    setText(text: string);
    getText(): string;
    initCursor(y: number);
    keydown(e: KeyboardEvent);
    keypress(e: KeyboardEvent);
}

export function inputBoxCreate(onsubmit: (s: string) => void,
    onchanged: (s: string) => void) {
    let elm = document.createElement("div");
    let span = document.createElement("span");
    elm.appendChild(span);
    let cursor: Cursor;

    return <IInputBox>{
        elm,
        getText,
        initCursor,
        setText,
        keypress,
        keydown,
    };

    function adjustCursorX() {
        let computedStyle = getComputedStyle(elm);
        let fontstr = computedStyle.font;
        let text = span.innerText.substring(0, cursor.pos);
        let w = Math.round(getTextWidth(text, fontstr));
        cursor.lateralMove(w);
    }

    function keydown(e: KeyboardEvent) {
        switch (e.keyCode) {
            case KeyCode.leftArrow:
                if (cursor.pos > 0) {
                    cursor.pos--;
                    adjustCursorX();
                }
                break;
            case KeyCode.rightArrow:
                if (cursor.pos < elm.innerText.length) {
                    cursor.pos++;
                    adjustCursorX();
                }
                break;
            case KeyCode.backspace:
                if (cursor.pos > 0) {
                    let text = span.innerText;
                    text = text.substring(0, cursor.pos - 1) +
                        text.substring(cursor.pos);
                    span.innerText = text;
                    cursor.pos--;
                    adjustCursorX();
                    onchanged(text);
                }
                break;
            case KeyCode.del:
                if (cursor.pos < span.innerText.length) {
                    let text = span.innerText;
                    text = text.substring(0, cursor.pos) +
                        text.substring(cursor.pos + 1);
                    span.innerText = text;
                    onchanged(text);
                }
                break;
        }
    }

    function keypress(e: KeyboardEvent) {
        let text = span.innerText;
        let code = e.charCode;
        if (code === CharacterCodes.cr) {
            onsubmit(text);
        } else {
            text = text.substring(0, cursor.pos) +
                String.fromCharCode(code) + text.substring(cursor.pos);
            span.innerText = text;
            cursor.pos++;
            adjustCursorX();
            onchanged(text);
        }
    }

    function initCursor(y: number) {
        let lineHeight = getTextHeight(elm);
        cursor = new Cursor(elm);
        cursor.assignToLine(0, lineHeight - y, elm);
        // cursor.editSpan.style.top=`${y}px`;
        cursor.scope();
    }

    function setText(text: string) {
        span.innerText = text;
    }

    function getText() {
        return span.innerText;
    }
}

export function searchBoxCreate(boundingElm: HTMLElement,
    searchStringChanged: (searchString: string) => void): ISearchBox {
    let container = document.createElement("div");
    let inputElmHeight = 32;
    let itemHeight = 24;
    let inputElm: HTMLElement;
    let inputBox: IInputBox;
    let selectionListBox: ISelectionListBox;

    init();

    return {
        getSelectedItem,
        getSelectedKey,
        showSelectionList: (items) => selectionListBox.showSelectionList(items),
        keydown,
        keypress,
        dismiss,
        getSearchString,
        updateText,
    };

    function getSelectedKey() {
        return selectionListBox.getSelectedKey();
    }

    function getSelectedItem() {
        return selectionListBox.getSelectedItem();
    }

    function getSearchString() {
        return inputBox.getText();
    }

    function dismiss() {
        document.body.removeChild(container);
    }

    function keydown(e: KeyboardEvent) {
        if (e.keyCode === KeyCode.leftArrow) {
            textSegKeydown(e);
        } else if (e.keyCode === KeyCode.upArrow) {
            selectionListBox.prevItem();
        } else if (e.keyCode === KeyCode.rightArrow) {
            textSegKeydown(e);
        } else if (e.keyCode === KeyCode.downArrow) {
            selectionListBox.nextItem();
        } else {
            textSegKeydown(e);
        }
    }

    function textSegKeydown(e: KeyboardEvent) {
        inputBox.keydown(e);
    }

    function keypress(e: KeyboardEvent) {
        if (e.charCode >= 32) {
            inputBox.keypress(e);
        }
    }

    function updateRectangles() {
        let boundingRect = ui.Rectangle.fromClientRect(boundingElm.getBoundingClientRect());
        let offsetY = boundingRect.y;
        boundingRect.width = Math.floor(window.innerWidth / 4);
        boundingRect.height = Math.floor(window.innerHeight / 3);
        boundingRect.moveElementToUpperLeft(container);
        boundingRect.x = 0;
        boundingRect.y = 0;
        let inputElmBorderSize = 2;
        let vertSplit = boundingRect.nipVert(inputElmHeight + inputElmBorderSize);
        vertSplit[0].height -= inputElmBorderSize;
        vertSplit[0].conformElement(inputElm);
        inputElm.style.lineHeight = `${vertSplit[0].height}px`;
        vertSplit[0].height += inputElmBorderSize;
        selectionListBox = selectionListBoxCreate(vertSplit[0], container, itemHeight, offsetY);
    }

    function updateText() {
        let text = inputBox.getText();
        if (text.length > 0) {
            searchStringChanged(text);
            if (selectionListBox) {
                let items = selectionListBox.items();
                if (items) {
                    showListContainer(selectionListBox.items().length === 0);
                }
            }
        } else {
            resetInputBox();
        }
    }

    function showListContainer(hidden?: boolean) {
        inputElm.style.fontStyle = "normal";
        inputElm.style.color = "black";
        if (!hidden) {
            selectionListBox.show();
            inputElm.style.borderBottomStyle = "none";
        }
    }

    function resetInputBox() {
        selectionListBox.hide();
        inputElm.style.borderBottom = "#e5e5e5 solid 2px";
        inputElm.style.boxShadow = "0 0 20px blue";
    }

    function init() {
        container.style.zIndex = "4";
        inputBox = inputBoxCreate((s) => updateText(),
            (s) => updateText());
        inputElm = inputBox.elm;
        inputElm.style.fontSize = "18px";
        inputElm.style.fontFamily = "Segoe UI";
        inputElm.style.borderTop = "#e5e5e5 solid 2px";
        inputElm.style.borderLeft = "#e5e5e5 solid 2px";
        inputElm.style.borderRight = "#e5e5e5 solid 2px";
        inputElm.style.backgroundColor = "white";
        inputElm.style.whiteSpace = "pre";
        updateRectangles();
        resetInputBox();

        container.appendChild(inputElm);
        document.body.appendChild(container);
        inputBox.initCursor(2);
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

function getTextHeight(elm: HTMLDivElement) {
    let computedStyle = getComputedStyle(elm);
    if (computedStyle.lineHeight) {
        return parseInt(elm.style.lineHeight, 10);
    } else {
        return parseInt(computedStyle.fontSize, 10);
    }
}

let textWidthCache = new Map<string, Map<string, number>>();
let lineHeightCache = new Map<string, number>();

function getLineHeight(fontstr: string, lineHeight?: string) {
    if (lineHeight) {
        fontstr += ("@" + lineHeight);
    }
    let height = lineHeightCache.get(fontstr);
    if (height === undefined) {
        let elm = document.createElement("div");
        elm.style.position = "absolute";
        elm.style.zIndex = "-10";
        elm.style.left = "0px";
        elm.style.top = "0px";
        document.body.appendChild(elm);
        height = getTextHeight(elm);
        document.body.removeChild(elm);
        lineHeightCache.set(fontstr, height);
    }
    return height;
}

function getTextWidth(text: string, font: string) {
    let fontMap = textWidthCache.get(font);
    let w: number;
    if (!fontMap) {
        fontMap = new Map<string, number>();
    } else {
        w = fontMap.get(text);
    }
    if (w === undefined) {
        const canvas = cachedCanvas || (cachedCanvas = document.createElement("canvas"));
        const context = canvas.getContext("2d");
        context.font = font;
        const metrics = context.measureText(text);
        w = metrics.width;
        fontMap.set(text, w);
    }
    return w;
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

export interface IRange {
    start: number;
    end: number;
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
    let cellVspace = 3;
    let tableVspace = pgVspace;
    let cellTopMargin = 3;
    let cellHMargin = 3;
    let indentWidthThreshold = 600;
    return <IDocumentContext>{
        fontstr, headerFontstr, wordSpacing, headerDivHeight, defaultLineDivHeight,
        pgVspace, cellVspace, cellHMargin, cellTopMargin, tableVspace, indentWidthThreshold,
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

function endRenderSegments(marker: MergeTree.Marker) {
    return (marker.hasTileLabel("pg") ||
        ((marker.hasRangeLabel("cell") &&
            (marker.refType & MergeTree.ReferenceType.NestEnd))));
}

const wordHeadingColor = "rgb(47, 84, 150)";

function renderSegmentIntoLine(
    segment: MergeTree.Segment, segpos: number, refSeq: number,
    clientId: number, start: number, end: number, lineContext: ILineContext) {
    if (lineContext.lineDiv.linePos === undefined) {
        lineContext.lineDiv.linePos = segpos + start;
        lineContext.lineDiv.lineEnd = lineContext.lineDiv.linePos;
    }
    let segType = segment.getType();
    if (segType === MergeTree.SegmentType.Text) {
        if (start < 0) {
            start = 0;
        }
        if (end > segment.cachedLength) {
            end = segment.cachedLength;
        }
        let textSegment = <MergeTree.TextSegment>segment;
        let text = textSegment.text.substring(start, end);
        let textStartPos = segpos + start;
        let textEndPos = segpos + end;
        lineContext.span = makeSegSpan(lineContext.flowView, text, textSegment, start, segpos);
        if ((lineContext.lineDiv.endPGMarker) && (lineContext.lineDiv.endPGMarker.properties.header)) {
            lineContext.span.style.color = wordHeadingColor;
        }
        lineContext.contentDiv.appendChild(lineContext.span);
        lineContext.lineDiv.lineEnd += text.length;
        if ((lineContext.flowView.cursor.pos >= textStartPos) && (lineContext.flowView.cursor.pos <= textEndPos)) {
            showPositionInLine(lineContext, textStartPos, text, lineContext.flowView.cursor.pos);
        }
        let presenceInfo = lineContext.flowView.presenceInfoInRange(textStartPos, textEndPos);
        if (presenceInfo) {
            showPositionInLine(lineContext, textStartPos, text, presenceInfo.xformPos, presenceInfo);
        }
    } else if (segType === MergeTree.SegmentType.Marker) {
        let marker = <MergeTree.Marker>segment;
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
        if ((elm.linePos <= pos) && (elm.lineEnd > pos)) {
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

function reRenderLine(lineDiv: ILineDiv, flowView: FlowView, docContext: IDocumentContext) {
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
        flowView.client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, MergeTree.UniversalSequenceNumber,
            flowView.client.getClientId(), lineContext, lineDiv.linePos, end);
        lineDiv.lineEnd = lineEnd;
        showBookmarks(flowView, lineDiv.linePos,
            lineEnd, lineDiv.style.font, lineDivHeight, lineDiv.breakIndex, docContext,
            contentDiv, lineDiv.endPGMarker);
    }
}

function buildIntervalBlockStyle(properties: MergeTree.PropertySet, startX: number, endX: number,
    height: number, leftInBounds: boolean, rightInBounds: boolean,
    contentDiv: HTMLDivElement, client: MergeTree.Client) {
    let bookmarkDiv = document.createElement("div");
    let bookmarkRect: ui.Rectangle;
    bookmarkRect = new ui.Rectangle(startX, 0, endX - startX, height);
    bookmarkRect.conformElement(bookmarkDiv);
    contentDiv.appendChild(bookmarkDiv);
    if (leftInBounds) {
        bookmarkDiv.style.borderTopLeftRadius = "5px";
        bookmarkDiv.style.borderLeft = "1px solid gray";
        bookmarkDiv.style.borderTop = "1px solid gray";
    }
    if (rightInBounds) {
        bookmarkDiv.style.borderBottomRightRadius = "5px";
        bookmarkDiv.style.borderRight = "1px solid gray";
        bookmarkDiv.style.borderBottom = "1px solid gray";
    }
    bookmarkDiv.style.pointerEvents = "none";
    bookmarkDiv.style.backgroundColor = "lightgray";
    bookmarkDiv.style.opacity = "0.3";
    if (properties) {
        if (properties["bgColor"]) {
            bookmarkDiv.style.backgroundColor = properties["bgColor"];
        } else if (properties["clid"]) {
            let clientId = client.getOrAddShortClientId(properties["clid"]);
            let bgColor = presenceColors[clientId % presenceColors.length];
            bookmarkDiv.style.backgroundColor = bgColor;
            bookmarkDiv.style.opacity = "0.08";
        }
    }
    bookmarkDiv.style.zIndex = "2";
}

function buildIntervalTieStyle(properties: MergeTree.PropertySet, startX: number, endX: number,
    lineDivHeight: number, leftInBounds: boolean, rightInBounds: boolean,
    contentDiv: HTMLDivElement, client: MergeTree.Client) {
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

    bookmarkDiv.style.pointerEvents = "none";
    bookmarkDiv.style.backgroundColor = "lightgray";
    bookendDiv1.style.backgroundColor = "lightgray";
    bookendDiv2.style.backgroundColor = "lightgray";
    if (properties && properties["clid"]) {
        let clientId = client.getOrAddShortClientId(properties["clid"]);
        let bgColor = presenceColors[clientId % presenceColors.length];
        bookmarkDiv.style.backgroundColor = bgColor;
        bookendDiv1.style.backgroundColor = bgColor;
        bookendDiv2.style.backgroundColor = bgColor;
    }
    bookmarkDiv.style.opacity = "0.5";
    bookmarkDiv.style.zIndex = "2";
    bookendDiv1.style.opacity = "0.5";
    bookendDiv1.style.zIndex = "2";
    bookendDiv2.style.opacity = "0.5";
    bookendDiv2.style.zIndex = "2";
}

function getWidthInLine(endPGMarker: Paragraph.IParagraphMarker, breakIndex: number,
    defaultFontstr: string, offset: number) {
    let itemIndex = endPGMarker.cache.breaks[breakIndex].startItemIndex;
    let w = 0;
    while (offset > 0) {
        let item = <Paragraph.IPGBlock>endPGMarker.itemCache.items[itemIndex];
        if (!item) {
            break;
        }
        if (item.text.length > offset) {
            let fontstr = item.fontstr || defaultFontstr;
            let subw = getTextWidth(item.text.substring(0, offset), fontstr);
            return Math.floor(w + subw);
        } else {
            w += item.width;
        }
        offset -= item.text.length;
        itemIndex++;
    }
    return Math.round(w);
}

function showBookmark(properties: MergeTree.PropertySet, lineText: string,
    start: number, end: number, lineStart: number, endPGMarker: Paragraph.IParagraphMarker,
    computedEnd: number, lineFontstr: string, lineDivHeight: number, lineBreakIndex: number,
    docContext: IDocumentContext, contentDiv: HTMLDivElement, client: MergeTree.Client, useTie = false) {
    let startX: number;
    let height = lineDivHeight;
    if (start >= lineStart) {
        startX = getWidthInLine(endPGMarker, lineBreakIndex, lineFontstr, start - lineStart);
    } else {
        startX = 0;
    }
    let endX: number;
    if (end <= computedEnd) {
        endX = getWidthInLine(endPGMarker, lineBreakIndex, lineFontstr, end - lineStart);
    } else {
        if (lineBreakIndex === (endPGMarker.cache.breaks.length - 1)) {
            height += docContext.pgVspace;
        }
        endX = getWidthInLine(endPGMarker, lineBreakIndex, lineFontstr, computedEnd - lineStart);
    }
    if (useTie) {
        buildIntervalTieStyle(properties, startX, endX, lineDivHeight,
            start >= lineStart, end <= computedEnd, contentDiv, client);
    } else {
        buildIntervalBlockStyle(properties, startX, endX, height,
            start >= lineStart, end <= computedEnd, contentDiv, client);
    }
}

function showBookmarks(flowView: FlowView, lineStart: number, lineEnd: number,
    lineFontstr: string, lineDivHeight: number, lineBreakIndex: number,
    docContext: IDocumentContext, contentDiv: HTMLDivElement, endPGMarker: Paragraph.IParagraphMarker) {
    let sel = flowView.cursor.getSelection();
    let havePresenceSel = false;
    for (let localPresenceInfo of flowView.presenceVector) {
        if (localPresenceInfo && (localPresenceInfo.markXformPos !== localPresenceInfo.xformPos)) {
            havePresenceSel = true;
            break;
        }
    }
    if (flowView.bookmarks || flowView.comments || sel || havePresenceSel) {
        let client = flowView.client;
        let computedEnd = lineEnd;
        let bookmarks = flowView.bookmarks.findOverlappingIntervals(lineStart, computedEnd);
        let comments = flowView.comments.findOverlappingIntervals(lineStart, computedEnd);
        let lineText = client.getText(lineStart, computedEnd);
        if (sel && ((sel.start < lineEnd) && (sel.end > lineStart))) {
            showBookmark(undefined, lineText, sel.start, sel.end, lineStart, endPGMarker,
                computedEnd, lineFontstr, lineDivHeight, lineBreakIndex, docContext, contentDiv, client);
        }
        if (havePresenceSel) {
            for (let localPresenceInfo of flowView.presenceVector) {
                if (localPresenceInfo && (localPresenceInfo.markXformPos !== localPresenceInfo.xformPos)) {
                    let presenceStart = Math.min(localPresenceInfo.markXformPos, localPresenceInfo.xformPos);
                    let presenceEnd = Math.max(localPresenceInfo.markXformPos, localPresenceInfo.xformPos);
                    if ((presenceStart < lineEnd) && (presenceEnd > lineStart)) {
                        showBookmark({ clid: flowView.client.getLongClientId(localPresenceInfo.clientId) },
                            lineText, presenceStart, presenceEnd, lineStart, endPGMarker,
                            computedEnd, lineFontstr, lineDivHeight, lineBreakIndex, docContext, contentDiv, client);
                    }
                }
            }
        }
        if (flowView.tempBookmarks && (!flowView.modes.showBookmarks)) {
            for (let b of flowView.tempBookmarks) {
                if (b.overlapsPos(client.mergeTree, lineStart, lineEnd)) {
                    let start = b.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                        client.getClientId());
                    let end = b.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                        client.getClientId());
                    showBookmark(b.properties, lineText, start, end, lineStart,
                        endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                        docContext, contentDiv, client, true);
                }
            }
        }
        if (bookmarks && flowView.modes.showBookmarks) {
            for (let b of bookmarks) {
                let start = b.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                let end = b.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                showBookmark(b.properties, lineText, start, end, lineStart,
                    endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                    docContext, contentDiv, client, true);
            }
        }
        if (comments && flowView.modes.showComments) {
            for (let comment of comments) {
                let start = comment.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                let end = comment.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                comment.addProperties({ bgColor: "gold" });
                showBookmark(comment.properties, lineText, start, end, lineStart,
                    endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                    docContext, contentDiv, client);
            }
        }
    }
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

let svgNS = "http://www.w3.org/2000/svg";

function createSVGWrapper(w: number, h: number) {
    let svg = <HTMLElement>document.createElementNS(svgNS, "svg");
    svg.style.zIndex = "-1";
    svg.setAttribute("width", w.toString());
    svg.setAttribute("height", h.toString());
    return svg;
}

function createSVGRect(r: ui.Rectangle) {
    let rect = <HTMLElement>document.createElementNS(svgNS, "rect");
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
    cellView: ICellView, layoutInfo: ILayoutContext, targetTranslation: string, defer = false,
    leftmost = false, top = false) {
    let cellRect = new ui.Rectangle(0, 0, cellView.specWidth, 0);
    let cellViewportWidth = cellView.specWidth - (2 * layoutInfo.docContext.cellHMargin);
    let cellViewportRect = new ui.Rectangle(layoutInfo.docContext.cellHMargin, 0,
        cellViewportWidth, 0);
    let cellDiv = document.createElement("div");
    cellView.div = cellDiv;
    cellRect.conformElementOpenHeight(cellDiv);
    let client = layoutInfo.flowView.client;
    let mergeTree = client.mergeTree;
    let transferDeferredHeight = false;

    cellView.viewport = new Viewport(layoutInfo.viewport.remainingHeight(),
        document.createElement("div"), cellViewportWidth);
    cellViewportRect.conformElementOpenHeight(cellView.viewport.div);
    cellDiv.appendChild(cellView.viewport.div);
    cellView.viewport.vskip(layoutInfo.docContext.cellTopMargin);

    let cellLayoutInfo = <ILayoutContext>{
        deferredAttach: true,
        docContext: layoutInfo.docContext,
        endMarker: cellView.endMarker,
        flowView: layoutInfo.flowView,
        requestedPosition: layoutInfo.requestedPosition,
        stackIndex: layoutInfo.stackIndex,
        startingPosStack: layoutInfo.startingPosStack,
        viewport: cellView.viewport,
    };
    // TODO: deferred height calculation for starting in middle of box
    if (isInnerCell(cellView, layoutInfo)) {
        let boxPos = mergeTree.getOffset(cellView.marker, MergeTree.UniversalSequenceNumber, client.getClientId());
        cellLayoutInfo.startPos = boxPos + cellView.marker.cachedLength;
    } else {
        let nextTable = layoutInfo.startingPosStack.table.items[layoutInfo.stackIndex + 1];
        cellLayoutInfo.startPos = getOffset(layoutInfo.flowView, <MergeTree.Marker>nextTable);
        cellLayoutInfo.stackIndex = layoutInfo.stackIndex + 1;
    }
    cellView.renderOutput = renderFlow(cellLayoutInfo, targetTranslation, defer);
    if (transferDeferredHeight && (cellView.renderOutput.deferredHeight > 0)) {
        layoutInfo.deferUntilHeight = cellView.renderOutput.deferredHeight;
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
        for (let lineDiv of cellLayoutInfo.reRenderList) {
            layoutInfo.reRenderList.push(lineDiv);
        }
    }
}

function renderTable(
    table: Table.ITableMarker,
    docContext: IDocumentContext,
    layoutInfo: ILayoutContext,
    targetTranslation: string,
    defer = false) {

    let flowView = layoutInfo.flowView;
    let mergeTree = flowView.client.mergeTree;
    let tablePos = mergeTree.getOffset(table, MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    let tableView = table.table;
    if (!tableView) {
        tableView = Table.parseTable(table, tablePos, flowView.sharedString, makeFontInfo(docContext));
    }
    // let docContext = buildDocumentContext(viewportDiv);
    let viewportWidth = parseInt(layoutInfo.viewport.div.style.width, 10);

    let tableWidth = Math.floor(tableView.contentPct * viewportWidth);
    tableView.updateWidth(tableWidth);
    let tableIndent = Math.floor(tableView.indentPct * viewportWidth);
    let startRow: Table.Row;
    let startCell: ICellView;

    if (layoutInfo.startingPosStack) {
        if (layoutInfo.startingPosStack.row &&
            (layoutInfo.startingPosStack.row.items.length > layoutInfo.stackIndex)) {
            let startRowMarker = <Table.IRowMarker>layoutInfo.startingPosStack.row.items[layoutInfo.stackIndex];
            startRow = startRowMarker.row;
        }
        if (layoutInfo.startingPosStack.cell &&
            (layoutInfo.startingPosStack.cell.items.length > layoutInfo.stackIndex)) {
            let startCellMarker = <Table.ICellMarker>layoutInfo.startingPosStack.cell.items[layoutInfo.stackIndex];
            startCell = <ICellView>startCellMarker.cell;
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
        let rowView = tableView.rows[rowIndex];
        let rowHeight = 0;
        if (startRow === rowView) {
            foundStartRow = true;
        }
        let renderRow = (!defer) && (deferredHeight >= layoutInfo.deferUntilHeight) &&
            foundStartRow && (!Table.rowIsMoribund(rowView.rowMarker));
        let rowDiv: IRowDiv;
        if (renderRow) {
            let y = layoutInfo.viewport.getLineTop();
            let rowRect = new ui.Rectangle(tableIndent, y, tableWidth, 0);
            rowDiv = <IRowDiv>document.createElement("div");
            rowDiv.rowView = rowView;
            rowRect.conformElementOpenHeight(rowDiv);
            if (topRow && startCell) {
                layoutCell(
                    startCell,
                    layoutInfo,
                    targetTranslation,
                    defer,
                    startCell === rowView.cells[0],
                    firstRendered);
                deferredHeight += startCell.renderOutput.deferredHeight;
                rowHeight = startCell.renderedHeight;
                cellCount++;
            }
        }
        let cellX = 0;
        for (let cellIndex = 0, cellsLen = rowView.cells.length; cellIndex < cellsLen; cellIndex++) {
            let cell = <ICellView>rowView.cells[cellIndex];
            if ((!topRow || (cell !== startCell)) && (!Table.cellIsMoribund(cell.marker))) {
                let noCellAbove = false;
                if (prevRenderedRow) {
                    if (prevCellCount <= cellIndex) {
                        noCellAbove = true;
                    }
                }
                layoutCell(cell, layoutInfo, targetTranslation, defer,
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
            let heightVal = `${rowHeight}px`;
            let adjustRowWidth = 0;
            for (let cellIndex = 0, cellsLen = rowView.cells.length; cellIndex < cellsLen; cellIndex++) {
                let cell = <ICellView>rowView.cells[cellIndex];
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
        for (let lineDiv of layoutInfo.reRenderList) {
            reRenderLine(lineDiv, flowView, docContext);
        }
        layoutInfo.reRenderList = undefined;
    }
    tableView.deferredHeight = deferredHeight;
    tableView.renderedHeight = tableHeight;
}

function showCell(pos: number, flowView: FlowView) {
    let client = flowView.client;
    let startingPosStack =
        flowView.client.mergeTree.getStackContext(pos, client.getClientId(), ["cell"]);
    if (startingPosStack.cell && (!startingPosStack.cell.empty())) {
        let cellMarker = <Table.ICellMarker>startingPosStack.cell.top();
        let start = getOffset(flowView, cellMarker);
        let endMarker = cellMarker.cell.endMarker;
        let end = getOffset(flowView, endMarker) + 1;
        // tslint:disable:max-line-length
        console.log(`cell ${cellMarker.getId()} seq ${cellMarker.seq} clid ${cellMarker.clientId} at [${start},${end})`);
        console.log(`cell contents: ${flowView.client.getTextRangeWithMarkers(start, end)}`);
    }
}

function showTable(pos: number, flowView: FlowView) {
    let client = flowView.client;
    let startingPosStack =
        flowView.client.mergeTree.getStackContext(pos, client.getClientId(), ["table"]);
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        let tableMarker = <Table.ITableMarker>startingPosStack.table.top();
        let start = getOffset(flowView, tableMarker);
        let endMarker = tableMarker.table.endTableMarker;
        let end = getOffset(flowView, endMarker) + 1;
        console.log(`table ${tableMarker.getId()} at [${start},${end})`);
        console.log(`table contents: ${flowView.client.getTextRangeWithMarkers(start, end)}`);
    }
}

function renderTree(
    viewportDiv: HTMLDivElement, requestedPosition: number, flowView: FlowView, targetTranslation: string) {
    let client = flowView.client;
    let docContext = buildDocumentContext(viewportDiv);
    flowView.lastDocContext = docContext;
    let outerViewportHeight = parseInt(viewportDiv.style.height, 10);
    let outerViewportWidth = parseInt(viewportDiv.style.width, 10);
    let outerViewport = new Viewport(outerViewportHeight, viewportDiv, outerViewportWidth);
    let startingPosStack =
        client.mergeTree.getStackContext(requestedPosition, client.getClientId(), ["table", "cell", "row"]);
    let layoutContext = <ILayoutContext>{
        docContext,
        flowView,
        requestedPosition,
        viewport: outerViewport,
    };
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        let outerTable = startingPosStack.table.items[0];
        let outerTablePos = flowView.client.mergeTree.getOffset(<MergeTree.Marker>outerTable,
            MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
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

function gatherOverlayLayer(
    segment: MergeTree.Segment,
    segpos: number,
    refSeq: number,
    clientId: number,
    start: number,
    end: number,
    context: IOverlayMarker[]) {

    if (segment.getType() === MergeTree.SegmentType.Marker) {
        let marker = <MergeTree.Marker>segment;
        if ((marker.refType === MergeTree.ReferenceType.Simple) &&
            (marker.hasSimpleType("inkOverlay"))) {
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
    function gtw(text: string, fontstr: string) {
        return getTextWidth(text, fontstr);
    }

    function glh(fontstr: string, lineHeight?: string) {
        return getLineHeight(fontstr, lineHeight);
    }

    function getFont(pg: Paragraph.IParagraphMarker) {
        if (pg.properties["header"]) {
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

function renderFlow(layoutContext: ILayoutContext, targetTranslation: string, deferWhole = false): IRenderOutput {
    let flowView = layoutContext.flowView;
    let client = flowView.client;
    // TODO: for stable viewports cache the geometry and the divs
    // TODO: cache all this pre-amble in style blocks; override with pg properties
    let docContext = layoutContext.docContext;
    let viewportStartPos = -1;

    function makeLineDiv(r: ui.Rectangle, lineFontstr) {
        let lineDiv = makeContentDiv(r, lineFontstr);
        layoutContext.viewport.div.appendChild(lineDiv);
        return lineDiv;
    }

    let currentPos = layoutContext.startPos;
    let curPGMarker: Paragraph.IParagraphMarker;
    let curPGMarkerPos: number;

    let itemsContext = <Paragraph.IItemsContext>{
        fontInfo: makeFontInfo(layoutContext.docContext),
    };
    if (layoutContext.deferUntilHeight === undefined) {
        layoutContext.deferUntilHeight = 0;
    }
    let deferredHeight = 0;
    let deferredPGs = (layoutContext.containingPGMarker !== undefined);
    let paragraphLexer = new Paragraph.ParagraphLexer(Paragraph.tokenToItems, itemsContext);
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

    function renderPGAnnotation(endPGMarker: Paragraph.IParagraphMarker, indentWidth: number, contentWidth: number) {
        let annotDiv = makeAnnotDiv(indentWidth, layoutContext.viewport.getLineTop(),
            contentWidth, docContext.fontstr);
        let text = endPGMarker.properties[targetTranslation];
        annotDiv.innerHTML = text;
        let clientRect = annotDiv.getBoundingClientRect();
        return clientRect.height;
    }

    function renderPG(
        endPGMarker: Paragraph.IParagraphMarker,
        pgStartPos: number,
        indentWidth: number,
        indentSymbol: Paragraph.ISymbol,
        contentWidth: number) {

        let pgBreaks = endPGMarker.cache.breaks;
        let lineDiv: ILineDiv;
        let lineDivHeight = docContext.defaultLineDivHeight;
        let span: ISegSpan;

        for (let breakIndex = 0, len = pgBreaks.length; breakIndex < len; breakIndex++) {
            let lineStart = pgBreaks[breakIndex].posInPG + pgStartPos;
            let lineEnd: number;
            if (breakIndex < (len - 1)) {
                lineEnd = pgBreaks[breakIndex + 1].posInPG + pgStartPos;
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
                let lineContext = <ILineContext>{
                    contentDiv, deferredAttach: layoutContext.deferredAttach, flowView: layoutContext.flowView,
                    lineDiv, lineDivHeight, pgMarker: endPGMarker, span,
                };
                if (viewportStartPos < 0) {
                    viewportStartPos = lineStart;
                }
                client.mergeTree.mapRange({ leaf: renderSegmentIntoLine }, MergeTree.UniversalSequenceNumber,
                    client.getClientId(), lineContext, lineStart, lineEnd);
                if (flowView.bookmarks) {
                    let computedEnd = lineEnd;
                    if (!computedEnd) {
                        computedEnd = client.mergeTree.getOffset(endPGMarker, client.getCurrentSeq(),
                            client.getClientId());
                    }
                    showBookmarks(layoutContext.flowView, lineStart,
                        computedEnd, lineFontstr, lineDivHeight, breakIndex, docContext, contentDiv, endPGMarker);
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
                break;
            }
        }
        return lineDiv.lineEnd;
    }

    let fetchLog = false;
    let segoff: ISegmentOffset;
    let totalLength = client.getLength();
    let viewportEndPos = currentPos;
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
        if ((segoff.segment.getType() === MergeTree.SegmentType.Marker) &&
            ((<MergeTree.Marker>segoff.segment).hasRangeLabel("table"))) {
            let marker = <MergeTree.Marker>segoff.segment;
            // TODO: branches
            let tableView: Table.Table;
            if (marker.removedSeq === undefined) {
                renderTable(marker, docContext, layoutContext, targetTranslation, deferredPGs);
                tableView = (<Table.ITableMarker>marker).table;
                deferredHeight += tableView.deferredHeight;
                layoutContext.viewport.vskip(layoutContext.docContext.tableVspace);
            } else {
                tableView = Table.parseTable(marker, currentPos, flowView.sharedString,
                    makeFontInfo(layoutContext.docContext));
            }
            let endTablePos = getOffset(layoutContext.flowView, tableView.endTableMarker);
            currentPos = endTablePos + 1;
            segoff = undefined;
            // TODO: if reached end of viewport, get pos ranges
        } else {
            if (segoff.segment.getType() === MergeTree.SegmentType.Marker) {
                // empty paragraph
                curPGMarker = <Paragraph.IParagraphMarker>segoff.segment;
                if (fetchLog) {
                    console.log("empty pg");
                    if (curPGMarker.itemCache) {
                        console.log(`length items ${curPGMarker.itemCache.items.length}`);
                    }
                }
                curPGMarkerPos = currentPos;
            } else {
                let curTilePos = findTile(flowView, currentPos, "pg", false);
                curPGMarker = <Paragraph.IParagraphMarker>curTilePos.tile;
                curPGMarkerPos = curTilePos.pos;
            }
            itemsContext.curPGMarker = curPGMarker;
            // TODO: only set this to undefined if text changed
            curPGMarker.listCache = undefined;
            Paragraph.getListCacheInfo(layoutContext.flowView.sharedString, curPGMarker, curPGMarkerPos);
            let indentPct = 0.0;
            let contentPct = 1.0;
            let indentWidth = 0;
            let contentWidth = layoutContext.viewport.currentLineWidth();
            let indentSymbol: Paragraph.ISymbol = undefined;

            if (curPGMarker.listCache) {
                indentSymbol = Paragraph.getIndentSymbol(curPGMarker);
            }
            if (indentPct === 0.0) {
                indentPct = Paragraph.getIndentPct(curPGMarker);
            }
            if (contentPct === 1.0) {
                contentPct = Paragraph.getContentPct(curPGMarker);
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
                Paragraph.clearContentCaches(curPGMarker);
            }
            if ((!curPGMarker.cache) || (curPGMarker.cache.singleLineWidth !== contentWidth)) {
                if (!curPGMarker.itemCache) {
                    itemsContext.itemInfo = { items: [], minWidth: 0 };
                    client.mergeTree.mapRange({ leaf: Paragraph.segmentToItems }, MergeTree.UniversalSequenceNumber,
                        client.getClientId(), itemsContext, currentPos, curPGMarkerPos + 1);
                    curPGMarker.itemCache = itemsContext.itemInfo;
                } else {
                    itemsContext.itemInfo = curPGMarker.itemCache;
                }
                let breaks = Paragraph.breakPGIntoLinesFF(itemsContext.itemInfo.items, contentWidth);
                curPGMarker.cache = { breaks, singleLineWidth: contentWidth };
            }
            paragraphLexer.reset();
            // TODO: more accurate end of document reasoning

            if (currentPos < totalLength) {
                let lineEnd = renderPG(curPGMarker, currentPos, indentWidth, indentSymbol, contentWidth);
                viewportEndPos = lineEnd;
                currentPos = curPGMarkerPos + curPGMarker.cachedLength;

                if (!deferredPGs) {
                    if (curPGMarker.properties[targetTranslation]) {
                        // layoutContext.viewport.vskip(Math.floor(docContext.pgVspace/2));
                        let height = renderPGAnnotation(curPGMarker, indentWidth, contentWidth);
                        layoutContext.viewport.vskip(height);
                    }
                }
                if (currentPos < totalLength) {
                    segoff = getContainingSegment(flowView, currentPos);
                    if (segoff.segment.getType() === MergeTree.SegmentType.Marker) {
                        let marker = <MergeTree.Marker>segoff.segment;
                        if (marker.hasRangeLabel("cell") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                            layoutContext.viewport.vskip(layoutContext.docContext.cellVspace);
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

    const overlayMarkers: IOverlayMarker[] = [];
    client.mergeTree.mapRange(
        { leaf: gatherOverlayLayer },
        MergeTree.UniversalSequenceNumber,
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
    context: FlowView, segText: string, textSegment: MergeTree.TextSegment, offsetFromSegpos: number,
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

const Nope = -1;

let presenceColors = ["darkgreen", "sienna", "olive", "purple"];
export class Cursor {
    public off = true;
    public parentSpan: HTMLSpanElement;
    public editSpan: HTMLSpanElement;
    public presenceDiv: HTMLDivElement;
    public presenceInfo: ILocalPresenceInfo;
    public presenceInfoUpdated = true;
    public mark = Nope;
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

    public tryMark() {
        if (this.mark === Nope) {
            this.mark = this.pos;
        }
    }

    public emptySelection() {
        return this.mark === this.pos;
    }

    public clearSelection() {
        this.mark = Nope;
    }

    public getSelection() {
        if (this.mark !== Nope) {
            return <IRange>{
                end: Math.max(this.mark, this.pos),
                start: Math.min(this.mark, this.pos),
            };
        }
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
        // TODO callback to go from UID to display information
        this.presenceDiv.innerText = this.getUserDisplayString(this.presenceInfo.user);
        this.presenceDiv.style.zIndex = "1";
        this.presenceDiv.style.position = "absolute";
        this.presenceDiv.style.color = "white";
        this.presenceDiv.style.backgroundColor = this.bgColor;
        this.presenceDiv.style.font = "14px Arial";
        this.presenceDiv.style.border = `3px solid ${this.bgColor}`;
        this.presenceDiv.style.borderTopRightRadius = "1em";
        // go underneath local cursor
        this.editSpan.style.zIndex = "1";
    }

    public makeSpan() {
        this.editSpan = document.createElement("span");
        this.editSpan.innerText = "\uFEFF";
        this.editSpan.style.zIndex = "3";
        this.editSpan.style.position = "absolute";
        this.editSpan.style.left = "0px";
        this.editSpan.style.top = "0px";
        this.editSpan.style.width = "2px";
        this.show();
    }

    public onLine(pos: number) {
        let lineDiv = this.lineDiv();
        return (pos >= lineDiv.linePos) && (pos < lineDiv.lineEnd);
    }

    public lineDiv() {
        return <ILineDiv>this.editSpan.parentElement;
    }

    public updateView(flowView: FlowView) {
        if (flowView.modes.showCursorLocation) {
            flowView.cursorLocation();
        }
        if (this.getSelection()) {
            flowView.render(flowView.topChar, true);
        } else {
            let lineDiv = this.lineDiv();
            if (lineDiv && (lineDiv.linePos <= this.pos) && (lineDiv.lineEnd > this.pos)) {
                reRenderLine(lineDiv, flowView, flowView.lastDocContext);
            } else {
                let foundLineDiv = findLineDiv(this.pos, flowView, true);
                if (foundLineDiv) {
                    reRenderLine(foundLineDiv, flowView, flowView.lastDocContext);
                } else {
                    flowView.render(flowView.topChar, true);
                }
            }
        }
    }

    public rect() {
        return this.editSpan.getBoundingClientRect();
    }

    public scope() {
        this.bgColor = "gray";
        this.editSpan.style.backgroundColor = this.bgColor;
        this.editSpan.style.zIndex = "4";
        this.editSpan.style.width = "1px";
    }

    public lateralMove(x: number) {
        this.editSpan.style.left = `${x}px`;
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

    private getUserDisplayString(user: core.IAuthenticatedUser): string {
        // TODO - callback to client code to provide mapping from user -> display
        // this would allow a user ID to be put on the wire which can then be mapped
        // back to an email, name, etc...
        return user.user.id;
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
    del = 46,
    letter_a = 65,
    letter_z = 90,
}

export interface IRemotePresenceInfo {
    origPos: number;
    origMark: number;
    refseq: number;
}

export interface ILocalPresenceInfo {
    localRef?: MergeTree.LocalReference;
    markLocalRef?: MergeTree.LocalReference;
    xformPos?: number;
    markXformPos?: number;
    clientId: number;
    user: core.IAuthenticatedUser;
    cursor?: Cursor;
    fresh: boolean;
}

interface ISegmentOffset {
    segment: MergeTree.Segment;
    offset: number;
}

interface IWordRange {
    wordStart: number;
    wordEnd: number;
}

function getCurrentWord(pos: number, mergeTree: MergeTree.MergeTree) {
    let wordStart = -1;
    let wordEnd = -1;

    function maximalWord(textSegment: MergeTree.TextSegment, offset: number) {
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

    let expandWordBackward = (segment: MergeTree.Segment) => {
        if (mergeTree.localNetLength(segment)) {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    return false;
                case MergeTree.SegmentType.Text:
                    let textSegment = <MergeTree.TextSegment>segment;
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

    let expandWordForward = (segment: MergeTree.Segment) => {
        if (mergeTree.localNetLength(segment)) {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    return false;
                case MergeTree.SegmentType.Text:
                    let textSegment = <MergeTree.TextSegment>segment;
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
        MergeTree.UniversalSequenceNumber, mergeTree.collabWindow.clientId);
    if (segoff.segment && (segoff.segment.getType() === MergeTree.SegmentType.Text)) {
        let textSegment = <MergeTree.TextSegment>segoff.segment;
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

function getLocalRefPos(flowView: FlowView, localRef: MergeTree.LocalReference) {
    return flowView.client.mergeTree.getOffset(localRef.segment, MergeTree.UniversalSequenceNumber,
        flowView.client.getClientId()) + localRef.offset;
}

function getContainingSegment(flowView: FlowView, pos: number): ISegmentOffset {
    return flowView.client.mergeTree.getContainingSegment(pos, MergeTree.UniversalSequenceNumber,
        flowView.client.getClientId());
}

function findTile(flowView: FlowView, startPos: number, tileType: string, preceding = true) {
    return flowView.client.mergeTree.findTile(startPos, flowView.client.getClientId(), tileType, preceding);
}

function getOffset(flowView: FlowView, segment: MergeTree.Segment) {
    return flowView.client.mergeTree.getOffset(segment, MergeTree.UniversalSequenceNumber,
        flowView.client.getClientId());
}

function preventD(e: Event) {
    e.returnValue = false;
    e.preventDefault();
    return false;
}

export interface IFlowViewModes {
    showBookmarks?: boolean;
    showComments?: boolean;
    showCursorLocation?: boolean;
}

export class FlowView extends ui.Component {
    public static docStartPosition = 0;
    public timeToImpression: number;
    public timeToLoad: number;
    public timeToEdit: number;
    public timeToCollab: number;
    public prevTopSegment: MergeTree.TextSegment;
    public viewportStartPos: number;
    public viewportEndPos: number;
    public cursorSpan: HTMLSpanElement;
    public viewportDiv: HTMLDivElement;
    public viewportRect: ui.Rectangle;
    public client: MergeTree.Client;
    public historyClient: MergeTree.Client;
    public historyWidget: HTMLDivElement;
    public historyBubble: HTMLDivElement;
    public historyVersion: HTMLSpanElement;
    public savedClient: MergeTree.Client;
    public ticking = false;
    public wheelTicking = false;
    public topChar = -1;
    public cursor: Cursor;
    public bookmarks: SharedIntervalCollection;
    public tempBookmarks: Interval[];
    public comments: SharedIntervalCollection;
    public presenceMapView: types.IMapView;
    public presenceVector: ILocalPresenceInfo[] = [];
    public docRoot: types.IMapView;
    public curPG: MergeTree.Marker;
    public modes = <IFlowViewModes>{
        showBookmarks: true,
        showComments: true,
        showCursorLocation: true,
    };
    public lastDocContext: IDocumentContext;
    private lastVerticalX = -1;
    private randWordTimer: any;
    private pendingRender = false;
    private diagCharPort = false;
    private targetTranslation: string;
    private activeSearchBox: ISearchBox;
    private cmdTree: MergeTree.TST<ICmd>;
    private formatRegister: MergeTree.PropertySet;

    constructor(
        element: HTMLDivElement,
        public collabDocument: api.Document,
        public sharedString: SharedString,
        public status: Status,
        public options: Object = undefined) {

        super(element);

        this.cmdTree = new MergeTree.TST<ICmd>();
        for (let command of commands) {
            this.cmdTree.put(command.key.toLowerCase(), command);
        }

        this.client = sharedString.client;
        this.viewportDiv = document.createElement("div");
        this.element.appendChild(this.viewportDiv);
        const translationLanguage = "translationLanguage";
        this.targetTranslation = options[translationLanguage]
            ? `translation-${options[translationLanguage]}`
            : undefined;

        this.statusMessage("li", " ");
        this.statusMessage("si", " ");
        sharedString.on("op", (msg, local) => {
            if (local) {
                return;
            }

            const delta = <MergeTree.IMergeTreeOp>msg.contents;
            if (this.applyOp(delta, msg)) {
                this.queueRender(msg);
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
            this.bookmarks.add(pos1, pos1 + intervalLen, MergeTree.IntervalType.Simple,
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
        presenceMap.on("valueChanged", (delta: types.IValueChanged, local: boolean, op: core.ISequencedObjectMessage) => {
            this.remotePresenceUpdate(delta, local, op);
        });

        presenceMap.getView().then((v) => {
            this.presenceMapView = v;
            this.updatePresence();
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

    public updatePresencePosition(localPresenceInfo: ILocalPresenceInfo) {
        if (localPresenceInfo) {
            localPresenceInfo.xformPos = getLocalRefPos(this, localPresenceInfo.localRef);
            if (localPresenceInfo.markLocalRef) {
                localPresenceInfo.markXformPos = getLocalRefPos(this, localPresenceInfo.markLocalRef);
            } else {
                localPresenceInfo.markXformPos = localPresenceInfo.xformPos;
            }
        }
    }

    public updatePresencePositions() {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            this.updatePresencePosition(this.presenceVector[i]);
        }
    }

    public updatePresenceVector(localPresenceInfo: ILocalPresenceInfo) {
        this.updatePresencePosition(localPresenceInfo);
        let presentPresence = this.presenceVector[localPresenceInfo.clientId];
        let tempXformPos = -1;
        let tempMarkXformPos = -2;

        if (presentPresence) {
            if (presentPresence.cursor) {
                localPresenceInfo.cursor = presentPresence.cursor;
                localPresenceInfo.cursor.presenceInfo = localPresenceInfo;
                localPresenceInfo.cursor.presenceInfoUpdated = true;
            }
            if (presentPresence.markLocalRef) {
                let markBaseSegment = <MergeTree.BaseSegment>presentPresence.localRef.segment;
                this.client.mergeTree.removeLocalReference(markBaseSegment, presentPresence.markLocalRef);
            }
            let baseSegment = <MergeTree.BaseSegment>presentPresence.localRef.segment;
            this.client.mergeTree.removeLocalReference(baseSegment, presentPresence.localRef);
            tempXformPos = presentPresence.xformPos;
            tempMarkXformPos = presentPresence.markXformPos;
        }
        this.client.mergeTree.addLocalReference(localPresenceInfo.localRef);
        if (localPresenceInfo.markLocalRef) {
            this.client.mergeTree.addLocalReference(localPresenceInfo.localRef);
        }
        this.presenceVector[localPresenceInfo.clientId] = localPresenceInfo;
        if ((localPresenceInfo.xformPos !== tempXformPos) ||
            (localPresenceInfo.markXformPos !== tempMarkXformPos)) {
            let sameLine = localPresenceInfo.cursor &&
                localPresenceInfo.cursor.onLine(tempXformPos) &&
                localPresenceInfo.cursor.onLine(tempMarkXformPos) &&
                localPresenceInfo.cursor.onLine(localPresenceInfo.xformPos) &&
                localPresenceInfo.cursor.onLine(localPresenceInfo.markXformPos);
            this.presenceQueueRender(localPresenceInfo, sameLine);
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
            for (let cell of rowDiv.rowView.cells) {
                if (cell.div) {
                    let innerDiv = this.lineDivSelect(fn, (cell as ICellView).viewport.div, true, rev);
                    if (innerDiv) {
                        lineDiv = innerDiv;
                        rowDiv = <IRowDiv>innerDiv;
                        break;
                    }
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
                this.curPG = <MergeTree.Marker>tilePos.tile;
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
                    if (position === targetLineDiv.lineEnd) {
                        position--;
                    }
                }
            }
        }

        return position;
    }

    // TODO: handle symbol div
    public setCursorPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        const position = this.getPosFromPixels(targetLineDiv, x);
        if (position !== undefined) {
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
            if (segoff.segment.getType() !== MergeTree.SegmentType.Text) {
                // REVIEW: assume marker for now (could be external later)
                let marker = <MergeTree.Marker>segoff.segment;
                if ((marker.refType & MergeTree.ReferenceType.Tile) &&
                    (marker.hasTileLabel("pg"))) {
                    if (marker.hasRangeLabel("table") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                        this.cursorRev();
                    }
                } else if ((marker.refType === MergeTree.ReferenceType.NestEnd) && (marker.hasRangeLabel("cell"))) {
                    let cellMarker = <Table.ICellMarker>marker;
                    let endId = cellMarker.getId();
                    let beginMarker: Table.ICellMarker;
                    if (endId) {
                        let id = Table.idFromEndId(endId);
                        beginMarker = <Table.ICellMarker>this.sharedString.client.mergeTree.getSegmentFromId(id);
                    } else {
                        endId = cellMarker.getLocalId();
                        let localId = Table.idFromEndId(endId);
                        beginMarker = <Table.ICellMarker>this.sharedString.client.mergeTree.getSegmentFromLocalId(localId);
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

    public cursorFwd() {
        if (this.cursor.pos < (this.client.getLength() - 1)) {
            this.cursor.pos++;

            let segoff = this.client.mergeTree.getContainingSegment(this.cursor.pos, MergeTree.UniversalSequenceNumber,
                this.client.getClientId());
            if (segoff.segment.getType() !== MergeTree.SegmentType.Text) {
                // REVIEW: assume marker for now
                let marker = <MergeTree.Marker>segoff.segment;
                if ((marker.refType & MergeTree.ReferenceType.Tile) &&
                    (marker.hasTileLabel("pg"))) {
                    if (marker.hasRangeLabel("table") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                        this.cursorFwd();
                    } else {
                        return;
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
                    let cell = <ICellView>rowDiv.rowView.findClosestCell(x);
                    if (cell) {
                        if (up) {
                            targetLineDiv = cell.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = cell.viewport.firstLineDiv();
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
                let targetRow: Table.Row;
                if (up) {
                    targetRow = tableView.findPrecedingRow(rowView);
                } else {
                    targetRow = tableView.findNextRow(rowView);
                }
                if (targetRow) {
                    let cell = <ICellView>targetRow.findClosestCell(x);
                    if (cell) {
                        if (up) {
                            targetLineDiv = cell.viewport.lastLineDiv();
                        } else {
                            targetLineDiv = cell.viewport.firstLineDiv();
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

    public clearSelection(render = true) {
        // TODO: only rerender line if selection on one line
        if (this.cursor.getSelection()) {
            this.cursor.clearSelection();
            this.updatePresence();
            if (render) {
                this.localQueueRender(this.cursor.pos);
            }
        }
    }

    public setEdit(docRoot: types.IMapView) {
        this.docRoot = docRoot;

        window.oncontextmenu = preventD;
        this.element.onmousemove = preventD;
        this.element.onmouseup = preventD;
        this.element.onselectstart = preventD;
        let prevX = Nope;
        let prevY = Nope;
        let freshDown = false;

        let moveCursor = (e: MouseEvent) => {
            if (e.button === 0) {
                prevX = e.clientX;
                prevY = e.clientY;
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
            }
        };

        let mousemove = (e: MouseEvent) => {
            if (e.button === 0) {
                if ((prevX !== e.clientX) || (prevY !== e.clientY)) {
                    if (freshDown) {
                        this.cursor.tryMark();
                        freshDown = false;
                    }
                    moveCursor(e);
                }
                e.preventDefault();
                e.returnValue = false;
                return false;
            }
        };

        this.element.onmousedown = (e) => {
            if (e.button === 0) {
                freshDown = true;
                moveCursor(e);
                if (!e.shiftKey) {
                    this.clearSelection();
                }
                this.element.onmousemove = mousemove;
            }
            e.preventDefault();
            e.returnValue = false;
            return false;
        };

        this.element.onmouseup = (e) => {
            this.element.onmousemove = undefined;
            if (e.button === 0) {
                freshDown = false;
                let span = <ISegSpan>e.target;
                let segspan: ISegSpan;
                if (span.seg) {
                    segspan = span;
                } else {
                    segspan = <ISegSpan>span.parentElement;
                }
                if (segspan && segspan.seg) {
                    this.clickSpan(e.clientX, e.clientY, segspan);
                    if (this.cursor.emptySelection()) {
                        this.clearSelection();
                    }
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
            if (this.activeSearchBox) {
                if (e.keyCode === KeyCode.esc) {
                    this.activeSearchBox.dismiss();
                    this.activeSearchBox = undefined;
                } else {
                    this.activeSearchBox.keydown(e);
                }
            } else {
                let saveLastVertX = this.lastVerticalX;
                let specialKey = true;
                this.lastVerticalX = -1;
                if (e.ctrlKey && (e.keyCode !== 17)) {
                    this.keyCmd(e.keyCode);
                } else if (e.keyCode === KeyCode.TAB) {
                    this.onTAB(e.shiftKey);
                } else if (e.keyCode === KeyCode.esc) {
                    this.clearSelection();
                } else if (e.keyCode === KeyCode.backspace) {
                    this.cursor.pos--;
                    if (this.modes.showCursorLocation) {
                        this.cursorLocation();
                    }
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
                    if (this.modes.showCursorLocation) {
                        this.cursorLocation();
                    }
                    this.render(FlowView.docStartPosition);
                } else if (e.keyCode === KeyCode.end) {
                    let halfport = Math.floor(this.viewportCharCount() / 2);
                    let topChar = this.client.getLength() - halfport;
                    this.cursor.pos = topChar;
                    if (this.modes.showCursorLocation) {
                        this.cursorLocation();
                    }
                    this.updatePresence();
                    this.render(topChar);
                } else if (e.keyCode === KeyCode.rightArrow) {
                    if (this.cursor.pos < (this.client.getLength() - 1)) {
                        if (this.cursor.pos === this.viewportEndPos) {
                            this.scroll(false, true);
                        }
                        if (e.shiftKey) {
                            this.cursor.tryMark();
                        } else {
                            this.clearSelection();
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
                        if (e.shiftKey) {
                            this.cursor.tryMark();
                        } else {
                            this.clearSelection();
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
                    if (e.shiftKey) {
                        this.cursor.tryMark();
                    } else {
                        this.clearSelection();
                    }
                    let maxPos = this.client.getLength() - 1;
                    if (this.viewportEndPos > maxPos) {
                        this.viewportEndPos = maxPos;
                    }
                    let vpEnd = this.viewportEndPos;
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
            }
        };

        let keypressHandler = (e: KeyboardEvent) => {
            if (this.activeSearchBox) {
                if (e.charCode === CharacterCodes.cr) {
                    let cmd = <ICmd>this.activeSearchBox.getSelectedItem();
                    if (cmd && cmd.exec) {
                        cmd.exec(this);
                    }
                    this.activeSearchBox.dismiss();
                    this.activeSearchBox = undefined;
                } else {
                    this.activeSearchBox.keypress(e);
                }
            } else {
                let pos = this.cursor.pos;
                this.cursor.pos++;
                let code = e.charCode;
                if (code === CharacterCodes.cr) {
                    // TODO: other labels; for now assume only list/pg tile labels
                    let curTilePos = findTile(this, pos, "pg", false);
                    let pgMarker = <Paragraph.IParagraphMarker>curTilePos.tile;
                    let pgPos = curTilePos.pos;
                    Paragraph.clearContentCaches(pgMarker);
                    let curProps = pgMarker.properties;
                    let newProps = MergeTree.createMap<any>();
                    let newLabels = ["pg"];
                    if (Paragraph.isListTile(pgMarker)) {
                        newLabels.push("list");
                        newProps.indentLevel = curProps.indentLevel;
                        newProps.listKind = curProps.listKind;
                    }
                    newProps[MergeTree.reservedTileLabelsKey] = newLabels;
                    // TODO: place in group op
                    // old marker gets new props
                    this.sharedString.annotateRange(newProps, pgPos, pgPos + 1,
                        { name: "rewrite" });
                    // new marker gets existing props
                    this.sharedString.insertMarker(pos, MergeTree.ReferenceType.Tile, curProps);
                } else {
                    this.sharedString.insertText(String.fromCharCode(code), pos);
                    this.updatePGInfo(pos);
                }
                this.clearSelection();
                if (this.modes.showCursorLocation) {
                    this.cursorLocation();
                }
                this.localQueueRender(this.cursor.pos);
            }
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

            let lc = !!(<Paragraph.IParagraphMarker>tileInfo.tile).listCache;
            console.log(`tile at pos ${tileInfo.pos} with props${buf} and list cache: ${lc}`);
        }
    }

    public setList(listKind = 0) {
        let searchPos = this.cursor.pos;
        let tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let tile = <Paragraph.IParagraphMarker>tileInfo.tile;
            let listStatus = false;
            if (tile.hasTileLabel("list")) {
                listStatus = true;
            }
            let curLabels = <string[]>tile.properties[MergeTree.reservedTileLabelsKey];

            if (listStatus) {
                let remainingLabels = curLabels.filter((l) => l !== "list");
                this.sharedString.annotateRange({
                    [MergeTree.reservedTileLabelsKey]: remainingLabels,
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
                    [MergeTree.reservedTileLabelsKey]: augLabels,
                    indentLevel,
                    listKind,
                }, tileInfo.pos, tileInfo.pos + 1);
            }
            tile.listCache = undefined;
            this.localQueueRender(this.cursor.pos);
        }
    }

    public tryMoveCell(pos: number, shift = false) {
        let cursorContext =
            this.client.mergeTree.getStackContext(pos, this.client.getClientId(), ["table", "cell", "row"]);
        if (cursorContext.table && (!cursorContext.table.empty())) {
            let tableMarker = <Table.ITableMarker>cursorContext.table.top();
            let tableView = tableMarker.table;
            if (cursorContext.cell && (!cursorContext.cell.empty())) {
                let cell = <Table.ICellMarker>cursorContext.cell.top();
                let toCell: Table.Cell;
                if (shift) {
                    toCell = tableView.prevcell(cell.cell);
                } else {
                    toCell = tableView.nextcell(cell.cell);
                }
                if (toCell) {
                    let offset = this.client.mergeTree.getOffset(toCell.marker,
                        MergeTree.UniversalSequenceNumber, this.client.getClientId());
                    this.cursor.pos = offset + 1;
                } else {
                    if (shift) {
                        let offset = this.client.mergeTree.getOffset(tableView.tableMarker,
                            MergeTree.UniversalSequenceNumber, this.client.getClientId());
                        this.cursor.pos = offset - 1;
                    } else {
                        let endOffset = this.client.mergeTree.getOffset(tableView.endTableMarker,
                            MergeTree.UniversalSequenceNumber, this.client.getClientId());
                        this.cursor.pos = endOffset + 1;
                    }
                }
                this.updatePresence();
                this.cursor.updateView(this);
            }
            return true;
        } else {
            return false;
        }
    }

    // TODO: tab stops in non-list, non-table paragraphs
    public onTAB(shift = false) {
        let searchPos = this.cursor.pos;
        let tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            if (!this.tryMoveCell(tileInfo.pos, shift)) {
                let tile = <Paragraph.IParagraphMarker>tileInfo.tile;
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
        this.toggleWordOrSelection("fontWeight", "bold", null);
    }

    public toggleItalic() {
        this.toggleWordOrSelection("fontStyle", "italic", "normal");
    }

    public toggleUnderline() {
        this.toggleWordOrSelection("textDecoration", "underline", null);
    }

    public copyFormat() {
        let segoff = getContainingSegment(this, this.cursor.pos);
        if (segoff.segment && (segoff.segment.getType() === MergeTree.SegmentType.Text)) {
            let textSegment = <MergeTree.TextSegment>segoff.segment;
            this.formatRegister = MergeTree.extend(MergeTree.createMap(), textSegment.properties);
        }
    }

    public setProps(props: MergeTree.PropertySet, updatePG = true) {
        let sel = this.cursor.getSelection();
        if (sel) {
            this.clearSelection(false);
            this.sharedString.annotateRange(props, sel.start, sel.end);
        } else {
            let wordRange = getCurrentWord(this.cursor.pos, this.sharedString.client.mergeTree);
            if (wordRange) {
                this.sharedString.annotateRange(props, wordRange.wordStart, wordRange.wordEnd);
            }
        }
        if (updatePG) {
            this.updatePGInfo(this.cursor.pos);
        }
        this.localQueueRender(this.cursor.pos);
    }

    public paintFormat() {
        if (this.formatRegister) {
            this.setProps(this.formatRegister);
        }
    }

    public setFont(family: string, size = "18px") {
        this.setProps({ fontFamily: family, fontSize: size });
    }

    public setColor(color: string) {
        this.setProps({ color }, false);
    }

    public toggleWordOrSelection(name: string, valueOn: string, valueOff: string) {
        let sel = this.cursor.getSelection();
        if (sel) {
            this.clearSelection(false);
            this.toggleRange(name, valueOn, valueOff, sel.start, sel.end);
        } else {
            let wordRange = getCurrentWord(this.cursor.pos, this.sharedString.client.mergeTree);
            if (wordRange) {
                this.toggleRange(name, valueOn, valueOff, wordRange.wordStart, wordRange.wordEnd);
            }
        }
    }

    public toggleRange(name: string, valueOn: string, valueOff: string, start: number, end: number) {
        let someSet = false;
        let findPropSet = (segment: MergeTree.Segment) => {
            if (segment.getType() === MergeTree.SegmentType.Text) {
                let textSegment = <MergeTree.TextSegment>segment;
                if (textSegment.properties && textSegment.properties[name] === valueOn) {
                    someSet = true;
                }
                return !someSet;
            }
        };
        this.sharedString.client.mergeTree.mapRange({ leaf: findPropSet }, MergeTree.UniversalSequenceNumber,
            this.sharedString.client.getClientId(), undefined, start, end);
        if (someSet) {
            this.sharedString.annotateRange({ [name]: valueOff }, start, end);
        } else {
            this.sharedString.annotateRange({ [name]: valueOn }, start, end);
        }
        this.localQueueRender(this.cursor.pos);
    }

    public showAdjacentBookmark(before = true) {
        if (this.bookmarks) {
            let result: Interval;
            if (before) {
                result = this.bookmarks.localCollection.previousInterval(this.cursor.pos);
            } else {
                result = this.bookmarks.localCollection.nextInterval(this.cursor.pos);
            }
            if (result) {
                let s = result.start.toPosition(this.client.mergeTree,
                    MergeTree.UniversalSequenceNumber, this.client.getClientId());
                let e = result.end.toPosition(this.client.mergeTree,
                    MergeTree.UniversalSequenceNumber, this.client.getClientId());
                let descr = "next ";
                if (before) {
                    descr = "previous ";
                }
                console.log(`${descr} bookmark is [${s},${e})`);
                this.tempBookmarks = [result];
                this.localQueueRender(this.cursor.pos);
            }
        }
    }

    public cursorLocation() {
        this.statusMessage("cursor", `Cursor: ${this.cursor.pos} `);
    }

    public showCommentText() {
        let overlappingComments = this.comments.findOverlappingIntervals(this.cursor.pos,
            this.cursor.pos + 1);
        if (overlappingComments && (overlappingComments.length >= 1)) {
            let commentInterval = overlappingComments[0];
            let commentText = commentInterval.properties["story"].client.getText();
            this.statusMessage("comment", "Comment Text: " + commentText);
            setTimeout(() => {
                this.status.remove("comment");
            }, (10000));
        }
    }

    public createComment() {
        let sel = this.cursor.getSelection();
        if (sel) {
            let commentStory = this.collabDocument.createString();
            commentStory.insertText("a comment...", 0);
            commentStory.attach();
            this.comments.add(sel.start, sel.end, MergeTree.IntervalType.Simple,
                { story: commentStory });
            this.cursor.clearSelection();
            this.localQueueRender(this.cursor.pos);
        }
    }

    public copy() {
        let sel = this.cursor.getSelection();
        if (sel) {
            this.sharedString.copy("clipboard", sel.start, sel.end);
            this.clearSelection();
        }
    }

    public cut() {
        let sel = this.cursor.getSelection();
        if (sel) {
            let len = sel.end - sel.start;
            this.sharedString.cut("clipboard", sel.start, sel.end);
            if (this.cursor.pos === sel.end) {
                this.cursor.pos -= len;
            }
            this.clearSelection();
            if (this.modes.showCursorLocation) {
                this.cursorLocation();
            }
            this.updatePresence();
        }
    }

    public paste() {
        this.updatePGInfo(this.cursor.pos);
        this.cursor.pos = this.sharedString.paste("clipboard", this.cursor.pos);
        this.updatePGInfo(this.cursor.pos);
        this.updatePresence();
        if (this.modes.showCursorLocation) {
            this.cursorLocation();
        }
        this.localQueueRender(this.cursor.pos);
    }

    public deleteRow() {
        let stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            let tableMarker = <Table.ITableMarker>stack.table.top();
            let rowMarker = <Table.IRowMarker>stack.row.top();
            if (!tableMarker.table) {
                let tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteRow(this.sharedString, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public deleteCellShiftLeft() {
        let stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            let tableMarker = <Table.ITableMarker>stack.table.top();
            let cellMarker = <Table.ICellMarker>stack.cell.top();
            if (!tableMarker.table) {
                let tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteCellShiftLeft(this.sharedString, cellMarker.cell, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public deleteColumn() {
        let stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            let tableMarker = <Table.ITableMarker>stack.table.top();
            let rowMarker = <Table.IRowMarker>stack.row.top();
            let cellMarker = <Table.ICellMarker>stack.cell.top();
            if (!tableMarker.table) {
                let tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteColumn(this.sharedString, cellMarker.cell, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public insertRow() {
        let stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            let tableMarker = <Table.ITableMarker>stack.table.top();
            let rowMarker = <Table.IRowMarker>stack.row.top();
            if (!tableMarker.table) {
                let tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertRow(this.sharedString, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public randomCell(table: Table.Table) {
        let cellCount = 0;
        for (let row of table.rows) {
            if (!Table.rowIsMoribund(row.rowMarker)) {
                for (let cell of row.cells) {
                    if (!Table.cellIsMoribund(cell.marker)) {
                        cellCount++;
                    }
                }
            }
        }
        if (cellCount > 0) {
            let randIndex = Math.round(Math.random() * cellCount);
            cellCount = 0;
            for (let row of table.rows) {
                if (!Table.rowIsMoribund(row.rowMarker)) {
                    for (let cell of row.cells) {
                        if (!Table.cellIsMoribund(cell.marker)) {
                            if (cellCount === randIndex) {
                                return cell;
                            }
                            cellCount++;
                        }
                    }
                }
            }
        }
    }

    public crazyTable(k: number) {
        let count = 0;
        let rowCount = 0;
        let columnCount = 0;
        let stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            let tableMarker = <Table.ITableMarker>stack.table.top();
            let randomTableOp = () => {
                count++;
                if (!tableMarker.table) {
                    let tableMarkerPos = getOffset(this, tableMarker);
                    Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
                }
                let randCell = this.randomCell(tableMarker.table);
                if (randCell) {
                    let pos = getOffset(this, randCell.marker);
                    this.cursor.pos = pos;
                    this.cursor.updateView(this);
                    let hit = false;
                    if (rowCount < 8) {
                        let chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.insertRow();
                            rowCount++;
                            hit = true;
                        }
                    }
                    if ((columnCount < 8) && (!hit)) {
                        let chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.insertColumn();
                            columnCount++;
                            hit = true;
                        }
                    }
                    if ((rowCount > 4) && (!hit)) {
                        let chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.deleteRow();
                            rowCount--;
                            hit = true;
                        }
                    }
                    if ((columnCount > 4) && (!hit)) {
                        let chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.deleteColumn();
                            columnCount--;
                            hit = true;
                        }
                    }
                } else {
                    return;
                }
                if (count < k) {
                    setTimeout(randomTableOp, 200);
                }
            };
            setTimeout(randomTableOp, 200);
        }
    }

    public insertColumn() {
        let stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            let tableMarker = <Table.ITableMarker>stack.table.top();
            let rowMarker = <Table.IRowMarker>stack.row.top();
            let cellMarker = <Table.ICellMarker>stack.cell.top();
            if (!tableMarker.table) {
                let tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertColumn(this.sharedString, cellMarker.cell, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public setPGProps(props: MergeTree.PropertySet) {
        let tileInfo = findTile(this, this.cursor.pos, "pg", false);
        if (tileInfo) {
            let pgMarker = <Paragraph.IParagraphMarker>tileInfo.tile;
            this.sharedString.annotateRange(props, tileInfo.pos,
                pgMarker.cachedLength + tileInfo.pos);
            Paragraph.clearContentCaches(pgMarker);
        }
        this.localQueueRender(this.cursor.pos);
    }

    public keyCmd(charCode: number) {
        switch (charCode) {
            case CharacterCodes.C:
                this.copy();
                break;
            case CharacterCodes.X:
                this.cut();
                break;
            case CharacterCodes.V:
                this.paste();
                break;
            case CharacterCodes.K:
                this.historyBack();
                break;
            case CharacterCodes.J:
                this.historyForward();
                break;
            case CharacterCodes.Q:
                this.backToTheFuture();
                break;
            case CharacterCodes.R: {
                this.updatePGInfo(this.cursor.pos - 1);
                Table.createTable(this.cursor.pos, this.sharedString);
                this.localQueueRender(this.cursor.pos);
                break;
            }
            case CharacterCodes.M: {
                this.activeSearchBox = searchBoxCreate(this.viewportDiv, (searchString) => {
                    let prefix = this.activeSearchBox.getSearchString().toLowerCase();
                    let items = this.cmdTree.pairsWithPrefix(prefix).map((res) => {
                        return res.val;
                    }).filter((cmd) => {
                        return (!cmd.enabled) || cmd.enabled(this);
                    });
                    this.activeSearchBox.showSelectionList(items);
                    // TODO: consolidate with the cr case
                });
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
        let onDeserialize = (interval) => {
            if (interval.properties && interval.properties["story"]) {
                let story = interval.properties["story"];
                if (!story["id"]) {
                    this.sharedString.getDocument().get(story["value"]).then((commentSharedString) => {
                        interval.properties["story"] = commentSharedString;
                    });
                }
            }
        };
        this.comments = this.sharedString.getSharedIntervalCollection("comments", onDeserialize);
        this.comments.localCollection.map(onDeserialize);
        this.render(0, true);
        if (clockStart > 0) {
            // tslint:disable-next-line:max-line-length
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()} - ${performanceNow()}`);
        }
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

    public updateTableInfo(changePos: number) {
        let stack =
            this.sharedString.client.mergeTree.getStackContext(changePos,
                this.sharedString.client.getClientId(), ["table"]);
        if (stack.table && (!stack.table.empty())) {
            let tableMarker = <Table.ITableMarker>stack.table.top();
            tableMarker.table = undefined;
        }
    }

    public updatePGInfo(changePos: number) {
        let tileInfo = findTile(this, changePos, "pg", false);
        if (tileInfo) {
            let tile = <Paragraph.IParagraphMarker>tileInfo.tile;
            Paragraph.clearContentCaches(tile);
        } else {
            console.log("did not find pg to clear");
        }
        let markers = this.client.getModifiedMarkersForOp();
        if (markers.length>0) {
            this.updateTableInfo(changePos);
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
        if (this.viewportRect.height >= 0) {
            ui.Rectangle.conformElementToRect(this.viewportDiv, this.viewportRect);
            if (this.client.getLength() > 0) {
                this.render(this.topChar, true);
            }
        }
    }

    private remotePresenceUpdate(delta: types.IValueChanged, local: boolean, op: core.ISequencedObjectMessage) {
        if (local) {
            return;
        }

        let remotePresenceInfo = this.presenceMapView.get(delta.key) as IRemotePresenceInfo;

        this.remotePresenceToLocal(delta.key, op.user, remotePresenceInfo);
    }

    private remotePresenceFromEdit(
        longClientId: string,
        userInfo: core.IAuthenticatedUser,
        refseq: number,
        oldpos: number,
        posAdjust = 0) {

        let remotePosInfo: IRemotePresenceInfo = {
            origMark: -1,
            origPos: oldpos + posAdjust,
            refseq,
        };

        this.remotePresenceToLocal(longClientId, userInfo, remotePosInfo);
    }

    private remotePresenceToLocal(longClientId: string, user: core.IAuthenticatedUser, remotePresenceInfo: IRemotePresenceInfo, posAdjust = 0) {
        const clientId = this.client.getOrAddShortClientId(longClientId);

        let segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos,
            remotePresenceInfo.refseq, clientId);

        if (segoff.segment === undefined) {
            if (remotePresenceInfo.origPos === this.client.getLength()) {
                segoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origPos - 1,
                    remotePresenceInfo.refseq, clientId);
                if (segoff.segment) {
                    segoff.offset++;
                }
            }
        }
        if (segoff.segment) {
            let localPresenceInfo = <ILocalPresenceInfo>{
                clientId,
                fresh: true,
                user,
                localRef: new MergeTree.LocalReference(<MergeTree.BaseSegment>segoff.segment, segoff.offset,
                    MergeTree.ReferenceType.SlideOnRemove),
            };
            if (remotePresenceInfo.origMark >= 0) {
                let markSegoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origMark,
                    remotePresenceInfo.refseq, clientId);
                if (markSegoff.segment) {
                    localPresenceInfo.markLocalRef =
                        new MergeTree.LocalReference(<MergeTree.BaseSegment>markSegoff.segment,
                            markSegoff.offset, MergeTree.ReferenceType.SlideOnRemove);
                }
            }
            this.updatePresenceVector(localPresenceInfo);
        }
    }

    private updatePresence() {
        if (this.presenceMapView) {
            const presenceInfo: IRemotePresenceInfo = {
                origMark: this.cursor.mark,
                origPos: this.cursor.pos,
                refseq: this.client.getCurrentSeq(),
            };

            this.presenceMapView.set(this.collabDocument.clientId, presenceInfo);
        }
    }

    private increaseIndent(tile: Paragraph.IParagraphMarker, pos: number, decrease = false) {
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
    private applyOp(delta: MergeTree.IMergeTreeOp, msg: core.ISequencedObjectMessage) {
        // tslint:disable:switch-default
        switch (delta.type) {
            case MergeTree.MergeTreeDeltaType.INSERT:
                let adjLength = 1;
                if (delta.marker) {
                    this.updatePGInfo(delta.pos1 - 1);
                } else if (delta.pos1 <= this.cursor.pos) {
                    if (delta.text) {
                        // insert text
                        adjLength = delta.text.length;
                        if (delta.pos2 !== undefined) {
                            // replace range
                            let remLen = delta.pos2 - delta.pos1;
                            adjLength -= remLen;
                        }
                        this.cursor.pos += adjLength;
                    } else if (delta.register) {
                        // paste
                        let len = this.sharedString.client.registerCollection.getLength(msg.clientId,
                            delta.register);
                        this.cursor.pos += len;
                        adjLength = len;
                    }
                }
                this.remotePresenceFromEdit(msg.clientId, msg.user, msg.referenceSequenceNumber, delta.pos1, adjLength);
                this.updatePGInfo(delta.pos1);
                if (adjLength > 1) {
                    this.updatePGInfo(delta.pos1 + adjLength);
                }
                return true;
            // TODO: update pg info for pos2 (remove and annotate)
            case MergeTree.MergeTreeDeltaType.REMOVE:
                if (delta.pos2 <= this.cursor.pos) {
                    this.cursor.pos -= (delta.pos2 - delta.pos1);
                } else if (this.cursor.pos >= delta.pos1) {
                    this.cursor.pos = delta.pos1;
                }
                this.remotePresenceFromEdit(msg.clientId, msg.user, msg.referenceSequenceNumber, delta.pos1);
                this.updatePGInfo(delta.pos1);
                return true;
            case MergeTree.MergeTreeDeltaType.GROUP: {
                let opAffectsViewport = false;
                for (let groupOp of delta.ops) {
                    opAffectsViewport = opAffectsViewport || this.applyOp(groupOp, msg);
                }
                return opAffectsViewport;
            }
            case MergeTree.MergeTreeDeltaType.ANNOTATE: {
                this.updatePGInfo(delta.pos1);
                return this.posInViewport(delta.pos1) || this.posInViewport(delta.pos2 - 1);
            }
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
                reRenderLine(localPresenceInfo.cursor.lineDiv(), this, this.lastDocContext);
            }
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
