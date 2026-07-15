/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTestPort } from "@fluidframework/test-tools";

/**
 * Port for the Tinylicious server started by this package's "start:tinylicious:test" script.
 *
 * @remarks
 * The port is dynamically assigned per-package by the `assign-test-ports` tool (run at the start of the
 * `ci:test:realsvc:tinylicious` sweep) so packages that launch their own Tinylicious server can run
 * concurrently without colliding on a shared port. When `assign-test-ports` has not run (e.g. the tests are
 * run directly, or against a manually started `start:tinylicious:test` server), `getTestPort` returns the
 * fallback below — Tinylicious's default port of 7070. The `with-test-port` wrapper is configured to use the
 * same fallback (via `--fallback 7070`), so the launched server and this client stay in agreement.
 */
export const tinyliciousPort = getTestPort("@fluidframework/tinylicious-client", 7070);
