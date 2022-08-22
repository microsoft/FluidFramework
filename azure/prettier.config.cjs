// TODO: Use shared config in build-common once version with config has been published.
module.exports = {
	printWidth: 100,
    quoteProps: "consistent",
	semi: true,
	singleQuote: false,
	trailingComma: "all",
    overrides: [
        {
            files: "lerna.json",
            options: {
                printWidth: 50,
                tabWidth: 2,
            },
        },
        {
            files: "tsconfig*.json",
            options: {
                parser: "json5",
                tabWidth: 2,
                trailingComma: "all",
                quoteProps: "preserve",
            },
        },
        {
            files: "*.json",
            options: {
                tabWidth: 2,
                trailingComma: "all",
                quoteProps: "preserve",
            },
        },
    ],
};
