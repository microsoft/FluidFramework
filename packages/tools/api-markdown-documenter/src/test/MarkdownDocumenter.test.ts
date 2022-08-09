import { CustomMarkdownEmitter } from "@microsoft/api-documenter/lib/markdown/CustomMarkdownEmitter";
import { ApiModel } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";
import * as Path from "path";

import { MarkdownDocument } from "../MarkdownDocument";
import { getDocumentItems, renderDocuments, renderFiles } from "../MarkdownDocumenter";
import { markdownDocumenterConfigurationWithDefaults } from "../MarkdownDocumenterConfiguration";

/**
 * Temp directory under which
 */
const testTempDirPath = Path.resolve(__dirname, "test_temp");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to dist/test.
 */
const snapshotsDirPath = Path.resolve(__dirname, "..", "..", "src", "test", "snapshots");

describe("api-markdown-documenter simple suite tests", async () => {
    const apiReportPath = Path.resolve(__dirname, "test-data", "simple-suite-test.json");
    const outputDirPath = Path.resolve(testTempDirPath, "simple-suite-test");
    const snapshotDirPath = Path.resolve(snapshotsDirPath, "simple-suite-test");

    let apiModel: ApiModel;
    before(async () => {
        // Clear any existing test_temp data
        await FileSystem.ensureEmptyFolderAsync(testTempDirPath);

        apiModel = new ApiModel();
        apiModel.loadPackage(apiReportPath);
    });

    it("Ensure no duplicate file paths", () => {
        const documents = renderDocuments(
            apiModel!,
            {
                uriRoot: "",
            },
            new CustomMarkdownEmitter(apiModel),
        );

        const pathMap = new Map<string, MarkdownDocument>();
        for (const document of documents) {
            if (pathMap.has(document.path)) {
                expect.fail(
                    `Rendering generated multiple documents to be rendered to the same file path: "${
                        document.path
                    }". Requested by the following items: "${document.apiItemName}" & "${
                        pathMap.get(document.path)!.apiItemName
                    }".`,
                );
            } else {
                pathMap.set(document.path, document);
            }
        }
    });

    /**
     * Simple integration test that validates complete output from simple test package
     */
    it("Compare sample suite against expected", async () => {
        await renderFiles(
            apiModel!,
            outputDirPath,
            {
                uriRoot: "",
            },
            new CustomMarkdownEmitter(apiModel),
        );

        // TODO: There appears to be some unawaited async code somewhere in the markdown documenter.
        // This timeout seems to be sufficient to wait for the process to complete before validating
        // its output.
        // But since the code is not annotated as being async, this should probably be considered a bug.
        // setTimeout(() => {}, 1000);

        // Verify against expected contents
        const result = await compare(outputDirPath, snapshotDirPath, { compareContent: true });

        if (!result.same) {
            await FileSystem.ensureEmptyFolderAsync(snapshotDirPath);
            await FileSystem.copyFilesAsync({
                sourcePath: outputDirPath,
                destinationPath: snapshotDirPath,
            });
        }

        // If this fails, then the docs build has generated new content.
        // View the diff in git and determine if the changes are appropriate or not.
        expect(result.same).to.be.true;
    });
});
