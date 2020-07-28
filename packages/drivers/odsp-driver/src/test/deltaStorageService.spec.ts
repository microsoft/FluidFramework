/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { OdspDeltaStorageService } from "../odspDeltaStorageService";
import { mockFetch } from "./mockFetch";

describe("DeltaStorageService", () => {
    /*
     * Use fake urls so we don't accidental make real calls that make our tests flakey.
     * Using microsoft.com as the domain so we don't send traffic somewhere hostile on accident.
     */
    const deltaStorageBasePath = "https://fake.microsoft.com";
    const deltaStorageRelativePath = "/drives/testdrive/items/testitem/opStream";
    const testDeltaStorageUrl = `${deltaStorageBasePath}${deltaStorageRelativePath}`;

    it("Should build the correct sharepoint delta url with auth", async () => {
        const deltaStorageService = new OdspDeltaStorageService(async () => testDeltaStorageUrl,
            undefined, async (refresh) => "?access_token=123");
        const actualDeltaUrl = await deltaStorageService.buildUrl(2, 8);
        // eslint-disable-next-line max-len
        const expectedDeltaUrl = `${deltaStorageBasePath}/drives/testdrive/items/testitem/opStream?filter=sequenceNumber%20ge%203%20and%20sequenceNumber%20le%207`;
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
            deltaStorageService = new OdspDeltaStorageService(async () => testDeltaStorageUrl,
                undefined, async (refresh) => "");
        });

        it("Should deserialize the delta feed response correctly", async () => {
            const actualDeltaFeedResponse = await mockFetch(expectedDeltaFeedResponse, async () => {
                return deltaStorageService.get(2, 8);
            });
            assert.equal(actualDeltaFeedResponse.length, 2, "Deserialized feed response is not of expected length");
                assert.equal(actualDeltaFeedResponse[0].sequenceNumber, 1,
                    "First element of feed response has invalid sequence number");
                assert.equal(actualDeltaFeedResponse[1].sequenceNumber, 2,
                    "Second element of feed response has invalid sequence number");
                assert.equal(actualDeltaFeedResponse[1].type, "noop",
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
            deltaStorageService = new OdspDeltaStorageService(async () => testDeltaStorageUrl,
                undefined, async (refresh) => "");
        });

        it("Should deserialize the delta feed response correctly", async () => {
            const actualDeltaFeedResponse = await mockFetch(expectedDeltaFeedResponse, async () => {
                return deltaStorageService.get(2, 8);
            });
            assert.equal(actualDeltaFeedResponse.length, 2, "Deserialized feed response is not of expected length");
            assert.equal(actualDeltaFeedResponse[0].sequenceNumber, 1,
                "First element of feed response has invalid sequence number");
            assert.equal(actualDeltaFeedResponse[1].sequenceNumber, 2,
                "Second element of feed response has invalid sequence number");
            assert.equal(actualDeltaFeedResponse[1].type, "noop",
                "Second element of feed response has invalid op type");
        });
    });
});
