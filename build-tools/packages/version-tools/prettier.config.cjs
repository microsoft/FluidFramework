// TODO: Use shared config in build-common once version with config has been published.
module.exports = {
    printWidth: 100,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    overrides: [
        {
            files: "lerna.json",
            options: {
                printWidth: 50,
            },
        },
        {
            files: "tsconfig*.json",
            options: {
                parser: "json5",
                trailingComma: "all",
                quoteProps: "preserve",
            },
        },
        {
            files: "*.json",
            options: {
                // parser: "json5",
                trailingComma: "all",
                quoteProps: "preserve",
            },
        },
    ],
};
