/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// when merging declarations the module path must match exactly. Because of this we need to explicitly export
// IComponent as opposed to an export *
export { IComponent } from "./components";
export * from "./componentLoadable";
export * from "./componentRender";
export { IRequestHeader } from "./componentRouter";
export * from "./componentRouter";
export * from "./handles";
export * from "./legacy";
export * from "./serializer";
