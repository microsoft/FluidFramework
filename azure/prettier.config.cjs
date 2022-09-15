module.exports = {
    ...require("@fluidframework/build-common/prettier.config.cjs"),
    importOrder: ["^node:(.*)$", "<THIRD_PARTY_MODULES>", "^[./]"],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
};
