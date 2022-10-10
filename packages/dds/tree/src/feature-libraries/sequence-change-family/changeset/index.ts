/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This module contains the changeset format and related operations.
 */

export {
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
} from "./format";
export { toDelta } from "./toDelta";
export {
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
} from "./utils";
export { MarkListFactory } from "./markListFactory";
