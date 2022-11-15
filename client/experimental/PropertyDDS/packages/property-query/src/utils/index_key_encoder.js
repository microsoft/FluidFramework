/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');
const Long = require('long');
const { PathHelper } = require('@fluid-experimental/property-changeset');
const { OperationError } = require('@fluid-experimental/property-common');
const HttpStatus = require('http-status');

const CODE = {
  NULL: '\x00',
  STRING: '\x01',
  PATH: '\x05',
  INT_MIN: '\x0c',
  INT_ZERO: '\x14',
  INT_MAX: '\x1c',
  SINGLE: '\x20',
  DOUBLE: '\x21',
  FALSE: '\x26',
  TRUE: '\x27',
  ESCAPE: '\uffff',
  ESCAPED_NULL: '\x00\uffff'
};

/**
 * Using the fields defined for an index, encodes arrays of values into index keys and
 * decodes index keys into arrays of values.
 */
class IndexKeyEncoder {
  /**
   * Creates an index key encoder/decoder that can handle the given fields.
   * @param {Array<Object>} fields Fields that are part of the index
   */
  constructor(fields) {
    this._fields = fields;

    this._initializeEncoders();
    this._initializeDecoders();
    this._initializeByteArrays();
  }

  /**
   * Encodes an array of values that matches the encoder fields into a string
   * @param {Array<*>} values Values that match the fields
   * @return {String} Encoded value
   */
  encode(values) {
    if (values.length !== this._fields.length) {
      throw new OperationError(`Wrong number of values. Provided ${values.length}, expected ${this._fields.length}`,
        'IndexEncoding', HttpStatus.BAD_REQUEST, OperationError.FLAGS.QUIET);
    }
    // Should prefix with '\x05' and suffix with '\x00' to be fully compliant, but it's not needed for our usage
    return values.map((value, index) => this.encodeSingleValue(value, this._fields[index].typeId)).join('');
  }

  /**
   * Encodes a single value using the specified index field type
   * @param {*} value Value to convert
   * @param {String} typeid Index field type
   * @return {String} Encoded value
   */
  encodeSingleValue(value, typeid) {
    if (value === undefined) {
      return CODE.ESCAPED_NULL;
    } else {
      const encoder = this._encoders[typeid];
      if (!encoder) {
        throw new Error(`Unknown index field type '${typeid}'!`);
      }
      return encoder(value);
    }
  }

  /**
   * Decodes an encoded string into the original values that match the index fields
   * @param {String} encodedValue Encoded value
   * @return {Array<*>} Original field values that were encoded
   */
  decode(encodedValue) {
    let values = [];
    let value, endIndex, decoder;
    for (let i = 0; i < encodedValue.length; i++) {
      decoder = this._decoders[encodedValue[i]];
      if (!decoder) {
        throw new Error(`Type code '0x${encodedValue[i].charCodeAt(0).toString(16)}' not recognized!`);
      }
      ({ value, endIndex } = decoder(encodedValue, i));
      values.push(value);
      i = endIndex;
    }
    return values;
  }

  /**
   * Initializes the encoders map that covers each supported field type
   * @private
   */
  _initializeEncoders() {
    this._encoders = {};
    this._encoders[IndexKeyEncoder.Type.Path] = this._encodePath.bind(this);
    this._encoders[IndexKeyEncoder.Type.String] = this._encodeString.bind(this);
    this._encoders[IndexKeyEncoder.Type.Integer] = this._encodeInteger.bind(this);
    this._encoders[IndexKeyEncoder.Type.Boolean] = this._encodeBoolean.bind(this);
    this._encoders[IndexKeyEncoder.Type.Single] = (value) => this._encodeFloat(value, false);
    this._encoders[IndexKeyEncoder.Type.Double] = (value) => this._encodeFloat(value, true);
  }

  /**
   * Initializes the decoders map that covers each supported data type
   * @private
   */
  _initializeDecoders() {
    this._decoders = {};
    this._decoders[CODE.NULL] = (encodedValue, i) => {
      if (encodedValue[i + 1] === CODE.ESCAPE) {
        return { value: undefined, endIndex: i + 1 };
      } else {
        throw new Error('Dangling null found in encoded sequence!');
      }
    };
    this._decoders[CODE.PATH] = this._decodePath.bind(this);
    this._decoders[CODE.STRING] = this._decodeString.bind(this);
    this._decoders[CODE.FALSE] = (encodedValue, i) => ({ value: false, endIndex: i });
    this._decoders[CODE.TRUE] = (encodedValue, i) => ({ value: true, endIndex: i });
    this._decoders[CODE.SINGLE] = this._decodeFloat.bind(this);
    this._decoders[CODE.DOUBLE] = this._decodeFloat.bind(this);
    const decodeInteger = this._decodeInteger.bind(this);
    for (let i = CODE.INT_MIN.charCodeAt(0); i <= CODE.INT_MAX.charCodeAt(0); i++) {
      this._decoders[String.fromCharCode(i)] = decodeInteger;
    }
  }

  /**
   * Initializes byte arrays used for type conversions
   * @private
   */
  _initializeByteArrays() {
    this._typeArrays = {};
    this._typeArrays['Single'] = new Float32Array(1);
    this._typeArrays['Double'] = new Float64Array(1);
    this._byteArrays = {};
    this._byteArrays['Single'] = new Uint8Array(this._typeArrays['Single'].buffer);
    this._byteArrays['Double'] = new Uint8Array(this._typeArrays['Double'].buffer);
  }

  /**
   * Gives the bytes corresponding to the representation for a value of a type
   * @param {String} type One of the index supported types
   * @param {*} value Native value
   * @return {Uint8Array} Bytes
   * @private
   */
  _getBytes(type, value) {
    this._typeArrays[type][0] = value;
    return this._byteArrays[type];
  }

  /**
   * Encodes a path as a tuple of segments
   * @param {String} path Path to be encoded
   * @return {String} Path encoded as a tuple of segments
   * @private
   */
  _encodePath(path) {
    let tokenizedPath = PathHelper.tokenizePathString(path);
    // TODO: Whenever we decide to split arrays into several nodes, path tokens that are array indices should be
    // encoded as numbers here to preserve order.
    return CODE.PATH + tokenizedPath.map(this._encodeString.bind(this)).join('') + CODE.NULL;
  }

  /**
   * Encodes a string value
   * @param {String} text String to encode
   * @return {String} Encoded string
   * @private
   */
  _encodeString(text) {
    return CODE.STRING + text.replace(CODE.NULL, CODE.ESCAPED_NULL) + CODE.NULL;
  }

  /**
   * Encodes a fixed precision number of up to 8 bytes of magnitude into a sortable string.
   * This is done range by range of bytes for positive and negative integers in the following fashion:
   * 0x0c [FFFFFFFFFFFFFFFF, 0100000000000000]
   * 0x0d [00FFFFFFFFFFFFFF, 0001000000000000]
   * 0x0e [0000FFFFFFFFFFFF, 0000010000000000]
   * 0x0f [000000FFFFFFFFFF, 0000000100000000]
   * 0x10 [00000000FFFFFFFF, 0000000001000000]
   * 0x11 [0000000000FFFFFF, 0000000000010000]
   * 0x12 [000000000000FFFF, 0000000000000100]
   * 0x13 [00000000000000FF, 0000000000000001]
   * 0x14 [0000000000000000]
   * 0x15 [0000000000000001, 00000000000000FF]
   * 0x16 [0000000000000100, 000000000000FFFF]
   * 0x17 [0000000000010000, 0000000000FFFFFF]
   * 0x18 [0000000001000000, 00000000FFFFFFFF]
   * 0x19 [0000000100000000, 000000FFFFFFFFFF]
   * 0x1a [0000010000000000, 0000FFFFFFFFFFFF]
   * 0x1b [0001000000000000, 00FFFFFFFFFFFFFF]
   * 0x1c [0100000000000000, FFFFFFFFFFFFFFFF]
   * Note that 0 bytes to the left are not included in the encoded representation. They are shown for readability.
   * @param {Number|Array<*>} number Value to encode. Note that this may be an array for 64 bit values.
   * @return {String} Encoded value
   * @private
   */
  _encodeInteger(number) {
    if (_.isNumber(number)) {
      if (number === 0) {
        return CODE.INT_ZERO;
      }
      const byteLength = this._getIntegerByteLength(number);
      const code = String.fromCharCode(CODE.INT_ZERO.charCodeAt(0) + byteLength * Math.sign(number));
      let isNegative = false;
      if (number < 0) {
        number = Math.abs(number);
        isNegative = true;
      }
      return code + this._numberToBigEndianBytes(number, isNegative);
    } else {
      let low = number[0];
      let high = number[1];
      const isSigned = number[2];
      if (low === 0 && high === 0) {
        return CODE.INT_ZERO;
      }
      let byteLength;
      let isNegative = false;
      if (isSigned) {
        let int64 = new Long(low, high);
        if (int64.lessThan(0)) {
          int64 = int64.negate();
          low = int64.getLowBits();
          high = int64.getHighBits()
          // At this point low might be negative (high should not)
          // Use the same bytes to get the equivalent positive
          if (low < 0) {
            low = new Long(low, 0, true).toNumber();
          }
          isNegative = true;
        }
      }
      if (high !== 0) {
        byteLength = this._getIntegerByteLength(high) + 4;
      } else {
        byteLength = this._getIntegerByteLength(low);
      }
      const code = String.fromCharCode(CODE.INT_ZERO.charCodeAt(0) + byteLength * (isNegative ? -1 : 1));
      return code + this._numberToBigEndianBytes(high, isNegative) +
        this._numberToBigEndianBytes(low, isNegative);
    }
  }

  /**
   * Given an integer number, it return the number of non-zero bytes required to represent its absolute value
   * @param {Number} number Number to calculate the byte length for
   * @return {Number} Minimum number of bytes to represent the absolute value of the number
   * @private
   */
  _getIntegerByteLength(number) {
    if (number < 0) {
      number = Math.abs(number);
    }
    let byteLength = 0;
    while (number > 0) {
      number = number >>> 8;
      byteLength++;
    }
    return byteLength;
  }

  /**
   * Given a non-negative integer, it returns its hex encoded representation
   * @param {Number} number Non-negative integer to be transformed
   * @param {Boolean} isNegative Whether the original number was negative
   * @return {String} Char sequence representing the encoded number
   * @private
   */
  _numberToBigEndianBytes(number, isNegative) {
    const littleEndianBytes = [];
    while (number > 0) {
      const normalizedNumber = isNegative ? ~number : number;
      littleEndianBytes.push((normalizedNumber & 0x0f).toString(16));
      littleEndianBytes.push((normalizedNumber >>> 4 & 0x0f).toString(16));
      number = number >>> 8;
    }
    return littleEndianBytes.reverse().join('');
  }

  /**
   * Encodes a boolean value into a string
   * @param {Boolean} bool Value to encode
   * @return {String} Encoded value
   * @private
   */
  _encodeBoolean(bool) {
    if (bool) {
      return CODE.TRUE;
    } else {
      return CODE.FALSE;
    }
  }

  /**
   * Encodes a floating-point number into a string
   * @param {Number} number Floating-point number to encode
   * @param {Boolean} isDouble Whether this is a Double precision float. Otherwise assumed Single precision
   * @return {String} Encoded value
   * @private
   */
  _encodeFloat(number, isDouble) {
    let code, bytes;
    if (isDouble) {
      code = CODE.DOUBLE;
      bytes = this._getBytes('Double', number);
    } else {
      code = CODE.SINGLE;
      bytes = this._getBytes('Single', number);
    }
    if (number < 0) {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] ^= 0xFF;
      }
    } else {
      bytes[bytes.length - 1] |= 0x80;
    }
    const hex = [];
    for (let i = bytes.length - 1; i >= 0; i--) {
      hex.push((bytes[i] >>> 4 & 0x0F).toString(16));
      hex.push((bytes[i] & 0x0F).toString(16));
    }
    return code + hex.join('');
  }

  /**
   * Decodes an encoded path back into the original property path
   * @param {String} encodedValue String representing the encoded array of values
   * @param {Number} startIndex Index where the current value starts
   * @return {Object} Contains the original value and the endIndex of it
   * @private
   */
  _decodePath(encodedValue, startIndex) {
    startIndex++;
    const partsToPath = (parts) => parts.map((part) => PathHelper.quotePathSegmentIfNeeded(part)).join('.');
    let pathParts = [];
    let value, endIndex;
    for (let i = startIndex; i < encodedValue.length; i++) {
      switch (encodedValue[i]) {
        case CODE.NULL:
          if (encodedValue[i + 1] === CODE.ESCAPE) {
            pathParts.push(undefined);
            i++;
          } else {
            return { value: partsToPath(pathParts), endIndex: i };
          }
          break;
        case CODE.STRING:
          ({ value, endIndex } = this._decodeString(encodedValue, i));
          pathParts.push(value);
          i = endIndex;
          break;
        default:
          break;
      }
    }
    return { value: partsToPath(pathParts), endIndex: encodedValue.length - 1 };
  }

  /**
   * Decodes an encoded string back into the original string
   * @param {String} encodedValue String representing the encoded array of values
   * @param {Number} startIndex Index where the current value starts
   * @return {Object} Contains the original value and the endIndex of it
   * @private
   */
  _decodeString(encodedValue, startIndex) {
    startIndex++;
    const extractValue = (end) => encodedValue.substring(startIndex, end).replace(CODE.ESCAPED_NULL, CODE.NULL);
    let foundNull = false;
    for (let i = startIndex; i < encodedValue.length; i++) {
      if (foundNull && encodedValue[i] !== CODE.ESCAPE) {
        return { value: extractValue(i - 1), endIndex: i - 1 };
      }
      foundNull = encodedValue[i] === CODE.NULL;
    }
    return { value: extractValue(encodedValue.length - 1), endIndex: encodedValue.length - 1 };
  }

  /**
   * Decodes an encoded integer back into the original value
   * @param {String} encodedValue String representing the encoded array of values
   * @param {Number} startIndex Index where the current value starts
   * @return {Object} Contains the original value and the endIndex of it
   * @private
   */
  _decodeInteger(encodedValue, startIndex) {
    const code = encodedValue[startIndex];
    if (code === CODE.INT_ZERO) {
      return { value: 0, endIndex: startIndex };
    }
    const codeDiff = code.charCodeAt(0) - CODE.INT_ZERO.charCodeAt(0);
    const byteLength = Math.abs(codeDiff);
    const hexLength = byteLength * 2;
    if (byteLength <= 4) {
      let value = this._bigEndianBytesToNumber(encodedValue.substring(startIndex + 1, startIndex + 1 + hexLength));
      if (codeDiff < 0) {
        value = ~value * -1;
        // Since we are doing the operations in reverse order, we need to stuff the missing bytes.
        let stuff = 0x00000000;
        for (let i = byteLength; i < 4; i++) {
          stuff = stuff >>> 8;
          stuff |= 0xFF000000;
        }
        value |= stuff;
      }
      return { value, endIndex: startIndex + hexLength };
    } else {
      let high = this._bigEndianBytesToNumber(
        encodedValue.substring(startIndex + 1, startIndex + 1 + (hexLength - 8)));
      let low = this._bigEndianBytesToNumber(
        encodedValue.substring(startIndex + 1 + (hexLength - 8), startIndex + 1 + hexLength));
      if (codeDiff < 0) {
        const int64 = (new Long(~low, ~high)).negate();
        low = int64.getLowBits();
        high = int64.getHighBits();
        // Since we are doing the operations in reverse order, we need to stuff the missing bytes.
        let stuff = 0x00000000;
        for (let i = byteLength; i < 8; i++) {
          stuff = stuff >>> 8;
          stuff |= 0xFF000000;
        }
        high |= stuff;
      }
      // Use the same bytes to get the equivalent positive
      if (low < 0) {
        low = new Long(low, 0, true).toNumber();
      }
      if (high < 0) {
        high = new Long(high, 0, true).toNumber();
      }
      return { value: [low, high, !(codeDiff === 8 && (high & 0x80000000))], endIndex: startIndex + hexLength };
    }
  }

  /**
   * Builds a number out of an encoded hex sequence, following Big Endian order
   * @param {String} bytes Encoded hex sequence
   * @return {Number} Decoded value
   * @private
   */
  _bigEndianBytesToNumber(bytes) {
    let number = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (i > 0) {
        number = number << 4;
      }
      number += parseInt(bytes[i], 16);
    }
    return number;
  }

  /**
   * Decodes an encoded floating-point number back into the original value
   * @param {String} encodedValue String representing the encoded array of values
   * @param {Number} startIndex Index where the current value starts
   * @return {Object} Contains the original value and the endIndex of it
   * @private
   */
  _decodeFloat(encodedValue, startIndex) {
    let length, value;
    const isDouble = encodedValue[startIndex] === CODE.DOUBLE;
    if (isDouble) {
      length = 8;
      value = new Float64Array(1);
    } else {
      length = 4;
      value = new Float32Array(1);
    }
    const bytes = new Uint8Array(value.buffer);
    const hex = encodedValue.substring(startIndex + 1, startIndex + 1 + length * 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[(hex.length - i) / 2 - 1] = (parseInt(hex[i], 16) << 4) + parseInt(hex[i + 1], 16);
    }
    if (bytes[bytes.length - 1] & 0x80) {
      bytes[bytes.length - 1] &= 0x7F;
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] ^= 0xFF;
      }
    }
    return { value: value[0], endIndex: startIndex + length * 2 };
  }
}

IndexKeyEncoder.Type = {
  Path: 'Path',
  String: 'String',
  Integer: 'Integer',
  Boolean: 'Boolean',
  Single: 'Single',
  Double: 'Double'
};

IndexKeyEncoder.UPPER_BOUND = CODE.ESCAPE;

module.exports = IndexKeyEncoder;
