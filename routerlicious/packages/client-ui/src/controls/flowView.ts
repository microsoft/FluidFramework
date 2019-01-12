// tslint:disable:no-bitwise whitespace align switch-default no-string-literal ban-types no-angle-bracket-type-assertion
import { ICollaborativeObject } from "@prague/api-definitions";
import * as api from "@prague/client-api";
import * as types from "@prague/map";
import * as MergeTree from "@prague/merge-tree";
import { findRandomWord } from "@prague/merge-tree-utils";
import { IGenericBlob, ISequencedObjectMessage, IUser } from "@prague/runtime-definitions";
import * as SharedString from "@prague/shared-string";
import * as assert from "assert";
import * as Geocoder from "geocoder";
// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now");
import { isBlock } from "@prague/app-ui";
import { blobUploadHandler, urlToInclusion } from "../blob";
import { CollaborativeWorkbook } from "../calc";
import {
    CharacterCodes,
    Paragraph,
    Table,
} from "../text";
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

export interface Item {
    key: string;
    div?: HTMLDivElement;
    iconURL?: string;
}

let viewOptions: Object;

export function namesToItems(names: string[]): Item[] {
    const items: Item[] = new Array(names.length);

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

const commands: ICmd[] = [
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
            f.geocodeAddress();
        },
        key: "geocode",
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
            f.addCalendarEntries();
        },
        key: "cal create",
    },
    {
        exec: (f) => {
            f.showCalendarEntries();
        },
        key: "cal show",
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
            f.tableSummary();
        },
        key: "table summary",
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
            f.insertPhoto();
        },
        key: "insert photo",
    },
    {
        exec: (f) => {
            f.insertList();
        },
        key: "insert list",
    },
    {
        exec: (f) => {
            f.addChildFlow();
        },
        key: "cflow test",
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
            f.deleteRow();
        },
        key: "delete row",
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
    {
        exec: (f) => {
            f.insertSheetlet();
        },
        key: "insert sheet",
    },
    {
        exec: (f) => {
            f.insertChart();
        },
        key: "insert chart",
    },
    {
        exec: (f) => {
            f.insertChaincode("map", "@chaincode/pinpoint-editor@0.6.15");
        },
        key: "insert map",
    },
    {
        exec: (f) => {
            f.insertInnerComponent("map", "@chaincode/pinpoint-editor@0.6.15");
        },
        key: "insert inner map",
    },
    {
        exec: (f) => {
            f.insertChaincode("code", "@chaincode/monaco@0.1.18");
        },
        key: "insert code",
    },
    {
        exec: (f) => {
            f.insertChaincode("chart", "@chaincode/charts@0.7.3");
        },
        key: "insert ivy",
    },
    {
        exec: (f) => {
            f.insertChaincode("scriptor", "@ms/scriptor@0.23.25");
        },
        key: "insert scriptor",
    },
];

export function moveMarker(flowView: FlowView, fromPos: number, toPos: number) {
    flowView.sharedString.cut("inclusion", fromPos, fromPos + 1);
    flowView.sharedString.paste("inclusion", toPos);
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
    getSelectedItem(): Item;
    getSelectionIndex(): number;
    setSelectionIndex(indx: number);
    keydown(e: KeyboardEvent);
}

export function selectionListBoxCreate(
    shapeRect: ui.Rectangle,
    popup: boolean,
    container: HTMLElement,
    itemHeight: number,
    offsetY: number,
    varHeight?: number): ISelectionListBox {

    const listContainer = document.createElement("div");
    let items: Item[];
    let itemCapacity: number;
    let selectionIndex = -1;
    let topSelection = 0;

    init();

    return {
        elm: listContainer,
        getSelectedItem,
        getSelectedKey,
        getSelectionIndex,
        hide: () => {
            listContainer.style.visibility = "hidden";
        },
        items: () => items,
        keydown,
        nextItem,
        prevItem,
        removeHighlight,
        selectItem: selectItemByKey,
        setSelectionIndex,
        show: () => {
            listContainer.style.visibility = "visible";
        },
        showSelectionList,
    };

    function getSelectionIndex() {
        return selectionIndex;
    }

    function setSelectionIndex(indx: number) {
        selectItem(indx);
    }

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

    function keydown(e: KeyboardEvent) {
        if (e.keyCode === KeyCode.upArrow) {
            prevItem();
        } else if (e.keyCode === KeyCode.downArrow) {
            nextItem();
        }
    }

    function init() {
        listContainer.style.boxShadow = "0px 3px 2px #bbbbbb";
        listContainer.style.backgroundColor = "white";
        listContainer.style.border = "#e5e5e5 solid 2px";

        updateRectangles();
        container.appendChild(listContainer);
    }

    function nonPopUpdateRectangles() {
        const trimRect = new ui.Rectangle(shapeRect.x, shapeRect.y,
            shapeRect.width - 10, shapeRect.height - 10);
        trimRect.conformElement(listContainer);
        itemCapacity = Math.floor(trimRect.height / itemHeight);

        if (varHeight) {
            listContainer.style.paddingBottom = varHeight + "px";
        }
    }

    function updateRectangles() {
        if (!popup) {
            nonPopUpdateRectangles();
        } else {
            const width = shapeRect.width;
            const height = window.innerHeight / 3;
            let top: number;
            let bottom: number;
            let right: number;
            if ((shapeRect.x + shapeRect.width) > window.innerWidth) {
                right = shapeRect.x;
            }
            // TODO: use container div instead of window/doc body
            // TODO: right/left (for now assume go right)
            if ((height + shapeRect.y + offsetY + shapeRect.height) >= window.innerHeight) {
                bottom = window.innerHeight - shapeRect.y;
            } else {
                top = shapeRect.y + shapeRect.height;
            }
            itemCapacity = Math.floor(height / itemHeight);
            if (top !== undefined) {
                const listContainerRect = new ui.Rectangle(shapeRect.x, top, width, height);
                listContainerRect.height = itemCapacity * itemHeight;
                listContainerRect.conformElementMaxHeight(listContainer);
            } else {
                const listContainerRect = new ui.Rectangle(shapeRect.x, 0, width, height);
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
        const item = items[i];
        const itemDiv = div;
        itemDiv.style.fontSize = "18px";
        itemDiv.style.fontFamily = "Segoe UI";
        itemDiv.style.lineHeight = itemHeight + "px";
        itemDiv.style.whiteSpace = "pre";
        items[i].div = itemDiv;
        const itemSpan = document.createElement("span");
        itemSpan.innerText = "  " + item.key;
        itemDiv.appendChild(itemSpan);

        if (item.iconURL) {
            const icon = document.createElement("img");
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
        const len = items.length;
        for (let i = 0; i < itemCapacity; i++) {
            const indx = i + topSelection;
            if (indx === len) {
                break;
            } else {
                const item = items[indx];
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
    const elm = document.createElement("div");
    const span = document.createElement("span");
    elm.appendChild(span);
    let cursor: Cursor;

    return {
        elm,
        getText,
        initCursor,
        keydown,
        keypress,
        setText,
    } as IInputBox;

    function adjustCursorX() {
        const computedStyle = getComputedStyle(elm);
        const fontstr = computedStyle.font;
        const text = span.innerText.substring(0, cursor.pos);
        const w = Math.round(getTextWidth(text, fontstr));
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
        const code = e.charCode;
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
        const lineHeight = getTextHeight(elm);
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
    const container = document.createElement("div");
    const inputElmHeight = 32;
    const itemHeight = 24;
    let inputElm: HTMLElement;
    let inputBox: IInputBox;
    let selectionListBox: ISelectionListBox;

    init();

    return {
        dismiss,
        getSearchString,
        getSelectedItem,
        getSelectedKey,
        keydown,
        keypress,
        showSelectionList: (items) => selectionListBox.showSelectionList(items),
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
        const boundingRect = ui.Rectangle.fromClientRect(boundingElm.getBoundingClientRect());
        const offsetY = boundingRect.y;
        boundingRect.width = Math.floor(window.innerWidth / 4);
        boundingRect.height = Math.floor(window.innerHeight / 3);
        boundingRect.moveElementToUpperLeft(container);
        boundingRect.x = 0;
        boundingRect.y = 0;
        const inputElmBorderSize = 2;
        const vertSplit = boundingRect.nipVert(inputElmHeight + inputElmBorderSize);
        vertSplit[0].height -= inputElmBorderSize;
        vertSplit[0].conformElement(inputElm);
        inputElm.style.lineHeight = `${vertSplit[0].height}px`;
        vertSplit[0].height += inputElmBorderSize;
        selectionListBox = selectionListBoxCreate(vertSplit[0], true, container, itemHeight, offsetY);
    }

    function updateText() {
        const text = inputBox.getText();
        if (text.length > 0) {
            searchStringChanged(text);
            if (selectionListBox) {
                const items = selectionListBox.items();
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

let cachedCanvas: HTMLCanvasElement;
const baseURI = typeof document !== "undefined" ? document.location.origin : "";
const underlineStringURL = `url("${baseURI}/public/images/underline.gif") bottom repeat-x`;
const underlinePaulStringURL = `url("${baseURI}/public/images/underline-paul.gif") bottom repeat-x`;
const underlinePaulGrammarStringURL = `url("${baseURI}/public/images/underline-paulgrammar.gif") bottom repeat-x`;
const underlinePaulGoldStringURL = `url("${baseURI}/public/images/underline-gold.gif") bottom repeat-x`;
// const mrBennetEyeRoll = `url("${baseURI}/public/images/bennet-eye-roll.gif")`;

function getTextHeight(elm: HTMLDivElement) {
    const computedStyle = getComputedStyle(elm);
    if (computedStyle.lineHeight && (computedStyle.lineHeight.length > 0) &&
        (computedStyle.lineHeight !== "normal")) {
        return parseInt(computedStyle.lineHeight, 10);
    } else {
        return parseInt(computedStyle.fontSize, 10);
    }
}

const textWidthCache = new Map<string, Map<string, number>>();
const lineHeightCache = new Map<string, number>();

function getLineHeight(fontstr: string, lineHeight?: string) {
    if (lineHeight) {
        fontstr += ("/" + lineHeight);
    }
    let height = lineHeightCache.get(fontstr);
    if (height === undefined) {
        const elm = document.createElement("div");
        elm.style.position = "absolute";
        elm.style.zIndex = "-10";
        elm.style.left = "0px";
        elm.style.top = "0px";
        elm.style.font = fontstr;
        document.body.appendChild(elm);
        height = getTextHeight(elm);
        document.body.removeChild(elm);
        lineHeightCache.set(fontstr, height);
    }
    if (isNaN(height)) {
        console.log(`nan height with fontstr ${fontstr}`);
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
    for (const text of texts) {
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
    const fontstr = "18px Times";
    viewportDiv.style.font = fontstr;
    const headerFontstr = "22px Times";
    const wordSpacing = getTextWidth(" ", fontstr);
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
        indentWidthThreshold, pgVspace, tableVspace, wordSpacing,
    } as IDocumentContext;
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
            // console.log(`cbounds w ${cursorBounds.width} posX ${posX} ldb ${lineDivBounds.left}`);
            lineContext.span.innerText = temp;
        } else {
            const cursorBounds = lineContext.span.getBoundingClientRect();
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

/**
 * Ensure the given 'element' is focusable and restore the default behavior of HTML intrinsic
 * controls (e.g., <input>) within the element.
 */
function allowDOMEvents(element: HTMLElement) {
    // Ensure element can receive DOM focus (see Example 1):
    // https://www.w3.org/WAI/GL/WCAG20/WD-WCAG20-TECHS/SCR29.html

    // Note: 'tabIndex' should never be NaN, undefined, etc., but use of negation below ensures
    //       these degenerate values will also be replaced with 0.
    if (!(element.tabIndex >= 0)) {
        element.tabIndex = 0;
    }

    // TODO: Unsure if the empty/overlapping line divs overlapping inclusions are intentional?
    //
    // Elevate elements expecting DOM focus within their stacking container to ensure they
    // appear above empty line divs generated after their marker.
    element.style.zIndex = "1";

    // Elements of a component do not expect whitespace to be preserved.  Revert the white-space
    // 'pre' style applied by the lineDiv.
    element.style.whiteSpace = "normal";

    // Stops these events from bubbling back up to the FlowView when the <div> is focused.
    // The FlowView invokes 'preventDefault()' on these events, which blocks the behavior of
    // HTML intrinsic controls like <input />.
    element.addEventListener("mousedown", (e) => { e.stopPropagation(); });
    element.addEventListener("mousemove", (e) => { e.stopPropagation(); });
    element.addEventListener("mouseup", (e) => { e.stopPropagation(); });
    element.addEventListener("keydown", (e) => { e.stopPropagation(); });
    element.addEventListener("keypress", (e) => { e.stopPropagation(); });
    element.addEventListener("keyup", (e) => { e.stopPropagation(); });

    return element;
}

function renderSegmentIntoLine(
    segment: MergeTree.Segment, segpos: number, refSeq: number,
    clientId: number, start: number, end: number, lineContext: ILineContext) {
    if (lineContext.lineDiv.linePos === undefined) {
        lineContext.lineDiv.linePos = segpos + start;
        lineContext.lineDiv.lineEnd = lineContext.lineDiv.linePos;
    }
    const segType = segment.getType();
    if (segType === MergeTree.SegmentType.Text) {
        if (start < 0) {
            start = 0;
        }
        if (end > segment.cachedLength) {
            end = segment.cachedLength;
        }
        const textSegment = segment as MergeTree.TextSegment;
        const text = textSegment.text.substring(start, end);
        const textStartPos = segpos + start;
        const textEndPos = segpos + end;
        lineContext.span = makeSegSpan(lineContext.flowView, text, textSegment, start, segpos);
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
    } else if (segType === MergeTree.SegmentType.Marker) {
        const marker = segment as MergeTree.Marker;
        // console.log(`marker pos: ${segpos}`);

        // If the marker is a simple reference, see if it's types is registered as an external
        // component.
        if (marker.refType === MergeTree.ReferenceType.Simple) {
            const typeName = marker.properties.ref && marker.properties.ref.type.name;
            const maybeComponent = ui.refTypeNameToComponent.get(typeName);
            // If it is a registered external component, ask it to render itself to HTML and
            // insert the divs here.
            if (maybeComponent) {
                const context = new ui.FlowViewContext(
                    document.createElement("canvas").getContext("2d"),
                    lineContext.lineDiv.style,
                    lineContext.flowView.services,
                );

                const newElement = maybeComponent.upsert(
                    marker.properties.state,
                    context,
                    marker.properties.cachedElement,
                );

                if (newElement !== marker.properties.cachedElement) {
                    marker.properties.cachedElement = newElement;
                    allowDOMEvents(newElement);
                }

                lineContext.contentDiv.appendChild(newElement);
            }
        }

        if (endRenderSegments(marker)) {
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
    const em = Math.round(getTextWidth("M", lineFontstr));
    const symbolWidth = getTextWidth(indentSymbol.text, indentFontstr);
    const symbolDiv = makeContentDiv(
        new ui.Rectangle(
            lineDiv.indentWidth - Math.floor(em + symbolWidth), 0, symbolWidth, lineDivHeight), indentFontstr);
    symbolDiv.innerText = indentSymbol.text;
    lineDiv.appendChild(symbolDiv);
}

function reRenderLine(lineDiv: ILineDiv, flowView: FlowView, docContext: IDocumentContext) {
    if (lineDiv) {
        const outerViewportBounds = ui.Rectangle.fromClientRect(flowView.viewportDiv.getBoundingClientRect());
        const lineDivBounds = lineDiv.getBoundingClientRect();
        const lineDivHeight = lineDivBounds.height;
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
    const bookmarkDiv = document.createElement("div");
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
            const clientId = client.getOrAddShortClientId(properties["clid"]);
            const bgColor = presenceColors[clientId % presenceColors.length];
            bookmarkDiv.style.backgroundColor = bgColor;
            bookmarkDiv.style.opacity = "0.08";
        }
    }
    bookmarkDiv.style.zIndex = "2";
}

function buildIntervalTieStyle(properties: MergeTree.PropertySet, startX: number, endX: number,
    lineDivHeight: number, leftInBounds: boolean, rightInBounds: boolean,
    contentDiv: HTMLDivElement, client: MergeTree.Client) {
    const bookmarkDiv = document.createElement("div");
    let bookmarkRect: ui.Rectangle;
    const bookendDiv1 = document.createElement("div");
    const bookendDiv2 = document.createElement("div");
    const tenthHeight = Math.max(1, Math.floor(lineDivHeight / 10));
    const halfHeight = Math.floor(lineDivHeight >> 1);
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
        const clientId = client.getOrAddShortClientId(properties["clid"]);
        const bgColor = presenceColors[clientId % presenceColors.length];
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
        const item = endPGMarker.itemCache.items[itemIndex];
        if (!item || (item.type === Paragraph.ParagraphItemType.Marker)) {
            itemIndex++;
            break;
        }
        const blockItem = <Paragraph.IPGBlock>item;
        if (blockItem.text.length > offset) {
            const fontstr = item.fontstr || defaultFontstr;
            const subw = getTextWidth(blockItem.text.substring(0, offset), fontstr);
            return Math.floor(w + subw);
        } else {
            w += item.width;
        }
        offset -= blockItem.text.length;
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
    const sel = flowView.cursor.getSelection();
    let havePresenceSel = false;
    for (const localPresenceInfo of flowView.presenceVector) {
        if (localPresenceInfo && (localPresenceInfo.markXformPos !== localPresenceInfo.xformPos)) {
            havePresenceSel = true;
            break;
        }
    }
    if (flowView.bookmarks || flowView.comments || sel || havePresenceSel) {
        const client = flowView.client;
        const computedEnd = lineEnd;
        const bookmarks = flowView.bookmarks.findOverlappingIntervals(lineStart, computedEnd);
        const comments = flowView.commentsView.findOverlappingIntervals(lineStart, computedEnd);
        const lineText = client.getText(lineStart, computedEnd);
        if (sel && ((sel.start < lineEnd) && (sel.end > lineStart))) {
            showBookmark(undefined, lineText, sel.start, sel.end, lineStart, endPGMarker,
                computedEnd, lineFontstr, lineDivHeight, lineBreakIndex, docContext, contentDiv, client);
        }
        if (havePresenceSel) {
            for (const localPresenceInfo of flowView.presenceVector) {
                if (localPresenceInfo && (localPresenceInfo.markXformPos !== localPresenceInfo.xformPos)) {
                    const presenceStart = Math.min(localPresenceInfo.markXformPos, localPresenceInfo.xformPos);
                    const presenceEnd = Math.max(localPresenceInfo.markXformPos, localPresenceInfo.xformPos);
                    if ((presenceStart < lineEnd) && (presenceEnd > lineStart)) {
                        showBookmark({ clid: flowView.client.getLongClientId(localPresenceInfo.clientId) },
                            lineText, presenceStart, presenceEnd, lineStart, endPGMarker,
                            computedEnd, lineFontstr, lineDivHeight, lineBreakIndex, docContext, contentDiv, client);
                    }
                }
            }
        }
        if (flowView.tempBookmarks && (!flowView.modes.showBookmarks)) {
            for (const b of flowView.tempBookmarks) {
                if (b.overlapsPos(client.mergeTree, lineStart, lineEnd)) {
                    const start = b.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                        client.getClientId());
                    const end = b.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                        client.getClientId());
                    showBookmark(b.properties, lineText, start, end, lineStart,
                        endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                        docContext, contentDiv, client, true);
                }
            }
        }
        if (bookmarks && flowView.modes.showBookmarks) {
            for (const b of bookmarks) {
                const start = b.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                const end = b.end.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                showBookmark(b.properties, lineText, start, end, lineStart,
                    endPGMarker, computedEnd, lineFontstr, lineDivHeight, lineBreakIndex,
                    docContext, contentDiv, client, true);
            }
        }
        if (comments && flowView.modes.showComments) {
            for (const comment of comments) {
                const start = comment.start.toPosition(client.mergeTree, client.getCurrentSeq(),
                    client.getClientId());
                const end = comment.end.toPosition(client.mergeTree, client.getCurrentSeq(),
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
    const contentDiv = document.createElement("div");
    contentDiv.style.font = lineFontstr;
    contentDiv.style.whiteSpace = "pre";
    contentDiv.onclick = (e) => {
        const targetDiv = e.target as HTMLDivElement;
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
    cellView: ICellView, layoutInfo: ILayoutContext, targetTranslation: string, defer = false,
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
        const cellPos = getOffset(layoutInfo.flowView, cellView.marker);
        cellLayoutInfo.startPos = cellPos + cellView.marker.cachedLength;
    } else {
        const nextTable = layoutInfo.startingPosStack.table.items[layoutInfo.stackIndex + 1];
        cellLayoutInfo.startPos = getOffset(layoutInfo.flowView, nextTable as MergeTree.Marker);
        cellLayoutInfo.stackIndex = layoutInfo.stackIndex + 1;
    }
    if (!cellView.emptyCell) {
        cellView.renderOutput = renderFlow(cellLayoutInfo, targetTranslation, defer);
        if (cellView.additionalCellMarkers) {
            for (const cellMarker of cellView.additionalCellMarkers) {
                cellLayoutInfo.endMarker = cellMarker.cell.endMarker;
                const cellPos = getOffset(layoutInfo.flowView, cellMarker);
                cellLayoutInfo.startPos = cellPos + cellMarker.cachedLength;
                const auxRenderOutput = renderFlow(cellLayoutInfo, targetTranslation, defer);
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
    targetTranslation: string,
    defer = false) {

    const flowView = layoutInfo.flowView;
    const mergeTree = flowView.client.mergeTree;
    const tablePos = mergeTree.getOffset(table, MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
    let tableView = table.table;
    if (!tableView) {
        tableView = Table.parseTable(table, tablePos, flowView.sharedString, makeFontInfo(docContext));
    }
    if (!tableView) {
        return;
    }
    // let docContext = buildDocumentContext(viewportDiv);
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
        const renderRow = (!defer) && (deferredHeight >= layoutInfo.deferUntilHeight) &&
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
            const cell = rowView.cells[cellIndex] as ICellView;
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
            reRenderLine(lineDiv, flowView, docContext);
        }
        layoutInfo.reRenderList = undefined;
    }
    tableView.deferredHeight = deferredHeight;
    tableView.renderedHeight = tableHeight;
}

function showCell(pos: number, flowView: FlowView) {
    const client = flowView.client;
    const startingPosStack =
        flowView.client.mergeTree.getStackContext(pos, client.getClientId(), ["cell"]);
    if (startingPosStack.cell && (!startingPosStack.cell.empty())) {
        const cellMarker = startingPosStack.cell.top() as Table.ICellMarker;
        const start = getOffset(flowView, cellMarker);
        const endMarker = cellMarker.cell.endMarker;
        const end = getOffset(flowView, endMarker) + 1;
        // tslint:disable:max-line-length
        console.log(`cell ${cellMarker.getId()} seq ${cellMarker.seq} clid ${cellMarker.clientId} at [${start},${end})`);
        console.log(`cell contents: ${flowView.client.getTextRangeWithMarkers(start, end)}`);
    }
}

function showTable(pos: number, flowView: FlowView) {
    const client = flowView.client;
    const startingPosStack =
        flowView.client.mergeTree.getStackContext(pos, client.getClientId(), ["table"]);
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        const tableMarker = startingPosStack.table.top() as Table.ITableMarker;
        const start = getOffset(flowView, tableMarker);
        const endMarker = tableMarker.table.endTableMarker;
        const end = getOffset(flowView, endMarker) + 1;
        console.log(`table ${tableMarker.getId()} at [${start},${end})`);
        console.log(`table contents: ${flowView.client.getTextRangeWithMarkers(start, end)}`);
    }
}

function renderTree(
    viewportDiv: HTMLDivElement, requestedPosition: number, flowView: FlowView, targetTranslation: string) {
    const client = flowView.client;
    const docContext = buildDocumentContext(viewportDiv);
    flowView.lastDocContext = docContext;
    const outerViewportHeight = parseInt(viewportDiv.style.height, 10);
    const outerViewportWidth = parseInt(viewportDiv.style.width, 10);
    const outerViewport = new Viewport(outerViewportHeight, viewportDiv, outerViewportWidth);
    if (flowView.movingInclusion.onTheMove) {
        outerViewport.addInclusion(flowView, flowView.movingInclusion.marker,
            flowView.movingInclusion.exclu.x, flowView.movingInclusion.exclu.y,
            docContext.defaultLineDivHeight, true);
    }
    const startingPosStack =
        client.mergeTree.getStackContext(requestedPosition, client.getClientId(), ["table", "cell", "row"]);
    const layoutContext = {
        docContext,
        flowView,
        requestedPosition,
        viewport: outerViewport,
    } as ILayoutContext;
    if (startingPosStack.table && (!startingPosStack.table.empty())) {
        const outerTable = startingPosStack.table.items[0];
        const outerTablePos = flowView.client.mergeTree.getOffset(outerTable as MergeTree.Marker,
            MergeTree.UniversalSequenceNumber, flowView.client.getClientId());
        layoutContext.startPos = outerTablePos;
        layoutContext.stackIndex = 0;
        layoutContext.startingPosStack = startingPosStack;
    } else {
        const previousTileInfo = findTile(flowView, requestedPosition, "pg");
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
        const marker = segment as MergeTree.Marker;
        if ((marker.refType === MergeTree.ReferenceType.Simple) &&
            (marker.hasSimpleType("inkOverlay"))) {
            context.push({ id: marker.getId(), position: segpos });
        }
    }

    return true;
}

// tslint:disable-next-line:no-empty-interface
export interface IViewportDiv extends HTMLDivElement {
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

export interface IExcludedRectangle extends ui.Rectangle {
    left: boolean;
    curY: number;
    id?: string;
    // What do the below parameters mean?
    requiresUL?: boolean;
    floatL?: boolean;
}

function makeExcludedRectangle(x: number, y: number, w: number, h: number, id?: string) {
    const r = <IExcludedRectangle>new ui.Rectangle(x, y, w, h);
    r.id = id;
    r.left = true;
    r.curY = 0;
    return r;
}

export interface ILineRect {
    e?: IExcludedRectangle;
    h: number;
    w: number;
    x: number;
    y: number;
}

function lineIntersectsRect(y: number, rect: IExcludedRectangle) {
    return (y >= rect.y) && (y <= (rect.y + rect.height));
}

export interface IFlowRefMarker extends MergeTree.Marker {
    flowView: FlowView;
}

export interface IListRefMarker extends MergeTree.Marker {
    selectionListBox: ISelectionListBox;
}

export class Viewport {
    // keep the line divs in order
    public lineDivs: ILineDiv[] = [];
    public visibleRanges: IRange[] = [];
    public currentLineStart = -1;
    private lineTop = 0;
    private excludedRects = <IExcludedRectangle[]>[];
    private lineX = 0;
    private inclusions: Map<string, HTMLVideoElement> = new Map<string, HTMLVideoElement>();

    constructor(public maxHeight: number, public div: IViewportDiv, private width: number) {
    }

    public showExclu() {
        urlToInclusion(`${baseURI}/public/images/bennet1.jpeg`)
            .then((incl) => {
                for (const exclu of this.excludedRects) {
                    const showImage = document.createElement("img");
                    showImage.src = incl.url;
                    exclu.conformElement(showImage);
                    this.div.appendChild(showImage);
                }
            });
    }

    // Remove inclusions that are not in the excluded rect list
    public removeInclusions() {
        if (this.div) {
            // TODO: sabroner fix skip issue
            for (let i = 0; i < this.div.children.length; i++) {
                const child = this.div.children.item(i);
                if ((child.classList as DOMTokenList).contains("preserve")) {
                    if (this.excludedRects.every((e) => e.id !== child.classList[1])) {
                        this.div.removeChild(child);
                    }
                }
            }
        }
    }

    public viewHasInclusion(sha: string): HTMLDivElement {
        for (let i = 0; i < this.div.children.length; i++) {
            const child = this.div.children.item(i);
            if ((child.classList as DOMTokenList).contains(sha)) {
                return child as HTMLDivElement;
            }
        }

        return null;
    }

    public addInclusion(flowView: FlowView, marker: MergeTree.Marker, x: number, y: number,
        lineHeight: number, movingMarker = false) {
        if ((!flowView.movingInclusion.onTheMove) ||
            ((flowView.movingInclusion.onTheMove && (flowView.movingInclusion.marker !== marker)) ||
                movingMarker)) {
            const irdoc = <IReferenceDoc>marker.properties.ref;
            if (irdoc) {
                const borderSize = 4;
                // for now always an image
                const minX = Math.floor(this.width / 5);
                const w = Math.floor(this.width / 3);
                let h = w;
                // TODO: adjust dx, dy by viewport dimensions
                let dx = 0;
                let dy = 0;
                if (movingMarker) {
                    dx = flowView.movingInclusion.dx;
                    dy = flowView.movingInclusion.dy;
                }
                if (irdoc.layout) {
                    h = Math.floor(w * irdoc.layout.ar);
                }
                if ((x + w) > this.width) {
                    x -= w;
                }
                x = Math.floor(x + dx);
                if (x < minX) {
                    x = 0;
                }
                y += lineHeight;
                y = Math.floor(y + dy);
                const exclu = makeExcludedRectangle(x, y, w, h, irdoc.sha);
                // This logic eventually triggers the marker to get moved based on the requiresUL property
                if (movingMarker) {
                    exclu.requiresUL = true;
                    if (exclu.x === 0) {
                        exclu.floatL = true;
                    }
                }
                let excluDiv = <IRefDiv>this.viewHasInclusion(irdoc.sha);

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
                    excluDiv.classList.add(irdoc.sha);
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
                        if (irdoc.sha && this.inclusions.has(irdoc.sha)) {
                            showVideo = this.inclusions.get(irdoc.sha) as HTMLVideoElement;
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
                        this.inclusions.set(irdoc.sha, showVideo);
                    } else if (irdoc.type.name === "list") {
                        const listRefMarker = marker as IListRefMarker;
                        let selectionIndex = 0;
                        const prevSelectionBox = listRefMarker.selectionListBox;
                        if (prevSelectionBox) {
                            selectionIndex = prevSelectionBox.getSelectionIndex();
                        }
                        const shapeRect = new ui.Rectangle(0, 0, exclu.width, exclu.height);
                        listRefMarker.selectionListBox =
                            selectionListBoxCreate(shapeRect, false, innerDiv, 24, 2);

                        // Allow the list box to receive DOM focus and subscribe its 'keydown' handler.
                        allowDOMEvents(listRefMarker.selectionListBox.elm);
                        listRefMarker.selectionListBox.elm.addEventListener("keydown",
                            (e) => listRefMarker.selectionListBox.keydown(e));

                        const listIrdoc =
                            <IListReferenceDoc>listRefMarker.properties[Paragraph.referenceProperty];
                        for (const item of listIrdoc.items) {
                            item.div = undefined;
                        }
                        listRefMarker.selectionListBox.showSelectionList(listIrdoc.items);
                        listRefMarker.selectionListBox.setSelectionIndex(selectionIndex);
                    } else if ((irdoc.type.name === "childFlow") && (!flowView.parentFlow)) {
                        const flowRefMarker = marker as IFlowRefMarker;
                        let startChar = 0;
                        let cursorPos = 0;
                        const prevFlowView = flowRefMarker.flowView;
                        if (prevFlowView) {
                            startChar = prevFlowView.viewportStartPos;
                            cursorPos = prevFlowView.cursor.pos;
                        }
                        flowRefMarker.flowView = flowView.renderChildFlow(startChar, cursorPos,
                            innerDiv, exclu, marker);
                    }
                }
            }
        }
    }

    public horizIntersect(h: number, rect: IExcludedRectangle) {
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
            // hit right edge
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

export interface IFlowBreakInfo extends Paragraph.IBreakInfo {
    lineY?: number;
    lineX?: number;
    lineWidth?: number;
    lineHeight?: number;
    movingExclu?: IExcludedRectangle;
}

export function breakPGIntoLinesFFVP(flowView: FlowView, itemInfo: Paragraph.IParagraphItemInfo, defaultLineHeight: number,
    viewport: Viewport, startOffset = 0) {
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
    const breaks = <IFlowBreakInfo[]>[breakInfo];
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
            viewport.addInclusion(flowView, <MergeTree.Marker>item.segment,
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

function renderFlow(layoutContext: ILayoutContext, targetTranslation: string, deferWhole = false): IRenderOutput {
    const flowView = layoutContext.flowView;
    const client = flowView.client;
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
        services: layoutContext.flowView.services,
    } as Paragraph.IItemsContext;
    if (layoutContext.deferUntilHeight === undefined) {
        layoutContext.deferUntilHeight = 0;
    }
    let deferredHeight = 0;
    const deferredPGs = (layoutContext.containingPGMarker !== undefined);
    const paragraphLexer = new Paragraph.ParagraphLexer({
        markerToken: Paragraph.markerToItems,
        textToken: Paragraph.textTokenToItems,
    }, itemsContext);
    itemsContext.paragraphLexer = paragraphLexer;
    textErrorRun = undefined;

    function makeAnnotDiv(x: number, y: number, width: number, fontstr: string) {
        const annotDiv = document.createElement("div");
        annotDiv.style.font = fontstr;
        annotDiv.style.fontStyle = "italic";
        const rect = new ui.Rectangle(x, y, width, 0);
        rect.conformElementOpenHeight(annotDiv);
        layoutContext.viewport.div.appendChild(annotDiv);
        return annotDiv;
    }

    function renderPGAnnotation(endPGMarker: Paragraph.IParagraphMarker, indentWidth: number, contentWidth: number) {
        const annotDiv = makeAnnotDiv(indentWidth, layoutContext.viewport.getLineTop(),
            contentWidth, docContext.fontstr);
        const text = endPGMarker.properties[targetTranslation];
        // tslint:disable-next-line:no-inner-html
        annotDiv.innerHTML = text;
        const clientRect = annotDiv.getBoundingClientRect();
        return clientRect.height;
    }

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
                    const em2 = Math.round(2 * getTextWidth("M", docContext.fontstr));
                    indentWidth = em2 + indentWidth;
                }
            }
            contentWidth = Math.floor(contentPct * lineWidth) - indentWidth;
            if (contentWidth > lineWidth) {
                // tslint:disable:max-line-length
                console.log(`egregious content width ${contentWidth} bound ${lineWidth}`);
            }

            const lineStart = breakInfo.posInPG + pgStartPos;
            let lineEnd: number;
            if (breakIndex < (len - 1)) {
                lineEnd = pgBreaks[breakIndex + 1].posInPG + pgStartPos;
            } else {
                lineEnd = undefined;
            }
            const lineOK = (!(deferredPGs || deferWhole)) && (layoutContext.deferUntilHeight <= deferredHeight);
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
                    for (const ldiv of lineContext.reRenderList) {
                        layoutContext.reRenderList.push(ldiv);
                    }
                }
                let eol = (lineX + lineWidth) >= layoutContext.viewport.currentLineWidth();
                eol = eol || (lineEnd === undefined);
                layoutContext.viewport.commitLineDiv(lineDiv, lineDivHeight, eol);
                if (breakInfo.movingExclu) {
                    // console.log(`exclu line ${lineDiv.innerHTML} pos ${lineDiv.linePos} end ${lineDiv.lineEnd}`);
                    if (breakInfo.movingExclu.floatL) {
                        flowView.movingInclusion.ulPos = lineDiv.linePos;
                    } else {
                        flowView.movingInclusion.ulPos = lineDiv.lineEnd;
                        if (lineDiv.lineEnd === curPGMarkerPos) {
                            flowView.movingInclusion.ulPos--;
                        }
                    }
                }
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

    const fetchLog = false;
    let segoff: ISegmentOffset;
    const totalLength = client.getLength();
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

        const asMarker = segoff.segment.getType() === MergeTree.SegmentType.Marker
            ? segoff.segment as MergeTree.Marker
            : undefined;

        const maybeComponent = asMarker && ui.maybeGetComponent(asMarker);

        if (isBlock(maybeComponent)) {
            const context = new ui.FlowViewContext(
                document.createElement("canvas").getContext("2d"),
                layoutContext.viewport.div.style,
                layoutContext.flowView.services,
            );

            const componentDiv = maybeComponent.upsert(
                asMarker.properties.state,
                context,
                asMarker.properties.cachedElement,
            );

            if (componentDiv !== asMarker.properties.cachedElement) {
                asMarker.properties.cachedElement = componentDiv;
                allowDOMEvents(componentDiv);
            }

            // Force subtree positioning to be relative to the lineDiv we create below.
            componentDiv.style.display = "flex";

            // Temporarily parent 'componentDiv' in the position where we will insert the lineDiv
            // in order to calculate it's height.
            layoutContext.viewport.div.appendChild(componentDiv);
            const componentHeight = componentDiv.scrollHeight;
            componentDiv.remove();

            const lineDiv = makeLineDiv(
                new ui.Rectangle(
                    0,
                    layoutContext.viewport.getLineTop(),
                    parseInt(layoutContext.viewport.div.style.width, 10),
                    componentHeight),
                layoutContext.docContext.fontstr);

            lineDiv.appendChild(componentDiv);

            // TODO: Suspect that missing ILineDiv metadata on element is why scroll(..) can hang on components.
            // componentDiv.linePos = currentPos;
            // componentDiv.lineEnd = currentPos + 1;
            layoutContext.viewport.vskip(componentHeight);
            currentPos++;
            segoff = undefined;
        } else if (asMarker && asMarker.hasRangeLabel("table")) {
            const marker = segoff.segment as MergeTree.Marker;
            // TODO: branches
            let tableView: Table.Table;
            if (marker.removedSeq === undefined) {
                renderTable(marker, docContext, layoutContext, targetTranslation, deferredPGs);
                tableView = (marker as Table.ITableMarker).table;
                deferredHeight += tableView.deferredHeight;
                layoutContext.viewport.vskip(layoutContext.docContext.tableVspace);
            } else {
                tableView = Table.parseTable(marker, currentPos, flowView.sharedString,
                    makeFontInfo(layoutContext.docContext));
            }
            const endTablePos = getOffset(layoutContext.flowView, tableView.endTableMarker);
            currentPos = endTablePos + 1;
            segoff = undefined;
            // TODO: if reached end of viewport, get pos ranges
        } else {
            if (segoff.segment.getType() === MergeTree.SegmentType.Marker) {
                // empty paragraph
                curPGMarker = segoff.segment as Paragraph.IParagraphMarker;
                if (fetchLog) {
                    console.log("empty pg");
                    if (curPGMarker.itemCache) {
                        console.log(`length items ${curPGMarker.itemCache.items.length}`);
                    }
                }
                curPGMarkerPos = currentPos;
            } else {
                const curTilePos = findTile(flowView, currentPos, "pg", false);
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
            if (flowView.historyClient) {
                Paragraph.clearContentCaches(curPGMarker);
            }
            if (!curPGMarker.itemCache) {
                itemsContext.itemInfo = { items: [], minWidth: 0 };
                client.mergeTree.mapRange({ leaf: Paragraph.segmentToItems }, MergeTree.UniversalSequenceNumber,
                    client.getClientId(), itemsContext, currentPos, curPGMarkerPos + 1);
                curPGMarker.itemCache = itemsContext.itemInfo;
            } else {
                itemsContext.itemInfo = curPGMarker.itemCache;
            }
            // TODO: always use break VP for excluded regions; go ahead and break each time
            // TODO: this is particular to pg annotation; need to call different vp idea for
            //   annotation
            const contentWidth = layoutContext.viewport.currentLineWidth();
            // const breaks = Paragraph.breakPGIntoLinesFF(itemsContext.itemInfo.items, contentWidth);
            // curPGMarker.cache = { breaks, isUniformWidth: true, uniformLineWidth: contentWidth };

            let startOffset = 0;
            if (layoutContext.requestedPosition > currentPos) {
                startOffset = layoutContext.requestedPosition - currentPos;
            }
            const breaks = breakPGIntoLinesFFVP(layoutContext.flowView, itemsContext.itemInfo, docContext.defaultLineDivHeight,
                layoutContext.viewport, startOffset);
            curPGMarker.cache = { breaks, isUniformWidth: false };
            paragraphLexer.reset();
            // TODO: more accurate end of document reasoning

            if (currentPos < totalLength) {
                const lineEnd = renderPG(curPGMarker, currentPos, indentPct, indentSymbol, contentPct);
                viewportEndPos = lineEnd;
                currentPos = curPGMarkerPos + curPGMarker.cachedLength;

                if (!deferredPGs) {
                    if (curPGMarker.properties[targetTranslation]) {
                        // layoutContext.viewport.vskip(Math.floor(docContext.pgVspace/2));
                        // TODO: make sure content width is same as pg width (may be different with regions present)
                        const height = renderPGAnnotation(curPGMarker, Math.floor(indentPct * contentWidth),
                            Math.floor(contentPct * contentWidth));
                        layoutContext.viewport.vskip(height);
                    }
                }
                if (currentPos < totalLength) {
                    segoff = getContainingSegment(flowView, currentPos);
                    if (segoff.segment.getType() === MergeTree.SegmentType.Marker) {
                        const marker = segoff.segment as MergeTree.Marker;
                        if (marker.hasRangeLabel("cell") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
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
                const textErrorInfo = textSegment.properties[key] as ITextErrorInfo;
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
                            const itemElm = ev.target as HTMLElement;
                            const text = itemElm.innerText.trim();
                            context.sharedString.removeText(span.textErrorRun.start, span.textErrorRun.end);
                            context.sharedString.insertText(text, span.textErrorRun.start);
                            context.localQueueRender(span.textErrorRun.start);
                        }
                        function selectItem(ev: MouseEvent) {
                            const itemElm = ev.target as HTMLElement;
                            if (slb) {
                                slb.selectItem(itemElm.innerText);
                            }
                            // console.log(`highlight ${itemElm.innerText}`);
                        }
                        console.log(`button ${e.button}`);
                        if ((e.button === 2) || ((e.button === 0) && (e.ctrlKey))) {
                            const spanBounds = ui.Rectangle.fromClientRect(span.getBoundingClientRect());
                            spanBounds.width = Math.floor(window.innerWidth / 4);
                            slb = selectionListBoxCreate(spanBounds, true, document.body, 24, 0, 12);
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
    const range = document.caretRangeFromPoint(x, y);
    if (range) {
        const result = {
            elm: range.startContainer.parentElement as HTMLElement,
            node: range.startContainer,
            offset: range.startOffset,
        };
        range.detach();
        return result;
    }
}

export function pixelToPosition(flowView: FlowView, x: number, y: number) {
    const elm = document.elementFromPoint(x, y);
    if (elm.tagName === "SPAN") {
        let position: number;
        const span = elm as ISegSpan;
        const elmOff = pointerToElementOffsetWebkit(x, y);
        if (elmOff) {
            let computed = elmOffToSegOff(elmOff, span);
            if (span.offset) {
                computed += span.offset;
            }
            position = span.segPos + computed;
        }
        return position;
    } else {
        let targetLineDiv = elm as ILineDiv;
        if (targetLineDiv.linePos !== undefined) {
            return flowView.getPosFromPixels(targetLineDiv, x);
        }
        do {
            targetLineDiv = targetLineDiv.previousElementSibling as ILineDiv;
        } while (targetLineDiv && (targetLineDiv.linePos === undefined));
        if (targetLineDiv) {
            return flowView.getPosFromPixels(targetLineDiv, x);
        }
    }
}

// Called from a few contexts, inclusions are called render
export function clearSubtree(elm: HTMLElement) {
    const removeList: Node[] = [];
    for (const child of elm.childNodes) {
        if (!(child as HTMLElement).classList.contains("preserve")) {
            removeList.push(child);
        }
    }
    for (const node of removeList) {
        elm.removeChild(node);
    }
}

export function clearInclusion(elm: HTMLElement, sha: string) {
    for (const child of elm.childNodes) {
        if ((child as HTMLElement).classList.contains(sha)) {
            return elm.removeChild(child);
        }
    }
}

const Nope = -1;

const presenceColors = ["darkgreen", "sienna", "olive", "purple"];
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
    private enabled = true;

    constructor(public viewportDiv: HTMLDivElement, public pos = 0) {
        this.makeSpan();
    }

    public addPresenceInfo(presenceInfo: ILocalPresenceInfo) {
        // for now, color
        const presenceColorIndex = presenceInfo.clientId % presenceColors.length;
        this.bgColor = presenceColors[presenceColorIndex];
        this.presenceInfo = presenceInfo;
        this.makePresenceDiv();

        this.refresh();

        if (this.enabled) {
            this.show();
        } else {
            this.hide(true);
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

    /**
     * Enable the cursor - makes the cursor visible
     */
    public enable() {
        if (this.enabled) {
            return;
        }

        this.enabled = true;
        this.show();

        this.blinkCursor();
    }

    /**
     * Disable the cursor - hides the cursor and prevents it from showing up
     */
    public disable() {
        if (!this.enabled) {
            return;
        }

        this.enabled = false;
        this.hide(true);
        this.clearSelection();

        if (this.blinkTimer) {
            clearTimeout(this.blinkTimer);
            this.blinkTimer = undefined;
        }
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
            return {
                end: Math.max(this.mark, this.pos),
                start: Math.min(this.mark, this.pos),
            } as IRange;
        }
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
        const lineDiv = this.lineDiv();
        return lineDiv && (pos >= lineDiv.linePos) && (pos < lineDiv.lineEnd);
    }

    public lineDiv() {
        return this.editSpan.parentElement as ILineDiv;
    }

    public updateView(flowView: FlowView) {
        if (flowView.modes.showCursorLocation) {
            flowView.cursorLocation();
        }
        if (this.getSelection()) {
            flowView.render(flowView.topChar, true);
        } else {
            const lineDiv = this.lineDiv();
            if (lineDiv && (lineDiv.linePos <= this.pos) && (lineDiv.lineEnd > this.pos)) {
                reRenderLine(lineDiv, flowView, flowView.lastDocContext);
            } else {
                const foundLineDiv = findLineDiv(this.pos, flowView, true);
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
            const bannerHeight = 20;
            const halfBannerHeight = bannerHeight / 2;
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
        if (!this.enabled) {
            return;
        }

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

    private getUserDisplayString(user: IUser): string {
        // TODO - callback to client code to provide mapping from user -> display
        // this would allow a user ID to be put on the wire which can then be mapped
        // back to an email, name, etc...
        return user.id;
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

export interface IRemotePresenceBase {
    type: string;
}
export interface IRemotePresenceInfo extends IRemotePresenceBase {
    type: "selection";
    origPos: number;
    origMark: number;
    refseq: number;
}

export interface IMovingInclusionInfo {
    onTheMove: boolean;
    exclu?: IExcludedRectangle;
    marker?: MergeTree.Marker;
    dx?: number;
    dy?: number;
    ulPos?: number;
}

export interface IRemoteDragInfo extends IRemotePresenceBase {
    type: "drag";
    exclu: IExcludedRectangle;
    markerPos: number;
    onTheMove: boolean;
    dx: number;
    dy: number;
}

export interface ILocalPresenceInfo {
    localRef?: MergeTree.LocalReference;
    markLocalRef?: MergeTree.LocalReference;
    xformPos?: number;
    markXformPos?: number;
    clientId: number;
    user: IUser;
    cursor?: Cursor;
    fresh: boolean;
    shouldShowCursor: () => boolean;
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

    const expandWordBackward = (segment: MergeTree.Segment) => {
        if (mergeTree.localNetLength(segment)) {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    return false;
                case MergeTree.SegmentType.Text:
                    const textSegment = segment as MergeTree.TextSegment;
                    const innerOffset = textSegment.text.length - 1;
                    const maxWord = maximalWord(textSegment, innerOffset);
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

    const expandWordForward = (segment: MergeTree.Segment) => {
        if (mergeTree.localNetLength(segment)) {
            switch (segment.getType()) {
                case MergeTree.SegmentType.Marker:
                    return false;
                case MergeTree.SegmentType.Text:
                    const textSegment = segment as MergeTree.TextSegment;
                    const innerOffset = 0;
                    const maxWord = maximalWord(textSegment, innerOffset);
                    if (maxWord.wordEnd > innerOffset) {
                        wordEnd += (maxWord.wordEnd - innerOffset);
                    }
                    return (maxWord.wordEnd === textSegment.text.length);
            }
        }
        return true;
    };

    const segoff = mergeTree.getContainingSegment(pos,
        MergeTree.UniversalSequenceNumber, mergeTree.collabWindow.clientId);
    if (segoff.segment && (segoff.segment.getType() === MergeTree.SegmentType.Text)) {
        const textSegment = segoff.segment as MergeTree.TextSegment;
        const maxWord = maximalWord(textSegment, segoff.offset);
        if (maxWord.wordStart < maxWord.wordEnd) {
            const segStartPos = pos - segoff.offset;
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
            return { wordStart, wordEnd } as IWordRange;
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
    return flowView.sharedString.findTile(startPos, tileType, preceding);
}

export function annotateMarker(flowView: FlowView, props: MergeTree.PropertySet, marker: MergeTree.Marker) {
    const start = getOffset(flowView, marker);
    const end = start + marker.cachedLength;
    flowView.sharedString.annotateRange(props, start, end);
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

export interface IReferenceDocType {
    name: string;
}

export interface IRefLayoutSpec {
    minWidth?: number;
    minHeight?: number;
    reqWidth?: number;
    reqHeight?: number;
    ar?: number;
    dx?: number;
    dy?: number;
}

export interface IReferenceDoc {
    type: IReferenceDocType;
    sha: string;
    url: string;
    layout?: IRefLayoutSpec;
}

export interface IListReferenceDoc extends IReferenceDoc {
    items: Item[];
    selectionIndex: number;
}

export function makeBlobRef(blob: IGenericBlob, tenant: string, cb: (irdoc: IReferenceDoc) => void) {
    switch (blob.type) {
        case "image": {
            const image = document.createElement("img");
            const irdocType = <IReferenceDocType>{
                name: "image",
            };
            const irdoc = <IReferenceDoc>{
                sha: blob.sha,
                type: irdocType,
                url: blob.url,
            };
            image.src = blob.url;

            image.onload = () => {
                irdoc.layout = { ar: image.naturalHeight / image.naturalWidth, dx: 0, dy: 0 };
                cb(irdoc);
            };
            break;
        }
        case "video": {
            const video = document.createElement("video");
            const irdocType = <IReferenceDocType>{
                name: "video",
            };
            const irdoc = <IReferenceDoc>{
                sha: blob.sha,
                type: irdocType,
                url: blob.url,
            };
            video.src = blob.url;
            cb(irdoc);
            video.load();
        }
    }
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
    public bookmarks: SharedString.SharedIntervalCollectionView<SharedString.SharedStringInterval>;
    public tempBookmarks: SharedString.SharedStringInterval[];
    public comments: SharedString.SharedIntervalCollection<SharedString.SharedStringInterval>;
    public commentsView: SharedString.SharedIntervalCollectionView<SharedString.SharedStringInterval>;
    public calendarIntervals: SharedString.SharedIntervalCollection<SharedString.Interval>;
    public calendarIntervalsView: SharedString.SharedIntervalCollectionView<SharedString.Interval>;
    public presenceMapView: types.IMapView;
    public presenceVector: ILocalPresenceInfo[] = [];
    public docRoot: types.IMapView;
    public curPG: MergeTree.Marker;
    public modes = {
        randExclusion: false,
        showBookmarks: true,
        showComments: true,
        showCursorLocation: true,
    } as IFlowViewModes;
    public movingInclusion = <IMovingInclusionInfo>{ onTheMove: false };
    public lastDocContext: IDocumentContext;
    public focusChild: FlowView;
    public focusMarker: MergeTree.Marker;
    public childMarker: MergeTree.Marker;
    public parentFlow: FlowView;
    public keypressHandler: (e: KeyboardEvent) => void;
    public keydownHandler: (e: KeyboardEvent) => void;

    // TODO: 'services' is being used temporarily to smuggle context down to components.
    //       Should be replaced w/component-standardized render context, layout context, etc.
    public services = new Map<string, any>();

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
        public sharedString: SharedString.SharedString,
        public status: Status,
        public options?: Object) {

        super(element);

        // Enable element to receive focus (see Example 1):
        // https://www.w3.org/WAI/GL/WCAG20/WD-WCAG20-TECHS/SCR29.html
        this.element.tabIndex = 0;

        // Disable visible focus outline when FlowView is focused.
        this.element.style.outline = "0px solid transparent";

        // Clip children of FlowView to the bounds of the FlowView's root div.
        this.element.style.overflow = "hidden";

        this.cmdTree = new MergeTree.TST<ICmd>();
        for (const command of commands) {
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

            const delta = msg.contents as MergeTree.IMergeTreeOp;
            if (this.applyOp(delta, msg)) {
                this.queueRender(msg);
            }
        });

        // refresh cursors when clients join or leave
        collabDocument.on("clientJoin", () => {
            this.updatePresenceCursors();
        });

        collabDocument.on("clientLeave", () => {
            this.updatePresenceCursors();
        });

        this.cursor = new Cursor(this.viewportDiv);
        this.setViewOption(this.options);
        blobUploadHandler(
            element,
            this.collabDocument,
            (incl: IGenericBlob) => this.insertBlobInternal(incl),
        );

        // HACK: Expose "insertComponent" and "insertText" via window to Collaborative Browser Extension
        //       for 2018/Oct demo.
        window["insertComponent"] = this.insertComponent.bind(this);
        window["insertText"] = (text: string) => {
            this.sharedString.insertText(text, this.cursor.pos);
            this.cursor.pos += text.length;
            this.localQueueRender(this.cursor.pos);
        };

        // Expose the ability to invalidate the current layout when a component's width/height changes.
        this.services.set("invalidateLayout", () => {
            console.log("Component invalidated layout");
            this.localQueueRender(FlowView.docStartPosition);
        });

        // Provide access to the containing collaborative object
        this.services.set("document", this.collabDocument);

        // TODO: Should insert a workbook into the document on demand, implement the ability
        //       to add references to pre-existing notebooks, support multiple notebooks, ...
        //
        //       Instead, we currently check to see if a workbook already exists.  If not, we
        //       insert one up front.
        this.collabDocument.getRoot().getView().then(async (rootView) => {
            let workbookMap: types.IMap;

            if (!this.collabDocument.existing) {
                workbookMap = this.collabDocument.createMap();
            } else {
                workbookMap = await rootView.wait<types.IMap>("workbook");
            }

            const workbookView = await workbookMap.getView();
            this.services.set(
                "workbook",
                new CollaborativeWorkbook(workbookView, 6, 6, [
                    ["Player", "Euchre", "Bridge", "Poker", "Go Fish", "Total Wins"],
                    ["Daniel", "0", "0", "0", "5", "=SUM(B2:E2)"],
                    ["Kurt", "2", "3", "0", "0", "=SUM(B3:E3)"],
                    ["Sam", "3", "4", "0", "0", "=SUM(B4:E4)"],
                    ["Tanvir", "3", "3", "0", "0", "=SUM(B5:E5)"],
                    ["Total Played", "=SUM(B2:B5)", "=SUM(C2:C5)", "=SUM(D2:D5)", "=SUM(E2:E5)", "=SUM(F2:F5)"],
                ]));

            // Set the map after loading data so it's populated when other clients load it
            if (!this.collabDocument.existing) {
                rootView.set("workbook", workbookMap);
            }

            workbookMap.on("valueChanged", () => {
                // TODO: Track which cells are visible and damp invalidation for off-screen cells.
                this.queueRender(undefined, true);
            });
        });
    }

    public treeForViewport() {
        console.log(this.sharedString.client.mergeTree.rangeToString(this.viewportStartPos, this.viewportEndPos));
    }

    public renderChildFlow(startChar: number, cursorPos: number, flowElement: HTMLDivElement,
        flowRect: IExcludedRectangle, marker: MergeTree.Marker) {
        const childFlow = new FlowView(flowElement, this.collabDocument, this.sharedString,
            this.status, this.options);
        childFlow.parentFlow = this;
        childFlow.setEdit(this.docRoot);
        childFlow.comments = this.comments;
        childFlow.commentsView = this.commentsView;
        childFlow.presenceMapView = this.presenceMapView;
        childFlow.presenceVector = this.presenceVector;
        childFlow.bookmarks = this.bookmarks;
        childFlow.cursor.pos = cursorPos;
        const clientRect = new ui.Rectangle(0, 0, flowRect.width, flowRect.height);
        childFlow.resizeCore(clientRect);
        childFlow.render(startChar, true);
        if (this.focusMarker === marker) {
            this.focusChild = childFlow;
        }
        childFlow.childMarker = marker;
        return childFlow;
    }

    public addChildFlow() {
        const rdocType = <IReferenceDocType>{
            name: "childFlow",
        };
        const irdoc = <IReferenceDoc>{
            sha: "C",
            type: rdocType,
        };
        const refProps = {
            [Paragraph.referenceProperty]: irdoc,
        };
        this.sharedString.insertMarker(this.cursor.pos, MergeTree.ReferenceType.Simple, refProps);
        this.localQueueRender(this.cursor.pos);
    }

    public measureClone() {
        const clock = Date.now();
        this.client.cloneFromSegments();
        console.log(`clone took ${Date.now() - clock}ms`);
    }

    /* tslint:disable:insecure-random */
    public createBookmarks(k: number) {
        const len = this.sharedString.client.getLength();
        for (let i = 0; i < k; i++) {
            const pos1 = Math.floor(Math.random() * (len - 1));
            const intervalLen = Math.max(1, Math.floor(Math.random() * Math.min(len - pos1, 150)));
            const props = { clid: this.sharedString.client.longClientId, user: this.sharedString.client.userInfo };
            this.bookmarks.add(pos1, pos1 + intervalLen, MergeTree.IntervalType.Simple,
                props);
        }
        this.localQueueRender(-1);
    }

    public updatePresenceCursors() {
        for (const presenceInfo of this.presenceVector) {
            if (presenceInfo && presenceInfo.cursor) {
                presenceInfo.cursor.refresh();
            }
        }
    }

    public xUpdateHistoryBubble(x: number) {
        const widgetDivBounds = this.historyWidget.getBoundingClientRect();
        const w = widgetDivBounds.width - 14;
        let diffX = x - (widgetDivBounds.left + 7);
        if (diffX <= 0) {
            diffX = 0;
        }
        const pct = diffX / w;
        const l = 7 + Math.floor(pct * w);
        const seq = this.client.historyToPct(pct);
        this.historyVersion.innerText = `Version @${seq}`;
        this.historyBubble.style.left = `${l}px`;
        this.cursor.pos = FlowView.docStartPosition;
        this.localQueueRender(FlowView.docStartPosition);
    }

    public updateHistoryBubble(seq: number) {
        const widgetDivBounds = this.historyWidget.getBoundingClientRect();
        const w = widgetDivBounds.width - 14;
        const count = this.client.undoSegments.length + this.client.redoSegments.length;
        const pct = this.client.undoSegments.length / count;
        const l = 7 + Math.floor(pct * w);
        this.historyBubble.style.left = `${l}px`;
        this.historyVersion.innerText = `Version @${seq}`;
    }

    public makeHistoryWidget() {
        const bounds = ui.Rectangle.fromClientRect(this.status.element.getBoundingClientRect());
        const x = Math.floor(bounds.width / 2);
        const y = 2;
        const widgetRect = new ui.Rectangle(x, y, Math.floor(bounds.width * 0.4),
            (bounds.height - 4));
        const widgetDiv = document.createElement("div");
        widgetRect.conformElement(widgetDiv);
        widgetDiv.style.zIndex = "3";
        const bubble = document.createElement("div");
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
        const versionSpan = document.createElement("span");
        widgetDiv.appendChild(versionSpan);
        versionSpan.innerText = "History";
        versionSpan.style.padding = "3px";
        this.historyVersion = versionSpan;
        this.historyWidget = widgetDiv;
        this.historyBubble = bubble;
        const clickHistory = (ev: MouseEvent) => {
            this.xUpdateHistoryBubble(ev.clientX);
        };
        const mouseDownBubble = (ev: MouseEvent) => {
            widgetDiv.onmousemove = clickHistory;
        };
        const cancelHistory = (ev: MouseEvent) => {
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
            const seq = this.client.undo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }

    public historyForward() {
        this.goHistorical();
        if (this.client.redoSegments.length > 0) {
            const seq = this.client.redo();
            this.updateHistoryBubble(seq);
            this.cursor.pos = FlowView.docStartPosition;
            this.localQueueRender(FlowView.docStartPosition);
        }
    }

    // assumes docRoot ready
    public addCalendarMap() {
        this.calendarIntervals =
            this.docRoot.get<SharedString.SharedIntervalCollection<SharedString.Interval>>("calendar");
        if (this.calendarIntervals) {
            this.calendarIntervals.getView().then((v) => {
                this.calendarIntervalsView = v;
            });
        }
    }

    public addCalendarEntries() {
        this.calendarIntervalsView.add(0, 10, MergeTree.IntervalType.Simple, { text: "picnic" });
    }

    public showCalendarEntries() {
        const intervals = this.calendarIntervalsView.findOverlappingIntervals(5, 6);
        if (intervals && (intervals.length > 0)) {
            this.statusMessage("cal", intervals[0].properties["text"]);
        }
    }

    public addPresenceMap(presenceMap: types.IMap) {
        presenceMap.on("valueChanged", (delta: types.IValueChanged, local: boolean, op: ISequencedObjectMessage) => {
            this.remotePresenceUpdate(delta, local, op);
        });

        presenceMap.getView().then((v) => {
            this.presenceMapView = v;
            this.updatePresence();
        });
    }

    public presenceInfoInRange(start: number, end: number) {
        for (let i = 0, len = this.presenceVector.length; i < len; i++) {
            const presenceInfo = this.presenceVector[i];
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
                const markBaseSegment = presentPresence.localRef.segment as MergeTree.BaseSegment;
                this.client.mergeTree.removeLocalReference(markBaseSegment, presentPresence.markLocalRef);
            }
            const baseSegment = presentPresence.localRef.segment as MergeTree.BaseSegment;
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
            const sameLine = localPresenceInfo.cursor &&
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
        let rowDiv = lineDiv as IRowDiv;
        let oldRowDiv: IRowDiv;
        while (rowDiv && (rowDiv !== oldRowDiv) && rowDiv.rowView) {
            oldRowDiv = rowDiv;
            lineDiv = undefined;
            for (const cell of rowDiv.rowView.cells) {
                if (cell.div) {
                    const innerDiv = this.lineDivSelect(fn, (cell as ICellView).viewport.div, true, rev);
                    if (innerDiv) {
                        lineDiv = innerDiv;
                        rowDiv = innerDiv as IRowDiv;
                        break;
                    }
                }
            }
        }
        return lineDiv;
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

    public clickSpan(x: number, y: number, elm: HTMLSpanElement) {
        const span = elm as ISegSpan;
        const elmOff = pointerToElementOffsetWebkit(x, y);
        if (elmOff) {
            let computed = elmOffToSegOff(elmOff, span);
            if (span.offset) {
                computed += span.offset;
            }
            this.cursor.pos = span.segPos + computed;
            const tilePos = findTile(this, this.cursor.pos, "pg", false);
            if (tilePos) {
                this.curPG = tilePos.tile as MergeTree.Marker;
            }
            this.updatePresence();
            this.cursor.updateView(this);
            if (this.parentFlow) {
                this.parentFlow.focusChild = this;
                this.parentFlow.focusMarker = this.childMarker;
            }
            this.focusChild = undefined;
            this.focusMarker = undefined;
            return true;
        }
    }

    public getPosFromPixels(targetLineDiv: ILineDiv, x: number) {
        let position: number;

        if (targetLineDiv && (targetLineDiv.linePos !== undefined)) {
            let y: number;
            const targetLineBounds = targetLineDiv.getBoundingClientRect();
            y = targetLineBounds.top + Math.floor(targetLineBounds.height / 2);
            const elm = document.elementFromPoint(x, y);
            if (elm.tagName === "DIV") {
                if ((targetLineDiv.lineEnd - targetLineDiv.linePos) === 1) {
                    // empty line
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
                    // content div
                    if (x <= targetLineBounds.left) {
                        position = targetLineDiv.linePos;
                    } else {
                        position = targetLineDiv.lineEnd;
                    }
                }

            } else if (elm.tagName === "SPAN") {
                const span = elm as ISegSpan;
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
        const cursorRect = this.cursor.rect();
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
            const segoff = getContainingSegment(this, this.cursor.pos);
            if (segoff.segment.getType() !== MergeTree.SegmentType.Text) {
                // REVIEW: assume marker for now (could be external later)
                const marker = segoff.segment as MergeTree.Marker;
                if ((marker.refType & MergeTree.ReferenceType.Tile) &&
                    (marker.hasTileLabel("pg"))) {
                    if (marker.hasRangeLabel("table") && (marker.refType & MergeTree.ReferenceType.NestEnd)) {
                        this.cursorRev();
                    }
                } else if ((marker.refType === MergeTree.ReferenceType.NestEnd) && (marker.hasRangeLabel("cell"))) {
                    const cellMarker = marker as Table.ICellMarker;
                    const endId = cellMarker.getId();
                    let beginMarker: Table.ICellMarker;
                    if (endId) {
                        const id = Table.idFromEndId(endId);
                        beginMarker = this.sharedString.client.mergeTree.getSegmentFromId(id) as Table.ICellMarker;
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

            const segoff = this.client.mergeTree.getContainingSegment(this.cursor.pos, MergeTree.UniversalSequenceNumber,
                this.client.getClientId());
            if (segoff.segment.getType() !== MergeTree.SegmentType.Text) {
                // REVIEW: assume marker for now
                const marker = segoff.segment as MergeTree.Marker;
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

        // if line div is row, then find line in box closest to x
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
                    // top or bottom row of table
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
        // TODO onmousewheel does not appear on DOM d.ts
        (this.element as any).onselectstart = preventD;
        let prevX = Nope;
        let prevY = Nope;
        let downX = Nope;
        let downY = Nope;
        let incluMarker: MergeTree.Marker;
        let freshDown = false;

        const moveObjects = (e: MouseEvent, fresh = false) => {
            if (e.button === 0) {
                prevX = e.clientX;
                prevY = e.clientY;
                const elm = document.elementFromPoint(prevX, prevY);
                if (elm) {
                    if (fresh) {
                        const refInclu = elm as IRefDiv;
                        if (refInclu.marker) {
                            this.movingInclusion.onTheMove = true;
                            incluMarker = refInclu.marker;
                            this.movingInclusion.exclu = refInclu.exclu;
                            this.movingInclusion.marker = incluMarker;
                        }
                    }
                    if (this.movingInclusion.onTheMove) {
                        // console.log(`moving inclusion to nowhere with ${prevX-downX},${prevY-downY}`);
                        const deltaX = prevX - downX;
                        const deltaY = prevY - downY;
                        const thresh = 2;
                        const dist = Math.abs(deltaX) + Math.abs(deltaY);
                        if (dist >= thresh) {
                            this.movingInclusion.dx = deltaX;
                            this.movingInclusion.dy = deltaY;
                            this.updateDragPresence();
                            this.render(this.topChar, true);
                        }
                    } else {
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
                downX = e.clientX;
                downY = e.clientY;
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
                if (this.movingInclusion.onTheMove) {
                    const toPos = this.movingInclusion.ulPos;
                    this.movingInclusion.dx = 0;
                    this.movingInclusion.dy = 0;
                    this.movingInclusion.onTheMove = false;
                    this.movingInclusion.ulPos = undefined;
                    this.updateDragPresence();
                    if (toPos !== undefined) {
                        // console.log(`moving to ${toPos}`);
                        const fromPos = getOffset(this, this.movingInclusion.marker);
                        moveMarker(this, fromPos, toPos);
                        this.updatePGInfo(fromPos);
                        this.updatePGInfo(toPos);
                    }
                    this.render(this.topChar, true);
                } else {
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
                // tslint:disable-next-line:max-line-length
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
            } else if (this.activeSearchBox) {
                if (e.keyCode === KeyCode.esc) {
                    this.activeSearchBox.dismiss();
                    this.activeSearchBox = undefined;
                } else {
                    this.activeSearchBox.keydown(e);
                }
            } else {
                const saveLastVertX = this.lastVerticalX;
                let specialKey = true;
                this.lastVerticalX = -1;
                if (e.ctrlKey && (e.keyCode !== 17)) {
                    this.keyCmd(e.keyCode);
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
                        // Otherwise, construct the range to remove by moving the cursor once in the reverse direction.
                        // Below we will remove the positions spanned by the current and previous cursor positions.
                        const removeEnd = this.cursor.pos;
                        this.cursorRev();
                        toRemove = {
                            end: removeEnd,
                            start: this.cursor.pos,
                        };
                    }
                    if (this.modes.showCursorLocation) {
                        this.cursorLocation();
                    }
                    this.sharedString.removeText(toRemove.start, toRemove.end);
                    this.localQueueRender(toRemove.start);
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
                    const halfport = Math.floor(this.viewportCharCount() / 2);
                    const topChar = this.client.getLength() - halfport;
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
                    const maxPos = this.client.getLength() - 1;
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

        const keypressHandler = (e: KeyboardEvent) => {
            if (this.focusChild) {
                this.focusChild.keypressHandler(e);
            } else if (this.activeSearchBox) {
                if (e.charCode === CharacterCodes.cr) {
                    const cmd = this.activeSearchBox.getSelectedItem() as ICmd;

                    // If the searchbox successfully resolved to a simple command, execute it.
                    if (cmd && cmd.exec) {
                        cmd.exec(this);
                    } else {
                        // TODO: A micro-language for inserting components would be helpful here.
                        const searchString = this.activeSearchBox.getSearchString();

                        // If it starts with "=", assume it's a formula definition.
                        if (searchString.startsWith("=")) {
                            this.insertFormula(searchString);
                        }

                        // If it starts with "*", assume it's a slider definition.
                        if (searchString.startsWith("*")) {
                            this.insertSlider("=" + searchString.substring(1));
                        }

                        // If it starts with &, assume it's a document ID
                        if (searchString.startsWith("&")) {
                            this.insertDocument(searchString.substring(1));
                        }
                    }
                    this.activeSearchBox.dismiss();
                    this.activeSearchBox = undefined;
                } else {
                    this.activeSearchBox.keypress(e);
                }
            } else {
                const pos = this.cursor.pos;
                this.cursor.pos++;
                const code = e.charCode;
                if (code === CharacterCodes.cr) {
                    // TODO: other labels; for now assume only list/pg tile labels
                    this.insertParagraph(pos);
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
        this.keypressHandler = keypressHandler;
        this.keydownHandler = keydownHandler;
    }

    public viewTileProps() {
        let searchPos = this.cursor.pos;
        if (this.cursor.pos === this.cursor.lineDiv().lineEnd) {
            searchPos--;
        }
        const tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            let buf = "";
            if (tileInfo.tile.properties) {
                // tslint:disable:forin
                for (const key in tileInfo.tile.properties) {
                    buf += ` { ${key}: ${tileInfo.tile.properties[key]} }`;
                }
            }

            const lc = !!(tileInfo.tile as Paragraph.IParagraphMarker).listCache;
            console.log(`tile at pos ${tileInfo.pos} with props${buf} and list cache: ${lc}`);
        }
    }

    public setList(listKind = 0) {
        const searchPos = this.cursor.pos;
        const tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile as Paragraph.IParagraphMarker;
            let listStatus = false;
            if (tile.hasTileLabel("list")) {
                listStatus = true;
            }
            const curLabels = tile.properties[MergeTree.reservedTileLabelsKey] as string[];

            if (listStatus) {
                const remainingLabels = curLabels.filter((l) => l !== "list");
                this.sharedString.annotateRange({
                    [MergeTree.reservedTileLabelsKey]: remainingLabels,
                    series: null,
                }, tileInfo.pos, tileInfo.pos + 1);
            } else {
                const augLabels = curLabels.slice();
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
        const cursorContext =
            this.client.mergeTree.getStackContext(pos, this.client.getClientId(), ["table", "cell", "row"]);
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
                    const offset = this.client.mergeTree.getOffset(toCell.marker,
                        MergeTree.UniversalSequenceNumber, this.client.getClientId());
                    this.cursor.pos = offset + 1;
                } else {
                    if (shift) {
                        const offset = this.client.mergeTree.getOffset(tableView.tableMarker,
                            MergeTree.UniversalSequenceNumber, this.client.getClientId());
                        this.cursor.pos = offset - 1;
                    } else {
                        const endOffset = this.client.mergeTree.getOffset(tableView.endTableMarker,
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
        const searchPos = this.cursor.pos;
        const tileInfo = findTile(this, searchPos, "pg", false);
        if (tileInfo) {
            if (!this.tryMoveCell(tileInfo.pos, shift)) {
                const tile = tileInfo.tile as Paragraph.IParagraphMarker;
                this.increaseIndent(tile, tileInfo.pos, shift);
            }
        }
    }

    public toggleBlockquote() {
        const tileInfo = findTile(this, this.cursor.pos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile;
            const props = tile.properties;
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
        const segoff = getContainingSegment(this, this.cursor.pos);
        if (segoff.segment && (segoff.segment.getType() === MergeTree.SegmentType.Text)) {
            const textSegment = segoff.segment as MergeTree.TextSegment;
            this.formatRegister = MergeTree.extend(MergeTree.createMap(), textSegment.properties);
        }
    }

    public setProps(props: MergeTree.PropertySet, updatePG = true) {
        const sel = this.cursor.getSelection();
        if (sel) {
            this.clearSelection(false);
            this.sharedString.annotateRange(props, sel.start, sel.end);
        } else {
            const wordRange = getCurrentWord(this.cursor.pos, this.sharedString.client.mergeTree);
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
        const sel = this.cursor.getSelection();
        if (sel) {
            this.clearSelection(false);
            this.toggleRange(name, valueOn, valueOff, sel.start, sel.end);
        } else {
            const wordRange = getCurrentWord(this.cursor.pos, this.sharedString.client.mergeTree);
            if (wordRange) {
                this.toggleRange(name, valueOn, valueOff, wordRange.wordStart, wordRange.wordEnd);
            }
        }
    }

    public toggleRange(name: string, valueOn: string, valueOff: string, start: number, end: number) {
        let someSet = false;
        const findPropSet = (segment: MergeTree.Segment) => {
            if (segment.getType() === MergeTree.SegmentType.Text) {
                const textSegment = segment as MergeTree.TextSegment;
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
            let result: SharedString.SharedStringInterval;
            if (before) {
                result = this.bookmarks.previousInterval(this.cursor.pos);
            } else {
                result = this.bookmarks.nextInterval(this.cursor.pos);
            }
            if (result) {
                const s = result.start.toPosition(this.client.mergeTree,
                    MergeTree.UniversalSequenceNumber, this.client.getClientId());
                const e = result.end.toPosition(this.client.mergeTree,
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

    public geocodeAddress() {
        const sel = this.cursor.getSelection();
        if (sel) {
            const text = this.client.getText(sel.start, sel.end);
            Geocoder.geocode(text, (err, data) => console.log(data),
                { key: "AIzaSyCY3kHHzocQSos6QNOzJINWmNo_a4IqN-8" });
        }
    }

    public showCommentText() {
        const overlappingComments = this.commentsView.findOverlappingIntervals(this.cursor.pos,
            this.cursor.pos + 1);
        if (overlappingComments && (overlappingComments.length >= 1)) {
            const commentInterval = overlappingComments[0];
            const commentText = commentInterval.properties["story"].client.getText();
            this.statusMessage("comment", "Comment Text: " + commentText);
            setTimeout(() => {
                this.status.remove("comment");
            }, (10000));
        }
    }

    public createComment() {
        const sel = this.cursor.getSelection();
        if (sel) {
            const commentStory = this.collabDocument.createString();
            commentStory.insertText("a comment...", 0);
            commentStory.attach();
            this.comments.add(
                sel.start,
                sel.end,
                MergeTree.IntervalType.Simple,
                { story: commentStory });
            this.cursor.clearSelection();
            this.localQueueRender(this.cursor.pos);
        }
    }

    /** Insert a Sheetlet. */
    public insertSheetlet() {
        this.insertComponent("sheetlet", {});
    }

    /** Insert a Chart. */
    public insertChart() {
        this.insertComponent("chart", {});
    }

    /** Insert an external component */
    public insertChaincode(prefix: string, chaincode: string) {
        const id = `${prefix}${Date.now()}`;
        this.insertComponent("document", { id, chaincode });
    }

    public insertInnerComponent(prefix: string, chaincode: string) {
        const id = `${prefix}${Date.now()}`;
        this.insertComponent("innerComponent", { id, chaincode });
    }

    /** Insert a Document */
    public insertDocument(id) {
        this.insertComponent("document", { id });
    }

    /** Insert a Formula box to display the given 'formula'. */
    public insertFormula(formula: string) {
        this.insertComponent("formula", { formula });
    }

    /** Insert a Slider box to display the given 'formula'. */
    public insertSlider(value: string) {
        this.insertComponent("slider", { value });
    }

    public insertList() {
        const startPos = this.cursor.pos;
        const testList: Item[] = [{ key: "providence" }, { key: "boston" }, { key: "issaquah" }];
        const irdoc = <IListReferenceDoc>{
            items: testList,
            selectionIndex: 0,
            sha: "L",
            type: { name: "list" },
            url: "",
        };
        const refProps = {
            [Paragraph.referenceProperty]: irdoc,
        };
        this.sharedString.insertMarker(this.cursor.pos++, MergeTree.ReferenceType.Simple, refProps);
        this.localQueueRender(startPos);
    }

    public insertPhoto() {
        urlToInclusion(`${baseURI}/public/images/bennet1.jpeg`)
            .then(async (incl) => {
                this.collabDocument.uploadBlob(incl)
                    .then((blob) => {
                        this.insertBlobInternal(blob);
                    });
            })
            .catch((error) => {
                console.log(error);
            });
    }

    public insertVideo() {
        urlToInclusion(`${baseURI}/public/images/SampleVideo_1280x720_1mb.mp4`)
            .then(async (incl) => {
                this.insertBlobInternal(await this.collabDocument.uploadBlob(incl));
            })
            .catch((error) => {
                console.log(error);
            });
    }

    private insertBlobInternal(blob: IGenericBlob) {
        this.collabDocument.getBlob(blob.sha)
            .then((finalBlob) => {
                makeBlobRef(finalBlob, this.collabDocument.tenantId, (irdoc) => {
                    const refProps = {
                        [Paragraph.referenceProperty]: irdoc,
                    };
                    this.sharedString.insertMarker(this.cursor.pos, MergeTree.ReferenceType.Simple, refProps);
                    this.localQueueRender(this.cursor.pos);
                });
            });
    }

    // tslint:disable:member-ordering
    public copy() {
        const sel = this.cursor.getSelection();
        if (sel) {
            this.sharedString.copy("clipboard", sel.start, sel.end);
            this.clearSelection();
        }
    }

    public cut() {
        const sel = this.cursor.getSelection();
        if (sel) {
            const len = sel.end - sel.start;
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
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteRow(this.sharedString, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public deleteCellShiftLeft() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteCellShiftLeft(this.sharedString, cellMarker.cell, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public deleteColumn() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.deleteColumn(this.sharedString, cellMarker.cell, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public insertRow() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertRow(this.sharedString, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public tableSummary() {
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const tableMarkerPos = getOffset(this, tableMarker);
            if (!tableMarker.table) {
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.succinctPrintTable(tableMarker, tableMarkerPos, this.sharedString);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public randomCell(table: Table.Table) {
        let cellCount = 0;
        for (const row of table.rows) {
            if (!Table.rowIsMoribund(row.rowMarker)) {
                for (const cell of row.cells) {
                    if (!Table.cellIsMoribund(cell.marker)) {
                        cellCount++;
                    }
                }
            }
        }
        if (cellCount > 0) {
            const randIndex = Math.round(Math.random() * cellCount);
            cellCount = 0;
            for (const row of table.rows) {
                if (!Table.rowIsMoribund(row.rowMarker)) {
                    for (const cell of row.cells) {
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
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const randomTableOp = () => {
                count++;
                if (!tableMarker.table) {
                    const tableMarkerPos = getOffset(this, tableMarker);
                    Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
                }
                const randCell = this.randomCell(tableMarker.table);
                if (randCell) {
                    const pos = getOffset(this, randCell.marker);
                    this.cursor.pos = pos;
                    this.cursor.updateView(this);
                    let hit = false;
                    if (rowCount < 8) {
                        const chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.insertRow();
                            rowCount++;
                            hit = true;
                        }
                    }
                    if ((columnCount < 8) && (!hit)) {
                        const chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.insertColumn();
                            columnCount++;
                            hit = true;
                        }
                    }
                    if ((rowCount > 4) && (!hit)) {
                        const chance = Math.round(Math.random() * 10);
                        if (chance >= 5) {
                            this.deleteRow();
                            rowCount--;
                            hit = true;
                        }
                    }
                    if ((columnCount > 4) && (!hit)) {
                        const chance = Math.round(Math.random() * 10);
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
        const stack =
            this.sharedString.client.mergeTree.getStackContext(this.cursor.pos,
                this.sharedString.client.getClientId(), ["table", "cell", "row"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            const rowMarker = stack.row.top() as Table.IRowMarker;
            const cellMarker = stack.cell.top() as Table.ICellMarker;
            if (!tableMarker.table) {
                const tableMarkerPos = getOffset(this, tableMarker);
                Table.parseTable(tableMarker, tableMarkerPos, this.sharedString, makeFontInfo(this.lastDocContext));
            }
            Table.insertColumn(this.sharedString, cellMarker.cell, rowMarker.row, tableMarker.table);
            this.localQueueRender(this.cursor.pos);
        }
    }

    public setPGProps(props: MergeTree.PropertySet) {
        const tileInfo = findTile(this, this.cursor.pos, "pg", false);
        if (tileInfo) {
            const pgMarker = tileInfo.tile as Paragraph.IParagraphMarker;
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
                    const prefix = this.activeSearchBox.getSearchString().toLowerCase();
                    const items = this.cmdTree.pairsWithPrefix(prefix).map((res) => {
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
        const text = this.sharedString.client.getText();
        const nonWhitespace = text.split(/\s+/g);
        console.log(`non ws count: ${nonWhitespace.length}`);
        const obj = new Object();
        for (const nws of nonWhitespace) {
            if (!obj[nws]) {
                obj[nws] = 1;
            } else {
                obj[nws]++;
            }
        }
        let count = 0;
        const uniques = [] as string[];
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                count++;
                uniques.push(key);
            }
        }
        console.log(`${count} unique`);
        const clock = Date.now();
        getMultiTextWidth(uniques, "18px Times");
        console.log(`unique pp cost: ${Date.now() - clock}ms`);
    }

    public preScroll() {
        if (this.lastVerticalX === -1) {
            const rect = this.cursor.rect();
            this.lastVerticalX = rect.left;
        }
    }

    public apresScroll(up: boolean) {
        if ((this.cursor.pos < this.viewportStartPos) ||
            (this.cursor.pos >= this.viewportEndPos)) {
            const x = this.getCanonicalX();
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
            const len = this.client.getLength();
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
        const len = this.client.getLength();
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

        const clk = Date.now();
        // TODO: consider using markers for presence info once splice segments during pg render
        this.updatePresencePositions();
        clearSubtree(this.viewportDiv);
        // this.viewportDiv.appendChild(this.cursor.editSpan);
        const renderOutput = renderTree(this.viewportDiv, this.topChar, this, this.targetTranslation);
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

    public async loadFinished(clockStart = 0) {
        // Work around a race condition with multiple shared strings trying to create the interval
        // collections at the same time
        if (this.collabDocument.existing) {
            const intervalCollections = this.sharedString.getIntervalCollections();
            await Promise.all([intervalCollections.wait("bookmarks"), intervalCollections.wait("comments")]);
        }

        const bookmarksCollection = this.sharedString.getSharedIntervalCollection("bookmarks");
        this.bookmarks = await bookmarksCollection.getView();

        // Takes a collaborative Object from OnPrepareDeserialize and inserts back into the interval's "Story" Property
        const onDeserialize: SharedString.DeserializeCallback = (interval, commentSharedString: ICollaborativeObject) => {
            if (interval.properties && interval.properties["story"]) {
                assert(commentSharedString);
                interval.properties["story"] = commentSharedString;
            }

            return true;
        };

        // Fetches the collaborative object with the key story["value"];
        const onPrepareDeserialize: SharedString.PrepareDeserializeCallback = (properties) => {
            if (properties && properties["story"]) {
                const story = properties["story"];
                return this.collabDocument.get(story["value"]);
            } else {
                return Promise.resolve(null);
            }
        };

        // For examples of showing the API we do interval adds on the collection with comments. But use
        // the view when doing bookmarks.
        this.comments = this.sharedString.getSharedIntervalCollection("comments");
        this.commentsView = await this.comments.getView(onDeserialize, onPrepareDeserialize);

        this.render(0, true);
        if (clockStart > 0) {
            // tslint:disable-next-line:max-line-length
            console.log(`time to edit/impression: ${this.timeToEdit} time to load: ${Date.now() - clockStart}ms len: ${this.sharedString.client.getLength()} - ${performanceNow()}`);
        }
        const presenceMap = this.docRoot.get("presence") as types.IMap;
        this.addPresenceMap(presenceMap);
        this.addCalendarMap();
        const intervalMap = this.sharedString.intervalCollections.getMap();
        intervalMap.on("valueChanged", (delta: types.IValueChanged) => {
            this.queueRender(undefined, true);
        });
        // this.testWordInfo();
    }

    public randomWordMove() {
        const client = this.sharedString.client;
        const word1 = findRandomWord(client.mergeTree, client.getClientId());
        if (word1) {
            const removeStart = word1.pos;
            const removeEnd = removeStart + word1.text.length;
            this.sharedString.removeText(removeStart, removeEnd);
            let word2 = findRandomWord(client.mergeTree, client.getClientId());
            while (!word2) {
                word2 = findRandomWord(client.mergeTree, client.getClientId());
            }
            const pos = word2.pos + word2.text.length;
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
        const stack =
            this.sharedString.client.mergeTree.getStackContext(changePos,
                this.sharedString.client.getClientId(), ["table"]);
        if (stack.table && (!stack.table.empty())) {
            const tableMarker = stack.table.top() as Table.ITableMarker;
            tableMarker.table = undefined;
        }
    }

    public updatePGInfo(changePos: number) {
        const tileInfo = findTile(this, changePos, "pg", false);
        if (tileInfo) {
            const tile = tileInfo.tile as Paragraph.IParagraphMarker;
            Paragraph.clearContentCaches(tile);
        } else {
            console.log("did not find pg to clear");
        }
        const markers = this.client.getModifiedMarkersForOp();
        if (markers.length > 0) {
            this.updateTableInfo(changePos);
        }
    }

    public localQueueRender(updatePos: number) {
        if (this.parentFlow) {
            this.parentFlow.localQueueRender(updatePos);
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

    private insertParagraph(pos: number) {
        const curTilePos = findTile(this, pos, "pg", false);
        const pgMarker = curTilePos.tile as Paragraph.IParagraphMarker;
        const pgPos = curTilePos.pos;
        Paragraph.clearContentCaches(pgMarker);
        const curProps = pgMarker.properties;
        const newProps = MergeTree.createMap<any>();
        const newLabels = ["pg"];

        // TODO: Should merge w/all exisitng tile labels?
        if (Paragraph.isListTile(pgMarker)) {
            newLabels.push("list");
            newProps.indentLevel = curProps.indentLevel;
            newProps.listKind = curProps.listKind;
        }

        newProps[MergeTree.reservedTileLabelsKey] = newLabels;

        // TODO: place in group op
        // old marker gets new props
        this.sharedString.annotateRange(newProps, pgPos, pgPos + 1, { name: "rewrite" });
        // new marker gets existing props
        this.sharedString.insertMarker(pos, MergeTree.ReferenceType.Tile, curProps);
    }

    private insertComponent(type: string, state: {}) {
        const startPos = this.cursor.pos;

        // TODO: All markers should be inserted as an atomic group.
        const component = ui.refTypeNameToComponent.get(type);
        if (isBlock(component)) {
            this.insertParagraph(this.cursor.pos++);
        }

        const props = {
            [Paragraph.referenceProperty]: {
                sha: "",                        // 'sha' not used
                type: {
                    name: type,
                } as IReferenceDocType,
                url: "",                        // 'url' not used
            } as IReferenceDoc,
            state,
        };

        this.sharedString.insertMarker(this.cursor.pos++, MergeTree.ReferenceType.Simple, props);
        this.localQueueRender(startPos);
    }

    private remotePresenceUpdate(delta: types.IValueChanged, local: boolean, op: ISequencedObjectMessage) {
        if (local) {
            return;
        }

        const remotePresenceBase = this.presenceMapView.get(delta.key) as IRemotePresenceBase;
        if (remotePresenceBase.type === "selection") {
            this.remotePresenceToLocal(delta.key, op.user, remotePresenceBase as IRemotePresenceInfo);
        } else if (remotePresenceBase.type === "drag") {
            this.remoteDragToLocal(delta.key, op.user, remotePresenceBase as IRemoteDragInfo);
        }
    }

    private remotePresenceFromEdit(
        longClientId: string,
        userInfo: IUser,
        refseq: number,
        oldpos: number,
        posAdjust = 0) {

        const remotePosInfo: IRemotePresenceInfo = {
            origMark: -1,
            origPos: oldpos + posAdjust,
            refseq,
            type: "selection",
        };

        this.remotePresenceToLocal(longClientId, userInfo, remotePosInfo);
    }
    // TODO: throttle this if local starts moving
    private remoteDragToLocal(longClientId: string, user: IUser, remoteDragInfo: IRemoteDragInfo) {
        this.movingInclusion.exclu = remoteDragInfo.exclu;
        this.movingInclusion.marker = <MergeTree.Marker>getContainingSegment(this, remoteDragInfo.markerPos).segment;
        this.movingInclusion.dx = remoteDragInfo.dx;
        this.movingInclusion.dy = remoteDragInfo.dy;
        this.movingInclusion.onTheMove = remoteDragInfo.onTheMove;
        this.localQueueRender(Nope);
    }

    private remotePresenceToLocal(longClientId: string, user: IUser, remotePresenceInfo: IRemotePresenceInfo, posAdjust = 0) {
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
            const localPresenceInfo = {
                clientId,
                fresh: true,
                localRef: new MergeTree.LocalReference(segoff.segment as MergeTree.BaseSegment, segoff.offset,
                    MergeTree.ReferenceType.SlideOnRemove),
                shouldShowCursor: () => {
                    return this.client.getClientId() !== clientId &&
                        Array.from(this.collabDocument.getClients().keys())
                            .map((k) => this.client.getOrAddShortClientId(k))
                            .indexOf(clientId) !== -1;
                },
                user,
            } as ILocalPresenceInfo;
            if (remotePresenceInfo.origMark >= 0) {
                const markSegoff = this.client.mergeTree.getContainingSegment(remotePresenceInfo.origMark,
                    remotePresenceInfo.refseq, clientId);
                if (markSegoff.segment) {
                    localPresenceInfo.markLocalRef =
                        new MergeTree.LocalReference(markSegoff.segment as MergeTree.BaseSegment,
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
                type: "selection",
            };

            this.presenceMapView.set(this.collabDocument.clientId, presenceInfo);
        }
    }

    private updateDragPresence() {
        if (this.presenceMapView) {
            let dragPresenceInfo: IRemoteDragInfo;
            dragPresenceInfo = {
                dx: this.movingInclusion.dx,
                dy: this.movingInclusion.dy,
                exclu: this.movingInclusion.exclu,
                markerPos: getOffset(this, this.movingInclusion.marker),
                onTheMove: this.movingInclusion.onTheMove,
                type: "drag",
            };
            this.presenceMapView.set(this.collabDocument.clientId, dragPresenceInfo);
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
    private applyOp(delta: MergeTree.IMergeTreeOp, msg: ISequencedObjectMessage) {
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
                            const remLen = delta.pos2 - delta.pos1;
                            adjLength -= remLen;
                        }
                        this.cursor.pos += adjLength;
                    } else if (delta.register) {
                        // paste
                        const len = this.sharedString.client.registerCollection.getLength(msg.clientId,
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
                for (const groupOp of delta.ops) {
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

    private queueRender(msg: ISequencedObjectMessage, go = false) {
        if ((!this.pendingRender) && (go || (msg && msg.contents))) {
            this.pendingRender = true;
            window.requestAnimationFrame(() => {
                this.pendingRender = false;
                this.render(this.topChar, true);
            });
        }
    }
}
