/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { strict as assert } from "assert";
import { DriverErrorType, IStream } from "@fluidframework/driver-definitions";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import {
    IClient,
    ISequencedDocumentMessage,
    SummaryType,
} from "@fluidframework/protocol-definitions";
import { MockLogger } from "@fluidframework/telemetry-utils";
/* eslint-disable import/no-internal-modules */
import { LocalOdspDocumentServiceFactory } from "../localOdspDriver/localOdspDocumentServiceFactory";
import { LocalOdspDocumentService } from "../localOdspDriver/localOdspDocumentService";
import { LocalOdspDocumentStorageService } from "../localOdspDriver/localOdspDocumentStorageManager";
/* eslint-enable import/no-internal-modules */

describe("Local Odsp driver", () => {
    // TODO: add end-to-end test

    const fakeOdspResolvedUrl: IOdspResolvedUrl = {
        type: "fluid",
        odspResolvedUrl: true,
        id: "1",
        siteUrl: "fakeUrl",
        driveId: "1",
        itemId: "1",
        url: "fakeUrl",
        hashedDocumentId: "1",
        endpoints: {
            snapshotStorageUrl: "fakeUrl",
            attachmentPOSTStorageUrl: "fakeUrl",
            attachmentGETStorageUrl: "fakeUrl",
            deltaStorageUrl: "fakeUrl",
        },
        tokens: {},
        fileName: "fakeName",
        summarizer: false,
        fileVersion: "1",
    };

    const localSnapshot = fs.readFileSync(
        `${__dirname}/../../src/test/localSnapshots/localSnapshot1.json`,
        { encoding: "utf8" },
    );

    async function assertThrowsUsageError(fn: () => Promise<any>) {
        await assert.rejects(fn, (e) => e.errorType === DriverErrorType.usageError);
    }

    describe("Local Odsp document service factory", () => {
        it("Can use a real snapshot", () => {
            assert.doesNotThrow(() => new LocalOdspDocumentServiceFactory(localSnapshot));
        });

        it("Protocol name is correct", () => {
            assert.strictEqual(new LocalOdspDocumentServiceFactory("sample data").protocolName, "fluid-odsp:");
        });

        it("createContainer throws error", async () => {
            await assertThrowsUsageError(async () => new LocalOdspDocumentServiceFactory("sample data")
                .createContainer(undefined, fakeOdspResolvedUrl));
        });

        describe("createDocumentService", () => {
            it("clientIsSummarizer should be undefined or false", async () => {
                const factory = new LocalOdspDocumentServiceFactory("sample data");
                await assert.doesNotReject(async () => {
                    await factory.createDocumentService(fakeOdspResolvedUrl);
                });
                await assert.doesNotReject(async () => {
                    await factory.createDocumentService(fakeOdspResolvedUrl, undefined, undefined);
                });
                await factory.createDocumentService(fakeOdspResolvedUrl, undefined, false);
                await assert.rejects(async () => {
                    await factory.createDocumentService(fakeOdspResolvedUrl, undefined, true);
                });
            });

            it("resolvedUrl must be IOdspResolvedUrl", async () => {
                const factory = new LocalOdspDocumentServiceFactory("sample data");
                await assert.doesNotReject(async () => factory.createDocumentService(fakeOdspResolvedUrl));
                await assert.rejects(async () => factory.createDocumentService({ type: "web", data: "" }));
            });
        });
    });

    describe("Local Odsp document service", () => {
        async function readAll(stream: IStream<ISequencedDocumentMessage[]>) {
            const ops: ISequencedDocumentMessage[] = [];
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const result = await stream.read();
                if (result.done) { break; }
                ops.push(...result.value);
            }
            return ops;
        }

        it("Can use a real snapshot", () => {
            assert.doesNotThrow(() =>
                new LocalOdspDocumentService(fakeOdspResolvedUrl, new MockLogger(), localSnapshot));
        });

        it("Can get resolvedUrl", () => {
            const resolvedUrl = fakeOdspResolvedUrl;
            const service = new LocalOdspDocumentService(resolvedUrl, new MockLogger(), "sample data");
            assert.strictEqual(service.resolvedUrl, resolvedUrl);
        });

        it("Delta storage service returns no messages", async () => {
            const service = new LocalOdspDocumentService(fakeOdspResolvedUrl, new MockLogger(), "sample data");
            const deltaStorageService = await service.connectToDeltaStorage();

            const allOps = await readAll(deltaStorageService.fetchMessages(1, 2));
            assert.strictEqual(allOps.length, 0, "There should be no messages");
        });

        it("connectToDeltaStream throws error", async () => {
            const mockLogger = new MockLogger();
            const service = new LocalOdspDocumentService(fakeOdspResolvedUrl, mockLogger, "sample data");

            const client: IClient = {
                mode: "read",
                details: { capabilities: { interactive: true } },
                permission: [],
                user: { id: "id" },
                scopes: [],
            };

            await assertThrowsUsageError(async () => service.connectToDeltaStream(client));
            mockLogger.assertMatch([
                { eventName: "UnsupportedUsage" },
            ], "Expected log not present");
        });

        it("Dispose does not throw", () => {
            const service = new LocalOdspDocumentService(fakeOdspResolvedUrl, new MockLogger(), "sample data");
            assert.doesNotThrow(() => service.dispose());
            assert.doesNotThrow(() => service.dispose(null));
            assert.doesNotThrow(() => service.dispose(undefined));
            assert.doesNotThrow(() => service.dispose(new Error("I am an error")));
        });
    });

    describe("Local Odsp document storage service", () => {
        it("Can use a real snapshot", () => {
            assert.doesNotThrow(() => new LocalOdspDocumentStorageService(new MockLogger(), localSnapshot));
        });

        it("uploadSummaryWithContext throws error", async () => {
            const mockLogger = new MockLogger();

            await assertThrowsUsageError(async () =>
                new LocalOdspDocumentStorageService(mockLogger, "sample data").uploadSummaryWithContext(
                    {
                        type: SummaryType.Tree,
                        tree: {},
                    },
                    {
                        proposalHandle: undefined,
                        ackHandle: undefined,
                        referenceSequenceNumber: 1,
                    },
                ));
            mockLogger.assertMatch([
                { eventName: "UnsupportedUsage" },
            ], "Expected log not present");
        });

        it("createBlob throws error", async () => {
            const mockLogger = new MockLogger();
            const storageService = new LocalOdspDocumentStorageService(mockLogger, "sample data");

            await assertThrowsUsageError(async () => storageService.createBlob(new ArrayBuffer(0)));
            mockLogger.assertMatch([
                { eventName: "UnsupportedUsage" },
            ], "Expected log not present");
        });

        describe("getVersions", () => {
            const snapshotVersion = [{ id: "bBwAAAAAHAAAA", treeId: undefined! }];

            it("blobid should always be null", async () => {
                const storageService = new LocalOdspDocumentStorageService(new MockLogger(), localSnapshot);
                await assert.rejects(async () => storageService.getVersions("", 1));
                await assert.rejects(async () => storageService.getVersions("1", 1));
            });

            it("count should always be 1", async () => {
                const storageService = new LocalOdspDocumentStorageService(new MockLogger(), localSnapshot);
                await assert.rejects(async () => storageService.getVersions(null, -1));
                await assert.rejects(async () => storageService.getVersions(null, 0));
                await assert.rejects(async () => storageService.getVersions(null, 2));
            });

            it("Retrieves snapshot version from JSON snapshot", async () => {
                const storageService = new LocalOdspDocumentStorageService(new MockLogger(), localSnapshot);
                assert.deepStrictEqual(
                    await storageService.getVersions(null, 1),
                    snapshotVersion,
                );
            });

            it("Calling multiple times", async () => {
                const storageService = new LocalOdspDocumentStorageService(new MockLogger(), localSnapshot);
                for (let i = 0; i < 3; i++) {
                    assert.deepStrictEqual(
                        await storageService.getVersions(null, 1),
                        snapshotVersion,
                    );
                }
            });
        });
    });
});
