/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IResolveDeclarationReferenceResult } from "@microsoft/api-extractor-model";
import { DocDeclarationReference } from "@microsoft/tsdoc";

import { MarkdownDocumenterConfiguration } from "../../Configuration";
import { UrlTarget } from "../../Link";
import { getLinkUrlForApiItem } from "../../utilities";
import { DocNodeTransformOptions } from "../DocNodeTransforms";

export function getDocNodeTransformationOptions(
    config: Required<MarkdownDocumenterConfiguration>,
): DocNodeTransformOptions {
    return {
        resolveApiReference: (codeDestination) => resolveSymbolicLink(codeDestination, config),
        logger: config.logger,
    };
}

function resolveSymbolicLink(
    codeDestination: DocDeclarationReference,
    config: Required<MarkdownDocumenterConfiguration>,
): UrlTarget | undefined {
    const { apiModel, logger } = config;

    const resolvedReference: IResolveDeclarationReferenceResult =
        apiModel.resolveDeclarationReference(
            codeDestination,
            undefined, // TODO: is this okay?
        );

    if (resolvedReference.resolvedApiItem === undefined) {
        logger.warning(
            `Unable to resolve reference "${codeDestination.emitAsTsdoc()}": ${
                resolvedReference.errorMessage
            }`,
        );

        return undefined;
    }

    return getLinkUrlForApiItem(resolvedReference.resolvedApiItem, config);
}
