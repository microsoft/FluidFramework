import { createRequire } from "module";
const require = createRequire(import.meta.url);
import * as fs from "fs";

import { remark } from "remark";
// import remarkTwoslash from "remark-shiki-twoslash";
// const { remarkTwoslash } = pkg;
import remarkHtml from "remark-html";
const remarkTwoslash = require("remark-shiki-twoslash");

import { toString } from "mdast-util-to-string";
import { toMarkdown } from "mdast-util-to-markdown";
import { toHast } from "mdast-util-to-hast";
import { toHtml } from "hast-util-to-html";

const main = async () => {
    const codeSample = fs.readFileSync("twoslash-code.md");

    const useLightTheme = true;

    const configuredTwoslash = remarkTwoslash.default({
        theme: "github-light",
        disableImplicitReactImport: true,
        defaultCompilerOptions: {
            strict: false,
        }
    });

    // console.log(JSON.stringify(configuredTwoslash));

    const markdownAST = remark().parse(codeSample);
    await configuredTwoslash(markdownAST);
    // console.log(toMarkdown(markdownAST));

    const hAST = toHast(markdownAST, { allowDangerousHtml: true });
    const html = toHtml(hAST, { allowDangerousHtml: true });

    // console.log(html)

    fs.writeFileSync("twoslash-code.html", html);
}

main();
