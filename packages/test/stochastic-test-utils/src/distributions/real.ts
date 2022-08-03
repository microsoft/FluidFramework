/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const real = (float64Source: () => number, min: number, max: number) => {
    const delta = max - min;
    return () => float64Source() * delta + min;
};
