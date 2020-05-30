/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as commander from "commander";
import * as puppeteer from "puppeteer";
import { URL } from "url";

async function testPage(documentUrl: string, page: puppeteer.Page, matchText: string[]): Promise<number[]> {
    const perfMatches: number[] = [];

    let entry = 0;
    const testFn = (msg: puppeteer.ConsoleMessage) => {
        const text = msg.text();

        console.error(text);

        // Already found all our matches
        if (entry === matchText.length) {
            return;
        }

        const regEx = new RegExp(`${matchText[entry]}: (\\d+.\\d+)`);
        const matches = text.match(regEx);
        if (matches) {
            entry++;
            console.log(matches[1]);
            perfMatches.push(Number.parseFloat(matches[1]));
        }
    };

    console.log(documentUrl);

    page.on("console", testFn);
    await page.goto(
        documentUrl,
        {
            waitUntil: "networkidle0",
        });
    page.removeListener("console", testFn);

    return perfMatches;
}

async function loginAndInitialize(
    origin: string,
    page: puppeteer.Page,
    username: string,
    password: string) {

    // Go to the login page
    await page.goto(`${origin}/login/local`);

    // Turn on verbose debugging across all pages
    await page.evaluate(() => {
        localStorage.debug = "fluid:*";
    });

    // await page.type("#username", username);
    // await page.type("#password", password);
    // const navigationP = page.waitForNavigation();
    // await page.click("#submit");
    // await navigationP;
}

async function runTest(
    documentUrl: string,
    document2Url: string,
    iterations: number,
    username: string,
    password: string,
): Promise<any[]> {

    console.error(`Opening ${documentUrl} for ${iterations} iterations`);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const parsedUrl = new URL(documentUrl);

    await loginAndInitialize(parsedUrl.origin, page, username, password);

    const matchText = [
        { text: "Container resolve", event: "resolve" },
        { text: "Container loading", event: "loading" },
        { text: "Partial load fired", event: "partial" },
        { text: "fully loaded", event: "full" }];
    const matchTextStrings = matchText.map((match) => match.text);

    await testPage(document2Url, page, matchTextStrings);

    const results: any[] = [];
    for (let i = 0; i < iterations; i++) {
        console.error(`Iteration ${i + 1}`);
        console.error("------------------");

        const matches = await testPage(documentUrl, page, matchTextStrings);
        if (matches.length !== matchText.length) {
            return Promise.reject(`Missing sample ${matches.length} !== ${matchText.length}`);
        }

        console.error("");

        // output values
        const result: any = {
            host: parsedUrl.host,
            temperature: i === 0 ? "cold" : "warm",
        };
        matchText.forEach((value, index) => {
            result[value.event] = matches[index];
        });

        results.push(result);
    }

    await browser.close();

    return results;
}

// Process command line input
commander
    .version("0.0.1")
    .option("-i, --iterations [iterations]", "Test iterations to run", parseFloat, 5)
    .option(
        "-d, --document [document]",
        "Document to open",
        "http://localhost:3000/loader/fluid/testtesttest8?chaincode=@fluid-example/shared-text2@0.2.13")
    .option(
        "-e, --document2 [document2]",
        "Document to open",
        "http://localhost:3000/loader/fluid/testtesttest7?chaincode=@fluid-example/shared-text2@0.2.13")
    .option("-u, --username [username]", "Username", "test")
    .option("-p, --password [password]", "Password", "mRTvhfDTE3FYbVc")
    .parse(process.argv);

runTest(
    commander.document,
    commander.document2,
    commander.iterations,
    commander.username,
    commander.password).then(
        (metrics) => {
            console.log(JSON.stringify(metrics, null, 2));
        },
        (error) => {
            console.error(error);
            process.exit(1);
        });
