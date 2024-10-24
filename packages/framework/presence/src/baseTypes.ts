/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A Fluid client connection identifier.
 *
 * @remarks
 * Each client connection is given a unique identifier for the duration of the
 * connection. If a client disconnects and reconnects, it will be given a new
 * identifier. Prefer use of {@link ISessionClient} as a way to identify clients
 * in a session. {@link ISessionClient.getConnectionId} will provide the current
 * connection identifier for a logical session client.
 *
 * @privateRemarks
 * This represents what is commonly `clientId` in Fluid code. Ideally this is
 * moved somewhere more central and we brand it to avoid confusion with other
 * strings. Branding broadly is likely a breaking change and may take decent
 * effort to manage.
 *
 * @alpha
 */
export type ClientConnectionId = string;
