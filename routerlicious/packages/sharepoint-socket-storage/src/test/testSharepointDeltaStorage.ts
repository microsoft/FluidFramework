import * as assert from "assert";
import * as nock from "nock";
import { SharepointDeltaStorageService } from "../deltaStorageService";

describe("SharepointDeltaStorageService", () => {
  let spoDeltaStorageService: SharepointDeltaStorageService;
  const deltaStorageBasePath: string = "https://msft-my.spoppe.com";
  const deltaStorageRelativePath: string = "/drives/testdrive/items/testitem/opStream";

  const testDeltaStorageUrl: string = "https://msft-my.spoppe.com/drives/testdrive/items/testitem/opStream";
  spoDeltaStorageService = new SharepointDeltaStorageService(testDeltaStorageUrl);

  it("Should build the correct sharepoint delta url", () => {
    const actualDeltaUrl = spoDeltaStorageService.constructUrl(2, 8);
    // tslint:disable-next-line:max-line-length
    const expectedDeltaUrl = `https://msft-my.spoppe.com/drives/testdrive/items/testitem/opStream?$filter=sequenceNumber%20ge%202%20and%20sequenceNumber%20le%208`;
    assert.equal(actualDeltaUrl, expectedDeltaUrl, "The constructed SPO delta url is invalid");
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

      before(() => {
          nock(deltaStorageBasePath)
            .get(deltaStorageRelativePath)
            .query(true)
            .reply(200, expectedDeltaFeedResponse, {"Access-Control-Allow-Origin": "*"});
      });

      it("Should deserialize the delta feed response correctly", async () => {
          const actualDeltaFeedResponse = await spoDeltaStorageService.get(null, null, null, 2, 8);
          assert.equal(actualDeltaFeedResponse.length, 2, "Deseralized feed response is not of expected length");
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

      before(() => {
          nock(deltaStorageBasePath)
            .get(deltaStorageRelativePath)
            .query(true)
            .reply(200, expectedDeltaFeedResponse, {"Access-Control-Allow-Origin": "*"});
      });

      it("Should deserialize the delta feed response correctly", async () => {
          const actualDeltaFeedResponse = await spoDeltaStorageService.get(null, null, null, 2, 8);
          assert.equal(actualDeltaFeedResponse.length, 2, "Deseralized feed response is not of expected length");
          assert.equal(actualDeltaFeedResponse[0].sequenceNumber, 1,
              "First element of feed response has invalid sequence number");
          assert.equal(actualDeltaFeedResponse[1].sequenceNumber, 2,
              "Second element of feed response has invalid sequence number");
          assert.equal(actualDeltaFeedResponse[1].type, "noop",
              "Second element of feed response has invalid op type");
      });
    });

  after(() => {
    // clean up the nock's interceptor list and restore back to unmocked behavior for http requests
    nock.cleanAll();
    nock.restore();
    });
  });
