/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
export declare const chaincodeName: string;
/**
 * This does setup for the Container. The SimpleModuleInstantiationFactory also
 * enables dynamic loading in the EmbeddedComponentLoader.
 *
 * There are two important things here:
 * 1. Default Component name
 * 2. Map of string to factory for all components
 */
export declare const fluidExport: SimpleModuleInstantiationFactory;
export { GithubComment, GithubCommentInstantiationFactory, } from "./main";
//# sourceMappingURL=index.d.ts.map