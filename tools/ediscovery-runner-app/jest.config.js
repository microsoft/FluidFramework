module.exports = {
    transform: {
      "^.+\\.(ts|tsx)?$": "ts-jest"
    },
    testPathIgnorePatterns: ["/node_modules/", "/lib/"],
    testRegex: "\\.test\\.(ts|tsx|js)$",
    moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
    globals: {
      "ts-jest": {}
    }
  };
  