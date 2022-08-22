/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file serve for webpack, otherwise TS will complain about the following import,
// which is required to transpile the SVGs.
import InspectorTableIcons from "../assets/icons/SVGStoreIcons";
export { InspectorTableIcons };

export * from "./InspectorTable";
export * from "./PropertyDataCreationHandlers";
export * from "./propertyInspectorUtils";
export * from "./icons";
export * from "./ModalManager";
export * from "./ModalRoot";
export * from "./CustomChip";
export * from "./TypeColumn";
export * from "./utils";
export * from "./InspectorTableTypes";
