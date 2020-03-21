/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Jsonable, JsonableObject } from "./jsonable";

export type RuntimeMetadata = JsonableObject<Jsonable>;

// Represents the structure of metadata on the ContainerRuntime. This can be used for storing things
// like the document's last edit user / time.
export interface IContainerRuntimeMetadata {
    content: RuntimeMetadata;
}
