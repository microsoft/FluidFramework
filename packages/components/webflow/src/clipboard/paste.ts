/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "../document";
import { Tag } from "../util/tag";
import { debug } from "./debug";

const enum ClipboardFormat {
    html = "text/html",
    text = "text/text",
}

export function paste(doc: FlowDocument, data: DataTransfer, position: number) {
    let content: string;

    // tslint:disable-next-line:no-conditional-assignment
    if (content = data.getData(ClipboardFormat.html)) {
        debug("paste('text/html'): %s", content);
        const root = document.createElement("span");
        // tslint:disable-next-line:no-inner-html
        root.innerHTML = content;
        pasteChildren(doc, root, position);
    // tslint:disable-next-line:no-conditional-assignment
    } else if (content = data.getData(ClipboardFormat.html)) {
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
                const emitTag = ignoredTags.indexOf(tag) < 0;
                if (emitTag) {
                    doc.insertTags([tag as Tag], position);
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
