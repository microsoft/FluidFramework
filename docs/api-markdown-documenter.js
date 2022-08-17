const { readModel, renderDocuments, emitMarkdown } = require("@fluid-tools/api-markdown-documenter");
const fs = require("fs-extra");
const path = require("path");

const apiReportsDirectoryPath = path.resolve(__dirname, "_api-extractor-temp", "_build");
const apiDocsDirectoryPath = path.resolve(__dirname, "content", "docs", "apis");

// function appendHugoFrontMatter(document) {

// }

async function main() {
    // Delete existing documentation output
    console.log("Removing existing generated API docs...");
    await fs.ensureDir(apiDocsDirectoryPath);
    await fs.emptyDir(apiDocsDirectoryPath);

    // Process API reports
    console.log("Generating API model...");
    const apiModel = await readModel(apiReportsDirectoryPath);

    const config = {
        apiModel,
        newlineKind: "lf",
        uriRoot: "/docs/apis",
    };

    console.log("Generating API docs...");
    const documents = renderDocuments(config);

    console.log("Writing API docs...");

    await Promise.all(documents.map(async (document) => {
        const filePath = path.join(apiDocsDirectoryPath, document.path);

        await fs.ensureFile(filePath);

        console.log(`Writing document for "${document.apiItem.displayName}"...`);

        const emittedMarkdown = emitMarkdown(document, config);

        await fs.writeFile(filePath, emittedMarkdown);
    }));
}

main().then(() => {
    console.log("API docs written!");
    return 0;
}, (error) => {
    console.error("API docs could not be written due to an error:");
    console.error(error);
    return 1;
})
