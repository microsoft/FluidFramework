/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "../document";
import { Tag } from "../util/tag";
import { debug } from "./debug";

export const enum ClipboardFormat {
    html = "text/html",
    text = "text/plain",
}

export function paste(doc: FlowDocument, data: DataTransfer, position: number) {
    let content: string;

    // eslint-disable-next-line no-cond-assign
    if (content = data.getData(ClipboardFormat.html)) {
        debug("paste('text/html'): %s", content);
        const root = document.createElement("span");
        root.innerHTML = content;
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        pasteChildren(doc, root, position);
        // eslint-disable-next-line no-cond-assign
    } else if (content = data.getData(ClipboardFormat.text)) {
        debug("paste('text/plain'): %s", content);
        doc.insertText(position, content);
    } else {
        debug("paste(%o): Unhandled clipboard type", data.types);
    }
}

const ignoredTags = [Tag.meta];

function pasteChildren(doc: FlowDocument, root: Node, position: number) {
    for (let child: Node | null = root.firstChild; child !== null; child = child.nextSibling) {
        switch (child.nodeType) {
            case document.TEXT_NODE: {
                const text = child as Text;
                doc.insertText(position, text.textContent);
                position += text.textContent.length;
                break;
            }
            case document.ELEMENT_NODE: {
                const el = child as HTMLElement;
                const tag = el.tagName as Tag;
                const emitTag = !ignoredTags.includes(tag);
                if (emitTag) {
                    doc.insertTags([tag], position);
                    doc.setAttr(position, position + 1,
                        [...el.attributes].reduce(
                            (accumulator, value) => {
                                accumulator[value.name] = value.textContent;
                                return accumulator;
                            }, {}));
                    doc.setCssStyle(position, position + 1, el.style.cssText);
                    position++;
                }
                position = pasteChildren(doc, el, position);
                if (emitTag) {
                    position++;
                }
                break;
            }
            default:
        }
    }
    return position;
}
