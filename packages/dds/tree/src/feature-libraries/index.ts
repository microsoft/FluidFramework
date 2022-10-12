/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export * from "./object-forest";
export * from "./editable-tree";
export * from "./defaultChangeFamily";
export * from "./forestIndex";
export { SchemaIndex, SchemaEditor, getSchemaString } from "./schemaIndex";
export * from "./treeTextCursorLegacy";
export {
    singleTextCursor as singleTextCursorNew,
    jsonableTreeFromCursor as jsonableTreeFromCursorNew,
} from "./treeTextCursor";
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export * from "./sequence-change-family";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as SequenceField from "./sequence-field";
export { SequenceField };

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
    NodeChangeComposer,
    NodeChangeInverter,
    NodeChangeRebaser,
    NodeChangeEncoder,
    NodeChangeDecoder,
    FieldKind,
    Multiplicity,
    FullSchemaPolicy,
    allowsRepoSuperset,
    GenericChangeset,
    genericFieldKind,
} from "./modular-schema";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as FieldKinds from "./defaultFieldKinds";
export { FieldKinds };

export * from "./deltaUtils";
