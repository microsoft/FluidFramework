var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as assert from "assert";
import * as nock from "nock";
import { SharepointDeltaStorageService } from "../deltaStorageService";
describe("SharepointDeltaStorage", () => {
    let spoDeltStorageService;
    const deltaStorageBasePath = "https://msft-my.spoppe.com";
    const deltaStorageRelativePath = "/drives/testdrive/items/testitem/opStream";
    const expectedDeltaFeedResponse = {
        opStream: [
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
    before(() => {
        const testDeltaStorageUrl = `${deltaStorageBasePath}${deltaStorageRelativePath}`;
        spoDeltStorageService = new SharepointDeltaStorageService(testDeltaStorageUrl);
        nock(deltaStorageBasePath)
            .get(deltaStorageRelativePath)
            .query(true)
            .reply(200, expectedDeltaFeedResponse);
    });
    after(() => {
        // clean up the nock's interceptor list and restore back to unmocked behavior for http requests
        nock.cleanAll();
        nock.restore();
    });
    it("Should build the correct sharepoint delta url", () => {
        const actualDeltaUrl = spoDeltStorageService.constructUrl(2, 8);
        // tslint:disable-next-line:max-line-length
        const expectedDeltaUrl = `https://msft-my.spoppe.com/drives/testdrive/items/testitem/opStream?$filter=sequenceNumber%20ge%202%20and%20sequenceNumber%20le%208`;
        assert.equal(actualDeltaUrl, expectedDeltaUrl, "The constructed SPO delta url is invalid");
    });
    it("Should deserialize the delta feed response correctly", () => __awaiter(this, void 0, void 0, function* () {
        const actualDeltaFeedResponse = yield spoDeltStorageService.get(null, null, null, 2, 8);
        assert.equal(actualDeltaFeedResponse.length, 2, "Deseralized feed response is not of expected length");
        assert.equal(actualDeltaFeedResponse[0].sequenceNumber, 1, "First element of feed response has invalid sequence number");
        assert.equal(actualDeltaFeedResponse[1].sequenceNumber, 2, "Second element of feed response has invalid sequence number");
        assert.equal(actualDeltaFeedResponse[1].type, "noop", "Second element of feed response has invalid op type");
    }));
});
//# sourceMappingURL=testSharepointDeltStorage.js.map