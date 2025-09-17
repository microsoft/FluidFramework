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

let localServer: ILocalDeltaConnectionServer | undefined;

export const createLocalDriver = async () => {
	localServer ??= LocalDeltaConnectionServer.create(new LocalSessionStorageDbFactory());
	return {
		urlResolver: new LocalResolver(),
		documentServiceFactory: new LocalDocumentServiceFactory(localServer),
		createCreateNewRequest: async (id: string) => createLocalResolverCreateNewRequest(id),
		createLoadExistingRequest: async (id: string) => {
			return { url: `${window.location.origin}/${id}` };
		},
	};
};
