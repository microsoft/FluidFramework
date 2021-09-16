/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import commander from "commander";
import { TestDriverTypes } from "@fluidframework/test-driver-definitions";
import { createTestDriver, initialize} from "./utils";

interface ITestUserConfig {
    /* key/value description:
     * Key    : Username for the client
     * Value  : Password specific to that username
     */
    [tenant: string]: Record<string, string>
}

const createLoginEnv = (userName: string, password: string) => `{"${userName}": "${password}"}`;

async function getTestUsers() {
    try {
        const config: ITestUserConfig = JSON.parse(await new Promise<string>((resolve, reject) =>
            fs.readFile("./testTenantConfig.json", "utf8",
                (err, data) => err !== undefined && err ? reject(err) : resolve(data))));
        return config;
    } catch (e) {
        console.error("Failed to read testUserConfig.json");
        console.error(e);
        process.exit(-1);
    }
}

async function main() {
    commander
        .requiredOption("-d, --driver <driver>", "Which test driver info to use", "odsp")
        .requiredOption("-n, --docCount <number>", "Number of Urls per tenant required")
        .requiredOption("-f, --outputFileName <string>", "Name of file to which doc urls should be written")
        .parse(process.argv);

    const driver: TestDriverTypes = commander.driver;
    const docCount: number = commander.docCount;
    const outputFileName: string = commander.outputFileName;
    const testUsers = await getTestUsers();
    await createDocs(
        driver,
        testUsers,
        docCount,
        outputFileName);
}

async function createDocs(
    driver: TestDriverTypes,
    testUsers: ITestUserConfig,
    docCount: number,
    outputFileName: string,
) {
    console.log(`Writing doc urls in ${outputFileName}. Please wait.`);
    const seed = Date.now();
    const tenantNames: string[] = Object.keys(testUsers.tenants);
    let tenantUrlsData: {tenantDocUrls: {[tenant: string]: string[]}} = { tenantDocUrls: {}};
    let done: number = 0;

    const fileExists = await new Promise<boolean>((resolve) =>
        fs.exists(outputFileName, (data: boolean) => resolve(data)));

    if (fileExists) {
        tenantUrlsData = JSON.parse(await new Promise<string>((resolve, reject) =>
            fs.readFile(outputFileName, "utf8",
                (err, data) => err !== undefined && err ? reject(err) : resolve(data))));
    }

    for (const tenantName of tenantNames) {
        let urls: string[] = [];
        if (tenantUrlsData.tenantDocUrls[tenantName] !== undefined) {
            urls = tenantUrlsData.tenantDocUrls[tenantName];
            done += urls.length > docCount ? docCount : urls.length;
        }

        console.log(`Creating doc for tenant ${tenantName}.`);
        const [userName] = Object.keys(testUsers.tenants[tenantName]);
        const password: string = testUsers.tenants[tenantName][userName];
        process.env.login__odsp__test__accounts = createLoginEnv(userName, password);
        const testDriver = await createTestDriver(driver, seed, undefined, true);
        for (let i: number = urls.length; i < docCount; i++) {
            const url = await initialize(testDriver, seed);
            if (url === undefined || url === "") {
                throw Error("Invalid URL");
            }
            urls.push(url);
            console.log(`Created ${++done} urls. ${url}`);
        }
        tenantUrlsData.tenantDocUrls[tenantName] = urls;
        fs.writeFileSync(outputFileName, JSON.stringify(tenantUrlsData, undefined, 2));
    }
    console.log("File has been written.");
    process.exit(0);
}

main().catch(
    (error) => {
        console.error(error);
        process.exit(-1);
    },
);
