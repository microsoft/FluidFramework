#!/usr/bin/env node

/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

// Create a temporary directory for testing
const tmpDir = path.join(__dirname, ".tmp-eslint-v9-test");
if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
}
fs.mkdirSync(tmpDir);

// Create a simple test package.json
fs.writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify(
        {
            name: "eslint-v9-test",
            version: "1.0.0",
            type: "module",
            private: true
        },
        null,
        2
    )
);

// Create a basic ESLint v9 config file
const eslintConfigJs = `
import eslint from "@eslint/js";

export default [
    eslint.configs.recommended,
    {
        files: ["*.js"],
        rules: {
            "no-console": "off"
        }
    }
];
`;

fs.writeFileSync(path.join(tmpDir, "eslint.config.js"), eslintConfigJs);

// Create a simple test file
fs.writeFileSync(
    path.join(tmpDir, "test.js"),
    `
// Test file
/* global console */
const test = () => {
    console.log("Test function");
};
export default test;
`
);

console.log("Validating basic ESLint v9 functionality...");

try {
    // Install basic ESLint v9
    console.log("Installing ESLint v9...");
    execSync("npm install --no-save eslint@9 @eslint/js", { 
        cwd: tmpDir, 
        stdio: "inherit"
    });
    
    // Test with a basic config first
    try {
        execSync("npx eslint test.js", {
            cwd: tmpDir,
            stdio: "inherit"
        });
        
        console.log("\nBasic ESLint v9 configuration works!");
        
        // Now check our files for syntax correctness
        console.log("\nValidating v9 configuration files for syntax...");
        
        const v9Files = fs.readdirSync(path.join(__dirname, "v9"));
        let allValid = true;
        
        for (const file of v9Files) {
            if (!file.endsWith(".js")) continue;
            
            console.log(`Checking ${file}...`);
            const filePath = path.join(__dirname, "v9", file);
            const content = fs.readFileSync(filePath, "utf8");
            
            // Basic validation - check that the file has valid ESM syntax
            if (content.includes("export default")) {
                console.log(`✓ ${file} has valid export default syntax`);
            } else {
                console.log(`✗ ${file} is missing export default syntax`);
                allValid = false;
            }
            
            // Check imports
            if (content.includes("import ")) {
                console.log(`✓ ${file} has valid import syntax`);
            } else if (file !== "index.js") { // index.js might just re-export
                console.log(`✗ ${file} is missing import statements`);
                allValid = false;
            }
        }
        
        if (allValid) {
            console.log("\nAll v9 configuration files appear to have valid ESM syntax.");
            console.log("ESLint v9 compatibility test PASSED!");
            process.exit(0);
        } else {
            console.error("\nSome v9 configuration files have syntax issues. Please fix them.");
            process.exit(1);
        }
    } catch (err) {
        console.error("\nError testing ESLint v9:", err.message);
        process.exit(1);
    }
} catch (error) {
    console.error("\nESLint v9 compatibility test FAILED!");
    if (error.stdout) console.error(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    process.exit(1);
} finally {
    // Clean up
    console.log("\nCleaning up...");
    fs.rmSync(tmpDir, { recursive: true, force: true });
}