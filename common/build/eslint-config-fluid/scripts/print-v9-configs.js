#!/usr/bin/env node

/**
 * Script to print ESLint v9 configurations.
 * This script is a temporary workaround since ESLint v9 uses a different configuration format,
 * and we can't directly use the existing print-config scripts.
 */

const fs = require("fs");
const path = require("path");

async function printConfig() {
  const baseDir = path.resolve(__dirname, "..");
  const outputDir = path.join(baseDir, "printed-configs");
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  
  // List of configurations to print
  const configs = [
    { name: "v9-default", configFile: "index.js" },
    { name: "v9-minimal", configFile: "minimal-deprecated.js" },
    { name: "v9-recommended", configFile: "recommended.js" },
    { name: "v9-strict", configFile: "strict.js" },
    { name: "v9-strict-biome", configFile: "strict-biome.js" },
    { name: "v9-react", configFile: "index.js", fileExtension: ".tsx" },
    { name: "v9-test", configFile: "index.js", filePath: "test/file.ts" },
  ];

  // Write an improved placeholder for each config
  // Since ESLint v9 uses a different configuration format, we need a different approach
  for (const config of configs) {
    const outputFile = path.join(outputDir, `${config.name}.json`);
    const configContent = {
      info: `ESLint v9 configuration - ${config.name}`,
      configType: "flat-config",
      description: "ESLint v9 uses a flat configuration format exported as an array of configuration objects",
      configFile: `v9/${config.configFile}`,
      usage: {
        legacyFormat: `// .eslintrc.js\nmodule.exports = {\n  extends: [\"@fluidframework/eslint-config-fluid/v9/${path.basename(config.configFile, '.js')}\"],\n  // ...rest of your config\n}`,
        flatFormat: `// eslint.config.js\nimport fluidConfig from \"@fluidframework/eslint-config-fluid/v9/${path.basename(config.configFile, '.js')}\";\n\nexport default [\n  ...fluidConfig,\n  // ...your other configs\n];`
      }
    };
    
    fs.writeFileSync(outputFile, JSON.stringify(configContent, null, 2));
    console.log(`Generated improved placeholder for ${config.name}`);
  }
}

printConfig().catch((error) => {
  process.exitCode = 1;
  console.error(error);
});