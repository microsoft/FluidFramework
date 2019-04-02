// tslint:disable:align
import { CharacterCodes } from "../text";
import * as ui from "../ui";
import { Cursor } from "./cursor";
import * as domutils from "./domutils";
import { KeyCode } from "./keycode";

// tslint:disable-next-line:interface-name
export interface Item {
    key: string;
    div?: HTMLDivElement;
    iconURL?: string;
}

export function namesToItems(names: string[]): Item[] {
    const items: Item[] = new Array(names.length);

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
    showSelectionList(selectionItems: Item[]);
    dismiss(): void;
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
