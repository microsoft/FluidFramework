/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@fluidframework/sequence";
import { getCss } from "../document/index.js";
import { areStringsEquivalent } from "../util/index.js";

// Note: Similar to TokenList.set(..), but elides the search for duplicate tokens.
const concat = (leftTokens: string, rightTokens: string) =>
	!rightTokens
		? leftTokens // If right is undefined/empty, just return left
		: !leftTokens
		? rightTokens // If left is undefined/empty, just return right
		: `${leftTokens} ${rightTokens}`; // Otherwise concat left/right;

export interface ICssProps {
	classList?: string;
	style?: string;
}

export function syncCss(element: HTMLElement, { classList, style }: ICssProps, className?: string) {
	const classes = concat(className, classList);

	if (!areStringsEquivalent(classes, element.className)) {
		element.className = classes;
	}
	if (!areStringsEquivalent(style, element.style.cssText)) {
		element.style.cssText = style;
	}
}

export function sameCss(segment: ISegment, { classList, style }: ICssProps) {
	const actual = getCss(segment);
	return (
		areStringsEquivalent(actual.classList, classList) &&
		areStringsEquivalent(actual.style, style)
	);
}
