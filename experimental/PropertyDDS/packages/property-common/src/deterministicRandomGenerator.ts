/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Helper class to create a deterministic sequence of random numbers.
 */

/* eslint-disable no-bitwise */

import _ from "lodash";
import { GuidUtils } from "./guidUtils";
import { calculateHash } from "./hashCalculator";

/**
 * Random number generator that creates a deterministic sequence of random numbers based on an initial seed GUID.
 *
 * @remarks Warning: This is a very straight forward implementation based on the hashCombine4xUint32 function.
 * It probably doesn't produce very high quality random numbers (do not use this for cryptography!) and it is not very
 * efficient.
 */
export class DeterministicRandomGenerator {
    _guid1: Uint32Array;
    _guid2: Uint32Array;
    _result: Uint32Array;

    /**
     * @param in_seed - The initial seed (it can be either a GUID or a number)
     * which is used to initialize the random number generator.
     */
    constructor(in_seed: string | number) {
        // Initialize the internal state from the given initial guid
        this._guid1 = _.isString(in_seed)
            ? GuidUtils.guidToUint32x4(in_seed)
            : GuidUtils.guidToUint32x4(calculateHash(String(in_seed)));
        this._guid2 = new Uint32Array(4);
        this._guid2[0] = (this._guid1[0] + 1) >>> 0;
        this._guid2[1] = (this._guid1[1] + 1) >>> 0;
        this._guid2[2] = (this._guid1[2] + 1) >>> 0;
        this._guid2[3] = (this._guid1[3] + 1) >>> 0;

        this._result = new Uint32Array(4);
    }

    /**
     * Creates a floating point random number.
     *
     * @param in_max - If supplied the returned number will be 0 \<= number \< `in_max`.
     * If none is given, `in_max` = 1 is assumed.
     *
     * @returns The random number.
     */
    random(in_max = 1.0) {
        const randomInteger = this.irandom();
        return randomInteger / 4294967296 * in_max;
    }

    /**
     * Creates an integer point random number.
     *
     * @param in_max - If supplied the returned number will be 0 \<= number \< `in_max`.
     * If none is given, `in_max` = 14294967296 (2^32) is assumed.
     *
     * @returns The random number.
     */
    irandom(in_max?: number): number {
        // Create a new hash
        GuidUtils.hashCombine4xUint32(this._guid1, this._guid2, this._result);

        // Permute the hashes
        for (let i = 0; i < 4; i++) {
            this._guid1[i] = this._guid2[i];
            this._guid2[i] = this._result[i];
        }

        if (in_max === undefined) {
            return this._guid1[0];
        } else {
            return in_max < 16777619
                // The random generator doesn't seem to be very good.
                // It is quite biased (e.g. it generates too many even numbers)
                // this is a hack to solve at least this problem, but we probably should
                // instead use a different approach altogether
                ? ((this._guid1[0]) % 16777619) % in_max
                : this._guid1[0] % in_max;
        }
    }
}
