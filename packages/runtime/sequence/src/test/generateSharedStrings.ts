/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SnapshotLegacy } from "@microsoft/fluid-merge-tree";
import * as mocks from "@microsoft/fluid-test-runtime-utils";
import { SharedString } from "../sharedString";

// TODO: Remove 'newFormat' arg once new snapshot format is adopted as default.
//       (See https://github.com/microsoft/FluidFramework/issues/84)
export function* generateStrings(newFormat: boolean) {
    const documentId = "fakeId";
    const runtime: mocks.MockRuntime = new mocks.MockRuntime();
    if (newFormat) {
        runtime.options.newMergeTreeSnapshotFormat = newFormat;
    }
    const insertText = "text";

    let sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // small enough so snapshot won't have body
    for (let i = 0; i < (SnapshotLegacy.sizeOfFirstChunk / insertText.length) / 2; ++i) {
        sharedString.insertText(0, `${insertText}${i}`);
    }

    yield sharedString;

    sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // big enough that snapshot will have body
    for (let i = 0; i < (SnapshotLegacy.sizeOfFirstChunk / insertText.length) * 2; ++i) {
        sharedString.insertText(0, `${insertText}${i}`);
    }

    yield sharedString;

    sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // very big sharedString
    for (let i = 0; i < SnapshotLegacy.sizeOfFirstChunk; ++i) {
        sharedString.insertText(0, `${insertText}-${i}`);
    }

    yield sharedString;

    sharedString = new SharedString(runtime, documentId);
    sharedString.initializeLocal();
    // sharedString with markers
    for (let i = 0; i < (SnapshotLegacy.sizeOfFirstChunk / insertText.length) * 2; ++i) {
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
    for (let i = 0; i < (SnapshotLegacy.sizeOfFirstChunk / insertText.length) * 2; ++i) {
        sharedString.insertText(0, `${insertText}${i}`);
    }
    for (let i = 0; i < sharedString.getLength(); i += 70) {
       sharedString.annotateRange(i, i + 10, {bold: true});
    }

    yield sharedString;
}
