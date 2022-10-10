/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// Recommended policy is not compatible with API-Extractor

/* eslint-disable unicorn/prefer-export-from */

/**
 * Rendering types and related functionality.
 */
import * as DefaultRenderingPolicies from "./default-policies";
import * as RenderingHelpers from "./helpers";

export { DefaultRenderingPolicies };
export { RenderingHelpers };

export     { renderModelDocument,     renderPackageDocument,     renderApiItemDocument } from "./Rendering";
export {
    RenderApiItemWithChildren,
    RenderApiItemWithoutChildren,
    RenderSectionWithInnerContent,
    RenderingPolicies,
    defaultRenderingPolicies,
} from "./RenderingPolicy";

/* eslint-enable unicorn/prefer-export-from */
