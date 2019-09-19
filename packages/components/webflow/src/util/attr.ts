/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { areStringsEquivalent } from "@fluid-example/flow-util-lib";
import { ISegment } from "@microsoft/fluid-merge-tree";
import { emptyObject } from "./";

export interface IHTMLAttributes {
    src?: string;
}

export function getAttrs(segment: ISegment): Readonly<IHTMLAttributes> {
    const properties = segment.properties;
    return (properties && properties.attr) || emptyObject;
}

export function syncAttrs(element: HTMLElement, attrs: IHTMLAttributes) {
    // Remove any attributes not in attrs
    for (const name of element.getAttributeNames()) {
        if (!(name in attrs)) {
            element.removeAttribute(name);
        }
    }

    // Ensure attributes have value specified in attrs
    for (const [name, value] of Object.entries(attrs)) {
        if (!areStringsEquivalent(value, element.getAttribute(name))) {
            element.setAttribute(name, value);
        }
    }
}
