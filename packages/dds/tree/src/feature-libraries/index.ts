/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { buildForest, ObjectForest } from "./object-forest";
export {
    getEditableTreeContext,
    EditableTree,
    EditableField,
    EditableTreeOrPrimitive,
    UnwrappedEditableTree,
    UnwrappedEditableField,
    getTypeSymbol,
    valueSymbol,
    anchorSymbol,
    proxyTargetSymbol,
    EditableTreeContext,
    isArrayField,
    isUnwrappedNode,
    PrimitiveValue,
    isPrimitiveValue,
    isPrimitive,
} from "./editable-tree";
export {
    DefaultChangeFamily,
    DefaultRebaser,
    DefaultEditor,
    DefaultChangeset,
    Change,
    SetValue,
} from "./defaultRebaser";
export { ForestIndex } from "./forestIndex";
export { SchemaIndex, SchemaEditor, getSchemaString } from "./schemaIndex";
export { singleTextCursor, jsonableTreeFromCursor, TextCursor, RootedTextCursor } from "./treeTextCursorLegacy";
export {
    singleTextCursor as singleTextCursorNew,
    jsonableTreeFromCursor as jsonableTreeFromCursorNew,
} from "./treeTextCursor";
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export {
    DUMMY_INVERSE_VALUE,
    DUMMY_INVERT_TAG,
    SequenceChangeFamily,
    sequenceChangeFamily,
    SequenceChangeRebaser,
    sequenceChangeRebaser,
    SequenceChangeset,
    sequenceChangeEncoder,
    SequenceEditBuilder,
    NodePath,
    PlacePath,
    Transposed,
    HasLength,
    TreeForestPath,
    TreeRootPath,
    RangeType,
    OpId,
    HasOpId,
    ProtoNode,
    NodeCount,
    GapCount,
    Skip,
    ChangesetTag,
    ClientId,
    Tiebreak,
    Effects,
    toDelta,
    isAttach,
    isReattach,
    isTomb,
    isGapEffectMark,
    getAttachLength,
    isEqualGaps,
    isEqualPlace,
    isEqualGapEffect,
    getOutputLength,
    getInputLength,
    isSkipMark,
    splitMarkOnInput,
    splitMarkOnOutput,
    isDetachMark,
    isObjMark,
    tryExtendMark,
    MarkListFactory,
} from "./sequence-change-family";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as SequenceField from "./sequence-field";
export { SequenceField };

export { neverField, emptyField, neverTree, defaultSchemaPolicy } from "./defaultSchema";
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
export { mapFieldMarks, mapMarkList, mapMark, applyModifyToTree } from "./deltaUtils";
