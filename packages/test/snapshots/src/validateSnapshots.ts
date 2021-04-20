/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { assert } from "@fluidframework/common-utils";
import { FileStorageDocumentName } from "@fluidframework/file-driver";
import {
    IFileSnapshot,
    StaticStorageDocumentServiceFactory,
} from "@fluidframework/replay-driver";
import { compareWithReferenceSnapshot, getNormalizedFileSnapshot, loadContainer } from "@fluid-internal/replay-tool";
import { SnapshotStorageService } from "./snapshotStorageService";

/**
 * Validates snapshots in the source directory with corresponding snapshots in the destination directory:
 * - Loads a new container with each snapshot in `srcDir`.
 * - Snapshots the continer and validates that the snapshot matches with the corresponding snapshot in `destDir`.
 * @param srcDir - The directory containing source snapshots that are to be loaded and validated.
 * @param destDir - The directory containing destination snapshots against which the above snaphost are validated.
 */
export async function validateSnapshots(srcDir: string, destDir: string) {
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
                getNormalizedFileSnapshot(snapshot),
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
