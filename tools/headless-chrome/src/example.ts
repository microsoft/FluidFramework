import * as puppeteer from "puppeteer";

async function run() {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on("console", (msg) => {
        console.log(msg.text());
        // for (let i = 0; i < msg.args().length; ++i) {
        //     console.log(`${i}: ${msg.args()[i]}`);
        // }
    });

    // Load the root page in order to set localStorage
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        localStorage.debug = "routerlicious:*";
    });

    // Then navigate to our desired page
    await page.goto('http://localhost:3000/sharedText/chilly-shoe', { waitUntil: "networkidle0" });
    await page.screenshot({path: 'output/example.png'});

    await browser.close();
}

run().catch((error) => console.error(error));
