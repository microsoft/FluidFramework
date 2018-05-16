import * as puppeteer from "puppeteer";

async function testPage(page: puppeteer.Page, matchText: string[]): Promise<number[]> {
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
    await page.goto('http://localhost:3000/sharedText/painstaking-fang', { waitUntil: "networkidle0" });
    page.removeListener("console", testFn);

    return perfMatches;
}

async function run() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // Load the root page in order to set localStorage
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        localStorage.debug = "routerlicious:*";
    });

    const matchText = [
        "Document loading",
        "Document loaded",
        "fully loaded"];
    const sums = matchText.map(() => 0);

    const iterations = 5;
    for (let i = 0; i < iterations; i++) {
        const matches = await testPage(page, matchText);
        console.log(`Iteration ${i + 1}`);
        matchText.forEach((value, index) => {
            console.log(`${value} ${matches[index]}`);
            sums[index] += matches[index];
        });
        console.log("----");
    }

    console.log("Final");
    console.log("");
    matchText.forEach((value, index) => {
        console.log(`${value} ${sums[index] / iterations}`);
    });

    await browser.close();
}

run().catch((error) => console.error(error));
