#!/usr/bin/env node

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import { runService } from "@fluidframework/server-services-shared";
import { configureLogging } from "@fluidframework/server-services-utils";
import Agent from "agentkeepalive";
import { default as Axios } from "axios";
import winston from "winston";

import { TinyliciousResourcesFactory } from "./resourcesFactory";
import { TinyliciousRunnerFactory } from "./runnerFactory";

/*
  Why set the default httpAgent for Axios to the one from agentkeepalive?

	General context:
	By default Axios keeps TCP connections (sockets) open after a request is done using them, so that they can be reused
	by a subsequent request without having to pay the cost of establishing a new connection.
	Both the http client and the server it communicates with can have their own timeouts for how long they keep those connections
	open.
	If the timeouts don't match, it can happen that one end closes the connection and the other one will see an error
	next time it tries to use it.
	For example, if the timeout on the client is higher than on the server and the server closes a connection that it
	considers inactive for too long, the client isn't notified immediately, and when it attempts to reuse it it might see
	an error like ECONNRESET or "socket hang up", indicating that "the other side of the connection closed it abruptly"
	(which in this case isn't really abruptly, it's just that the client doesn't immediately react to the server closing
	the connection).

	FF context:
  Tinylicious includes the code for the Alfred and Historian components of the server.
	But even though we bundle both of them in a monolithic process, it still uses http requests when Alfred needs to
	communicate with Historian, so that communication is subject to the considerations above.

	'Agent' from the agentkeepalive package sets keep-alive to true (Axios does this, but not the default Node http agent)
	and sets the inactive/active TCP connection timeout to 4s and 8s respectively. On the server side, Express defaults to
	5s, so Agent's values try to guarantee that the client will be the one to close inactive sockets, so it doesn't run
	into issues	trying to reuse them.

  CAREFUL: setting global Axios settings here might not be reflected in the Axios instance used to make requests if the
	code that issues the requests is imported from a different package, and that package is using a different version of
	Axios.
	For example, requests to Historian end up using BasicRestWrapper from services-client; that class will use the default
	instance from whichever Axios version the services-client package depends on, unless one is explicitly passed in.
	Ideally, an Axios instance should be passed to it to avoid this potential issue.

	CAREFUL: the fact that TCP connections are kept open to allow reuse after a request is done with one of them can lead
	to port exhaustion if the process issuing requests is using new TCP sockets every time instead of reusing them.
	This applies to client processes (like running tests) making requests to Alfred, and to Alfred making requests to
	Historian.
*/
Axios.defaults.httpAgent = new Agent();

const configPath = path.join(__dirname, "../config.json");

configureLogging(configPath);

/**
 * The maximum valid TCP port number (2^16 - 1).
 * Valid ports range from 0 to this value (inclusive).
 */
const maxPort = 65535;

/**
 * Validates a raw `--port` value and returns it as a number.
 * @throws If the value is not an integer between 0 and {@link maxPort}.
 */
function validatePort(rawPort: string | undefined): number {
	const port = rawPort !== undefined && /^\d+$/u.test(rawPort) ? Number(rawPort) : Number.NaN;
	if (!Number.isInteger(port) || port < 0 || port > maxPort) {
		throw new Error(
			`Invalid --port value "${rawPort ?? ""}"; expected an integer between 0 and ${maxPort}.`,
		);
	}
	return port;
}

/**
 * Parses an optional `--port <number>` (or `--port=<number>`) command line argument specifying the port for
 * Tinylicious to listen on.
 * @returns The specified port, or `undefined` when the argument is not present.
 */
function parsePortArg(args: readonly string[]): number | undefined {
	const flagIndex = args.indexOf("--port");
	if (flagIndex !== -1) {
		return validatePort(args[flagIndex + 1]);
	}

	const inlineArg = args.find((arg) => arg.startsWith("--port="));
	if (inlineArg !== undefined) {
		return validatePort(inlineArg.slice("--port=".length));
	}

	return undefined;
}

runService(
	new TinyliciousResourcesFactory(parsePortArg(process.argv.slice(2))),
	new TinyliciousRunnerFactory(),
	winston,
	"tinylicious",
	configPath,
);
