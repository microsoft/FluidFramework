/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createLocalResolverCreateNewRequest,
	LocalDocumentServiceFactory,
	LocalResolver,
	LocalSessionStorageDbFactory,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/local-driver/internal";
import {
	LocalDeltaConnectionServer,
	type ILocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";

import type { ExampleDriver } from "./interfaces.js";

// A single localServer should be shared by all instances of a local driver so they can communicate
// with each other. It is created lazily when the first local driver is created, since we may not
// need it if we're not running in local mode.
let localServer: ILocalDeltaConnectionServer | undefined;

export const createLocalDriver = async (): Promise<ExampleDriver> => {
	localServer ??= LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
	return {
		urlResolver: new LocalResolver(),
		documentServiceFactory: new LocalDocumentServiceFactory(localServer),
		createCreateNewRequest: (id: string) => createLocalResolverCreateNewRequest(id),
		createLoadExistingRequest: async (id: string) => {
			return { url: `${window.location.origin}/${id}` };
		},
	};
};
