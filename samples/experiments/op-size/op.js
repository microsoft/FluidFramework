/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.op = (function() {

    /**
     * Namespace op.
     * @exports op
     * @namespace
     */
    var op = {};

    op.SequencedOp = (function() {

        /**
         * Properties of a SequencedOp.
         * @memberof op
         * @interface ISequencedOp
         * @property {string} clientId SequencedOp clientId
         * @property {number|Long} clientSequenceNumber SequencedOp clientSequenceNumber
         * @property {string|null} [contents] SequencedOp contents
         * @property {number|Long} minimumSequenceNumber SequencedOp minimumSequenceNumber
         * @property {number|Long} referenceSequenceNumber SequencedOp referenceSequenceNumber
         * @property {number|Long} sequenceNumber SequencedOp sequenceNumber
         * @property {number|Long} timestamp SequencedOp timestamp
         * @property {Array.<string>|null} [traces] SequencedOp traces
         * @property {string} type SequencedOp type
         */

        /**
         * Constructs a new SequencedOp.
         * @memberof op
         * @classdesc Represents a SequencedOp.
         * @implements ISequencedOp
         * @constructor
         * @param {op.ISequencedOp=} [properties] Properties to set
         */
        function SequencedOp(properties) {
            this.traces = [];
            if (properties)
                for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null)
                        this[keys[i]] = properties[keys[i]];
        }

        /**
         * SequencedOp clientId.
         * @member {string} clientId
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.clientId = "";

        /**
         * SequencedOp clientSequenceNumber.
         * @member {number|Long} clientSequenceNumber
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.clientSequenceNumber = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * SequencedOp contents.
         * @member {string} contents
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.contents = "";

        /**
         * SequencedOp minimumSequenceNumber.
         * @member {number|Long} minimumSequenceNumber
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.minimumSequenceNumber = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * SequencedOp referenceSequenceNumber.
         * @member {number|Long} referenceSequenceNumber
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.referenceSequenceNumber = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * SequencedOp sequenceNumber.
         * @member {number|Long} sequenceNumber
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.sequenceNumber = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * SequencedOp timestamp.
         * @member {number|Long} timestamp
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.timestamp = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

        /**
         * SequencedOp traces.
         * @member {Array.<string>} traces
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.traces = $util.emptyArray;

        /**
         * SequencedOp type.
         * @member {string} type
         * @memberof op.SequencedOp
         * @instance
         */
        SequencedOp.prototype.type = "";

        /**
         * Creates a new SequencedOp instance using the specified properties.
         * @function create
         * @memberof op.SequencedOp
         * @static
         * @param {op.ISequencedOp=} [properties] Properties to set
         * @returns {op.SequencedOp} SequencedOp instance
         */
        SequencedOp.create = function create(properties) {
            return new SequencedOp(properties);
        };

        /**
         * Encodes the specified SequencedOp message. Does not implicitly {@link op.SequencedOp.verify|verify} messages.
         * @function encode
         * @memberof op.SequencedOp
         * @static
         * @param {op.ISequencedOp} message SequencedOp message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SequencedOp.encode = function encode(message, writer) {
            if (!writer)
                writer = $Writer.create();
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.clientId);
            writer.uint32(/* id 2, wireType 0 =*/16).int64(message.clientSequenceNumber);
            if (message.contents != null && message.hasOwnProperty("contents"))
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.contents);
            writer.uint32(/* id 4, wireType 0 =*/32).int64(message.minimumSequenceNumber);
            writer.uint32(/* id 5, wireType 0 =*/40).int64(message.referenceSequenceNumber);
            writer.uint32(/* id 6, wireType 0 =*/48).int64(message.sequenceNumber);
            writer.uint32(/* id 7, wireType 0 =*/56).int64(message.timestamp);
            if (message.traces != null && message.traces.length)
                for (var i = 0; i < message.traces.length; ++i)
                    writer.uint32(/* id 8, wireType 2 =*/66).string(message.traces[i]);
            writer.uint32(/* id 9, wireType 2 =*/74).string(message.type);
            return writer;
        };

        /**
         * Encodes the specified SequencedOp message, length delimited. Does not implicitly {@link op.SequencedOp.verify|verify} messages.
         * @function encodeDelimited
         * @memberof op.SequencedOp
         * @static
         * @param {op.ISequencedOp} message SequencedOp message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SequencedOp.encodeDelimited = function encodeDelimited(message, writer) {
            return this.encode(message, writer).ldelim();
        };

        /**
         * Decodes a SequencedOp message from the specified reader or buffer.
         * @function decode
         * @memberof op.SequencedOp
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {op.SequencedOp} SequencedOp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SequencedOp.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            var end = length === undefined ? reader.len : reader.pos + length, message = new $root.op.SequencedOp();
            while (reader.pos < end) {
                var tag = reader.uint32();
                switch (tag >>> 3) {
                case 1:
                    message.clientId = reader.string();
                    break;
                case 2:
                    message.clientSequenceNumber = reader.int64();
                    break;
                case 3:
                    message.contents = reader.string();
                    break;
                case 4:
                    message.minimumSequenceNumber = reader.int64();
                    break;
                case 5:
                    message.referenceSequenceNumber = reader.int64();
                    break;
                case 6:
                    message.sequenceNumber = reader.int64();
                    break;
                case 7:
                    message.timestamp = reader.int64();
                    break;
                case 8:
                    if (!(message.traces && message.traces.length))
                        message.traces = [];
                    message.traces.push(reader.string());
                    break;
                case 9:
                    message.type = reader.string();
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
                }
            }
            if (!message.hasOwnProperty("clientId"))
                throw $util.ProtocolError("missing required 'clientId'", { instance: message });
            if (!message.hasOwnProperty("clientSequenceNumber"))
                throw $util.ProtocolError("missing required 'clientSequenceNumber'", { instance: message });
            if (!message.hasOwnProperty("minimumSequenceNumber"))
                throw $util.ProtocolError("missing required 'minimumSequenceNumber'", { instance: message });
            if (!message.hasOwnProperty("referenceSequenceNumber"))
                throw $util.ProtocolError("missing required 'referenceSequenceNumber'", { instance: message });
            if (!message.hasOwnProperty("sequenceNumber"))
                throw $util.ProtocolError("missing required 'sequenceNumber'", { instance: message });
            if (!message.hasOwnProperty("timestamp"))
                throw $util.ProtocolError("missing required 'timestamp'", { instance: message });
            if (!message.hasOwnProperty("type"))
                throw $util.ProtocolError("missing required 'type'", { instance: message });
            return message;
        };

        /**
         * Decodes a SequencedOp message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof op.SequencedOp
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {op.SequencedOp} SequencedOp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SequencedOp.decodeDelimited = function decodeDelimited(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a SequencedOp message.
         * @function verify
         * @memberof op.SequencedOp
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        SequencedOp.verify = function verify(message) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (!$util.isString(message.clientId))
                return "clientId: string expected";
            if (!$util.isInteger(message.clientSequenceNumber) && !(message.clientSequenceNumber && $util.isInteger(message.clientSequenceNumber.low) && $util.isInteger(message.clientSequenceNumber.high)))
                return "clientSequenceNumber: integer|Long expected";
            if (message.contents != null && message.hasOwnProperty("contents"))
                if (!$util.isString(message.contents))
                    return "contents: string expected";
            if (!$util.isInteger(message.minimumSequenceNumber) && !(message.minimumSequenceNumber && $util.isInteger(message.minimumSequenceNumber.low) && $util.isInteger(message.minimumSequenceNumber.high)))
                return "minimumSequenceNumber: integer|Long expected";
            if (!$util.isInteger(message.referenceSequenceNumber) && !(message.referenceSequenceNumber && $util.isInteger(message.referenceSequenceNumber.low) && $util.isInteger(message.referenceSequenceNumber.high)))
                return "referenceSequenceNumber: integer|Long expected";
            if (!$util.isInteger(message.sequenceNumber) && !(message.sequenceNumber && $util.isInteger(message.sequenceNumber.low) && $util.isInteger(message.sequenceNumber.high)))
                return "sequenceNumber: integer|Long expected";
            if (!$util.isInteger(message.timestamp) && !(message.timestamp && $util.isInteger(message.timestamp.low) && $util.isInteger(message.timestamp.high)))
                return "timestamp: integer|Long expected";
            if (message.traces != null && message.hasOwnProperty("traces")) {
                if (!Array.isArray(message.traces))
                    return "traces: array expected";
                for (var i = 0; i < message.traces.length; ++i)
                    if (!$util.isString(message.traces[i]))
                        return "traces: string[] expected";
            }
            if (!$util.isString(message.type))
                return "type: string expected";
            return null;
        };

        /**
         * Creates a SequencedOp message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof op.SequencedOp
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {op.SequencedOp} SequencedOp
         */
        SequencedOp.fromObject = function fromObject(object) {
            if (object instanceof $root.op.SequencedOp)
                return object;
            var message = new $root.op.SequencedOp();
            if (object.clientId != null)
                message.clientId = String(object.clientId);
            if (object.clientSequenceNumber != null)
                if ($util.Long)
                    (message.clientSequenceNumber = $util.Long.fromValue(object.clientSequenceNumber)).unsigned = false;
                else if (typeof object.clientSequenceNumber === "string")
                    message.clientSequenceNumber = parseInt(object.clientSequenceNumber, 10);
                else if (typeof object.clientSequenceNumber === "number")
                    message.clientSequenceNumber = object.clientSequenceNumber;
                else if (typeof object.clientSequenceNumber === "object")
                    message.clientSequenceNumber = new $util.LongBits(object.clientSequenceNumber.low >>> 0, object.clientSequenceNumber.high >>> 0).toNumber();
            if (object.contents != null)
                message.contents = String(object.contents);
            if (object.minimumSequenceNumber != null)
                if ($util.Long)
                    (message.minimumSequenceNumber = $util.Long.fromValue(object.minimumSequenceNumber)).unsigned = false;
                else if (typeof object.minimumSequenceNumber === "string")
                    message.minimumSequenceNumber = parseInt(object.minimumSequenceNumber, 10);
                else if (typeof object.minimumSequenceNumber === "number")
                    message.minimumSequenceNumber = object.minimumSequenceNumber;
                else if (typeof object.minimumSequenceNumber === "object")
                    message.minimumSequenceNumber = new $util.LongBits(object.minimumSequenceNumber.low >>> 0, object.minimumSequenceNumber.high >>> 0).toNumber();
            if (object.referenceSequenceNumber != null)
                if ($util.Long)
                    (message.referenceSequenceNumber = $util.Long.fromValue(object.referenceSequenceNumber)).unsigned = false;
                else if (typeof object.referenceSequenceNumber === "string")
                    message.referenceSequenceNumber = parseInt(object.referenceSequenceNumber, 10);
                else if (typeof object.referenceSequenceNumber === "number")
                    message.referenceSequenceNumber = object.referenceSequenceNumber;
                else if (typeof object.referenceSequenceNumber === "object")
                    message.referenceSequenceNumber = new $util.LongBits(object.referenceSequenceNumber.low >>> 0, object.referenceSequenceNumber.high >>> 0).toNumber();
            if (object.sequenceNumber != null)
                if ($util.Long)
                    (message.sequenceNumber = $util.Long.fromValue(object.sequenceNumber)).unsigned = false;
                else if (typeof object.sequenceNumber === "string")
                    message.sequenceNumber = parseInt(object.sequenceNumber, 10);
                else if (typeof object.sequenceNumber === "number")
                    message.sequenceNumber = object.sequenceNumber;
                else if (typeof object.sequenceNumber === "object")
                    message.sequenceNumber = new $util.LongBits(object.sequenceNumber.low >>> 0, object.sequenceNumber.high >>> 0).toNumber();
            if (object.timestamp != null)
                if ($util.Long)
                    (message.timestamp = $util.Long.fromValue(object.timestamp)).unsigned = false;
                else if (typeof object.timestamp === "string")
                    message.timestamp = parseInt(object.timestamp, 10);
                else if (typeof object.timestamp === "number")
                    message.timestamp = object.timestamp;
                else if (typeof object.timestamp === "object")
                    message.timestamp = new $util.LongBits(object.timestamp.low >>> 0, object.timestamp.high >>> 0).toNumber();
            if (object.traces) {
                if (!Array.isArray(object.traces))
                    throw TypeError(".op.SequencedOp.traces: array expected");
                message.traces = [];
                for (var i = 0; i < object.traces.length; ++i)
                    message.traces[i] = String(object.traces[i]);
            }
            if (object.type != null)
                message.type = String(object.type);
            return message;
        };

        /**
         * Creates a plain object from a SequencedOp message. Also converts values to other types if specified.
         * @function toObject
         * @memberof op.SequencedOp
         * @static
         * @param {op.SequencedOp} message SequencedOp
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        SequencedOp.toObject = function toObject(message, options) {
            if (!options)
                options = {};
            var object = {};
            if (options.arrays || options.defaults)
                object.traces = [];
            if (options.defaults) {
                object.clientId = "";
                if ($util.Long) {
                    var long = new $util.Long(0, 0, false);
                    object.clientSequenceNumber = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.clientSequenceNumber = options.longs === String ? "0" : 0;
                object.contents = "";
                if ($util.Long) {
                    var long = new $util.Long(0, 0, false);
                    object.minimumSequenceNumber = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.minimumSequenceNumber = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, false);
                    object.referenceSequenceNumber = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.referenceSequenceNumber = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, false);
                    object.sequenceNumber = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.sequenceNumber = options.longs === String ? "0" : 0;
                if ($util.Long) {
                    var long = new $util.Long(0, 0, false);
                    object.timestamp = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                } else
                    object.timestamp = options.longs === String ? "0" : 0;
                object.type = "";
            }
            if (message.clientId != null && message.hasOwnProperty("clientId"))
                object.clientId = message.clientId;
            if (message.clientSequenceNumber != null && message.hasOwnProperty("clientSequenceNumber"))
                if (typeof message.clientSequenceNumber === "number")
                    object.clientSequenceNumber = options.longs === String ? String(message.clientSequenceNumber) : message.clientSequenceNumber;
                else
                    object.clientSequenceNumber = options.longs === String ? $util.Long.prototype.toString.call(message.clientSequenceNumber) : options.longs === Number ? new $util.LongBits(message.clientSequenceNumber.low >>> 0, message.clientSequenceNumber.high >>> 0).toNumber() : message.clientSequenceNumber;
            if (message.contents != null && message.hasOwnProperty("contents"))
                object.contents = message.contents;
            if (message.minimumSequenceNumber != null && message.hasOwnProperty("minimumSequenceNumber"))
                if (typeof message.minimumSequenceNumber === "number")
                    object.minimumSequenceNumber = options.longs === String ? String(message.minimumSequenceNumber) : message.minimumSequenceNumber;
                else
                    object.minimumSequenceNumber = options.longs === String ? $util.Long.prototype.toString.call(message.minimumSequenceNumber) : options.longs === Number ? new $util.LongBits(message.minimumSequenceNumber.low >>> 0, message.minimumSequenceNumber.high >>> 0).toNumber() : message.minimumSequenceNumber;
            if (message.referenceSequenceNumber != null && message.hasOwnProperty("referenceSequenceNumber"))
                if (typeof message.referenceSequenceNumber === "number")
                    object.referenceSequenceNumber = options.longs === String ? String(message.referenceSequenceNumber) : message.referenceSequenceNumber;
                else
                    object.referenceSequenceNumber = options.longs === String ? $util.Long.prototype.toString.call(message.referenceSequenceNumber) : options.longs === Number ? new $util.LongBits(message.referenceSequenceNumber.low >>> 0, message.referenceSequenceNumber.high >>> 0).toNumber() : message.referenceSequenceNumber;
            if (message.sequenceNumber != null && message.hasOwnProperty("sequenceNumber"))
                if (typeof message.sequenceNumber === "number")
                    object.sequenceNumber = options.longs === String ? String(message.sequenceNumber) : message.sequenceNumber;
                else
                    object.sequenceNumber = options.longs === String ? $util.Long.prototype.toString.call(message.sequenceNumber) : options.longs === Number ? new $util.LongBits(message.sequenceNumber.low >>> 0, message.sequenceNumber.high >>> 0).toNumber() : message.sequenceNumber;
            if (message.timestamp != null && message.hasOwnProperty("timestamp"))
                if (typeof message.timestamp === "number")
                    object.timestamp = options.longs === String ? String(message.timestamp) : message.timestamp;
                else
                    object.timestamp = options.longs === String ? $util.Long.prototype.toString.call(message.timestamp) : options.longs === Number ? new $util.LongBits(message.timestamp.low >>> 0, message.timestamp.high >>> 0).toNumber() : message.timestamp;
            if (message.traces && message.traces.length) {
                object.traces = [];
                for (var j = 0; j < message.traces.length; ++j)
                    object.traces[j] = message.traces[j];
            }
            if (message.type != null && message.hasOwnProperty("type"))
                object.type = message.type;
            return object;
        };

        /**
         * Converts this SequencedOp to JSON.
         * @function toJSON
         * @memberof op.SequencedOp
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        SequencedOp.prototype.toJSON = function toJSON() {
            return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
        };

        return SequencedOp;
    })();

    return op;
})();

module.exports = $root;
