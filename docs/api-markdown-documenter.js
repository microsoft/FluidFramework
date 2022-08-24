const {
    emitMarkdown,
    getLinkUrlForApiItem,
    getUnscopedPackageName,
    loadModel,
    markdownDocumenterConfigurationWithDefaults,
    MarkdownEmitter,
    renderDocuments,
    DefaultPolicies
} = require("@fluid-tools/api-markdown-documenter");
const { StringBuilder } = require("@microsoft/tsdoc");
const { ApiItemKind } = require("@microsoft/api-extractor-model");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");


// TODOs:
// - Filter packages we generate docs for
// - Styling (in particular, tables)

const apiReportsDirectoryPath = path.resolve(__dirname, "_api-extractor-temp", "_build");
const apiDocsDirectoryPath = path.resolve(__dirname, "content", "docs", "apis");

/**
 * Creates Hugo front-matter for the given API item.
 * This will be appended to the top of the generated API documents.
 *
 * @param {ApiItem} apiItem - The root API item of the document being rendered.
 * @param {MarkdownDocumenterConfiguration} config
 * @param {MarkdownEmitter} markdownEmitter
 *
 * @returns The JSON-formatted Hugo front-matter as a `string`.
 */
function frontMatterFromApiItem(apiItem, config, markdownEmitter) {
    function extractSummary(docComment) {
        const stringBuilder = new StringBuilder();
        const summary = docComment.summarySection;
        markdownEmitter.emit(stringBuilder, summary, {
            contextApiItem: apiItem,
            getLinkUrlApiItem: (apiItemForFilename) => {
                return getLinkUrlForApiItem(apiItemForFilename, config);
            }
        });
        return stringBuilder.toString().replace(/"/g, "'").trim();
    }

    const frontMatter = {};
    frontMatter.title = apiItem.displayName.replace(/"/g, '').replace(/!/g, '');
    let apiMembers = apiItem.members;
    switch (apiItem.kind) {
        case ApiItemKind.Model:
            frontMatter.title = "Package Reference";
            break;
        case ApiItemKind.Class:
            if (apiItem.tsdocComment) {
                frontMatter.summary = extractSummary(apiItem.tsdocComment);
            }
            frontMatter.title += " Class";
            break;
        case ApiItemKind.Interface:
            frontMatter.title += " Interface";
            if (apiItem.tsdocComment) {
                frontMatter.summary = extractSummary(apiItem.tsdocComment);
            }
            break;
        case ApiItemKind.Package:
            frontMatter.title += " Package";
            apiMembers = apiItem.entryPoints[0].members;
            if (apiItem.tsdocComment) {
                frontMatter.summary = extractSummary(apiItem.tsdocComment);
            }
            break;
        case ApiItemKind.Namespace:
            frontMatter.title += " Namespace";
            apiMembers = apiItem.members;
            if (apiItem.tsdocComment) {
                frontMatter.summary = extractSummary(apiItem.tsdocComment);
            }
            break;
        default:
            break;
    }

    frontMatter.kind = apiItem.kind;

    frontMatter.members = new Map();
    apiMembers.forEach(element => {
        if (element.displayName === "") {
            return;
        }
        if (!frontMatter.members[element.kind]) {
            frontMatter.members[element.kind] = {};
        }
        frontMatter.members[element.kind][element.displayName] = getLinkUrlForApiItem(element, config);
    });

    const associatedPackage = apiItem.getAssociatedPackage();
    if (associatedPackage) {
        frontMatter.package = associatedPackage.name.replace(/"/g, '').replace(/!/g, '');
        frontMatter.unscopedPackageName = getUnscopedPackageName(associatedPackage);
    } else {
        frontMatter.package = "undefined";
    }

    return JSON.stringify(frontMatter, undefined, 2).trim();
}

async function main() {
    // Delete existing documentation output
    console.log("Removing existing generated API docs...");
    await fs.ensureDir(apiDocsDirectoryPath);
    await fs.emptyDir(apiDocsDirectoryPath);

    // Process API reports
    console.log("Generating API model...");
    const apiModel = await loadModel(apiReportsDirectoryPath);

    const config = markdownDocumenterConfigurationWithDefaults({
        apiModel,
        newlineKind: "lf",
        uriRoot: "/docs/apis",
        includeTopLevelDocumentHeading: false, // This will be added automatically by Hugo
        fileNamePolicy: (apiItem) => {
            return apiItem.kind === ApiItemKind.Model
                ? "_index" // Hugo syntax for a page with content sub-directories
                : DefaultPolicies.defaultFileNamePolicy(apiItem);
        }
    });

    console.log("Generating API docs...");
    let documents;
    try {
        documents = renderDocuments(config);
    } catch(error) {
        console.error(`Encountered error while generating API documentation for "${document.apiItem.displayName}":`);
        console.error(error);
        throw error;
    }

    console.log("Writing API docs...");

    await Promise.all(documents.map(async (document) => {
        const filePath = path.join(apiDocsDirectoryPath, document.path);

        await fs.ensureFile(filePath);

        console.log(`Writing document for "${document.apiItem.displayName}"...`);

        // Emit markdown for API docs
        const markdownEmitter = new MarkdownEmitter(config.apiModel);
        let generatedMarkdown;
        try {
            generatedMarkdown = emitMarkdown(document, config, markdownEmitter);
        } catch (error) {
            console.error(`Encountered error while emitting markdown for "${document.apiItem.displayName}":`);
            console.error(error);
            throw error;
        }

        // Generate Hugo front-matter for the API item
        let frontMatter;
        try {
            frontMatter = frontMatterFromApiItem(document.apiItem, config, markdownEmitter);
        } catch (error) {
            console.error(`Encountered error while generating front-matter for "${document.apiItem.displayName}":`);
            console.error(error);
            throw error;
        }

        const generatedContentNotice = "[//]: # (Do not edit this file. It is automatically generated by @fluidtools/api-markdown-documenter.)";

        // Combine front-matter, generated content notice comment, and API docs into a single string, and write to disk
        const fileContents = [frontMatter, generatedContentNotice, generatedMarkdown].join(`${os.EOL}${os.EOL}`).trim();

        try {
            await fs.writeFile(filePath, fileContents);
        } catch (error) {
            console.error(`Encountered error while writing file output for "${document.apiItem.displayName}":`);
            console.error(error);
            throw error;
        }
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
