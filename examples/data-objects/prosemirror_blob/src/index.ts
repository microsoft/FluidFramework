/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntimeFactoryWithDefaultDataStore } from "@fluidframework/aqueduct";
import { ProseMirrorFactory, ProseMirror } from "./prosemirror";

export { ProseMirrorFactory, ProseMirror } from "./prosemirror";

export const fluidExport = new ContainerRuntimeFactoryWithDefaultDataStore(
    ProseMirrorFactory,
    new Map([
        [ProseMirror.Name, Promise.resolve(ProseMirrorFactory)],
    ]),
);
