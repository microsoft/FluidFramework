/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { assert } from "@fluidframework/common-utils";
import { FileStorageDocumentName } from "@fluidframework/file-driver";
import { TreeEntry } from "@fluidframework/protocol-definitions";
import {
    IFileSnapshot,
    StaticStorageDocumentServiceFactory,
} from "@fluidframework/replay-driver";
import { compareWithReferenceSnapshot, getNormalizedFileSnapshot, loadContainer } from "@fluid-internal/replay-tool";
import { SnapshotStorageService } from "./snapshotStorageService";

const metadataBlobName = ".metadata";

/**
 * Validates snapshots in the source directory with corresponding snapshots in the destination directory:
 * - Loads a new container with each snapshot in `srcDir`.
 * - Snapshots the continer and validates that the snapshot matches with the corresponding snapshot in `destDir`.
 * @param srcDir - The directory containing source snapshots that are to be loaded and validated.
 * @param destDir - The directory containing destination snapshots against which the above snaphost are validated.
 * @param seqToTimestamp - A map of sequence number to timestamp for the messages in this container.
 */
export async function validateSnapshots(srcDir: string, destDir: string, seqToTimestamp: Map<number, number>) {
    const errors: string[] = [];
    // Error handler that reports errors if any while validation.
    const reportError = (description: string, error?: any) => {
        let errorString: string;
        if (error === undefined) {
            errorString = description;
        } else if (error instanceof Error) {
            errorString = `${description}\n${error.stack}`;
        } else {
            errorString = `${description} ${error}`;
        }

        errors.push(errorString);
        const errorsToReport = 5;
        if (errors.length <= errorsToReport) {
            console.error(errorString);
        } else if (errors.length === errorsToReport + 1) {
            console.error("\n!!! Too many errors - stopped reporting errors !!!");
        }
    };

    for (const file of fs.readdirSync(srcDir, { withFileTypes: true })) {
        // Don't process sub-directories or files that do not start with "snapshot_" as these are not supported.
        if (file.isDirectory() || !file.name.startsWith("snapshot_")) {
            continue;
        }

        // We must have a corresponding destination snapshot for the source snapshot.
        assert(fs.existsSync(`${destDir}/${file.name}`), `Destination snapshot does not exist for ${file.name}`);

        const snapshotFileName = file.name.split(".")[0];
        const srcContent = fs.readFileSync(`${srcDir}/${file.name}`, "utf-8");
        // This function will be called by the storage service when the container is snapshotted. When that happens,
        // validate that snapshot with the destination snapshot.
        const onSnapshotCb =
            (snapshot: IFileSnapshot) => compareWithReferenceSnapshot(
                getNormalizedFileSnapshot(addSummaryTimestamp(snapshot, seqToTimestamp)),
                `${destDir}/${snapshotFileName}`,
                reportError,
            );
        const storage = new SnapshotStorageService(JSON.parse(srcContent) as IFileSnapshot, onSnapshotCb);
        const container = await loadContainer(
            new StaticStorageDocumentServiceFactory(storage),
            FileStorageDocumentName,
        );
        await container.snapshot(file.name, true /* fullTree */);
    }

    if (errors.length !== 0) {
        throw new Error(`\nErrors while validating source snapshots in ${srcDir}\n ${errors.join("\n")}`);
    }
}

/**
 * Add summary timestamp to the ".metadata" blob of older snapshots that did not have timestamps in summary. The summary
 * timestamp is the timestamp of the last message processed while generating summary. However, in the back compat tests,
 * we do not process any messages before summarizing, so the summary timestamp will be undefined. Use the timestamp of
 * the last message that the summary contains as the summary timestamp.
 */
function addSummaryTimestamp(snapshot: IFileSnapshot, seqToTimestamp: Map<number, number>): IFileSnapshot {
    const treeEntries = snapshot.tree.entries;
    for (const entry of treeEntries) {
        if (entry.path === metadataBlobName && entry.type === TreeEntry.Blob) {
            const metadata = JSON.parse(entry.value.contents);
            if (metadata.timestamp === undefined) {
                metadata.timestamp = seqToTimestamp.get(metadata.sequenceNumber);
            }
            entry.value.contents = JSON.stringify(metadata);
        }
    }
    return snapshot;
}
