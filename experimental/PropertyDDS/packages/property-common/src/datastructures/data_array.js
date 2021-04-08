/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint accessor-pairs: [2, { "getWithoutSet": false }] */
/**
 @fileoverview The data arrays definition file.
 */
(function() {

  /**
   * A typed data container that is persistable, high-performance, and can be used
   * as a backing store for collaborative property sets.
   *
   * @param {function} in_bufferConstructor - This is the constructor to be used to
   *    setup the internal buffer of the DataArray.
   * @param {number} in_size - The initial size with which to allocate the array.
   * @constructor
   * @private
   * @alias property-common.Datastructures.DataArrays
   */
  var BaseDataArray = function( in_bufferConstructor, in_size ) {
    // The 'eslint-...' is used to disable the rule that requires
    // constructors to start with a capitalized letter.
    this._buffer       = new in_bufferConstructor(in_size); // eslint-disable-line new-cap
    this._bufferConstructor = in_bufferConstructor;
    this._size       = in_size;
  };

  /**
   * Get the value at an index. If no index is passed, return zeroth item.
   * @param {Number} in_idx the specific item in the data array.
   * @return {*} the value at that index
   */
  BaseDataArray.prototype.getValue = function(in_idx) {
    in_idx = in_idx === undefined ? 0 : in_idx;
    if (in_idx >= this._size || in_idx < 0) {
      throw new Error('Trying to access out of bounds!');
    }

    return this._buffer[in_idx];
  };

  /**
   * Return a range of values in the array.
   * @param {Number} in_idxStart the starting index
   * @param {Number} in_idxEnd the end index
   * @return {Int16Array|Uint16Array|Float64Array|Float32Array|Int8Array|Int32Array|*} the array of values in the range
   */
  BaseDataArray.prototype.getValueRange = function(in_idxStart, in_idxEnd) {
    if (in_idxStart >= this._size || in_idxEnd > this._size || in_idxStart < 0 || in_idxEnd < 0) {
      throw new Error('Trying to access out of bounds!');
    }

    return this._buffer.subarray( in_idxStart, in_idxEnd );
  };

  /**
   * Return the serialized form of Data Arrays.
   * @return {Array<*>} An object containing an array of the values.
   */
  BaseDataArray.prototype.serialize = function( ) {
    // Copy over the data to a standard Javascript array.
    var valArray = new Array( this._size );
    for (var i = 0; i < this._size; i++) {
      valArray[i] = this._buffer[i];
    }
    return valArray;
  };

  /**
   * Deserialize data from a serialized representation
   * @param {Array} in_serialized the serialized representation
   */
  BaseDataArray.prototype.deserialize = function( in_serialized ) {
    var values = in_serialized;
    var length = in_serialized.length;
    if (length !== this._size) {
      this.resize(length);
      this._size = length;
    }
    var i;
    for (i = 0; i < length; i++) {
      this._buffer[i] = values[i];
    }
  };

  /**
   * Set value at an index.
   * @param {Number} in_idx the index
   * @param {*} in_value the value we want to set at index
   */
  BaseDataArray.prototype.setValue = function( in_idx, in_value ) {
    if ( in_idx < this._buffer.length ) {
      this._buffer[in_idx] = in_value;
    } else {
      console.error( 'DataArray setValue in_idx is out of bounds.' );
    }
  };

  /**
   * creates a copy of a typed array with removed elements
   * @param {TypedArray} in_arr the input array (won't be modified)
   * @param {number} in_offset starting index of range that will be removed
   * @param {number} in_deleteCount number of removed elements
   * @return {TypedArray} a copy of the input array without the selected range
   * @private
   */
  BaseDataArray.prototype._removeElementsFromArray = function(in_arr, in_offset, in_deleteCount) {
    // TODO: this function can be optimized
    var newSize = this._size - in_deleteCount;
    var splicedArray = new in_arr.constructor(newSize);
    splicedArray.set(in_arr.subarray(0, in_offset));
    splicedArray.set(in_arr.subarray(in_offset + in_deleteCount, this._size), in_offset );
    return splicedArray;
  };

  /**
   * remove a range of elements from the array
   * @param {number} in_offset start of the range
   * @param {number} in_deleteCount number of elements to be removed
   */
  BaseDataArray.prototype.removeRange = function( in_offset, in_deleteCount) {
    if ( in_offset + in_deleteCount < this._buffer.length + 1 ) {
      this._buffer = this._removeElementsFromArray(this._buffer, in_offset, in_deleteCount);
      this._size = this._size - in_deleteCount;
    } else {
      console.error( 'DataArray removeRange in_offset + in_deleteCount is out of bounds.' );
    }
  };

  /**
   * copy an array with elements inserted into the copy
   * @param {TypedArray} in_arr the input array (won't be modified)
   * @param {number} in_offset the index where the new elements will be inserted
   * @param {Array} in_addedArray the array with the elements that will be added
   * @return {TypedArray} the combined array
   * @private
   */
  BaseDataArray.prototype._insert = function(in_arr, in_offset, in_addedArray) {
    // TODO: this function can be optimized
    var newSize = this._size + in_addedArray.length;
    var insertedArray = new in_arr.constructor(newSize);
    insertedArray.set(in_arr.subarray(0, in_offset));
    insertedArray.set(in_addedArray, in_offset);
    insertedArray.set(in_arr.subarray(in_offset, this._size), in_offset + in_addedArray.length);
    return insertedArray;
  };

  /**
   * insert the content of an array into the DataArray
   * @param {number} in_offset the target index
   * @param {Array} in_array the array to be inserted
   */
  BaseDataArray.prototype.insertRange = function( in_offset, in_array) {
    this._buffer = this._insert(this._buffer, in_offset, in_array);
    this._size = this._size + in_array.length;
  };

  /**
   * Set this array values to be equal to in_array values
   * @param {Number=} in_offset An optional offset in this array to begin start
   *                  setting this arrays values to in_array values.
   * @param {*} in_array the input array
   */
  BaseDataArray.prototype.set = function( in_offset, in_array) {
    if ( in_array instanceof ArrayBuffer || in_array instanceof Array || in_array instanceof this.getBufferCtor() ) {
      this._buffer.set( in_array, in_offset );
    } else if ( in_array instanceof BaseDataArray ) {
      this._buffer.set( in_array.getBuffer(), in_offset );
    } else {
      console.error( 'DataArray set() must be called with Array, TypedArray or DataArray' );
    }
  };

  /**
   * insert a value at the end of the array, creates a new element at the end and sets the value
   * @param {*} in_value the new value
   */
  BaseDataArray.prototype.push = function( in_value ) {

    // Adjust the buffer if necessary
    var bufferLength = this._buffer.length;
    if (this._size > bufferLength - 1 ) {
      this._alloc( this._size * 2 || 1); // grow by a factor of 2x
    }
    // set the value and update size
    this.setValue( this._size, in_value );
    this._size++;
  };

  /**
   * get direct access to the data (for performance reasons)
   * this should be uses read only
   * @return {TypedArray} the (read only) raw data
   */
  BaseDataArray.prototype.getBuffer = function() {
    return this._buffer;
  };

  /**
   * get the constructor of the underlying TypedArray
   * @return {Function} the constructor for the data buffer
   */
  BaseDataArray.prototype.getBufferCtor = function() {
    return this._bufferConstructor;
  };

  /**
   * apply a given function to all elements of the array
   * @param {Function} in_fn the function that will be applied to every element
   */
  BaseDataArray.prototype.iterate = function(in_fn) {
    var l = this._size;
    for (var i = 0; i < l; i++) {
      in_fn( this._buffer[i] );
    }
  };

  /**
   * get a resized buffer copy
   * @param {Function} in_bufferCtor the constructor for the returned buffer
   * @param {TypedArray} in_buffer the input buffer (won't be modified)
   * @param {number} in_newSize the target size
   * @return {TypedArray} the buffer with the new size
   */
  var resizeBuffer = function( in_bufferCtor, in_buffer, in_newSize ) {
    // target buffer with the desired new size
    // The 'eslint-...' is used to disable the rule that requires
    // constructors to start with a capitalized letter.
    var newBuffer = new in_bufferCtor(in_newSize); // eslint-disable-line new-cap
    var oldSize   = in_buffer.length;
    var oldBuffer = in_buffer;
    var isShrinking = oldSize > in_newSize;
    newBuffer.set( isShrinking ? oldBuffer.subarray(0, in_newSize) : oldBuffer );
    return newBuffer;
  };

  /**
   * allocate memory for the array (for performance reasons, you can allocate more space than the current length,
   * which makes pushes to the array less expensive later)
   * @param {number} in_size the target allocated space
   * @return {BaseDataArray} the DataArray itself
   * @private
   */
  BaseDataArray.prototype._alloc = function(in_size) {
    this._buffer       = resizeBuffer( this._bufferConstructor, this._buffer, in_size );
    return this;
  };

  /**
   * change the size of the array
   * @param {number} in_size the target size
   * @return {BaseDataArray} the DataArray itself
   */
  BaseDataArray.prototype.resize = function(in_size) {   // this can be costly!!!
    this._alloc(in_size);
    this._size = in_size;
    return this;
  };

  BaseDataArray.prototype.copy   = function() {  // and this!
    var newBuffer = new this._bufferConstructor(this._size); // buffer with the desired new size
    newBuffer.set(this._buffer);
    return newBuffer;
  };

  Object.defineProperty(
    BaseDataArray.prototype,
    'length',
    {
      get: function() { return this._size; }
    }
  );

  var Int8DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Int8DataArray.prototype = Object.create( BaseDataArray.prototype );
  Int8DataArray.prototype.getBufferCtor = function() { return Int8Array; };

  var Int16DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Int16DataArray.prototype = Object.create( BaseDataArray.prototype );
  Int16DataArray.prototype.getBufferCtor = function() { return Int16Array; };

  var Int32DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Int32DataArray.prototype = Object.create( BaseDataArray.prototype );
  Int32DataArray.prototype.getBufferCtor = function() { return Int32Array; };

  var Uint8DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Uint8DataArray.prototype = Object.create( BaseDataArray.prototype );
  Uint8DataArray.prototype.getBufferCtor = function() { return Uint8Array; };
  var Uint16DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Uint16DataArray.prototype = Object.create( BaseDataArray.prototype );
  Uint16DataArray.prototype.getBufferCtor = function() { return Uint16Array; };

  var Uint32DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Uint32DataArray.prototype = Object.create( BaseDataArray.prototype );
  Uint32DataArray.prototype.getBufferCtor = function() { return Uint32Array; };

  var Float32DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Float32DataArray.prototype = Object.create( BaseDataArray.prototype );
  Float32DataArray.prototype.getBufferCtor = function() { return Float32Array; };

  var Float64DataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  Float64DataArray.prototype = Object.create( BaseDataArray.prototype );
  Float64DataArray.prototype.getBufferCtor = function() { return Float64Array; };



  /**
   * A data container that can contain every native type
   *
   * @param {number} in_size - The initial size with which to allocate the array.
   * @constructor
   * @alias property-common.Datastructures.DataArrays.UniversalDataArray
   * @private
   */
  var UniversalDataArray = function( in_size ) {BaseDataArray.call(this, this.getBufferCtor(), in_size );};
  UniversalDataArray.prototype = Object.create( BaseDataArray.prototype );
  UniversalDataArray.prototype.getBufferCtor = function() { return Array; };

  /**
   * helper function to write array values into another array at a given offset
   * @param {Array} array target array
   * @param {Array} values the values we need to write
   * @param {number} offset starting index in target array
   */
  var arraySet = function(array, values, offset) {
    offset = offset || 0;
    var index = 0;
    values.forEach(function(value) {
      array[index + offset] = value;
      index++;
    });
  };

  /**
   * insert the content of an array into the DataArray
   * @param {number} in_offset the target index
   * @param {Array} in_array the array to be inserted
   */
  UniversalDataArray.prototype.insertRange = function( in_offset, in_array) {
    this._buffer.splice.apply(this._buffer, [in_offset, 0].concat(in_array));
    this._size = this._size + in_array.length;
  };

  /**
   * remove a range of elements from the array
   * @param {number} in_offset start of the range
   * @param {number} in_deleteCount number of elements to be removed
   */
  UniversalDataArray.prototype.removeRange = function( in_offset, in_deleteCount) {
    if ( in_offset + in_deleteCount < this._buffer.length + 1 ) {
      this._buffer.splice(in_offset, in_deleteCount);
      this._size -= in_deleteCount;
    } else {
      throw Error( 'DataArray removeRange in_offset + in_deleteCount is out of bounds.' );
    }
  };

  /**
   * Set this array values to be equal to in_array values
   * @param {Number=} in_offset An optional offset in this array to begin start
   *                  setting this arrays values to in_array values.
   * @param {*} in_array the input array
   */
  UniversalDataArray.prototype.set = function( in_offset, in_array) {
    if ( in_array instanceof ArrayBuffer || in_array instanceof Array || in_array instanceof this.getBufferCtor() ) {
      arraySet(this._buffer, in_array, in_offset );
    } else if ( in_array instanceof BaseDataArray ) {
      arraySet(this._buffer, in_array.getBuffer(), in_offset );
    } else {
      console.error( 'DataArray set() must be called with Array, TypedArray or DataArray' );
    }
  };

  /**
   * Return a range of values in the array.
   * @param {Number} in_idxStart the starting index
   * @param {Number} in_idxEnd the end index - this offset is exclusive
   * @return {Array} the array of values in the range
   */
  UniversalDataArray.prototype.getValueRange = function(in_idxStart, in_idxEnd) {
    if (in_idxStart >= this._size || in_idxEnd > this._size || in_idxStart < 0 || in_idxEnd < 0) {
      throw new Error('Trying to access out of bounds!');
    }
    return this._buffer.slice( in_idxStart, in_idxEnd );
  };

  /**
   * change the size of a javascript array and keep the content, if possible. Keeps the input buffer.
   * @param {Array} in_buffer input buffer - not changed
   * @param {number} in_newSize target size
   * @return {Array} an Array of the new size
   */
  var resizeBufferArray = function( in_buffer, in_newSize ) {
    // target buffer with the desired new size
    var newBuffer = new Array(in_newSize);
    var oldSize   = in_buffer.length;
    var oldBuffer = in_buffer;
    var isShrinking = oldSize > in_newSize;
    arraySet(newBuffer, isShrinking ? oldBuffer.slice(0, in_newSize) : oldBuffer );
    return newBuffer;
  };

  /**
   * allocate memory for the array (for performance reasons, you can allocate more space than the current length,
   * which makes pushes to the array less expensive later)
   * @param {number} in_size the target allocated space
   * @return {BaseDataArray} the DataArray itself
   * @private
   */
  UniversalDataArray.prototype._alloc = function(in_size) {
    this._buffer = resizeBufferArray( this._buffer, in_size );
    return this;
  };


  /**
   * A data container that contains a string
   *
   * @constructor
   * @alias property-common.Datastructures.DataArrays.StringDataArray
   * @private
   */
  var StringDataArray = function() {
    BaseDataArray.call(this, this.getBufferCtor(), '' );
    this._size = 0;
    this._buffer = '';
  };
  StringDataArray.prototype = Object.create( BaseDataArray.prototype );
  StringDataArray.prototype.getBufferCtor = function() { return String; };

  /**
   * insert the content of a string into the StringDataArray
   * @param {number} in_offset the target index
   * @param {string} in_string the string to be inserted
   */
  StringDataArray.prototype.insertRange = function( in_offset, in_string) {
    this._buffer = this._buffer.substr(0, in_offset) + in_string + this._buffer.substr(in_offset);
    this._size = this._size + in_string.length;
  };

  /**
   * remove a range of elements from the string
   * @param {number} in_offset start of the range
   * @param {number} in_deleteCount number of elements to be removed
   */
  StringDataArray.prototype.removeRange = function( in_offset, in_deleteCount) {
    if ( in_offset + in_deleteCount < this._buffer.length + 1 ) {
      this._buffer = this._buffer.substr(0, in_offset) + this._buffer.substr(in_offset + in_deleteCount);
      this._size -= in_deleteCount;
    } else {
      throw Error( 'DataArray removeRange in_offset + in_deleteCount is out of bounds.' );
    }
  };

  /**
   * Set this array values to be equal to in_string values
   * @param {Number=} in_offset The offset in this array to begin start
   *                  setting this arrays values to in_string values.
   * @param {string} in_string the input string
   */
  StringDataArray.prototype.set = function( in_offset, in_string) {
    this._buffer = this._buffer.substr(0, in_offset) + in_string + this._buffer.substr(in_offset + in_string.length);
  };

  /**
   * Return a range of characters in the string.
   * @param {Number} in_idxStart the starting index
   * @param {Number} in_idxEnd the end index - this offset is exclusive
   * @return {String} the characters in the range
   */
  StringDataArray.prototype.getValueRange = function(in_idxStart, in_idxEnd) {
    if (in_idxStart >= this._size || in_idxEnd > this._size || in_idxStart < 0 || in_idxEnd < 0) {
      throw new Error('Trying to access out of bounds!');
    }
    return this._buffer.slice( in_idxStart, in_idxEnd );
  };

  Object.defineProperty(
    StringDataArray.prototype,
    'length',
    {
      get: function() { return this._buffer.length; }
    }
  );

  /**
   * A data container that can contain boolean type
   *
   * @param {number} in_size - The initial size with which to allocate the array.
   * @constructor
   * @alias property-common.Datastructures.DataArrays.BoolDataArray
   * @private
   */
  var BoolDataArray = function( in_size ) { UniversalDataArray.call(this, in_size ); };
  BoolDataArray.prototype = Object.create( UniversalDataArray.prototype );
  BoolDataArray.prototype.getBufferCtor = function() { return Array; };

  /**
   * helper function to write and cast to boolean array values into another array at a given offset
   * @param {Array} array target array
   * @param {Array} values the values we need to write
   * @param {number} offset starting index in target array
   */
  var arraySetBool = function(array, values, offset) {
    offset = offset || 0;
    var index = 0;
    values.forEach(function(value) {
      array[index + offset] = !!value;
      index++;
    });
  };

  /**
   * insert the content of an array into the DataArray
   * @param {number} in_offset the target index
   * @param {Array} in_array the array to be inserted
   */
  BoolDataArray.prototype.insertRange = function( in_offset, in_array) {
    this._buffer.splice.apply(this._buffer, [in_offset, 0].concat(in_array.map(function(val) { return !!val; })));
    this._size = this._size + in_array.length;
  };

  /**
   * Set this array values to be equal to in_array values
   * @param {Number=} in_offset An optional offset in this array to begin start
   *                  setting this arrays values to in_array values.
   * @param {*} in_array the input array
   */
  BoolDataArray.prototype.set = function( in_offset, in_array) {
    if ( in_array instanceof ArrayBuffer || in_array instanceof Array || in_array instanceof this.getBufferCtor() ) {
      arraySetBool(this._buffer, in_array, in_offset );
    } else if ( in_array instanceof BaseDataArray ) {
      arraySetBool(this._buffer, in_array.getBuffer(), in_offset );
    } else {
      console.error( 'DataArray set() must be called with Array, TypedArray or DataArray' );
    }
  };

  module.exports = {
    BaseDataArray:     BaseDataArray,
    Float32DataArray:  Float32DataArray,
    Float64DataArray:  Float64DataArray,
    Int8DataArray:     Int8DataArray,
    Int16DataArray:    Int16DataArray,
    Int32DataArray:    Int32DataArray,
    Uint8DataArray:    Uint8DataArray,
    Uint16DataArray:   Uint16DataArray,
    Uint32DataArray:   Uint32DataArray,
    UniversalDataArray: UniversalDataArray,
    StringDataArray:   StringDataArray,
    BoolDataArray:   BoolDataArray
  };

})();
