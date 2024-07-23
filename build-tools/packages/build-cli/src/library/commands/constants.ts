/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Literal pattern to search for in file prefix to replace with unscoped package name.
 *
 * @privateRemarks api-extractor uses `<@..>`, but `<>` is problematic for command line
 * specification. A policy incorrectly thinks an argument like that should not be quoted.
 * It is just easier to use an alternate bracket style.
 */
export const unscopedPackageNameString = "{@unscopedPackageName}";
