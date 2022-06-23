/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const fetchData = async () => {
    const inventoryData =
`Alpha:1
Beta:2
Gamma:3
Delta:4`;
    return inventoryData;
};

export const writeData = async (data: string) => {
    // Write to persisted storage
    console.log("Wrote data:");
    console.log(data);
};
