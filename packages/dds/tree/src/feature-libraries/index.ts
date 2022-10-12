/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
    Change,
    DefaultChangeFamily,
    DefaultChangeset,
    DefaultEditor,
    DefaultRebaser,
    SetValue,
} from "./defaultRebaser";
export {
    anchorSymbol,
    EditableField,
    EditableTree,
    EditableTreeContext,
    EditableTreeOrPrimitive,
    getEditableTreeContext,
    getTypeSymbol,
    isArrayField,
    isPrimitive,
    isPrimitiveValue,
    isUnwrappedNode,
    PrimitiveValue,
    proxyTargetSymbol,
    UnwrappedEditableField,
    UnwrappedEditableTree,
    valueSymbol,
} from "./editable-tree";
export { ForestIndex } from "./forestIndex";
export { singleMapTreeCursor, mapTreeFromCursor } from "./mapTreeCursor";
export { buildForest, ObjectForest } from "./object-forest";
export {
    singleTextCursor as singleTextCursorNew,
    jsonableTreeFromCursor as jsonableTreeFromCursorNew,
} from "./treeTextCursor";
export {
    jsonableTreeFromCursor,
    RootedTextCursor,
    singleTextCursor,
    TextCursor,
} from "./treeTextCursorLegacy";
export { SchemaIndex, SchemaEditor, getSchemaString } from "./schemaIndex";
export {
    ChangesetTag,
    ClientId,
    DUMMY_INVERSE_VALUE,
    DUMMY_INVERT_TAG,
    Effects,
    GapCount,
    getAttachLength,
    getInputLength,
    getOutputLength,
    HasLength,
    HasOpId,
    isAttach,
    isDetachMark,
    isEqualGapEffect,
    isEqualGaps,
    isEqualPlace,
    isGapEffectMark,
    isObjMark,
    isReattach,
    isSkipMark,
    isTomb,
    MarkListFactory,
    NodeCount,
    NodePath,
    OpId,
    PlacePath,
    ProtoNode,
    RangeType,
    sequenceChangeEncoder,
    SequenceChangeFamily,
    sequenceChangeFamily,
    SequenceChangeRebaser,
    sequenceChangeRebaser,
    SequenceChangeset,
    SequenceEditBuilder,
    Skip,
    splitMarkOnInput,
    splitMarkOnOutput,
    Tiebreak,
    toDelta,
    Transposed,
    TreeForestPath,
    TreeRootPath,
    tryExtendMark,
} from "./sequence-change-family";

// Split this up into separate import and export for compatibility with API-Extractor.
import * as SequenceField from "./sequence-field";
export { SequenceField };

export { defaultSchemaPolicy, emptyField, neverField, neverTree } from "./defaultSchema";

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

export { applyModifyToTree, mapFieldMarks, mapMark, mapMarkList } from "./deltaUtils";
