/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver";

export function apisToBundle() {
     // Pass through dummy parameters, this file is only used for bundle analysis
    new OdspDocumentServiceFactory(undefined as any, undefined as any);
}
