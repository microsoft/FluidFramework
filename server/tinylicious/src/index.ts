#!/usr/bin/env node
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import http from "http";
import Axios from "axios";
import { runService } from "@fluidframework/server-services-utils";
import { TinyliciousResourcesFactory } from "./resourcesFactory";
import { TinyliciousRunnerFactory } from "./runnerFactory";

// Each TCP connect has a delay to allow it to be reuse after close, and unit test make a lot of connection,
// which might cause port exhaustion.

// Tinylicious includes end points for ths historian for the client. But even we bundle all the service in
// a monolithic process, it still uses sockets to communicate with the historian service.  For these call,
// keep the TCP connection open so that they can be reused
// TODO: Set this globally since the Historian use the global Axios default instance.  Make this encapsulated.
Axios.defaults.httpAgent = new http.Agent({ keepAlive: true });

runService(
    new TinyliciousResourcesFactory(),
    new TinyliciousRunnerFactory(),
    "tinylicious",
    path.join(__dirname, "../config.json"));
