/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@fluidframework/sequence";
import { areStringsEquivalent } from "./string.js";
import { emptyObject } from "./index.js";

export interface IHTMLAttributes {
	src?: string;
}

export function getAttrs(segment: ISegment): Readonly<IHTMLAttributes> {
	const properties = segment.properties;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return properties?.attr || emptyObject;
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
