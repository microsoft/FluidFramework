/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "../../document";

export async function importDoc(doc: FlowDocument, file: string) {
    const response = await fetch(`https://www.wu2.prague.office-int.com/public/literature/${file}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            const lines = decoder.decode(value).split(/\r?\n/);
            for (const paragraph of lines) {
                doc.insertText(doc.length, paragraph);
                doc.insertParagraph(doc.length);
            }
        }
    } finally {
        reader.releaseLock();
    }
}
