/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { areStringsEquivalent } from "@prague/flow-util";
import { ISegment } from "@prague/merge-tree";
import { getCss } from "../../document";

// Note: Similar to TokenList.set(..), but elides the search for duplicate tokens.
function concat(leftTokens: string, rightTokens: string) {
    return !rightTokens
        ? leftTokens                            // If right is undefined/empty, just return left
        : !leftTokens
            ? rightTokens                       // If left is undefined/empty, just return right
            : `${leftTokens} ${rightTokens}`;   // Otherwise concat left/right
}

export function syncCss(element: HTMLElement, { classList, style }: { classList?: string, style?: string }, className?: string) {
    const classes = concat(className, classList);

    if (!areStringsEquivalent(classes, element.className)) {
        element.className = classes;
    }
    if (!areStringsEquivalent(style, element.style.cssText)) {
        element.style.cssText = style;
    }
}

export function sameCss(segment: ISegment, { classList, style }: { classList?: string, style?: string }) {
    const actual = getCss(segment);
    return areStringsEquivalent(actual.classList, classList)
        && areStringsEquivalent(actual.style, style);
}
