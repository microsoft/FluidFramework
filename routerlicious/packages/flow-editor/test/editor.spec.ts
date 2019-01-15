require("jsdom-global")("", {
    url: "https://example.org/",
    includeNodeLocations: true,
});

import { TestStore } from "./teststore";
import { FlowDocument } from "@chaincode/flow-document";

describe("Layout", () => {
    it("", async () => {
        const doc = TestStore.open("docId", "userId", FlowDocument.type);
        return doc;
    });
});