const colors = require("colors");
const fs = require("fs-extra");
const path = require("path");

// Use defaults for rendering policies
const config = {
    newlineKind: "lf",
    uriRoot: "",
};

const docsOutputDirectory = path.resolve(__dirname, "generated-api-docs");

async function main() {
    // Clear output folder.
    await fs.emptyDir(docsOutputDirectory);

    // TODO
}

main().then(
    () => {
        console.log(colors.green("SUCCESS: Markdown documentation generated successfully!"));
        process.exit(0);
    },
    (error) => {
        console.error(
            "FAILURE: Markdown documentation could not be generated due to an error.",
            error,
        );
        process.exit(1);
    },
);
