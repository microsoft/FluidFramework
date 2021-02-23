/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import fs from "fs";

const configPath = `${__dirname}/../config.json`;

 export function loadConfig(): TestDriverConfig {
    const config: TestDriverConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert(config, `${configPath} does not exist`);
    return config;
 }

 export function writeConfig(config: TestDriverConfig) {
    fs.writeFileSync(configPath, JSON.stringify(config, undefined, 2), {encoding: "utf-8"});
 }

export interface IOdspTestConfigEntry {
    tenants: { [friendlyName: string]: IOdspTestLoginInfo };
}

export interface IOdspTestLoginInfo {
    server: string;
    username: string;
    password: string;
    driveId: string;
}

 export interface TestDriverConfig{
    odsp: IOdspTestConfigEntry
 }
