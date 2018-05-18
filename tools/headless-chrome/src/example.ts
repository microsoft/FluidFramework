import * as commander from "commander";
import * as puppeteer from "puppeteer";
import { URL } from "url";

interface IMetric {
    name: string;
    average: number;
    raw: number[];
}

async function testPage(documentUrl: string, page: puppeteer.Page, matchText: string[]): Promise<number[]> {
    const perfMatches: number[] = [];

    let entry = 0;
    const testFn = (msg: puppeteer.ConsoleMessage) => {
        const text = msg.text();

        console.log(text);

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
    documentUrl: string,
    page: puppeteer.Page,
    username: string,
    password: string) {

    const parsedUrl = new URL(documentUrl);

    // Go to the login page
    await page.goto(`${parsedUrl.origin}/login/local`);

    // Turn on verbose debugging across all pages
    await page.evaluate(() => {
        localStorage.debug = "routerlicious:*";
    });

    await page.type("#username", username);
    await page.type("#password", password);
    await page.click("#submit");
    await page.waitForNavigation();
}

async function runTest(
    documentUrl: string,
    iterations: number,
    username: string,
    password: string): Promise<IMetric[]> {

    console.log(`Opening ${documentUrl} for ${iterations} iterations`);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    await loginAndInitialize(documentUrl, page, username, password);

    const matchText = [
        "Document loading",
        "Document loaded",
        "fully loaded"];
    const rawSamples = matchText.map(() => [] as number[]);

    for (let i = 0; i < iterations; i++) {
        const matches = await testPage(documentUrl, page, matchText);
        console.log(`Iteration ${i + 1}`);
        matchText.forEach((value, index) => {
            console.log(`${value} ${matches[index]}`);
            rawSamples[index].push(matches[index]);
        });
        console.log("----");
    }

    const closeP = browser.close();
    const metricsP = Promise.all(matchText.map(async (value, index) => {
        if (rawSamples[index].length !== iterations) {
            return Promise.reject(`Missing sample ${value}: ${rawSamples[index]} !== ${iterations}`);
        }

        let sum = 0;
        for (const rawSample of rawSamples[index]) {
            sum += rawSample;
        }

        return {
            average: sum / iterations,
            name: value,
            raw: rawSamples[index],
        } as IMetric;
    }));

    return Promise.all([metricsP, closeP]).then(([metrics]) => metrics);
}

// Process command line input
commander
    .version("0.0.1")
    .option("-i, --iterations [iterations]", "Test iterations to run", parseFloat, 5)
    .option(
        "-d, --document [document]",
        "Document to open",
        "https://alfred.wu2-ppe.prague.office-int.com/sharedText/disastrous-page")
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
