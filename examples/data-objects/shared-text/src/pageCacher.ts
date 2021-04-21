/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Named function for the headless loader.
interface IWindow extends Window {
    cachePage(pageHTML: string): void;
}

// Extract the head and body HTML. Remove any <script> tag. And then wrap inside a basic HTML page.
export function createCacheHTML(): void {
    const [bodyHTML, headHTML] = [document.body.innerHTML, document.head.innerHTML];
    // eslint-disable-next-line unicorn/no-unsafe-regex
    const cleanBodyHTML = bodyHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    // eslint-disable-next-line unicorn/no-unsafe-regex
    const cleanHeadHTML = headHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
    const pageHTML = craftCachePage(cleanHeadHTML, cleanBodyHTML);
    ((window as unknown) as IWindow).cachePage(pageHTML);
}

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
