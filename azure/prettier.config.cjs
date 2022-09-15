module.exports = {
    ...require("@fluidframework/build-common/prettier.config.cjs"),
    importOrder: ["<THIRD_PARTY_MODULES>", "^[./]"],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,
};
