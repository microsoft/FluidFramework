/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";

import { GithubCommentInstantiationFactory } from "./main";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../package.json");
export const githubCommentName = pkg.name as string;

/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also
 * enables dynamic loading in the EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export const fluidExport = new SimpleModuleInstantiationFactory(
    githubCommentName,
    new Map([
        [githubCommentName,
            Promise.resolve(GithubCommentInstantiationFactory)],
    ]),
);

// Export necessary members from main.tsx:
export {
    GithubComment,
    GithubCommentInstantiationFactory,
} from "./main";
