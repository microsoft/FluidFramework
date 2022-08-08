// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
import { MarkdownEmitter } from "@microsoft/api-documenter/lib/markdown/MarkdownEmitter";
import { ApiModel } from "@microsoft/api-extractor-model";
import { NewlineKind } from "@rushstack/node-core-library";
import * as Path from "path";

import { render } from "../MarkdownDocumenter";

// Simple integration test that compares the total output against an expected "snapshot"
test("compare sample suite against expected", () => {
    const apiReportPath = Path.resolve(__dirname, "testData", "simple-suite-test.json");

    const apiModel = new ApiModel();
    apiModel.loadPackage(apiReportPath);

    const documents = render(
        apiModel,
        {
            newlineKind: NewlineKind.CrLf,
            uriRoot: "",
        },
        new MarkdownEmitter(),
    );

    expect(documents.length).
});
