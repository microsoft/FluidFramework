/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IRequest } from "@fluidframework/core-interfaces";
import { IDocumentServiceFactory, IUrlResolver } from "@fluidframework/driver-definitions";

export type TestDriverTypes = "tinylicious" | "t9s" | "routerlicious" | "r11s" | "odsp" | "local";

export interface ITestDriver{
    /**
     * The type of server the test driver executes against
     */
    readonly type: TestDriverTypes;

    /**
     * The semantic version of the test drivers package.
     * In general this version will match that of the  client
     * interfaces and implementation exposed and used by the test driver.
     */
    readonly version: string;

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
    createContainerUrl(testId: string): Promise<string>;
}

/**
 * Extension of ITelemetryBaseLogger with support for flushing
 * all buffered logs that have not yet been fully processed (e.g. uploaded)
 */
export interface ITelemetryBufferedLogger extends ITelemetryBaseLogger {
    /**
     * Flush any underlying buffer of events that have been sent so far
     * but not yet fully processed - e.g. uploaded to a log ingestion service.
     */
    flush(): Promise<void>;
}
