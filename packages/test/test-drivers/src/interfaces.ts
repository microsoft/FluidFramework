/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";

export type TestDriverTypes = "local" | "tinylicious" | "routerlicious" | "odsp";

export interface ITestDriver{
    /**
     * The type of server the test driver executes against
     */
    type: TestDriverTypes;

    /**
     * Creates a document service factory targetting the server
     */
    createDocumentServiceFactory(): IDocumentServiceFactory;

    /**
     * Creates a url resolver targetting the server
     */
    createUrlResolver(): IUrlResolver;

    /**
     * Creates a create new request based on the test id.
     * Repeated calls with the same test id will return the same request.
     * The test id may not map directly to any specific Fluid Framework concept.
     * If you need more control you should disambiguate the driver based on its
     * type, this should only be done it absolutely necessary for complex scenarios
     * as the test may not  work against all supported servers if done.
     */
    createCreateNewRequest(testId: string): IRequest;

    /**
     * Creates a container url that can be resolved by the url resolver for this driver.
     * Repeated calls with the same test id will return the same test id.
     * The test id may not map directly to any specific Fluid Framework concept.
     * If you need more control you should disambiguate the driver based on its
     * type, this should only be done it absolutely necessary for complex scenarios
     * as the test may not  work against all supported servers if done.
     */
    createContainerUrl(testId: string): string;
}
