/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "../document/index.js";
import { TagName } from "../util/index.js";
import { debug } from "./debug.js";

const enum ClipboardFormat {
	html = "text/html",
	text = "text/text",
}

export function paste(doc: FlowDocument, data: DataTransfer, position: number) {
	let content: string;

	/* eslint-disable no-cond-assign */
	if ((content = data.getData(ClipboardFormat.html))) {
		debug("paste('text/html'): %s", content);
		const root = document.createElement("span");
		root.innerHTML = content;
		pasteChildren(doc, root, position);
		// TODO: fix this bug
		// eslint-disable-next-line no-dupe-else-if
	} else if ((content = data.getData(ClipboardFormat.html))) {
		debug("paste('text/plain'): %s", content);
		doc.insertText(position, content);
	} else {
		debug("paste(%o): Unhandled clipboard type", data.types);
	}
	/* eslint-enable no-cond-assign */
}

const ignoredTags = [TagName.meta];

function pasteChildren(doc: FlowDocument, root: Node, position: number) {
	let _position = position;

	for (let child: Node | null = root.firstChild; child !== null; child = child.nextSibling) {
		switch (child.nodeType) {
			case document.TEXT_NODE: {
				const text = child as Text;
				doc.insertText(_position, text.textContent);
				_position += text.textContent.length;
				break;
			}
			case document.ELEMENT_NODE: {
				const el = child as HTMLElement;
				const tag = el.tagName as TagName;
				const emitTag = !ignoredTags.includes(tag);
				if (emitTag) {
					doc.setAttr(
						_position,
						_position + 1,
						[...el.attributes].reduce((accumulator, value) => {
							accumulator[value.name] = value.textContent;
							return accumulator;
						}, {}),
					);
					doc.setCssStyle(_position, _position + 1, el.style.cssText);
					_position++;
				}
				_position = pasteChildren(doc, el, _position);
				if (emitTag) {
					_position++;
				}
				break;
			}
			default:
		}
	}

	return _position;
}
