/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ICaretBounds, ICaretEvent, CaretEventType, caretEnter, caretLeave } from "./caret.js";
export { ICommand } from "./command.js";
export {
	Direction,
	getDeltaX,
	getDeltaY,
	getTabDirection,
	TabDirection,
} from "./direction.js";
export { Dom } from "./dom.js";
export { KeyCode } from "./keycode.js";
export { randomId } from "./random.js";
export { IRect, Rect } from "./rect.js";
export { getSegmentRange } from "./segment.js";
export { areStringsEquivalent } from "./string.js";
export { hasTagName, isElementNode, isTextNode, TagName } from "./tagName.js";
export { findToken, TokenList } from "./tokenlist.js";

export const done = Promise.resolve();
export const emptyObject = Object.freeze({});
export const emptyArray = Object.freeze([] as any[]);

export const clamp = (min: number, value: number, max: number) =>
	Math.min(Math.max(min, value), max);
