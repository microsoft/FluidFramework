module.exports = {
    ...require("@fluidframework/build-common/prettier.config.cjs"),
    importOrder: [
        "^node:(.*)$",
        "<THIRD_PARTY_MODULES>",
        "^fluid-framework$",
        "^@fluidframework/(.*)$",
        "^@fluid-(.*?)/(.*)$",
        "^[./]"
    ],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
};
