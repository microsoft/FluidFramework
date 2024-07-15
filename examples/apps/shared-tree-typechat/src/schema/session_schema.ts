/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeConfiguration, SchemaFactory } from "fluid-framework";

// Include a UUID to guarantee that this schema will be uniquely identifiable
const sf = new SchemaFactory("cc2e4c35-a80d-49d4-b29c-57319de412dd");

export class Client extends sf.object("Client", {
	clientId: sf.string,
	selected: sf.array(sf.string),
}) {}

// Define a root type.
export class ClientSession extends sf.object("Session", {
	clients: sf.array(Client),
}) {}

// Export the tree config appropriate for this schema
// This is passed into the SharedTree when it is initialized
export const sessionTreeConfiguration = new TreeConfiguration(ClientSession, () => ({
	clients: [],
}));
