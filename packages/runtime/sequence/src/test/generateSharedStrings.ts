/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Snapshot } from "@prague/merge-tree";
import * as mocks from "@prague/runtime-test-utils";
import { SharedString } from "../sharedString";

export function* generateStrings() {
    const documentId = "fakeId";
    const runtime: mocks.MockRuntime = new mocks.MockRuntime();
    const insertText = "text";

    let sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // small enough so snapshot won't have body
    for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) / 2; ++i) {
        sharedString.insertText(0, `${insertText}${i}`);
    }

    yield sharedString;

    sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // big enough that snapshot will have body
    for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
        sharedString.insertText(0, `${insertText}${i}`);
    }

    yield sharedString;

    sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // very big sharedString
    for (let i = 0; i < Snapshot.sizeOfFirstChunk; ++i) {
        sharedString.insertText(0, `${insertText}-${i}`);
    }

    yield sharedString;

    sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // sharedString with markers
    for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
        sharedString.insertText(0, `${insertText}${i}`);
    }
    for (let i = 0; i < sharedString.getLength(); i += 70) {
        sharedString.insertMarker(i, 1, {
            ItemType: "Paragraph",
            Properties: {Bold: false},
            markerId: `marker${i}`,
            referenceTileLabels: ["Eop"],
        });
    }

    yield sharedString;

    sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // sharedString with annotations
    for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
        sharedString.insertText(0, `${insertText}${i}`);
    }
    for (let i = 0; i < sharedString.getLength(); i += 70) {
       sharedString.annotateRange(i, i + 10, {bold: true});
    }

    yield sharedString;
}
