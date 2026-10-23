/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A site version leveraged by the Docusaurus build.
 *
 * - "current" - maps to the current/default (unversioned) site version
 * - "local" - maps to the optional locally generated site version (see the website README for more information)
 * - Otherwise, an integer string (e.g., "1", "2", etc.) maps to a published historical site version
 */
export type SiteVersion = "current" | "local" | `${number}`;
