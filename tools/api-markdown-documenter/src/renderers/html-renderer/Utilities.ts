/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentWriter } from "../DocumentWriter";

/**
 * Renders an HTML anchor for the given ID.
 */
export function renderAnchor(anchorId: string, writer: DocumentWriter): void {
	writer.writeLine(`<a name="${anchorId}" />`);
}
