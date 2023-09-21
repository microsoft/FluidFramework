/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import type { DocumentWriter } from "../../DocumentWriter";

/**
 * Renders a {@link LineBreakNode} as HTML.
 *
 * @param writer - Writer context object into which the document contents will be written.
 */
export function renderLineBreak(writer: DocumentWriter): void {
	writer.ensureNewLine();
	writer.writeLine("<br>");
}
