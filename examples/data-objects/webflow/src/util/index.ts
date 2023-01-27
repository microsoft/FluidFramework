/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ICaretBounds, ICaretEvent, CaretEventType, caretEnter, caretLeave } from "./caret";
export { ICommand } from "./command";
export { Direction, getDeltaX, getDeltaY, getTabDirection, TabDirection } from "./direction";
export { Dom } from "./dom";
export { KeyCode } from "./keycode";
export { randomId } from "./random";
export { IRect, Rect } from "./rect";
export { getSegmentRange } from "./segment";
export { areStringsEquivalent } from "./string";
export { hasTagName, isElementNode, isTextNode, TagName } from "./tagName";
export { findToken, TokenList } from "./tokenlist";

export const done = Promise.resolve();
export const emptyObject = Object.freeze({});
export const emptyArray = Object.freeze([] as any[]);

export const clamp = (min: number, value: number, max: number) =>
	Math.min(Math.max(min, value), max);
