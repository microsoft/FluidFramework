#!/usr/bin/env node

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { runService } from "@fluidframework/server-services-shared";
import { configureLogging } from "@fluidframework/server-services-utils";
import { Agent, setGlobalDispatcher } from "undici";
import winston from "winston";

import { TinyliciousResourcesFactory } from "./resourcesFactory";
import { TinyliciousRunnerFactory } from "./runnerFactory";

/*
  Why configure a global undici dispatcher with keep-alive?

	General context:
	By default Node.js's native fetch (powered by undici) keeps TCP connections (sockets) open after a request is done
	using them, so that they can be reused by a subsequent request without having to pay the cost of establishing a new
	connection.
	Both the HTTP client and the server it communicates with can have their own timeouts for how long they keep those
	connections open. If the timeouts don't match, it can happen that one end closes the connection and the other one
	will see an error next time it tries to use it.

	FF context:
	Tinylicious includes the code for the Alfred and Historian components of the server.
	But even though we bundle both of them in a monolithic process, it still uses http requests when Alfred needs to
	communicate with Historian, so that communication is subject to the considerations above.

	The undici Agent sets keep-alive socket timeouts to 4s and 8s respectively. On the server side, Express defaults to
	5s, so these values try to guarantee that the client will be the one to close inactive sockets, so it doesn't run
	into issues trying to reuse them.
*/
setGlobalDispatcher(
	new Agent({
		keepAliveTimeout: 4_000, // 4s inactive socket timeout
		keepAliveMaxTimeout: 8_000, // 8s active socket timeout
	}),
);

const configPath = path.join(__dirname, "../config.json");

configureLogging(configPath);

runService(
	new TinyliciousResourcesFactory(),
	new TinyliciousRunnerFactory(),
	winston,
	"tinylicious",
	configPath,
);
