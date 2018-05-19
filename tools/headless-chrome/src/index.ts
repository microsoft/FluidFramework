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

        const regEx = new RegExp(`${matchText[entry]} (.+): (\\d+.\\d+) `);
        const matches = text.match(regEx);
        if (matches) {
            entry++;
            perfMatches.push(Number.parseFloat(matches[2]));
        }
    };

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
        localStorage.debug = "routerlicious:*";
    });

    await page.type("#username", username);
    await page.type("#password", password);
    const navigationP = page.waitForNavigation();
    await page.click("#submit");
    await navigationP;
}

async function runTest(
    documentUrl: string,
    iterations: number,
    username: string,
    password: string): Promise<any[]> {

    console.error(`Opening ${documentUrl} for ${iterations} iterations`);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const parsedUrl = new URL(documentUrl);

    await loginAndInitialize(parsedUrl.origin, page, username, password);

    const matchText = [
        { text: "Document loading", event: "loading" },
        { text: "Document loaded", event: "loaded_head" },
        { text: "fully loaded", event: "loaded_body" }];
    const matchTextStrings = matchText.map((match) => match.text);

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
        const result: any = { host: parsedUrl.host };
        matchText.forEach((value, index) => {
            const temperature = i === 0 ? "cold" : "warm";
            result[value.event] = matches[index];
            result[`${temperature}_${value.event}`] = matches[index];
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
        "https://alfred.eu.prague.office-int.com/sharedText/disastrous-page")
    .option("-u, --username [username]", "Username", "test")
    .option("-p, --password [password]", "Password", "mRTvhfDTE3FYbVc")
    .parse(process.argv);

runTest(commander.document, commander.iterations, commander.username, commander.password).then(
    (metrics) => {
        console.log(JSON.stringify(metrics, null, 2));
    },
    (error) => {
        console.error(error);
        process.exit(1);
    });
