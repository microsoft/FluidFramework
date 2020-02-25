/*!
* Copyright (c) Microsoft Corporation. All rights reserved.
* Licensed under the MIT License.
*/

import { SharedStringFactory } from "@microsoft/fluid-sequence";
import { PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
// tslint:disable:binary-expression-operand-order
import { TestHost } from "@microsoft/fluid-local-test-utils";
import * as assert from "assert";
// tslint:disable-next-line:no-import-side-effect
import "mocha";
import { SourceDocument } from "../src/document";

// tslint:disable:mocha-no-side-effect-code
const sourceDocumentType = "@chaincode/source-document";
const sourceDocumentFactory = new PrimedComponentFactory(SourceDocument, [new SharedStringFactory()]);
// tslint:enable:mocha-no-side-effect-code

describe("SourceDocument", () => {
    let host: TestHost;
    let doc: SourceDocument;

    before(async () => {
        host = new TestHost([
            [sourceDocumentType, Promise.resolve(sourceDocumentFactory)],
        ]);
    });

    after(async () => {
        await host.close();
    });

    beforeEach(async () => {
        // tslint:disable-next-line:insecure-random
        doc = await host.createAndAttachComponent(Math.random().toString(36).slice(2), sourceDocumentType);
    });

    it("exists", () => {
        doc.insertText(0, "abc");
        doc.annotateLocal(1, 2, { x: true });
        assert(doc.toString());
    });
});
