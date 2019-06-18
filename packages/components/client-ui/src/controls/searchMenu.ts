/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:align
import * as MergeTree from "@prague/merge-tree";
import { CharacterCodes } from "../text";
import * as ui from "../ui";
import { Cursor } from "./cursor";
import * as domutils from "./domutils";
import { KeyCode } from "./keycode";

export interface ISearchMenuHost {
    // TD switch to options structure
    showSearchMenu(
        cmdTree: MergeTree.TST<ISearchMenuCommand>,
        foldCase: boolean,
        showAllInitially: boolean,
        cmdParser?: (searchString: string, cmd?: ISearchMenuCommand) => void): boolean;
    cancelSearchMenu(): void;
}

export interface ISearchMenuClient {
    registerSearchMenuHost(host: ISearchMenuHost): void;
}

export interface ISearchMenuParam<TContext = any> {
    name: string;
    suffix?: string;
    lruValue?: string;
    values(context: TContext): MergeTree.TST<ISearchMenuCommand>;
    defaultValue(context: TContext): string;
}

export interface ISearchMenuCommand<TContext = any> {
    div?: HTMLDivElement;
    exec?: (cmd: ISearchMenuCommand<TContext>, parameters: string[], context?: TContext) => void;
    enabled?: (context?: TContext) => boolean;
    iconHTML?: string;
    key: string;
    parameters?: Array<ISearchMenuParam<TContext>>;
}

export function namesToItems(names: string[]): ISearchMenuCommand[] {
    const items: ISearchMenuCommand[] = new Array(names.length);

    for (let i = 0, len = names.length; i < len; i++) {
        items[i] = { key: names[i] };
    }

    return items;
}

export interface ISelectionListBox {
    elm: HTMLDivElement;
    show(): void;
    hide(): void;
    prevItem();
    nextItem();
    removeHighlight(): void;
    showSelectionList(selectionItems: ISearchMenuCommand[], hintSelection?: string): void;
    selectItem(key: string): void;
    setItemTextPrefix(prefix: string): void;
    setItemTextSuffix(suffix: string): void;
    items(): ISearchMenuCommand[];
    getSelectedKey(): string;
    getSelectedItem(): ISearchMenuCommand;
    getSelectionIndex(): number;
    setSelectionIndex(indx: number): void;
    keydown(e: KeyboardEvent): void;
}

export function selectionListBoxCreate(
    shapeRect: ui.Rectangle,
    popup: boolean,
    container: HTMLElement,
    itemHeight: number,
    offsetY: number,
    varHeight?: number): ISelectionListBox {

    const listContainer = document.createElement("div");
    let items: ISearchMenuCommand[];
    let itemCapacity: number;
    let selectionIndex = -1;
    let topSelection = 0;
    let itemTextPrefix = "";
    let itemTextSuffix = "";

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
        setItemTextPrefix,
        setItemTextSuffix,
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

    function setItemTextPrefix(prefix: string) {
        itemTextPrefix = prefix;
    }

    function setItemTextSuffix(suffix: string) {
        itemTextSuffix = suffix;
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

        if (item.iconHTML) {
            const icon = document.createElement("span");
            // tslint:disable:no-inner-html
            icon.innerHTML = item.iconHTML;
            icon.style.marginRight = "2px";
            itemDiv.insertBefore(icon, itemSpan);
        }
        return itemDiv;
    }

    function showSelectionList(selectionItems: ISearchMenuCommand[], hintSelection?: string) {
        topSelection = 0;
        items = selectionItems;
        domutils.clearSubtree(listContainer);
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
        domutils.clearSubtree(listContainer);
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
    showAllItems();
    showSelectionList(selectionItems: ISearchMenuCommand[]);
    dismiss(): void;
    keydown(e: KeyboardEvent): void;
    keypress(e: KeyboardEvent): boolean;
    getSearchString(): string;
    getSelectedKey(): string;
    getSelectedItem(): ISearchMenuCommand;
    updateText();
}

export interface IInputBox {
    elm: HTMLDivElement;
    setPrefixText(text: string): void;
    setText(text: string): void;
    getText(): string;
    initCursor(y: number);
    keydown(e: KeyboardEvent);
    keypress(e: KeyboardEvent);
}

export function inputBoxCreate(onsubmit: (s: string) => void,
    onchanged: (s: string) => void) {
    const elm = document.createElement("div");
    const readOnlySpan = document.createElement("span");
    elm.appendChild(readOnlySpan);
    const span = document.createElement("span");
    elm.appendChild(span);
    let cursor: Cursor;

    return {
        elm,
        getText,
        initCursor,
        keydown,
        keypress,
        setPrefixText,
        setText,
    } as IInputBox;

    function adjustCursorX() {
        const computedStyle = getComputedStyle(elm);
        const fontstr = computedStyle.font;
        const text = span.innerText.substring(0, cursor.pos);
        const w = Math.round(domutils.getTextWidth(text, fontstr));
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
        const lineHeight = domutils.getTextHeight(elm);
        cursor = new Cursor(elm);
        cursor.assignToLine(0, lineHeight - y, elm);
        // cursor.editSpan.style.top=`${y}px`;
        cursor.scope();
    }

    function setText(text: string) {
        span.innerText = text;
    }

    function setPrefixText(text: string) {
        readOnlySpan.innerText = text;
    }

    function getText() {
        return span.innerText;
    }
}

interface IParameterState {
    paramCmd: ISearchMenuCommand;
    // represents parameters already satisfied; length of params is index of current parameter
    params: string[];
}

// TODO: make generic in context type
export function searchBoxCreate(context: any, boundingElm: HTMLElement,
    cmdTree: MergeTree.TST<ISearchMenuCommand>,
    foldCase = true,
    cmdParser?: (searchString: string, cmd?: ISearchMenuCommand) => void): ISearchBox {
    const container = document.createElement("div");
    const inputElmHeight = 32;
    const itemHeight = 24;
    let inputElm: HTMLElement;
    let inputBox: IInputBox;
    let selectionListBox: ISelectionListBox;
    let paramState: IParameterState;

    init();

    return {
        dismiss,
        getSearchString,
        getSelectedItem,
        getSelectedKey,
        keydown,
        keypress,
        showAllItems,
        showSelectionList,
        updateText,
    };

    function showSelectionList(items: ISearchMenuCommand[], prefix = "", suffix = "") {
        if (selectionListBox) {
            selectionListBox.setItemTextPrefix(prefix);
            selectionListBox.setItemTextSuffix(suffix);
            selectionListBox.showSelectionList(items);
        }
    }

    function showAllItems() {
        const items = [] as ISearchMenuCommand[];
        cmdTree.map((k, v) => items.push(v));
        if (items.length > 0) {
            showSelectionList(items);
            if (selectionListBox) {
                showListContainer(selectionListBox.items().length === 0);
            }
        }
    }

    function lookup(text: string) {
        let prefix = text;
        if (foldCase) {
            prefix = prefix.toLowerCase();
        }
        if (paramState) {
            const paramIndex = paramState.params.length;
            const paramCmd = paramState.paramCmd;
            const param = paramCmd.parameters[paramIndex];
            const paramCmdTree = param.values(context);
            const items = paramCmdTree.pairsWithPrefix(prefix).map((res) => {
                return res.val;
            });
            let suffix = "";
            for (let i = paramIndex + 1; i < paramCmd.parameters.length; i++) {
                const ithParam = paramCmd.parameters[i];
                suffix += ` ${ithParam.name}: ${ithParam.defaultValue(context)}`;
            }
            showSelectionList(items, `${paramState.paramCmd.key} `, suffix);
        } else {
            const items = cmdTree.pairsWithPrefix(prefix).map((res) => {
                return res.val;
            }).filter((cmd) => {
                return (!cmd.enabled) || cmd.enabled(context);
            });
            showSelectionList(items);
        }
    }

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

    // TODO: check param state already shows in parameter
    function onTAB(shift: boolean) {
        const cmd = getSelectedItem();
        if (cmd) {
            if (paramState) {
                paramState.params.push(cmd.key);
                const paramIndex = paramState.params.length;
                if (paramIndex < paramState.paramCmd.parameters.length) {
                    const paramName = paramState.paramCmd.parameters[paramIndex].name + ": ";
                    inputBox.setPrefixText(paramName);
                }
            } else {
                if (cmd.parameters) {
                    paramState = { paramCmd: cmd, params: [] };
                }
            }
        } else {
            if (cmdParser) {
                cmdParser(getSearchString(), cmd);
            }
        }
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
        } else if (e.keyCode === KeyCode.TAB) {
            onTAB(e.shiftKey);
        } else {
            textSegKeydown(e);
        }
    }

    function textSegKeydown(e: KeyboardEvent) {
        inputBox.keydown(e);
    }

    // TODO: change exec to take parameters if any

    function keypress(e: KeyboardEvent) {
        if (e.charCode === CharacterCodes.cr) {
            let cmd: ISearchMenuCommand;
            let params = [] as string[];
            if (paramState) {
                cmd = paramState.paramCmd;
                params = paramState.params;
            } else {
                cmd = getSelectedItem();
            }
            // If the searchbox successfully resolved to a simple command, execute it.
            if (cmd && cmd.exec) {
                cmd.exec(cmd, params, context);
            } else {
                if (cmdParser) {
                    cmdParser(getSearchString(), cmd);
                }
            }
            return true;
        } else if (e.charCode >= 32) {
            inputBox.keypress(e);
            return false;
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
            lookup(text);
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
