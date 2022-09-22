/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ApiInterface, ApiItem, ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { expect } from "chai";
import * as Path from "path";

import {
    MarkdownDocumenterConfiguration,
    markdownDocumenterConfigurationWithDefaults,
} from "../../../Configuration";
import { HierarchicalSectionNode } from "../../documentation-domain";
import { apiItemToSection } from "../TransformApiItem";

/**
 * Sample "default" configuration.
 */
const defaultPartialConfig: Omit<MarkdownDocumenterConfiguration, "apiModel"> = {
    uriRoot: ".",
};

function generateModel(testReportFileName: string): ApiModel {
    const filePath = Path.resolve(__dirname, "test-data", testReportFileName);

    const apiModel = new ApiModel();
    apiModel.loadPackage(filePath);

    return apiModel;
}

function getApiItems(apiModel: ApiModel): readonly ApiItem[] {
    const packages = apiModel.packages;
    expect(packages.length).to.equal(1);

    const entryPoints = packages[0].entryPoints;
    expect(entryPoints.length).to.equal(1);

    return entryPoints[0].members;
}

function findApiMember(
    members: readonly ApiItem[],
    memberName: string,
    expectedKind: ApiItemKind,
): ApiItem {
    for (const member of members) {
        if (member.displayName === memberName && member.kind === expectedKind) {
            return member;
        }
    }
    expect.fail(
        `Item with name "${memberName}" and kind "${expectedKind}" not found in provided list.`,
    );
}

function createConfig(
    partialConfig: Omit<MarkdownDocumenterConfiguration, "apiModel">,
    apiModel: ApiModel,
) {
    return markdownDocumenterConfigurationWithDefaults({
        ...partialConfig,
        apiModel,
    });
}

describe("api-markdown-documenter full-suite tests", () => {
    it("test-interface", () => {
        const model = generateModel("test-interface.json");
        const members = getApiItems(model);
        const apiInterface = findApiMember(
            members,
            "TestInterface",
            ApiItemKind.Interface,
        ) as ApiInterface;

        const config = createConfig(defaultPartialConfig, model);

        const result = config.transformApiInterface(apiInterface, config, (childItem) =>
            apiItemToSection(childItem, config),
        );
        expect(result.equals(new HierarchicalSectionNode([]))).to.be.true;
    });
});
