/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Iterator to iterate over array ChangeSets
 */

const _ = require('lodash');
const MSG = require('@fluid-experimental/property-common').constants.MSG;

/**
 * Iterator class which iterates over an array ChangeSet. It will successively return the operations ordered by their
 * position within the array. Additionally, it will keep track of the modifications to the array indices caused
 * by the previous operations.
 *
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The ChangeSet to iterate over (this has to be an array
 *                                                           ChangeSet)
 * @alias property-changeset.ChangeSetOperations.ArrayOperations.ArrayChangeSetIterator
 * @constructor
 * @public
 * @category PropertyUtils
 */
var ArrayChangeSetIterator = function(in_changeSet) {
  this._changeSet = in_changeSet;
  // if we need to chop overlapping modifies internally, so we have to copy them
  // we do this lazy and only if really needed
  this._copiedModifies = in_changeSet.modify;
  this._currentIndices = {
    insert: 0,
    remove: 0,
    modify: 0
  };

  this._currentOffset = 0;
  this._lastOperationIndex = -1;
  this._lastOperationOffset = 0;
  this._atEnd = false;
  this.removeInsertOperation = undefined;

  this.type = ArrayChangeSetIterator.types.NOP;
  this.operation = undefined;
  this.offset = 0;

  // go to the first element
  this.next();
};

/**
 * Returns the next operation in the ChangeSet
 * @return {boolean} true, if there are operations left
 */
ArrayChangeSetIterator.prototype.next = function() {
  // Find the smallest index in the operations lists
  var type = undefined,
      currentIndex = Infinity;

  this.removeInsertOperation = undefined;
  // Process the current remove entry
  if (this._changeSet.remove &&
      this._currentIndices.remove < this._changeSet.remove.length) {
    type = ArrayChangeSetIterator.types.REMOVE;
    currentIndex = this._changeSet.remove[this._currentIndices.remove][0];
    var currentLength = this._changeSet.remove[this._currentIndices.remove][1];
    if (!_.isNumber(currentLength)) {
      currentLength = currentLength.length;
    }

    // Check, whether this is a removeInsertOperation
    if (this._changeSet.insert &&
        this._currentIndices.insert < this._changeSet.insert.length &&
        this._changeSet.insert[this._currentIndices.insert][0] <= currentIndex + currentLength) {
      this.removeInsertOperation = this._changeSet.insert[this._currentIndices.insert];
    }
  }

  // Process the current insert entry (we prefer remove over insert, since this prevents the array from growing more
  // than necessary)
  if (this._changeSet.insert &&
      this._currentIndices.insert < this._changeSet.insert.length &&
      this._changeSet.insert[this._currentIndices.insert][0] < currentIndex) {
    type = ArrayChangeSetIterator.types.INSERT;
    currentIndex = this._changeSet.insert[this._currentIndices.insert][0];
  }

  // Process the current modify entry
  if (this._copiedModifies &&
      this._currentIndices.modify < this._copiedModifies.length &&
      this._copiedModifies[this._currentIndices.modify][0] < currentIndex) {
    type = ArrayChangeSetIterator.types.MODIFY;
  }

  if (this._lastOperationIndex !== currentIndex) {
    this._currentOffset += this._lastOperationOffset;
    this._lastOperationIndex = currentIndex;
    this._lastOperationOffset = 0;
  }

  // We have found nothing, so we are at the end of the ChangeSet
  if (type === undefined) {
    this.type = ArrayChangeSetIterator.types.NOP;
    this.operation = undefined;
    this.offset = this._currentOffset;
    this._atEnd = true;
    return false;
  }

  // Determine the return value and update the internal indices and offsets depending on the next operation
  switch (type) {
    case ArrayChangeSetIterator.types.INSERT:
      // Define the return value
      this.type = ArrayChangeSetIterator.types.INSERT;
      this.operation =  this._changeSet.insert[this._currentIndices.insert];
      this.offset = this._currentOffset;

      // Update the current offset. For an insert we have to increase it by the number of the inserted elements
      this._lastOperationOffset += this.operation[1].length;

      // Shift the internal index
      this._currentIndices.insert++;
      break;
    case ArrayChangeSetIterator.types.REMOVE:
      // Define the return value
      this.type = ArrayChangeSetIterator.types.REMOVE;
      this.operation =  this._changeSet.remove[this._currentIndices.remove];
      this.offset = this._currentOffset;

      // Update the current offset. For a remove we have to decrement it by the number of the removed elements
      var removedElements = _.isNumber(this.operation[1]) ? this.operation[1] : this.operation[1].length;
      this._lastOperationOffset -= removedElements;

      // Shift the internal index
      this._currentIndices.remove++;
      break;
    case ArrayChangeSetIterator.types.MODIFY:
      {
        this.type = ArrayChangeSetIterator.types.MODIFY;
        this.offset = this._currentOffset;

      // check, if the modify's range overlaps with coming insert changes:
        var nextModify = this._copiedModifies[this._currentIndices.modify];
        var modifyEnd = nextModify[0] + nextModify[1].length;
        if (this._changeSet.insert &&
          this._currentIndices.insert < this._changeSet.insert.length &&
          this._changeSet.insert[this._currentIndices.insert][0] < modifyEnd) {
        // we have an overlap and need to cut the modify
          var insertPosition = this._changeSet.insert[this._currentIndices.insert][0];

        // if we haven't copied the change set's modifies yet, we need to do that now
          if (this._copiedModifies === this._changeSet.modify) {
            this._copiedModifies = this._copyModifies(this._changeSet.modify);
          // now we need to update nextModify!
            nextModify = this._copiedModifies[this._currentIndices.modify];
          }

        // use modify only up to insert's position

        // build a partial modify and cut the remaining one:
          var partialModify = [nextModify[0], 0];
          if (_.isString(nextModify[1])) {
            partialModify[1] = nextModify[1].substr(0, insertPosition - nextModify[0]);
            nextModify[1] = nextModify[1].substr(insertPosition - nextModify[0]);
          } else {
            partialModify[1] = nextModify[1].splice(0, insertPosition - nextModify[0]);
          }

          nextModify[0] = insertPosition;

        // use the whole modify
          this.operation = partialModify;

        } else {

        // use the whole modify
          this.operation = nextModify;

        // Shift the internal index
          this._currentIndices.modify++;
        }
        break;
      }
    default:
      throw new Error('ArrayChangeSetIterator: ' + MSG.UNKNOWN_OPERATION);
  }
  this._atEnd = false;
  return true;
};

/**
 * @return {boolean} true, if there are no more operations left
 */
ArrayChangeSetIterator.prototype.atEnd = function() {
  return this._atEnd;
};

ArrayChangeSetIterator.prototype._copyModifies = function(in_modifies) {
  if (!in_modifies || in_modifies.length === 0) {
    return undefined;
  }
  var result = [];
  for (var i = 0; i < in_modifies.length; i++) {
    result.push([in_modifies[i][0], in_modifies[i][1].slice()]);
  }
  return result;
};


/**
 * Iterator types
 * @enum number
 * The operations that can be performed on the array
 */
ArrayChangeSetIterator.types = {
  INSERT: 0,
  REMOVE: 1,
  MODIFY: 2,
  MOVE:   3, // reserved, not implemented yet
  NOP:    4  // no op (e.g. when a remove neutralized an insert in a merge
};

module.exports = ArrayChangeSetIterator;
