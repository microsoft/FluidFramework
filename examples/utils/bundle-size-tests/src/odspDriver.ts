/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { OdspDocumentServiceFactoryWithCodeSplit } from "@fluidframework/odsp-driver";

export function apisToBundle() {
     // Pass through dummy parameters, this file is only used for bundle analysis
    new OdspDocumentServiceFactoryWithCodeSplit(undefined as any, undefined as any);
}
