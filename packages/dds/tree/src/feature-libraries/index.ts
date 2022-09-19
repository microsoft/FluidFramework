/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export * from "./object-forest";
export * from "./editable-tree";
export * from "./defaultRebaser";
export * from "./forestIndex";
export { SchemaIndex } from "./schemaIndex";
export * from "./treeTextCursorLegacy";
export {
	singleTextCursor as singleTextCursorNew,
	jsonableTreeFromCursor as jsonableTreeFromCursorNew,
} from "./treeTextCursor";
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export * from "./sequence-change-family";
export * from "./defaultSchema";
export {
    isNeverField,
    ModularChangeFamily,
    ModularEditBuilder,
    FieldChangeHandler,
    FieldChangeRebaser,
    FieldChangeEncoder,
    FieldEditor,
    NodeChangeset,
    ValueChange,
    FieldChangeMap,
    FieldChange,
    FieldChangeset,
    ToDelta,
    UpPathWithFieldKinds,
    NodeChangeComposer,
    NodeChangeInverter,
    NodeChangeRebaser,
    NodeChangeEncoder,
    NodeChangeDecoder,
    FieldKind,
    Multiplicity,
    FullSchemaPolicy,
    allowsRepoSuperset,
} from "./modular-schema";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as FieldKinds from "./defaultFieldKinds";
export { FieldKinds };
