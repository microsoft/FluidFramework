/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createTestDriver, initialize} from "./utils";

interface ITestUserConfig {
    [tenant: string]: Record<string, string>
}

async function getTestUsers() {
    let config: ITestUserConfig;
    try {
        config = JSON.parse(await new Promise<string>((resolve, reject) =>
            fs.readFile("./testTenantConfig.json", "utf8", (err, data) => {
                if (!err) {
                    resolve(data);
                } else {
                    reject(err);
                }
            })));
        return config;
    } catch (e) {
        console.error("Failed to read testUserConfig.json");
        console.error(e);
        process.exit(-1);
    }
}

const createLoginEnv = (userName: string, password: string) => `{"${userName}": "${password}"}`;

async function main() {
    commander
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-n, --urlCount <number>", "Number of Urls per tenant required")
        .requiredOption("-f, --outputFileName <string>", "Name of file to which doc urls should be written")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const urlCount: number = commander.urlCount;
    const outputFileName: string = commander.outputFileName;
    const testUsers = await getTestUsers();
    await createDocs(
        driver,
        testUsers,
        urlCount,
        outputFileName);
}

async function createDocs(
    driver: TestDriverTypes,
    testUsers: ITestUserConfig,
    urlCount: number,
    outputFileName: string,
) {
    console.log(`Writing doc urls in ${outputFileName}, Please wait....`);
    const seed = Date.now();
    const tenantNames: string[] = Object.keys(testUsers.tenants);
    const tenantUrlsData: {tenantDocUrls: {[tenant: string]: string[]}} = { tenantDocUrls: {}};
    for (const tenantName of tenantNames) {
        const userNames: string[] = [];
        const urls: string[] = [];
        Object.keys(testUsers.tenants[tenantName]).forEach(function(key) {
            userNames.push(key);
        });
        for(let i: number = 0; i < urlCount; i++) {
            /* Randomly selecting a user credential and creating doc through it.
            Can also be done incrementally, doen't matter. */
            const userIndex = Math.floor(Math.random() * Object.keys(testUsers.tenants[tenantName]).length);
            const userName = userNames[userIndex];
            const password: string = testUsers.tenants[tenantName][userName];
            process.env.login__odsp__test__accounts = createLoginEnv(userName, password);
            const testDriver = await createTestDriver(
                driver,
                seed,
                undefined,
                true);
            const url  = await initialize(testDriver, seed);
            urls.push(url);
        }
        tenantUrlsData.tenantDocUrls[tenantName] = urls;
    }
    fs.writeFileSync(outputFileName, JSON.stringify(tenantUrlsData, undefined, 2));
    console.log("File has been written");
    process.exit(0);
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
