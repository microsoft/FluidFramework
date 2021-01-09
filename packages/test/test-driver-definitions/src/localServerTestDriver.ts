/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISummaryConfiguration } from "@fluidframework/protocol-definitions";
import { ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { ITestDriver } from "./interfaces";

export interface ILocalServerTestDriver extends Omit<ITestDriver,"type"> {
    readonly type: "local";
    readonly server: ILocalDeltaConnectionServer
    /**
     * @deprecated - We only need this for some back-compat cases. Once we have a release with
     * all the test driver changes, this will be removed in 0.33
     */
    reset?(options?: {serviceConfiguration?: {summary?: Partial<ISummaryConfiguration>}});
}
