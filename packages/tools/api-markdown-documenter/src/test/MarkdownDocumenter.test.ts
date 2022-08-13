/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiModel } from "@microsoft/api-extractor-model";
import { FileSystem } from "@rushstack/node-core-library";
import { expect } from "chai";
import { compare } from "dir-compare";
import { Suite } from "mocha";
import * as Path from "path";

import { MarkdownDocument } from "../MarkdownDocument";
import { renderDocuments, renderFiles } from "../MarkdownDocumenter";
import {
    MarkdownDocumenterConfiguration,
    markdownDocumenterConfigurationWithDefaults,
} from "../MarkdownDocumenterConfiguration";
import { MarkdownEmitter } from "../MarkdownEmitter";
import { renderModelPage, renderPackagePage } from "../rendering";

// TODOs:
// - Test array of sample configurations

/**
 * Temp directory under which
 */
const testTempDirPath = Path.resolve(__dirname, "test_temp");

/**
 * Snapshot directory to which generated test data will be copied.
 * Relative to dist/test.
 */
const snapshotsDirPath = Path.resolve(__dirname, "..", "..", "src", "test", "snapshots");

/**
 * Simple integration test that validates complete output from simple test package
 */
async function snapshotTest(
    relativeSnapshotDirectoryPath: string,
    config: MarkdownDocumenterConfiguration,
): Promise<void> {
    const outputDirPath = Path.resolve(testTempDirPath, relativeSnapshotDirectoryPath);
    const snapshotDirPath = Path.resolve(snapshotsDirPath, relativeSnapshotDirectoryPath);

    await renderFiles(config, outputDirPath, new MarkdownEmitter(config.apiModel));

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
}

function apiTestSuite(
    packageName: string,
    apiReportFilePath: string,
    configLessApiModel: Omit<MarkdownDocumenterConfiguration, "apiModel">,
): Suite {
    return describe(packageName, async () => {
        let config: Required<MarkdownDocumenterConfiguration>;
        before(async () => {
            // Clear any existing test_temp data
            await FileSystem.ensureEmptyFolderAsync(testTempDirPath);

            const apiModel = new ApiModel();
            apiModel.loadPackage(apiReportFilePath);

            config = markdownDocumenterConfigurationWithDefaults({
                ...configLessApiModel,
                apiModel,
            });
        });

        it("Render Model page (smoke test)", () => {
            const result = renderModelPage(config.apiModel, config);
            expect(result.path).to.equal("index.md"); // TODO: make this configurable
        });

        it("Render Package page (smoke test)", () => {
            const packageItem = config.apiModel.packages[0];

            const result = renderPackagePage(packageItem, config);
            expect(result.path).to.equal(`${packageName}.md`);
        });

        it("Ensure no duplicate file paths", () => {
            const documents = renderDocuments(config);

            const pathMap = new Map<string, MarkdownDocument>();
            for (const document of documents) {
                if (pathMap.has(document.path)) {
                    expect.fail(
                        `Rendering generated multiple documents to be rendered to the same file path: "${
                            document.path
                        }". Requested by the following items: "${
                            document.apiItem.displayName
                        }" & "${pathMap.get(document.path)!.apiItem.displayName}".`,
                    );
                } else {
                    pathMap.set(document.path, document);
                }
            }
        });

        // TODO: by config
        it("Snapshot test", async () => {
            await snapshotTest(packageName, config);
        });
    });
}

describe("api-markdown-documenter full-suite tests", () => {
    // Run the test suite against a sample report
    apiTestSuite(
        "simple-suite-test",
        // Relative to dist/test
        Path.resolve(__dirname, "test-data", "simple-suite-test.json"),
        {
            uriRoot: "docs",
        },
    );

    // Run the test suite against this package's own report
    apiTestSuite(
        "api-markdown-documenter",
        // Relative to dist/test
        Path.resolve(
            __dirname,
            "..",
            "..",
            "_api-extractor-temp",
            "doc-models",
            "api-markdown-documenter.api.json",
        ),
        {
            uriRoot: "docs",
        },
    );
});
