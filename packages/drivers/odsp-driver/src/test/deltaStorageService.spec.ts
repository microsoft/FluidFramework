/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { OdspDeltaStorageService } from "../odspDeltaStorageService";
import { LocalPersistentCache } from "../odspCache";
import { EpochTracker } from "../epochTracker";
import { mockFetchOk } from "./mockFetch";

const createUtLocalCache = () => new LocalPersistentCache(2000);
const createUtEpochTracker = (fileEntry, logger) => new EpochTracker(createUtLocalCache(), fileEntry, logger);

describe("DeltaStorageService", () => {
    /*
     * Use fake urls so we don't accidental make real calls that make our tests flakey.
     * Using microsoft.com as the domain so we don't send traffic somewhere hostile on accident.
     */
    const deltaStorageBasePath = "https://fake.microsoft.com";
    const deltaStorageRelativePath = "/drives/testdrive/items/testitem/opStream";
    const testDeltaStorageUrl = `${deltaStorageBasePath}${deltaStorageRelativePath}`;
    let resolvedUrl: IOdspResolvedUrl | undefined;
    const fileEntry = { docId: "docId", resolvedUrl: resolvedUrl! };

    it("Should build the correct sharepoint delta url with auth", async () => {
        const logger = new TelemetryUTLogger();
        const deltaStorageService = new OdspDeltaStorageService(
            testDeltaStorageUrl,
            async (_refresh) => "?access_token=123",
            createUtEpochTracker(fileEntry, logger),
            logger);
        const actualDeltaUrl = deltaStorageService.buildUrl(3, 8);
        // eslint-disable-next-line max-len
        const expectedDeltaUrl = `${deltaStorageBasePath}/drives/testdrive/items/testitem/opStream?ump=1&filter=sequenceNumber%20ge%203%20and%20sequenceNumber%20le%207`;
        assert.equal(actualDeltaUrl, expectedDeltaUrl, "The constructed delta url is invalid");
    });

    describe("Get Returns Response With Op Envelope", () => {
        const expectedDeltaFeedResponse: any = {
            value: [
                {
                    op: {
                        clientId: "present-place",
                        clientSequenceNumber: 71,
                        contents: null,
                        minimumSequenceNumber: 1,
                        referenceSequenceNumber: 1,
                        sequenceNumber: 1,
                        text: "",
                        user: {
                            id: "Unruffled Bose",
                        },
                    },
                    sequenceNumber: 1,
                },
                {
                    op: {
                        clientId: "present-place",
                        clientSequenceNumber: 71,
                        contents: null,
                        minimumSequenceNumber: 1,
                        referenceSequenceNumber: 1,
                        sequenceNumber: 2,
                        type: "noop",
                        user: {
                            id: "Unruffled Bose",
                        },
                    },
                    sequenceNumber: 2,
                },
            ],
        };

        let deltaStorageService: OdspDeltaStorageService;
        before(() => {
            const logger = new TelemetryUTLogger();
            deltaStorageService = new OdspDeltaStorageService(
                testDeltaStorageUrl,
                async (_refresh) => "",
                createUtEpochTracker(fileEntry, logger),
                logger);
        });

        it("Should deserialize the delta feed response correctly", async () => {
            const { messages, partialResult } = await mockFetchOk(
                async () => deltaStorageService.get(2, 8, {}),
                expectedDeltaFeedResponse,
            );
            assert(!partialResult, "partialResult === false");
            assert.equal(messages.length, 2, "Deserialized feed response is not of expected length");
            assert.equal(messages[0].sequenceNumber, 1,
                "First element of feed response has invalid sequence number");
            assert.equal(messages[1].sequenceNumber, 2,
                "Second element of feed response has invalid sequence number");
            assert.equal(messages[1].type, "noop",
                "Second element of feed response has invalid op type");
        });
    });

    describe("Get Returns Response With Op Envelope", () => {
        const expectedDeltaFeedResponse: any = {
            value: [
                {
                    clientId: "present-place",
                    clientSequenceNumber: 71,
                    contents: null,
                    minimumSequenceNumber: 1,
                    referenceSequenceNumber: 1,
                    sequenceNumber: 1,
                    text: "",
                    user: {
                        id: "Unruffled Bose",
                    },
                },
                {
                    clientId: "present-place",
                    clientSequenceNumber: 71,
                    contents: null,
                    minimumSequenceNumber: 1,
                    referenceSequenceNumber: 1,
                    sequenceNumber: 2,
                    type: "noop",
                    user: {
                        id: "Unruffled Bose",
                    },
                },
            ],
        };

        let deltaStorageService: OdspDeltaStorageService;
        before(() => {
            const logger = new TelemetryUTLogger();
            deltaStorageService = new OdspDeltaStorageService(
                testDeltaStorageUrl,
                async (_refresh) => "",
                createUtEpochTracker(fileEntry, logger),
                logger);
        });

        it("Should deserialize the delta feed response correctly", async () => {
            const { messages, partialResult } = await mockFetchOk(
                async () => deltaStorageService.get(2, 8, {}),
                expectedDeltaFeedResponse,
            );
            assert(!partialResult, "partialResult === false");
            assert.equal(messages.length, 2, "Deserialized feed response is not of expected length");
            assert.equal(messages[0].sequenceNumber, 1,
                "First element of feed response has invalid sequence number");
            assert.equal(messages[1].sequenceNumber, 2,
                "Second element of feed response has invalid sequence number");
            assert.equal(messages[1].type, "noop",
                "Second element of feed response has invalid op type");
        });
    });
});
