/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper functions and classes to work with array ChangeSets
 */
 import {copy as cloneDeep} from "fastest-json-copy";
 import isNumber from "lodash/isNumber";
 import isString from "lodash/isString";
 import isEqual from "lodash/isEqual";

// @ts-ignore
import { ConsoleUtils, constants } from "@fluid-experimental/property-common";
import { ApplyChangeSetOptions, ConflictInfo, SerializedChangeSet } from "../changeset";
import { TypeIdHelper } from "../helpers/typeidHelper";
import { ArrayChangeSetIterator, arrayInsertList, arrayModifyList, arrayRemoveList, GenericOperation, InsertOperation, ModifyOperation, NoneNOPOperation, NOPOperation, RemoveOperation } from "./arrayChangesetIterator";
import { ConflictType } from "./changesetConflictTypes";

const { MSG } = constants;
const { isPrimitiveType } = TypeIdHelper;

/**
 * The range combinations of two change sets (A and B)
 * This can either be complete operations, parts of complete operations or overlapping segments
 * @enum number
 */
enum ArrayChangeSetRangeType {
    completeA, // a complete operation of change set A
    completeB, // a complete operation of change set B
    partOfA, // a partial operation of change set A
    partOfB, // a partial operation of change set B
    completeApartOfB, // a complete operation of change set A overlapping with a partial operation of change set B
    completeBpartOfA, // a complete operation of change set B overlapping with a partial operation of change set A
    completeAcompleteB, // a complete operation of change set A overlapping a complete operation of change set B
    partOfApartOfB, // a partial operation of change set A, a partial operation of change set B
}

interface SegmentType<T = GenericOperation, K = GenericOperation, L = GenericOperation> {
    begin?: number;
    op?: T;
    flag?: ArrayChangeSetRangeType;
    opA?: K;
    opB?: L;
    removeInsertOperationA?: arrayRemoveList | arrayInsertList;

}

/**
 * A range of an array operation
 */
// TODO: Cleaning up these types using discriminated union
export interface OperationRangeDescription<T = GenericOperation> {
    opA?: any;
    opB?: any;
    insertAlreadyProcessed?: boolean;
    removeInsertOperationB?: arrayRemoveList | arrayInsertList;
    removeInsertOperation?: arrayRemoveList | arrayInsertList;
    removeInsertOperationA?: arrayRemoveList | arrayInsertList;
    op?: T,
    begin?: number,
    end?: number,
    flag?: ArrayChangeSetRangeType

}

/**
 * A range of an insert array operation
 */
export interface OperationRangeInsert extends OperationRangeDescription<InsertOperation> {
    removeInsertOperationB?: arrayInsertList;
    removeInsertOperation?: arrayInsertList;
    removeInsertOperationA?: arrayInsertList;
}

/**
 * A range of a remove array operation
 */
export interface OperationRangeRemove extends OperationRangeDescription<RemoveOperation> {
    removeInsertOperationB?: arrayRemoveList;
    removeInsertOperation?: arrayRemoveList;
    removeInsertOperationA?: arrayRemoveList;
}

/**
* A range of a modify array operation
*/
export interface OperationRangeModify extends Omit<OperationRangeDescription<ModifyOperation>,
    'removeInsertOperationB' | 'removeInsertOperation' | 'removeInsertOperationA'> { }

/**
* A range of a NOP array operation
*/
export interface OperationRangeNOP extends Omit<OperationRangeDescription<NOPOperation>,
    'removeInsertOperationB' | 'removeInsertOperation' | 'removeInsertOperationA'> { }

/**
 * A range of a none NOP array operation
 */
export type OperationRangeNoneNOP = OperationRangeInsert | OperationRangeRemove | OperationRangeModify;

export type OperationRange = OperationRangeNoneNOP | OperationRangeNOP;

/**
 * compute a range for an operation of the current change set
 * @param io_operation input
 * @param in_aOffset the offset that needs to be added to transform the operation
 * @param io_resultingRange
 * the computed range
 */
const getRangeForCurrentStateOperation = function(io_operation: GenericOperation, in_aOffset: number, io_resultingRange: OperationRange) {
    if (!io_operation) {
        return;
    }
    if (io_operation.type === ArrayChangeSetIterator.types.NOP) {
        const dummyOp: NOPOperation = {
            type: ArrayChangeSetIterator.types.NOP,
            offset: in_aOffset,
        };
        io_resultingRange.begin = undefined;
        io_resultingRange.end = undefined;
        io_resultingRange.op = dummyOp;
        io_resultingRange.flag = ArrayChangeSetRangeType.completeA;
        return;
    }

    io_operation.operation[0] += in_aOffset;
    switch (io_operation.type) {
        case ArrayChangeSetIterator.types.INSERT:
            io_resultingRange.begin = io_operation.operation[0];
            io_resultingRange.end = io_operation.operation[0] + io_operation.operation[1].length;
            io_resultingRange.op = io_operation;
            io_resultingRange.flag = ArrayChangeSetRangeType.completeA;
            return;
        case ArrayChangeSetIterator.types.REMOVE:
            io_resultingRange.begin = io_operation.operation[0];
            io_resultingRange.end = io_operation.operation[0];
            io_resultingRange.op = io_operation;
            io_resultingRange.flag = ArrayChangeSetRangeType.completeA;
            (io_resultingRange as OperationRangeRemove).removeInsertOperation = io_operation.removeInsertOperation;
            return;
        case ArrayChangeSetIterator.types.MODIFY:
            io_resultingRange.begin = io_operation.operation[0];
            io_resultingRange.end = io_operation.operation[0] + io_operation.operation[1].length;
            io_resultingRange.op = io_operation;
            io_resultingRange.flag = ArrayChangeSetRangeType.completeA;
            return;
        default:
            throw new Error(`getRangeForCurrentStateOperation: ${MSG.UNKNOWN_OPERATION}`);
    }
};

const getOpLength = (op: arrayRemoveList) => isNumber(op[1]) ? op[1] : op[1].length;

/**
 * computes the impact range for a given operation of the applied change set
 * @param in_operation the op
 * @param io_resultingRange the computed range
 * @param in_flag the flag for the resulting range, default is 'complete B'
 * @param in_options - Optional additional parameters
 */
const getRangeForAppliedOperation = function(
    in_operation: GenericOperation,
    io_resultingRange: OperationRangeDescription,
    in_flag?: ArrayChangeSetRangeType,
    in_options?: ApplyChangeSetOptions,
) {
    if (!in_operation || in_operation.type === ArrayChangeSetIterator.types.NOP) {
        io_resultingRange.begin = undefined;
        io_resultingRange.end = undefined;
        io_resultingRange.op = undefined;
        io_resultingRange.flag = undefined;
        return;
    }
    if (!io_resultingRange.op) {
        io_resultingRange.op = {} as any;
    }
    io_resultingRange.op.type = in_operation.type;
    io_resultingRange.op.offset = in_operation.offset;
    if (!io_resultingRange.op.operation) {
        io_resultingRange.op.operation = [];
    }
    io_resultingRange.op.operation[0] = in_operation.operation[0];

    io_resultingRange.begin = in_operation.operation[0];
    io_resultingRange.op._absoluteBegin = in_operation.operation[0];
    if (in_flag !== undefined) {
        io_resultingRange.flag = in_flag;
    } else {
        io_resultingRange.flag = ArrayChangeSetRangeType.completeB;
    }

    switch (in_operation.type) {
        case ArrayChangeSetIterator.types.INSERT:
            io_resultingRange.end = in_operation.operation[0];
            io_resultingRange.op.operation[1] = in_operation.operation[1].slice();
            if (in_options && in_options.applyAfterMetaInformation) {
                const metaInformation = in_options.applyAfterMetaInformation.get(in_operation.operation[1]);
                if (metaInformation) {
                    in_options.applyAfterMetaInformation.set(io_resultingRange.op.operation[1], metaInformation);
                }
            }
            return;
        case ArrayChangeSetIterator.types.REMOVE:
            let numberOfRemovedElements = getOpLength(in_operation.operation);

            io_resultingRange.end = in_operation.operation[0] + numberOfRemovedElements;
            if (Array.isArray(in_operation.operation[1])) {
                io_resultingRange.op.operation[1] = in_operation.operation[1].slice();
            } else {
                io_resultingRange.op.operation[1] = in_operation.operation[1];
            }
            io_resultingRange.removeInsertOperation = in_operation.removeInsertOperation;
            return;
        case ArrayChangeSetIterator.types.MODIFY:
            io_resultingRange.end = in_operation.operation[0] + in_operation.operation[1].length;
            io_resultingRange.op.operation[1] = in_operation.operation[1].slice();
            if (in_operation.operation[2] !== undefined) {
                io_resultingRange.op.operation[2] = in_operation.operation[2].slice();
            }
            return;
        default:
            throw new Error(`getRangeForCurrentStateOperation: ${MSG.UNKNOWN_OPERATION}`);
    }
};

/**
 * Splits the second and third parameter in an array remove or modify operation into two segments.
 * This treats the three possible cases array, string and length that are allowed in a remove operation
 *
 * @param in_firstResult  - Place where the first half is stored
 * @param in_secondResult - Place where the second half is stored
 * @param in_data         - The original operation
 * @param in_start        - Index at which the operation is split
 * @private
 */
const _splitArrayParameter = function(
    in_firstResult: arrayModifyList | arrayRemoveList,
    in_secondResult: arrayModifyList | arrayRemoveList,
    in_data: arrayModifyList | arrayRemoveList,
    in_start: number,
) {
    let firstTmp: any;
    if (isString(in_data[1])) {
        firstTmp = in_data[1].substr(0, in_start);
        in_secondResult[1] = in_data[1].substr(in_start);
        if (in_firstResult) {
            in_firstResult[1] = firstTmp;
        }
        if (in_data[2] !== undefined && isString(in_data[2])) {
            firstTmp = in_data[2].substr(0, in_start);
            in_secondResult[2] = in_data[2].substr(in_start);
            if (in_firstResult) {
                in_firstResult[2] = firstTmp;
            }
        }
    } else if (Array.isArray(in_data[1])) {
        firstTmp = in_data[1].splice(0, in_start);
        in_secondResult[1] = in_data[1];
        if (in_firstResult) {
            in_firstResult[1] = firstTmp;
        }
        if (in_data[2] !== undefined && Array.isArray(in_data[2])) {
            firstTmp = in_data[2].splice(0, in_start);
            in_secondResult[2] = in_data[2];
            if (in_firstResult) {
                in_firstResult[2] = firstTmp;
            }
        }
    } else {
        if (in_firstResult) {
            in_firstResult[1] = in_start;
        }
        in_secondResult[1] = in_data[1] - in_start;
    }
};

/**
 * Splits an operation for the splitOverlapping function
 *
 * @param in_targetRange - The range to split
 * @param in_targetOperation - The target operation into which the split range is written
 * @param lengthUsedInResultSegment - The length of the range to split
 * @param in_updateOffset - Should the offset in the target range be updated?
 */
const _splitOperation = function(
    in_targetRange: OperationRangeDescription<NoneNOPOperation>,
    in_targetOperation: NoneNOPOperation,
    lengthUsedInResultSegment: number,
    in_updateOffset: boolean,
) {
    _splitArrayParameter(in_targetOperation.operation, in_targetRange.op.operation,
        in_targetRange.op.operation, lengthUsedInResultSegment);

    if (in_updateOffset) {
        if (in_targetRange.op.type === ArrayChangeSetIterator.types.INSERT) {
            in_targetRange.op.offset += lengthUsedInResultSegment;
        }
        if (in_targetRange.op.type === ArrayChangeSetIterator.types.REMOVE) {
            in_targetRange.op.offset -= lengthUsedInResultSegment;
        }
    }
};

/**
 * Copies an array operation
 * @param in_sourceOperation - The source operation
 * @param in_targetOperation - The target operation which will be overwritten
 */
const _copyOperation = function(in_sourceOperation: NoneNOPOperation, in_targetOperation: NoneNOPOperation) {
    if (in_sourceOperation.type === ArrayChangeSetIterator.types.REMOVE) {
        in_targetOperation.operation[1] = in_sourceOperation.operation[1];
    } else {
        in_targetOperation.operation[1] = in_sourceOperation.operation[1].slice();
        if (in_sourceOperation.operation[2] !== undefined) {
            in_targetOperation.operation[2] = in_sourceOperation.operation[2].slice();
        }
    }
};

/**
 * cut overlapping ranges in non-overlapping and completely overlapping segments
 * ranges of length 0 just cut lengthy ranges
 * @param io_rangeA input A
 * @param io_rangeB input B
 * @param io_resultingSegment the resulting overlapping segment
 * @param in_rebasing is this function called for rebasing - we have to implement two different
 *     behaviors of this function: one for squashing and one for rebasing, because an insert-insert
 *     operation in squashing should be separte segments, while for rebasing, we need one segment
 *     for both inserts to be able to report a conflict.
 * overlapping range or
 * (partial) A or B
 */
// eslint-disable-next-line complexity
const splitOverlapping = function(
    io_rangeA: OperationRangeInsert | OperationRangeRemove,
    io_rangeB: OperationRangeInsert | OperationRangeRemove,
    io_resultingSegment: OperationRangeInsert | OperationRangeRemove,
    in_rebasing: boolean,
    in_options?: ApplyChangeSetOptions) {
    if (io_rangeA.removeInsertOperation) {
        io_resultingSegment.removeInsertOperationA = io_rangeA.removeInsertOperation;
    } else {
        delete io_resultingSegment.removeInsertOperationA;
    }
    if (io_rangeB.removeInsertOperation) {
        io_resultingSegment.removeInsertOperationB = io_rangeB.removeInsertOperation;
    } else {
        delete io_resultingSegment.removeInsertOperationB;
    }

    if (io_rangeB.begin === undefined) {
        io_resultingSegment.begin = io_rangeA.begin;
        io_resultingSegment.end = io_rangeA.end;
        io_resultingSegment.op = io_rangeA.op;
        io_resultingSegment.flag = io_rangeA.flag;
        return;
    }

    if (io_rangeB.removeInsertOperation &&
        io_rangeB.op.type === ArrayChangeSetIterator.types.REMOVE &&
        (io_rangeA.begin === undefined || io_rangeB.removeInsertOperation[0] < io_rangeA.begin - io_rangeA.op.offset) &&
        io_rangeB.removeInsertOperation[0] < io_rangeB.begin &&
        !io_rangeB.insertAlreadyProcessed) {
        io_resultingSegment.begin = io_rangeB.removeInsertOperation[0];
        io_resultingSegment.end = io_rangeB.removeInsertOperation[0];
        (io_resultingSegment as OperationRangeInsert).op = {
            type: ArrayChangeSetIterator.types.INSERT,
            operation: io_rangeB.removeInsertOperation as arrayInsertList,
            offset: io_rangeB.op.offset,
        };
        io_resultingSegment.flag = ArrayChangeSetRangeType.completeB;
        io_rangeB.insertAlreadyProcessed = true;
        return;
    }

    if (io_rangeA.begin === undefined) {
        io_resultingSegment.begin = io_rangeB.begin;
        io_resultingSegment.end = io_rangeB.end;
        io_resultingSegment.op = io_rangeB.op;
        io_resultingSegment.flag = io_rangeB.flag;
        return;
    }
    io_resultingSegment.opA = undefined;
    io_resultingSegment.opB = undefined;
    io_resultingSegment.op = undefined;

    // We have an overlapping remove and insert operation at the same position
    // in a squash operation. In that case, we try to create a more efficient
    // ChangeSet by detecting cases, in which the remove and insert cancel out
    // (which we can detect for a reversible ChangeSet).
    // TODO: In the most general case, we should convert the overlapping remove
    //       insert operations into the most optimal modify operation, but this
    //       would require the computation of the edit distance between the two
    //       operations, which could only be done efficiently for named properties.
    let nextInsertOffset = 0;
    if (io_rangeA.removeInsertOperation) {
        nextInsertOffset = getOpLength(io_rangeA.removeInsertOperation);
    }
    if (!in_rebasing &&
        (io_rangeA.begin <= io_rangeB.begin) &&
        (io_rangeA.begin + nextInsertOffset >= io_rangeB.begin) &&
        (io_rangeA.op.type === ArrayChangeSetIterator.types.REMOVE) &&
        Array.isArray(io_rangeA.op.operation[1]) && // This is a reversible remove operation
        (io_rangeB.op.type === ArrayChangeSetIterator.types.INSERT)) {
        // Are the two operations canceling out?
        let startOffset = 0;
        let rangeStart = 0;
        let matchFound = false;
        let rangeLength = io_rangeB.op.operation[1].length;
        const operationMetaInfo = in_options && in_options.applyAfterMetaInformation &&
            in_options.applyAfterMetaInformation.get(io_rangeB.op.operation[1]);
        if (operationMetaInfo && operationMetaInfo.rebasedRemoveInsertRanges) {
            if (operationMetaInfo.currentInsertOffset === undefined) {
                operationMetaInfo.currentInsertOffset = 0;
                operationMetaInfo.currentRemoveOffset = 0;
            }
            let i = 0;
            for (; i < operationMetaInfo.rebasedRemoveInsertRanges.length; i++) {
                if (operationMetaInfo.rebasedRemoveInsertRanges[i].rangeStart >= operationMetaInfo.currentInsertOffset) {
                    startOffset = operationMetaInfo.rebasedRemoveInsertRanges[i].originalStartPosition -
                        io_rangeA.op.operation[0] +
                        io_rangeA.op.offset +
                        io_rangeB.op.offset;
                    rangeStart = operationMetaInfo.rebasedRemoveInsertRanges[i].rangeStart -
                        operationMetaInfo.currentInsertOffset;
                    rangeLength = operationMetaInfo.rebasedRemoveInsertRanges[i].rangeLength;

                    if (io_rangeA.op.operation[1].length - startOffset >= rangeLength &&
                        isEqual(io_rangeA.op.operation[1].slice(startOffset, startOffset + rangeLength),
                            io_rangeB.op.operation[1].slice(rangeStart, rangeStart + rangeLength))) {
                        matchFound = true;

                        // If we have an remove / insert operation in the range A we have to make sure,
                        // the insert happens at the correct position within the remove range after canceling
                        // out the insert/remove combination.
                        // We decide this, based on the position of the insert in iterator B relative to the insert
                        // in iterator A. If the insert in iterator B is behind the insert in iteraator A, we have
                        // to move the insert from A to the beginning of the remove range, since it has to placed
                        // before the canceled range.
                        if (nextInsertOffset > 0 &&
                            io_rangeB.begin >= io_rangeA.begin + nextInsertOffset) {
                            const newStartOffset = io_rangeA.op.operation[0] + startOffset - io_rangeA.op.offset;

                            // We don't want to shift the insertion backwards, if it already is before the position of the
                            // canceled entry
                            io_rangeA.removeInsertOperation[0] = Math.min(io_rangeA.removeInsertOperation[0], newStartOffset);
                        }
                        break;
                    }
                }
            }
        } else {
            if (io_rangeA.op.operation[1].length === rangeLength &&
                isEqual(io_rangeA.op.operation[1],
                    io_rangeB.op.operation[1])) {
                matchFound = true;
            }
        }
        if (matchFound) {
            if (startOffset > 0) {
                io_resultingSegment.begin = io_rangeA.begin;
                io_resultingSegment.end = io_rangeA.begin;

                io_resultingSegment.op = {
                    type: io_rangeA.op.type,
                    operation: [] as any,
                };
                io_resultingSegment.op.operation[0] = io_rangeA.op.operation[0];
                io_resultingSegment.flag = ArrayChangeSetRangeType.partOfA;

                // cut the remaining segment entry
                _splitArrayParameter(io_resultingSegment.op.operation, io_rangeA.op.operation,
                    io_rangeA.op.operation, startOffset);
                io_rangeA.op.operation[0] += startOffset;
                operationMetaInfo.currentRemoveOffset += startOffset;
                return;
            } else if (rangeStart > 0) {
                io_resultingSegment.begin = io_rangeB.begin;
                io_resultingSegment.end = rangeStart;

                io_resultingSegment.op = {
                    type: io_rangeB.op.type,
                    operation: [] as any,
                };
                io_resultingSegment.op.operation[0] = io_rangeB.op.operation[0];

                io_resultingSegment.flag = ArrayChangeSetRangeType.partOfB;

                // cut the remaining segment entry
                _splitArrayParameter(io_resultingSegment.op.operation, io_rangeB.op.operation,
                    io_rangeB.op.operation, rangeStart);
                operationMetaInfo.currentInsertOffset += rangeStart;
                return;
            } else {
                if (operationMetaInfo) {
                    operationMetaInfo.currentRemoveOffset += rangeLength;
                    operationMetaInfo.currentInsertOffset += rangeLength;
                }

                io_resultingSegment.begin = io_rangeA.begin;
                io_resultingSegment.end = io_rangeA.end;
                io_resultingSegment.op = undefined; // This is used to indicate that we don't need any operation

                if (io_rangeB.op.operation[1].length === rangeLength) {
                    if (io_rangeA.op.operation[1].length === rangeLength) {
                        // We consume both A and B
                        io_resultingSegment.flag = ArrayChangeSetRangeType.completeAcompleteB;
                    } else {
                        io_resultingSegment.flag = ArrayChangeSetRangeType.completeBpartOfA;
                    }
                } else {
                    if (io_rangeA.op.operation[1].length === rangeLength) {
                        // We consume A and leave a part of B
                        io_resultingSegment.flag = ArrayChangeSetRangeType.completeApartOfB;
                    } else {
                        io_resultingSegment.flag = ArrayChangeSetRangeType.partOfApartOfB;
                    }
                }
                // cut the remaining segment entry
                if (io_resultingSegment.flag === ArrayChangeSetRangeType.partOfApartOfB ||
                    io_resultingSegment.flag === ArrayChangeSetRangeType.completeBpartOfA) {
                    _splitArrayParameter(undefined, io_rangeA.op.operation,
                        io_rangeA.op.operation, rangeLength);
                    io_rangeA.op.operation[0] += rangeLength;
                }

                // cut the remaining segment entry
                if (io_resultingSegment.flag === ArrayChangeSetRangeType.partOfApartOfB ||
                    io_resultingSegment.flag === ArrayChangeSetRangeType.completeApartOfB) {
                    _splitArrayParameter(undefined, io_rangeB.op.operation,
                        io_rangeB.op.operation, rangeLength);
                }

                return;
            }
        }
    }

    if ((io_rangeA.end < io_rangeB.begin) || // please see in_rebasing comments in the function description
        ((!in_rebasing || io_rangeA.op.type === ArrayChangeSetIterator.types.REMOVE) &&
            (io_rangeA.end === io_rangeB.begin))) {
        io_resultingSegment.begin = io_rangeA.begin;
        io_resultingSegment.end = io_rangeA.end;
        io_resultingSegment.op = io_rangeA.op;
        io_resultingSegment.flag = io_rangeA.flag;

        // We need to store the length of the adjacent remove operation for later squashes
        if (in_rebasing &&
            io_rangeA.op.type === ArrayChangeSetIterator.types.REMOVE &&
            io_rangeA.end === io_rangeB.begin) {
            if (in_options && in_options.applyAfterMetaInformation) {
                let length = io_rangeB.op.operation[1];
                if (!isNumber(length)) {
                    length = length.length;
                }

                in_options.applyAfterMetaInformation.set(io_rangeB.op.operation[1], {
                    rebasedRemoveInsertRanges: [{
                        rangeStart: 0,
                        rangeLength: length,
                        originalStartPosition: io_rangeA.end + io_rangeB.op.offset,
                    }],
                });
            }
        }
        return;
    }
    if ((io_rangeB.end < io_rangeA.begin) || // please see in_rebasing comments in the function description
        (!in_rebasing && (io_rangeB.end === io_rangeA.begin))) {
        io_resultingSegment.begin = io_rangeB.begin;
        io_resultingSegment.end = io_rangeB.end;
        io_resultingSegment.op = io_rangeB.op;
        io_resultingSegment.flag = io_rangeB.flag;
        return;
    }
    // handle real overlaps:
    if (io_rangeA.begin < io_rangeB.begin) {
        // take A up to the begin of B
        io_resultingSegment.begin = io_rangeA.begin;
        io_resultingSegment.end = io_rangeB.begin;

        // to avoid deepCopy, we just copy the necessary parts of the op:
        io_resultingSegment.op = {
            type: io_rangeA.op.type,
            operation: [] as any,
        };
        io_resultingSegment.op.operation[0] = io_rangeA.op.operation[0];
        io_resultingSegment.flag = ArrayChangeSetRangeType.partOfA;

        // cut the remaining segment entry
        _splitOperation(io_rangeA, io_resultingSegment.op, io_rangeB.begin - io_rangeA.begin, true);

        io_rangeA.begin = io_rangeB.begin;
        io_rangeA.op.operation[0] = io_rangeB.begin;
    } else if (io_rangeA.begin === io_rangeB.begin) {
        // find the largest common range:
        io_resultingSegment.begin = io_rangeA.begin;
        io_resultingSegment.end = undefined;

        // to avoid deepCopy, we just copy the necessary parts of the op:
        io_resultingSegment.opA = {
            type: io_rangeA.op.type,
            operation: [],
            _absoluteBegin: io_rangeA.op._absoluteBegin,
        };
        io_resultingSegment.opA.operation[0] = io_rangeA.op.operation[0];
        io_resultingSegment.opB = {
            type: io_rangeB.op.type,
            operation: [],
            offset: io_rangeB.op.offset,
        };
        io_resultingSegment.opB.operation[0] = io_rangeB.op.operation[0];

        // who ends first, A or B?
        if (io_rangeA.end < io_rangeB.end) {
            // segment A ends first, it is consumed by the resulting merged segment!
            // a part of segment B remains and needs updates
            io_resultingSegment.end = io_rangeA.end;
            io_resultingSegment.flag = ArrayChangeSetRangeType.completeApartOfB;

            // cut the remaining segment B entries (segment A needs no update!)
            _splitOperation(io_rangeB, io_resultingSegment.opB, io_rangeA.end - io_rangeA.begin, false);

            // just copy opA
            _copyOperation(io_rangeA.op, io_resultingSegment.opA);

            io_rangeB.begin = io_rangeA.end;
            io_rangeB.op.operation[0] = io_rangeA.end;
        } else if (io_rangeA.end > io_rangeB.end) {
            // segment B ends first, it is consumed by the resulting merged segment!
            // a part of segment A remains and needs updates
            io_resultingSegment.end = io_rangeB.end;
            io_resultingSegment.flag = ArrayChangeSetRangeType.completeBpartOfA;

            // cut the remaining segment A entry
            _splitOperation(io_rangeA, io_resultingSegment.opA, io_rangeB.end - io_rangeB.begin, true);

            // just copy opB
            _copyOperation(io_rangeB.op, io_resultingSegment.opB);

            io_rangeA.begin = io_rangeB.end;
            io_rangeA.op.operation[0] = io_rangeB.end;
        }
        if (io_rangeA.end === io_rangeB.end) {
            io_resultingSegment.end = io_rangeB.end;
            io_resultingSegment.flag = ArrayChangeSetRangeType.completeAcompleteB;
            // both are fully used, no cut needed!

            // copy ops
            _copyOperation(io_rangeA.op, io_resultingSegment.opA);
            _copyOperation(io_rangeB.op, io_resultingSegment.opB);
        }
    } else if (io_rangeB.begin < io_rangeA.begin) {
        // take B up to the begin of A
        io_resultingSegment.begin = io_rangeB.begin;
        io_resultingSegment.end = io_rangeA.begin;

        // to avoid deepCopy, we just copy the necessary parts of the op:
        io_resultingSegment.op = {
            type: io_rangeB.op.type,
            operation: [] as any,
        };
        io_resultingSegment.op.operation[0] = io_rangeB.op.operation[0];
        io_resultingSegment.flag = ArrayChangeSetRangeType.partOfB;

        // cut the remaining segment entry
        _splitOperation(io_rangeB, io_resultingSegment.op, io_rangeA.begin - io_rangeB.begin, false);

        io_rangeB.begin = io_rangeA.begin;
        io_rangeB.op.operation[0] = io_rangeA.begin;
        io_rangeB.op.offset = 0;
    }
};

/**
 * merge in_op with the last op of that category in io_changeset (if possible)
 * e.g. merge an delete [1,3] with delete [3,2] to delete [1,5]
 * @param in_op - the op to merge
 * @param io_changeset - the changeset to merge the op to
 * @param in_targetIndex the transformed target index offset
 * @returns true if the merge was possible and executed
 */
const mergeWithLastIfPossible = function(
    in_op: GenericOperation,
    io_changeset: SerializedChangeSet,
    in_targetIndex: number,
    in_options?: ApplyChangeSetOptions): boolean {
    let lastOp;
    switch (in_op.type) {
        case ArrayChangeSetIterator.types.INSERT: {
            if (io_changeset.insert.length === 0) {
                return false;
            }
            lastOp = io_changeset.insert[io_changeset.insert.length - 1];
            if (lastOp[0] === in_targetIndex) {
                // If we merge two segments, we also have to merge the attached meta information and store mappings for the
                // sub-ranges of the merged segment
                let mergedRangeMetaInformation;
                if (in_options && in_options.applyAfterMetaInformation) {
                    const previousMetaInfo = in_options.applyAfterMetaInformation.get(lastOp[1]);
                    const currentMetaInfo = in_options.applyAfterMetaInformation.get(in_op.operation[1]);
                    if (previousMetaInfo || currentMetaInfo) {
                        // Get the range information attached to the segments that get merged
                        const previousRange = (previousMetaInfo && previousMetaInfo.rebasedRemoveInsertRanges) || [];
                        const nextRange = (currentMetaInfo && currentMetaInfo.rebasedRemoveInsertRanges) || [];

                        // Update the start index
                        for (let i = 0; i < nextRange.length; i++) {
                            nextRange[i].rangeStart += lastOp[1].length;
                        }

                        for (let i = 0; i < nextRange.length; i++) {
                            previousRange.push(nextRange[i]);
                        }

                        mergedRangeMetaInformation = previousRange;

                        // Remove the old entries from the meta information
                        in_options.applyAfterMetaInformation.delete(lastOp[1]);
                        in_options.applyAfterMetaInformation.delete(in_op.operation[1]);
                    }
                }

                // merge with last insert
                if (isString(in_op.operation[1])) {
                    for (let i = 0; i < in_op.operation[1].length; i++) {
                        lastOp[1] += in_op.operation[1][i];
                    }
                } else {
                    for (let i = 0; i < in_op.operation[1].length; i++) {
                        lastOp[1].push(in_op.operation[1][i]);
                    }
                }
                // Store the updated meta-information
                if (mergedRangeMetaInformation) {
                    in_options.applyAfterMetaInformation.set(lastOp[1], {
                        rebasedRemoveInsertRanges: mergedRangeMetaInformation,
                    });
                }
            } else {
                return false;
            }
            break;
        }
        case ArrayChangeSetIterator.types.REMOVE: {
            // We cannot perform merges for removes here, as those
            // also depend on the insert positions, which might not
            // yet have been processed when the remove is processed.
            // We handle these in a post processing step instead
            throw new Error("Should never happen");
        }
        case ArrayChangeSetIterator.types.MODIFY:
            if (io_changeset.modify.length === 0) {
                return false;
            }
            lastOp = io_changeset.modify[io_changeset.modify.length - 1];
            if (lastOp[0] + lastOp[1].length === in_targetIndex) {
                // merge with last modify
                lastOp[1] = lastOp[1].concat(in_op.operation[1]);
                if (lastOp[2] !== undefined) {
                    lastOp[2] = lastOp[2].concat(in_op.operation[2]);
                }
            } else {
                return false;
            }
            break;
        default:
            throw new Error(`pushOp: ${MSG.UNKNOWN_OPERATION}${in_op.type}`);
    }
    return true;
};

interface RemoveOpInfo {
    position: number;
    offsetIncremented: boolean;
    length: number;
}

/**
 * push an operation to a changeset, will try to merge the op if possible
 * @param in_op the operation we want to push
 * @param io_changeset target
 * @param the current offset
 * @param in_options - Optional additional parameters
 * @param in_lastIteratorARemove - Information about the last remove operation in iterator A
 * @param in_segment - Segment this operation is part of
 */
const pushOp = function(
    in_op: GenericOperation,
    io_changeset: SerializedChangeSet,
    in_indexOffset: number,
    in_options?: ApplyChangeSetOptions,
    in_lastIteratorARemove?: RemoveOpInfo,
    in_segment?: SegmentType) {
    let writeTargetIndex;
    if (ArrayChangeSetIterator.types.NOP !== in_op.type) {
        writeTargetIndex = in_op.operation[0] - in_indexOffset;

        // We have to update the write target index, if we have an insert at the
        // position of a remove. In that case, we have to move the insert to the beginning
        // of the remove range, to make sure, it will give consistent results with individually
        // rebasing the two changsets (first rebasing an insert at the beginning of the remove the
        // wouldn't have an effect on rebased changeset and then rebasing it with respect to the
        // insert would move it befind the insert. If we do this rebase with respect to the combined
        // CS, we must have the insert before the remove to make sure it is taken into account)
        if (ArrayChangeSetIterator.types.INSERT === in_op.type &&
            in_lastIteratorARemove !== undefined &&
            in_segment.flag === ArrayChangeSetRangeType.completeB) {
            if (in_lastIteratorARemove.position == in_op.operation[0] &&
                in_lastIteratorARemove.offsetIncremented) {
                writeTargetIndex -= in_lastIteratorARemove.length;
            }
        }
        if (writeTargetIndex < 0) {
            writeTargetIndex = 0; // TODO: investigate negative index!
        }
    }
    switch (in_op.type) {
        case ArrayChangeSetIterator.types.INSERT: {
            if (in_options && in_options.applyAfterMetaInformation && !isNumber(in_op.operation[1])) {
                // If we don't have any meta information yet, we add an entry with the correct offset applied
                const metaInfo = in_options.applyAfterMetaInformation.get(in_op.operation[1]);
                if (!metaInfo) {
                    in_options.applyAfterMetaInformation.set(in_op.operation[1], {
                        rebasedRemoveInsertRanges: [{
                            rangeStart: 0,
                            rangeLength: in_op.operation[1].length,
                            originalStartPosition: in_op.operation[0],
                        }],
                    });
                }
            }

            if (!mergeWithLastIfPossible(in_op, io_changeset, writeTargetIndex, in_options)) {
                io_changeset.insert.push([writeTargetIndex, in_op.operation[1]]);
            }
            break;
        }
        case ArrayChangeSetIterator.types.REMOVE: {
            // Note: we don't merge removes here, since those depend on not yet processed inserts.
            // This is done in a post processing step instead

            // our segmentation method currently can produce length zero remove segments
            // this is by by design and those filtered out here
            const length = getOpLength(in_op.operation);
            if (length > 0) {
                io_changeset.remove.push([writeTargetIndex, in_op.operation[1]]);
            }
            break;
        }
        case ArrayChangeSetIterator.types.MODIFY: {
            if (!mergeWithLastIfPossible(in_op, io_changeset, writeTargetIndex, in_options)) {
                if (in_op.operation[2] !== undefined) {
                    io_changeset.modify.push([writeTargetIndex, in_op.operation[1], in_op.operation[2]]);
                } else {
                    io_changeset.modify.push([writeTargetIndex, in_op.operation[1]]);
                }
            }
            break;
        }
        case ArrayChangeSetIterator.types.NOP: {
            // nothing to do
            break;
        }
        default:
            throw new Error(`pushOp: ${MSG.UNKNOWN_OPERATION}${(in_op as any).type}`);
    }
};

/**
 * handle combinations of range operations
 * e.g. an insert and delete at the same place and same length nullify each other
 * @param in_segment the two ops to be combined
 * @param in_isPrimitiveType is it an array of primitive types
 * ATTENTION: We overwrite opB to save garbage (instead of creating a result OP)
 */
const handleCombinations = function(in_segment: SegmentType, in_isPrimitiveType: boolean) {
    const opA = in_segment.opA;
    const opB = in_segment.opB;
    switch (opA.type) {
        case ArrayChangeSetIterator.types.INSERT: {
            switch (opB.type) {
                case ArrayChangeSetIterator.types.INSERT: {
                    // this combination is not reachable since this case has already been handled before
                    console.error("this combination should not occur in handleCombinations - this is a bug");
                    break;
                }
                case ArrayChangeSetIterator.types.REMOVE: {
                    // Attention: B removes A completely, kill A to avoid zero inserts
                    let opBLen;
                    if (isNumber(opB.operation[1])) {
                        opBLen = opB.operation[1];
                    } else {
                        opBLen = opB.operation[1].length;
                    }
                    if (opBLen !== opA.operation[1].length) {
                        throw new Error("handleCombinations: insert-remove: unequal number of affected entries");
                    }

                    (opB as GenericOperation).type = ArrayChangeSetIterator.types.NOP;
                    opB.operation = null;
                    break;
                }
                case ArrayChangeSetIterator.types.MODIFY: {
                    // we have to apply modify of B to As insert
                    if (in_isPrimitiveType) {
                        // since the length of A and B is equal in here
                        // we can just insert the modified values instead
                        (opB as GenericOperation).type = ArrayChangeSetIterator.types.INSERT;
                    } else {
                        // the array element is a complex types
                        // we have to recursively call the modify
                        for (let i = 0; i < opB.operation[1].length; ++i) {
                            // TypeIds MUST be stored in the entries
                            ConsoleUtils.assert(opA.operation[1][i].typeid, "Malformed Operation. Missing typeid");

                            this.performApplyAfterOnPropertyWithTypeid(i,
                                opA.operation[1],
                                opB.operation[1],
                                opA.operation[1][i].typeid,
                                false);
                        }
                        opB.operation = opA.operation;
                        (opB as GenericOperation).type = ArrayChangeSetIterator.types.INSERT;
                    }
                    break;
                }
                default:
                    throw new Error(`handleCombinations: ${MSG.UNKNOWN_OPERATION}${opB.type}`);
            }
            break;
        }
        case ArrayChangeSetIterator.types.REMOVE: {
            // this combination is not reachable since this case has already been handled before
            console.error("this combination should not occur in handleCombinations - this is a bug");
            break;
        }
        case ArrayChangeSetIterator.types.MODIFY: {
            if (in_isPrimitiveType) {
                // If we have a reversible changeset, we
                // have to keep the previous state from before the
                // apply after
                if (opA.operation[2] !== undefined) {
                    (opB as ModifyOperation).operation[2] = opA.operation[2];
                }
                break;
            } else {
                // we have to deal with complex types here!
                if (opB.type === ArrayChangeSetIterator.types.MODIFY) {
                    for (let i = 0; i < opB.operation[1].length; ++i) {
                        // TypeIds MUST be stored in the entries
                        ConsoleUtils.assert(opA.operation[1][i].typeid, "Malformed Operation. Missing typeid");

                        this.performApplyAfterOnPropertyWithTypeid(i,
                            opA.operation[1],
                            opB.operation[1],
                            opA.operation[1][i].typeid,
                            false);
                    }
                    opB.operation = opA.operation;
                }
                break;
            }
        }
        default:
            throw new Error(`handleCombinations: ${MSG.UNKNOWN_OPERATION}${opA.type}`);
    }
};

/**
 * Tests if 2 arrays of the same length, containing primitive values, contain the same values.
 *
 * @param in_arr1 - First array to compare
 * @param in_arr2 - Second array to compare
 * @returns True if arrays contain the same values, false otherwise
 */
const arraysHaveSameValues = function(in_arr1: arrayModifyList[1], in_arr2: arrayModifyList[1]): boolean {
    // We assume arrays are of same length
    const len = in_arr1.length;
    if (len !== in_arr2.length) {
        return false;
    }

    let i;
    // For (u)int64, values are arrays of 2 elements
    if (len > 0 && in_arr1[0].length === 2) {
        for (i = 0; i < len; i++) {
            if (in_arr1[i][0] !== in_arr2[i][0] || in_arr1[i][1] !== in_arr2[i][1]) {
                break;
            }
        }
    } else {
        for (i = 0; i < len; i++) {
            if (in_arr1[i] !== in_arr2[i]) {
                break;
            }
        }
    }
    return i === len;
};

/**
 * handle combinations of range operations
 * e.g. an insert and delete at the same place and same length nullify each other
 *
 * ATTENTION: We overwrite opB to save garbage (instead of creating a result OP)
 *
 * We have to handle the conflicting rebase changes. The changes we do, are summarized in this table.
 * Other is the modified, rebased (on own) changeset.
 *                   BASE
 *                  /    \
 *                 /      \
 *               OWN      OTHER
 *
 * gets rebased to:
 *
 *                 BASE
 *                  /
 *               OWN
 *                  \
 *                OTHER
 *
 * conflict default behavior in ()
 *
 * -------|-----------------+------------------+------------------|
 *    \Own|    insert       |       modify     |     remove       |
 *     \  |                 |                  |                  |
 * other\ |                 |                  |                  |
 * ------\|-----------------+------------------+------------------|
 *        | conflicting     | non-conflicting  | non-conflicting  |
 * insert | inserts         | change           | change           |
 *        | (i. other after)|                  |                  |
 * -------|-----------------+------------------+------------------|
 *        | non-conflicting | merge recursively| conflict         |
 * modify | change          | (note the user)  | (delete modify   |
 *        |                 |                  | in other)        |
 *        |                 |                  |                  |
 * -------|-----------------+------------------+------------------|
 *        | non-conflicting | non-conflicting  | non-conflicting  |
 * remove | change          | change           | change           |
 *        | [rem orig. data]| (note the user)  | [rem dupl. rem]  |
 * -------|-----------------+------------------+------------------|
 *
 * @param {{opA:{}, opB:{}}} in_segment the two ops to be combined
 * @param {Array.<property-changeset.ChangeSet.ConflictInfo>} out_conflicts -
 *     A list of paths that resulted in conflicts together with the type of the conflict
 * @param {string} in_basePath -
 *     Base path to get to the property processed by this function
 * @param {boolean} in_isPrimitiveType is it an array of primitive types
 * @param {Object} [in_options] - Optional additional parameters
 * @param {Map} [in_options.applyAfterMetaInformation] - Additional meta information which help later to obtain
 *                                                       more compact changeset during the apply operation
 */
const handleRebaseCombinations = function(
    in_segment: SegmentType,
    out_conflicts: ConflictInfo[],
    in_basePath: string,
    in_isPrimitiveType: string,
    in_options: ApplyChangeSetOptions) {
    const opA = in_segment.opA;
    const opB = in_segment.opB;
    if (opB.type === ArrayChangeSetIterator.types.INSERT) {
        const originalStartPosition = opB.operation[0] + opB.offset;
        if (in_options && in_options.applyAfterMetaInformation) {
            let length: number;
            const insertEntries = opB.operation[1];
            if (!isNumber(insertEntries)) {
                length = insertEntries.length;

                in_options.applyAfterMetaInformation.set(insertEntries, {
                    rebasedRemoveInsertRanges: [{
                        rangeStart: 0,
                        rangeLength: length,
                        originalStartPosition,
                    }],
                });
            }
        }
    }

    const handleInsert = (insertOp: Omit<InsertOperation, 'type'>, baseOp: InsertOperation) => {
        // conflicting inserts - report conflict, insert both
        delete insertOp._absoluteBegin;
        delete baseOp.offset;
        const conflict = {
            path: in_basePath, // TODO: We have to report the range or per element
            type: ConflictType.INSERTED_ENTRY_WITH_SAME_KEY, // todo
            conflictingChange: cloneDeep(baseOp),
        };
        out_conflicts.push(conflict);

        // move to the right side of the insert
        baseOp.operation[0] += insertOp.operation[1].length;
    };
    switch (opA.type) {
        case ArrayChangeSetIterator.types.INSERT: {
            switch (opB.type) {
                case ArrayChangeSetIterator.types.INSERT: {
                    handleInsert(opA, opB);
                    break;
                }
                case ArrayChangeSetIterator.types.REMOVE: {
                    // non-conflicting insert - just keep B
                    break;
                }
                case ArrayChangeSetIterator.types.MODIFY: {
                    // non-conflicting insert - just keep B
                    break;
                }
                default:
                    throw new Error(`handleCombinations: ${MSG.UNKNOWN_OPERATION}${opB.type}`);
            }
            break;
        }
        case ArrayChangeSetIterator.types.REMOVE: {
            switch (opB.type) {
                case ArrayChangeSetIterator.types.INSERT: {
                    if (opA._absoluteBegin !== opA.operation[0]) {
                        // Move the insert operation to the beginning of the removed range
                        opB.operation[0] -= opA.operation[0] - opA._absoluteBegin;
                    }

                    // If we have a range with a remove / insert operation, we have
                    // to take the insert operation within the base changeset
                    // into account during rebasing, moving the rebased operation
                    // behind this insert
                    if (in_segment.removeInsertOperationA &&
                        in_segment.removeInsertOperationA[0] === opB.operation[0]) {
                        handleInsert({
                            operation: in_segment.removeInsertOperationA as arrayInsertList,
                        }, opB);
                    }
                    break;
                }
                case ArrayChangeSetIterator.types.REMOVE: {
                    // Remove already in A, no need to add the same again -> write nop

                    let opBLen; let opALen;
                    if (isNumber(opB.operation[1])) {
                        opBLen = opB.operation[1];
                    } else {
                        opBLen = opB.operation[1].length;
                    }
                    if (isNumber(opA.operation[1])) {
                        opALen = opA.operation[1];
                    } else {
                        opALen = opA.operation[1].length;
                    }

                    if (opBLen !== opALen) {
                        throw new Error("handleRebaseCombinations: remove-remove: unequal number of affected entries, " +
                            "this should never happen! Probably a bug in splitRange.");
                    }
                    (opB as GenericOperation).type = ArrayChangeSetIterator.types.NOP;
                    opB.operation = null;
                    break;
                }
                case ArrayChangeSetIterator.types.MODIFY: {
                    // trying to modify something that was removed ->
                    // replace the modify with a NOP and report a conflict

                    if (opB.operation[1].length > 0) {
                        delete opA._absoluteBegin;
                        delete opB.offset;
                        let conflict = {
                            path: in_basePath, // TODO: We have to report the range or per element
                            type: ConflictType.ENTRY_MODIFIED_AFTER_REMOVE,
                            conflictingChange: cloneDeep(opB),
                        };
                        out_conflicts.push(conflict);
                    }

                    (opB as GenericOperation).type = ArrayChangeSetIterator.types.NOP;
                    opB.operation = null;

                    break;
                }
                default:
                    throw new Error(`handleCombinations: ${MSG.UNKNOWN_OPERATION}${opB.type}`);
            }
            break;
        }
        case ArrayChangeSetIterator.types.MODIFY: {
            if (in_isPrimitiveType) {
                // just use opB and notify accordingly
                if (opB.type === ArrayChangeSetIterator.types.MODIFY && opB.operation[1].length > 0) {
                    delete opA._absoluteBegin;
                    delete opB.offset;
                    let conflict = {
                        path: in_basePath, // TODO: We have to report the range or per element
                        type: ConflictType.COLLIDING_SET,
                        conflictingChange: cloneDeep(opB),
                    };
                    out_conflicts.push(conflict);
                    // If opB new value is same as opA new value, replace the modify with a NOP
                    // TODO: The real operation that we should do here is not to only test if both arrays are
                    //       completely identical, but if any value is identical and if so split the range
                    //       into multiple ones.
                    //       Ex. [[0, [30, 20, 10]]] over [[0, [10, 20, 30]]] should become [[0, [30]], [2, [10]]].
                    //       This does not seem easily doable in the current code.
                    if (arraysHaveSameValues(opA.operation[1], opB.operation[1])) {
                        (opB as GenericOperation).type = ArrayChangeSetIterator.types.NOP;
                        opB.operation = null;
                        // If any, change the opB old value by the opA new value
                    } else if (opB.operation[2]) {
                        opB.operation[2] = opA.operation[1].slice();
                    }
                }
                if (opB.type === ArrayChangeSetIterator.types.REMOVE && opB.operation[1] > 0) {
                    delete opA._absoluteBegin;
                    delete opB.offset;
                    let conflict = {
                        path: in_basePath, // TODO: We have to report the range or per element
                        type: ConflictType.REMOVE_AFTER_MODIFY,
                        conflictingChange: cloneDeep(opB),
                    };
                    out_conflicts.push(conflict);
                }
                break;
            } else {
                // we have to deal with complex types here!
                if (opB.type === ArrayChangeSetIterator.types.MODIFY) {
                    for (let i = 0; i < opB.operation[1].length; ++i) {
                        ConsoleUtils.assert(opA.operation[1][i].typeid, "Malformed Operation. Missing typeid");

                        this.rebaseChangeSetForPropertyEntryWithTypeid(i,
                            opA.operation[1],
                            opB.operation[1],
                            opA.operation[1][i].typeid,
                            `${in_basePath}[${i}]`,
                            false,
                            out_conflicts,
                            in_options);
                    }
                }
                break;
            }
        }
        default:
            throw new Error(`handleCombinations: ${MSG.UNKNOWN_OPERATION}${opA.type}`);
    }
};

/**
 * apply a range's operation to the changeset
 * @param in_segment to be applied
 * @param io_changeset target
 * @param in_currentIndexOffset current offset
 * @param in_isPrimitiveType is it an array of primitive types
 */
const applySegment = function(
    in_segment: SegmentType,
    io_changeset: SerializedChangeSet,
    in_currentIndexOffset: number,
    lastIteratorARemove: RemoveOpInfo,
    in_isPrimitiveType: boolean,
    in_options?: ApplyChangeSetOptions) {
    if (!in_segment) {
        throw Error("applySegment: in_segment is undefined!");
    }

    // No operation needs to be performed
    if (in_segment.op === undefined && in_segment.opA === undefined && in_segment.opB === undefined) {
        return;
    }
    if (in_segment.flag === ArrayChangeSetRangeType.completeA ||
        in_segment.flag === ArrayChangeSetRangeType.completeB ||
        in_segment.flag === ArrayChangeSetRangeType.partOfA ||
        in_segment.flag === ArrayChangeSetRangeType.partOfB ||
        in_segment.flag === ArrayChangeSetRangeType.partOfApartOfB) {
        // just push it
        pushOp(in_segment.op, io_changeset, in_currentIndexOffset, in_options, lastIteratorARemove, in_segment);
    } else {
        // combinations: pAB, AB or ApB
        handleCombinations.call(this, in_segment, in_isPrimitiveType); // modifies in_segment.opB to save garbage
        pushOp(in_segment.opB, io_changeset, in_currentIndexOffset, in_options);
    }
};

/**
 * apply a range's operation to the rebased changeset
 * @param in_segment to be applied
 * @param io_changeset target
 * @param in_currentIndexOffset current offset
 * @param out_conflicts - A list of paths that resulted in conflicts together with the type of the conflict
 * @param in_basePath - Base path to get to the property processed by this function
 * @param in_isPrimitiveType is it an array of primitive types
 */
const applyRebaseSegment = function(
    in_segment: SegmentType,
    io_changeset: SerializedChangeSet,
    in_currentIndexOffset: number,
    out_conflicts: ConflictInfo[],
    in_basePath: string,
    in_isPrimitiveType: boolean,
    in_options?: ApplyChangeSetOptions) {
    if (!in_segment) {
        throw Error("applySegment: in_segment is undefined!");
    }
    if (in_segment.flag === ArrayChangeSetRangeType.completeB ||
        in_segment.flag === ArrayChangeSetRangeType.partOfB) {
        // not touching anything of A, just push it
        pushOp(in_segment.op, io_changeset, in_currentIndexOffset, in_options);
    } else if (in_segment.flag === ArrayChangeSetRangeType.completeA ||
        in_segment.flag === ArrayChangeSetRangeType.partOfA) {
        // do nothing (we are rebasing B, not A)
    } else {
        // combinations: pAB, AB or ApB
        handleRebaseCombinations.call(this, in_segment, out_conflicts,
            in_basePath, in_isPrimitiveType, in_options); // modifies in_segment.opB to save garbage
        pushOp(in_segment.opB, io_changeset, in_currentIndexOffset, in_options);
    }
};

export namespace ChangeSetArrayFunctions {

    /**
     * Applies a changeset to a given array property. The ChangeSet is assumed to be relative to the same
     * property root and it will be applied behind the base ChangeSet (assuming that the changes are relative to the
     * state after the base ChangeSet has been applied. It will change the base ChangeSet.)
     *
     * @param io_basePropertyChanges    - The ChangeSet describing the initial state
     * @param in_appliedPropertyChanges - The ChangeSet to apply to this state
     * @param in_typeid                 - The typeid of the contents of the collection (without the collection type)
     */
    export function _performApplyAfterOnPropertyArray(
        io_basePropertyChanges: SerializedChangeSet,
        in_appliedPropertyChanges: SerializedChangeSet,
        in_typeid: string,
        in_options?: ApplyChangeSetOptions) {
        ConsoleUtils.assert(in_typeid, "_performApplyAfterOnPropertyArray: typeid missing");
        ConsoleUtils.assert(!isString(io_basePropertyChanges), io_basePropertyChanges);
        ConsoleUtils.assert(!isString(in_appliedPropertyChanges), in_appliedPropertyChanges);

        const isPrimitiveTypeid = isPrimitiveType(in_typeid);

        // Iterator to process the changes in the ChangeSet in the correct order
        const iteratorA = new ArrayChangeSetIterator((io_basePropertyChanges));
        const iteratorB = new ArrayChangeSetIterator((in_appliedPropertyChanges));

        const rangeA: OperationRangeRemove | OperationRangeInsert = {};
        const rangeB: OperationRangeRemove | OperationRangeInsert = {};

        const opA = iteratorA.opDescription;
        const opB = iteratorB.opDescription;

        getRangeForCurrentStateOperation(opA, opA.offset ? opA.offset : 0, rangeA);
        getRangeForAppliedOperation(opB, rangeB, undefined, in_options);

        const resultPropertyChanges: SerializedChangeSet = {};
        resultPropertyChanges.insert = [];
        resultPropertyChanges.modify = [];
        resultPropertyChanges.remove = [];
        resultPropertyChanges.writeOffset = 0;

        let currentIndexOffset = 0;
        let lastIteratorARemove;
        const segment: OperationRangeRemove | OperationRangeInsert = {};
        let skipIteratorBOperation;

        const advanceIteratorB = () => {
            if ((opB as any).removeInsertOperation &&
                segment.op !== undefined &&
                skipIteratorBOperation === undefined &&
                segment.op.operation === (opB as any).removeInsertOperation) {
                skipIteratorBOperation = segment.op.operation;
            } else {
                iteratorB.next();
                if (skipIteratorBOperation &&
                    opB.operation === skipIteratorBOperation) {
                    iteratorB.next();
                }
                skipIteratorBOperation = undefined;
                getRangeForAppliedOperation(opB, rangeB, undefined, in_options);
            }
        };

        // create ranges for A and B: A is the current state and B is the change set to be applied
        let lastIndexOffset = 0;
        let canceledSegmentBegin;
        let lastOpWasNop = false;

        while (!iteratorA.atEnd() || !iteratorB.atEnd()) {
            // produce first segment:
            splitOverlapping(rangeA, rangeB, segment, false, in_options);

            let indexOffset = currentIndexOffset;

            if (lastOpWasNop &&
                (rangeA.begin === undefined || rangeA.begin >= segment.begin) &&
                (segment.flag === ArrayChangeSetRangeType.completeB &&
                    segment.op.type === ArrayChangeSetIterator.types.INSERT &&
                    segment.op.operation[0] === canceledSegmentBegin)) {
                indexOffset = lastIndexOffset;
            }

            applySegment.call(this, segment, resultPropertyChanges, indexOffset, lastIteratorARemove, isPrimitiveTypeid);
            lastOpWasNop = segment.opB !== undefined && segment.opB.type === ArrayChangeSetIterator.types.NOP;
            if (lastOpWasNop) {
                canceledSegmentBegin = segment.begin;
            }

            // increase pointers if necessary
            if (segment.flag === ArrayChangeSetRangeType.completeA ||
                segment.flag === ArrayChangeSetRangeType.completeApartOfB) {
                // We keep track of the last remove operation, because this information is needed
                // in pushOp to move inserts to the beginning of a remove range. The problem is
                // that the insert is processed after the remove and in that case the iterator
                // offset has already been incremented by the remove. Therefore, the insert would
                // be placed behind the remove. We detect this case and correct the offset accordingly
                // in pushOp
                if (opA.type === ArrayChangeSetIterator.types.REMOVE) {
                    if (!lastIteratorARemove ||
                        lastIteratorARemove.position !== opA.operation[0]) {
                        lastIteratorARemove = {
                            position: opA.operation[0],
                            length: getOpLength(opA.operation),
                            offsetIncremented: false,
                            currentIndex: opA.operation[0],
                        };

                        // If there is already an insert operation at the beginning of the remove range
                        // we have to adjust the position to the end of this operation (an insert that is
                        // applied at the position of the remove would be shifted behind this insert)
                        if (opA.removeInsertOperation) {
                            if (opA.removeInsertOperation[0] + opA.offset === lastIteratorARemove.position) {
                                lastIteratorARemove.position += getOpLength(opA.removeInsertOperation);
                            }
                        }
                    }
                }

                let moreAs = iteratorA.next();

                // The offset will only be incremented as soon as the iterator reaches an operation at a different index.
                // We detect this case and keep track, whether the remove has already been added to the offset or not.
                if (lastIteratorARemove &&
                    ((opA as any).operation === undefined || (opA as any).operation[0] !== lastIteratorARemove.currentIndex)) {
                    lastIteratorARemove.offsetIncremented = true;
                }
                getRangeForCurrentStateOperation(iteratorA.opDescription, moreAs ? opA.offset : 0, rangeA);
            }

            if (segment.flag === ArrayChangeSetRangeType.completeB ||
                segment.flag === ArrayChangeSetRangeType.completeBpartOfA) {
                advanceIteratorB();
            }
            if (segment.flag === ArrayChangeSetRangeType.completeAcompleteB) {
                let moreAs = iteratorA.next();
                getRangeForCurrentStateOperation(opA, moreAs ? opA.offset : 0, rangeA);
                advanceIteratorB();
            }

            if (opA.offset !== undefined) {
                // the correct index offset for the next operation is given by A's offset
                lastIndexOffset = currentIndexOffset;
                currentIndexOffset = opA.offset;
            }
        }

        // write back:
        if (resultPropertyChanges.insert.length > 0) {
            io_basePropertyChanges.insert = resultPropertyChanges.insert;
        } else {
            delete io_basePropertyChanges.insert;
        }
        if (resultPropertyChanges.modify.length > 0) {
            io_basePropertyChanges.modify = resultPropertyChanges.modify;
        } else {
            delete io_basePropertyChanges.modify;
        }

        if (resultPropertyChanges.remove.length > 0) {
            // Merge remove operations (but only, if there is no
            // insert inbetween the two removes)
            const insertPosition = new Set(resultPropertyChanges.insert.map((x) => x[0]));
            const mergedRemoves = [];
            for (const remove of resultPropertyChanges.remove) {
                const lastRemove = mergedRemoves[mergedRemoves.length - 1];
                if (lastRemove &&
                    lastRemove[0] + getOpLength(lastRemove) === remove[0] &&
                    !insertPosition.has(remove[0])) {
                    if (Array.isArray(remove[1])) {
                        lastRemove[1] = lastRemove[1].concat(remove[1]);
                    } else {
                        lastRemove[1] += remove[1];
                    }
                } else {
                    mergedRemoves.push(remove);
                }
            }
            io_basePropertyChanges.remove = mergedRemoves;
        } else {
            delete io_basePropertyChanges.remove;
        }
    }

    /**
     * Performs the rebase operation for array changes
     *
     * @param in_ownPropertyChangeSet -The ChangeSet for the property stored in this object
     * @param io_rebasePropertyChangeSet - The ChangeSet for the property to be rebased
     * @param in_basePath - Base path to get to the property processed by this function
     * @param out_conflicts - A list of paths that resulted in conflicts together with the type of the conflict
     * @param in_typeid - The typeid of the contents of the collection (without the collection type)
     */
    export function _rebaseArrayChangeSetForProperty(
        in_ownPropertyChangeSet: SerializedChangeSet,
        io_rebasePropertyChangeSet: SerializedChangeSet,
        in_basePath: string,
        out_conflicts: ConflictInfo[],
        in_typeid: string,
        in_options?: ApplyChangeSetOptions) {
        const isPrimitiveTypeid = isPrimitiveType(in_typeid);

        // Iterator to process the changes in the ChangeSet in the correct order
        const iteratorA = new ArrayChangeSetIterator((in_ownPropertyChangeSet));
        const iteratorB = new ArrayChangeSetIterator((io_rebasePropertyChangeSet));

        const opA = iteratorA.opDescription;

        const rangeA: OperationRangeRemove | OperationRangeInsert = {};
        getRangeForAppliedOperation(opA, rangeA, ArrayChangeSetRangeType.completeA, in_options);
        const rangeB: OperationRangeRemove | OperationRangeInsert = {};
        getRangeForAppliedOperation(iteratorB.opDescription, rangeB, undefined, in_options);

        const resultPropertyChanges: SerializedChangeSet = {};
        resultPropertyChanges.insert = [];
        resultPropertyChanges.modify = [];
        resultPropertyChanges.remove = [];
        resultPropertyChanges.writeOffset = 0;

        let currentIndexOffset = 0;
        const segment: OperationRangeRemove | OperationRangeInsert = {};

        // create ranges for A and B: A is the current state and B is the change set to be applied
        while (!iteratorA.atEnd() || !iteratorB.atEnd()) {
            splitOverlapping(rangeA, rangeB, segment, true, in_options);

            applyRebaseSegment.call(this, segment, resultPropertyChanges,
                currentIndexOffset, out_conflicts, in_basePath, isPrimitiveTypeid, in_options);

            // increase pointers if necessary
            if (segment.flag === ArrayChangeSetRangeType.completeA ||
                segment.flag === ArrayChangeSetRangeType.completeApartOfB) {
                iteratorA.next();
                getRangeForAppliedOperation(opA, rangeA, ArrayChangeSetRangeType.completeA, in_options);
            }

            if (segment.flag === ArrayChangeSetRangeType.completeB ||
                segment.flag === ArrayChangeSetRangeType.completeBpartOfA) {
                iteratorB.next();
                getRangeForAppliedOperation(iteratorB.opDescription, rangeB, undefined, in_options);
            }
            if (segment.flag === ArrayChangeSetRangeType.completeAcompleteB) {
                iteratorA.next();
                getRangeForAppliedOperation(opA, rangeA, ArrayChangeSetRangeType.completeA, in_options);
                iteratorB.next();
                getRangeForAppliedOperation(iteratorB.opDescription, rangeB, undefined, in_options);
            }

            if (opA.offset !== undefined) {
                // the correct index offset for the next operation is given by A's offset
                currentIndexOffset = -opA.offset;
            }
        }

        // write back:
        if (resultPropertyChanges.insert.length > 0) {
            io_rebasePropertyChangeSet.insert = resultPropertyChanges.insert;
        } else {
            delete io_rebasePropertyChangeSet.insert;
        }
        if (resultPropertyChanges.modify.length > 0) {
            io_rebasePropertyChangeSet.modify = resultPropertyChanges.modify;
        } else {
            delete io_rebasePropertyChangeSet.modify;
        }
        if (resultPropertyChanges.remove.length > 0) {
            // Merge remove operations (but only, if there is no
            // insert in between the two removes)
            const insertPosition = new Set(resultPropertyChanges.insert.map((x) => x[0]));
            const mergedRemoves = [];
            for (const remove of resultPropertyChanges.remove) {
                const lastRemove = mergedRemoves[mergedRemoves.length - 1];
                if (lastRemove &&
                    lastRemove[0] + getOpLength(lastRemove) === remove[0] &&
                    !insertPosition.has(remove[0])) {
                    if (Array.isArray(remove[1])) {
                        lastRemove[1] = lastRemove[1].concat(remove[1]);
                    } else {
                        lastRemove[1] += remove[1];
                    }
                } else {
                    mergedRemoves.push(remove);
                }
            }

            io_rebasePropertyChangeSet.remove = mergedRemoves;
        } else {
            delete io_rebasePropertyChangeSet.remove;
        }
    }

    /**
     * Performs the rebase operation for string changes
     *
     *
     * We have to handle the conflicting rebase changes. The changes we do, are summarized in this table.
     * Other is the modified, rebased (on own) changeset.
     *                   BASE
     *                  /    \
     *                 /      \
     *               OWN      OTHER
     *
     * gets rebased to:
     *
     *                 BASE
     *                  /
     *               OWN
     *                  \
     *                OTHER
     *
     * conflict default behavior in ()
     *
     * -------|-----------------+------------------+------------------|----------------|
     *    \Own|    insert       |       modify     |     remove       |   String set   |
     *     \  |                 |                  |                  |                |
     * other\ |                 |                  |                  |                |
     * ------\|-----------------+------------------+------------------|----------------|
     *        | conflicting     | non-conflicting  | non-conflicting  |   conflict     |
     * insert | inserts         | change           | change           |(ignore insert) |
     *        | (i. other after)|                  |                  |                |
     * -------|-----------------+------------------+------------------|----------------|
     *        | non-conflicting |     conflict     | conflict         |   conflict     |
     * modify | change          |(notify the user) | (delete modify   |(ignore modify) |
     *        |                 |                  | in other)        |                |
     * -------|-----------------+------------------+------------------|----------------|
     *        | non-conflicting | non-conflicting  | non-conflicting  |   conflict     |
     * remove | change          | change           | change           |(ignore remove) |
     * -------|-----------------+------------------+------------------+----------------|
     *  Str.  |                 |              conflict               |                |
     *  set   |           'other's set overwrites whatever happend before              |
     *        |                 |                  |                  |                |
     * --------------------------------------------------------------------------------|
     *
     * @param in_ownPropertyChangeSet - The ChangeSet for the property stored in this object
     * @param io_rebasePropertyChangeSetParent - The Array containing the ChangeSet for the property to be rebased
     * @param in_key the key to the ChangeSet in io_rebasePropertyChangeSetParent we are rebasing on
     * @param in_basePath - Base path to get to the property processed by this function
     * @param out_conflicts - A list of paths that resulted in conflicts together with the type of the conflict
     */

    export function _rebaseChangeSetForString(
        in_ownPropertyChangeSet: SerializedChangeSet,
        io_rebasePropertyChangeSetParent: SerializedChangeSet,
        in_key: string,
        in_basePath: string,
        out_conflicts: ConflictInfo[],
        in_options?: ApplyChangeSetOptions) {
        if (isString(io_rebasePropertyChangeSetParent[in_key]) || (io_rebasePropertyChangeSetParent[in_key] &&
            io_rebasePropertyChangeSetParent[in_key].hasOwnProperty("value"))) {
            // other overwrites any old changes, we ignore them and report the conflict
            let conflict = {
                path: in_basePath,
                type: ConflictType.COLLIDING_SET,
                conflictingChange: cloneDeep(in_ownPropertyChangeSet),
            };
            out_conflicts.push(conflict);
            // If value is the same, delete the entry
            let ownValue = in_ownPropertyChangeSet;
            if (typeof ownValue === "object") {
                ownValue = ownValue.value;
            }
            let rebaseValue = io_rebasePropertyChangeSetParent[in_key];
            if (typeof rebaseValue === "object") {
                rebaseValue = rebaseValue.value;
            }
            if (ownValue === rebaseValue) {
                delete io_rebasePropertyChangeSetParent[in_key];
            }
        } else if (isString(in_ownPropertyChangeSet) || (in_ownPropertyChangeSet &&
            in_ownPropertyChangeSet.hasOwnProperty("value"))) {
            // we have a conflict since we cannot allow insert/remove/modify on an unknown state
            // we just ignore other's modifications and take own's set
            let conflict = {
                path: in_basePath,
                type: ConflictType.COLLIDING_SET,
                conflictingChange: cloneDeep(io_rebasePropertyChangeSetParent[in_key]),
            };
            out_conflicts.push(conflict);
            io_rebasePropertyChangeSetParent[in_key] = in_ownPropertyChangeSet;
        } else {
            // both have no 'set' just array ops -> use array rebase!
            this._rebaseArrayChangeSetForProperty(in_ownPropertyChangeSet,
                io_rebasePropertyChangeSetParent[in_key],
                in_basePath,
                out_conflicts,
                "String",
                in_options);
        }
    }
}
