/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Page } from "puppeteer";

function craftCachePage(headHTML: string, bodyHTML: string) {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
        <head>
            ${headHTML}
        </head>
        <body>
            <div id="content">
                ${bodyHTML}
            </div>
        </body>
    </html>`;
    return html;
}

// Extract the head and body HTML. Remove any <script> tag. And then wrap inside a basic HTML page.
// todo (mdaumi): Chaincode should specify how to do this. This should be used as a fallback.
export async function createCacheHTML(page: Page): Promise<string> {
    const [bodyHTML, headHTML] = await page.evaluate(() => [document.body.innerHTML, document.head.innerHTML]);
    // eslint-disable-next-line unicorn/no-unsafe-regex
    const re = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
    const cleanBodyHTML = bodyHTML.replace(re, "");
    const cleanHeadHTML = headHTML.replace(re, "");
    const pageHTML = craftCachePage(cleanHeadHTML, cleanBodyHTML);
    return pageHTML;
}
