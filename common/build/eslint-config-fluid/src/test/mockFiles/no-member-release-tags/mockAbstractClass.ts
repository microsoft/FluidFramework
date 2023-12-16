/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @public
 * Not used in the current test suite due to compatibility issue with the ESLint.
*/
abstract class MockAbstractClass {
    /**
     * @public
     */
    abstract invalidMethod(): void;

    /**
     * @alpha
     */
    abstract invalidSignature: number;

    abstract validMethod(): boolean;    

    abstract validSignature: string;
}