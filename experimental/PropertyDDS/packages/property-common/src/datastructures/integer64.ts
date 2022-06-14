/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview implements (U)Int64 Datastructures
 */

import _ from "lodash";
import { ConsoleUtils } from "../consoleUtils";
import { constants } from "../constants";

const BIT32 = 4294967296;
const { MSG } = constants;
/**
 * A data representation class for 64 bit integer types.
 * This is necessary since js doesn't support 64bit
 * integers natively yet.
 *
 * Please note this class is immutable.
 * There are and there won't be set functions!
 * (see javascript String class)
 *
 * @param low  - lower 32 bit
 * @param high - higher 32 bit
 */
export class Integer64 {
    constructor(protected low = 0, protected high = 0) {
    }

    /**
     * @returns the higher 32 bit integer part
     */
    getValueHigh() {
        return this.high;
    }

    /**
     * @returns the lower 32 bit integer part
     */
    getValueLow() {
        return this.low;
    }

    protected _int64toString(isSigned: boolean, in_radix = 10): string {
        ConsoleUtils.assert(_.isNumber(in_radix), `${MSG.IN_RADIX_MUST_BE_NUMBER} ${in_radix}`);
        ConsoleUtils.assert(in_radix >= 2 && 36 >= in_radix, `${MSG.BASE_OUT_OF_RANGE} ${in_radix}`);

        let high = this.getValueHigh();
        let low = this.getValueLow();
        let result = "";
        const sign = !!(isSigned && (high & 0x80000000)); // eslint-disable-line no-bitwise
        if (sign) {
            high = ~high; // eslint-disable-line no-bitwise
            low = BIT32 - low;
        }
        do {
            const mod = (high % in_radix) * BIT32 + low;
            high = Math.floor(high / in_radix);
            low = Math.floor(mod / in_radix);
            result = (mod % in_radix).toString(in_radix) + result;
        } while (high || low);

        return sign ? `-${result}` : result;
    }
}

/**
 * stringToInt function parses a string argument updates object's lower and higher 32 bit integer parts.
 *
 * @param in_signed - If the expect response should be signed or unsigned.
 * @param in_string - The value to parse. Leading whitespace in the string argument is ignored.
 * @param in_radix - An integer between 2 and 36 that represents the
 *     radix (the base in mathematical numeral systems) of the above mentioned string.
 * @throws if in_string is not a string
 * @throws if in_radix is entered but is not a number between 2 and 36
 * @throws if the property is a Uint64 property and in_string is a negative number
 * @throws if in_string contains characters other than numbers
 * @returns low and high bits of Int64
 */
function _stringToInt64(in_signed: boolean, in_string: string, in_radix = 10): number[] {
    ConsoleUtils.assert(_.isString(in_string), MSG.IN_STRING_MUST_BE_STRING + in_string);
    const string = in_string.trim();

    ConsoleUtils.assert(_.isNumber(in_radix), `${MSG.IN_RADIX_BETWEEN_2_36}  ${in_radix}`);
    ConsoleUtils.assert(in_radix >= 2 && 36 >= in_radix, `${MSG.BASE_OUT_OF_RANGE} ${in_radix}`);

    let position = 0;
    let negative = false;
    let high = 0;
    let low = 0;
    if (string[0] === "-") {
        negative = true;
        position += 1;
    }

    ConsoleUtils.assert(!negative || in_signed, MSG.CANNOT_UPDATE_TO_NEGATIVE + string);

    while (position < string.length) {
        const digit = parseInt(string[position++], in_radix);
        if (isNaN(digit)) {
            throw new TypeError(MSG.CANNOT_PARSE_INVALID_CHARACTERS + string);
        }
        low = low * in_radix + digit;
        high = high * in_radix + Math.floor(low / BIT32);
        low %= BIT32;
    }

    if (negative) {
        // eslint-disable-next-line no-bitwise
        high = ~high;
        if (low) {
            low = BIT32 - low;
        } else {
            high += 1;
        }
    }

    return [low, high];
}

/**
 * A data representation class for the signed 64 bit integer type
 */
export class Int64 extends Integer64 {
    static fromString = function(in_string: string, radix = 10) {
        const [low, high] = _stringToInt64(true, in_string, radix);
        return new Int64(low, high);
    };

    clone() {
        return new Int64(this.low, this.high);
    }

    toString(radix = 10) {
        return this._int64toString(true, radix);
    }
}

/**
 * A data representation class for the unsigned 64 bit integer type
 */
export class Uint64 extends Integer64 {
    static fromString(in_string: string, in_radix = 10) {
        const [low, high] = _stringToInt64.call(this, false, in_string, in_radix);
        return new Uint64(low, high);
    }

    clone() {
        return new Uint64(this.low, this.high);
    }

    toString(radix) {
        return this._int64toString(false, radix);
    }
}
