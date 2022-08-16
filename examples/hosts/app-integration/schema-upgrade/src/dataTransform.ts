/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataTransformationCallback } from "./migrationInterfaces";

export function readVersion(stringData: string) {
    const lines = stringData.split("\n");
    const [versionTag, version] = lines[0].split(":");
    if (versionTag !== "version" || typeof version !== "string" || version === "") {
        throw new Error("Can't read version");
    }
    return version;
}

export function parseStringData1(stringData: string) {
    const version = readVersion(stringData);
    if (version !== "one") {
        throw new Error(`Expected to parse version one, got version ${version}`);
    }
    const itemStrings = stringData.split("\n");
    itemStrings.shift(); // remove version line
    return itemStrings.map((itemString) => {
        const [itemNameString, itemQuantityString] = itemString.split(":");
        return { name: itemNameString, quantity: parseInt(itemQuantityString, 10) };
    });
}

export function parseStringData2(stringData: string) {
    const version = readVersion(stringData);
    if (version !== "two") {
        throw new Error(`Expected to parse version two, got version ${version}`);
    }
    const itemStrings = stringData.split("\n");
    itemStrings.shift(); // remove version line
    return itemStrings.map((itemString) => {
        const [itemNameString, itemQuantityString] = itemString.split("\t");
        return { name: itemNameString, quantity: parseInt(itemQuantityString, 10) };
    });
}

function parseStringData(stringData: string) {
    const version = readVersion(stringData);
    if (version === "one") {
        return parseStringData1(stringData);
    } else if (version === "two") {
        return parseStringData2(stringData);
    } else {
        throw new Error(`Don't know how to parse version ${version}`);
    }
}

function transformToOne(stringData: string) {
    const inventoryItems = parseStringData(stringData);
    const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
        return `${ inventoryItem.name }:${ inventoryItem.quantity.toString() }`;
    });
    return `version:one\n${inventoryItemStrings.join("\n")}`;
}

function transformToTwo(stringData: string) {
    const inventoryItems = parseStringData(stringData);
    const inventoryItemStrings = inventoryItems.map((inventoryItem) => {
        return `${ inventoryItem.name }\t${ inventoryItem.quantity.toString() }`;
    });
    return `version:two\n${inventoryItemStrings.join("\n")}`;
}

export const dataTransformationCallback: DataTransformationCallback = async (exportedData: unknown, targetModel) => {
    if (targetModel.supportsDataFormat(exportedData)) {
        return exportedData;
    }

    if (typeof exportedData !== "string") {
        throw new Error("Unexpected data format");
    }

    const targetVersion = targetModel.version;
    if (targetVersion === "one") {
        return transformToOne(exportedData);
    } else if (targetVersion === "two") {
        return transformToTwo(exportedData);
    } else {
        throw new Error(`Don't know how to transform for target version ${targetVersion}`);
    }
};
