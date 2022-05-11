/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SnapshotLegacy as Snapshot } from "@fluidframework/merge-tree";
import Random from "random-js";
import * as mocks from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { IntervalType } from "../intervalCollection";

export const LocationBase: string = "src/test/snapshots/";

export const supportedVersions = new Map<string, any>([
    // the catchUpBlob had to be renamed.
    // We are now support any name for this blob.
    // so for legacy set it to another name to ensure
    // we keep support
    ["legacy", { catchUpBlobName: "randomNameForCatchUpOps" }],
    ["legacyWithCatchUp", {}],
    ["v1", { newMergeTreeSnapshotFormat: true }],
]);

export function* generateStrings(): Generator<[string, SharedString]> {
    for (const [version, options] of supportedVersions) {
        const documentId = "fakeId";
        const dataStoreRuntime: mocks.MockFluidDataStoreRuntime = new mocks.MockFluidDataStoreRuntime();
        const createNewSharedString = (): SharedString => {
            const string = new SharedString(dataStoreRuntime, documentId, SharedStringFactory.Attributes);
            string.initializeLocal();
            return string;
        };

        for (const key of Object.keys(options)) {
            dataStoreRuntime.options[key] = options[key];
        }
        const insertText = "text";

        let sharedString = createNewSharedString();
        // Small enough so snapshot won't have body
        for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) / 2; ++i) {
            sharedString.insertText(0, `${insertText}${i}`);
        }

        yield [`${version}/headerOnly`, sharedString];

        sharedString = createNewSharedString();
        // Big enough that snapshot will have body
        for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
            sharedString.insertText(0, `${insertText}${i}`);
        }

        yield [`${version}/headerAndBody`, sharedString];

        sharedString = createNewSharedString();
        // Very big sharedString
        for (let i = 0; i < Snapshot.sizeOfFirstChunk; ++i) {
            sharedString.insertText(0, `${insertText}-${i}`);
        }

        yield [`${version}/largeBody`, sharedString];

        sharedString = createNewSharedString();
        // SharedString with markers
        for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
            sharedString.insertText(0, `${insertText}${i}`);
        }
        for (let i = 0; i < sharedString.getLength(); i += 70) {
            sharedString.insertMarker(i, 1, {
                ItemType: "Paragraph",
                Properties: { Bold: false },
                markerId: `marker${i}`,
                referenceTileLabels: ["Eop"],
            });
        }

        yield [`${version}/withMarkers`, sharedString];

        sharedString = createNewSharedString();
        // SharedString with annotations
        for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) * 2; ++i) {
            sharedString.insertText(0, `${insertText}${i}`);
        }
        for (let i = 0; i < sharedString.getLength(); i += 70) {
            sharedString.annotateRange(i, i + 10, { bold: true });
        }

        yield [`${version}/withAnnotations`, sharedString];

        sharedString = createNewSharedString();
        // Very big sharedString
        for (let i = 0; i < Snapshot.sizeOfFirstChunk; ++i) {
            sharedString.insertText(0, `${insertText}-${i}`);
        }

        yield [`${version}/largeBody`, sharedString];

        sharedString = createNewSharedString();
        // SharedString with intervals
        for (let i = 0; i < (Snapshot.sizeOfFirstChunk / insertText.length) / 2; i++) {
            sharedString.insertText(0, `${insertText}${i}`);
        }

        const rand = new Random(Random.engines.mt19937().seed(0));
        const collection1 = sharedString.getIntervalCollection("collection1");
        collection1.add(1, 5, IntervalType.SlideOnRemove, { intervalId: rand.uuid4() });

        const collection2 = sharedString.getIntervalCollection("collection2");
        for (let i = 0; i < sharedString.getLength() - 5; i += 100) {
            collection2.add(i, i + 5, IntervalType.SlideOnRemove, { intervalId: rand.uuid4() });
        }

        yield [`${version}/withIntervals`, sharedString];
    }
}
