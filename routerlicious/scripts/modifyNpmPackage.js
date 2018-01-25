// simple helper function to rev the version of package.json
// Also removes the postinstall instructions because it's breaking sabroners build!
// Example: node .\scripts\routerliciousPackageGenerator.js "..\package.json" "3"

const fs = require("fs");
const path = require("path");

const relativePath = process.argv[2];
const version = process.argv[3];
const packagePath = path.join(__dirname, relativePath);

const f = fs.readFileSync(packagePath);
const package = JSON.parse(f);

const patchIndex = package["version"].lastIndexOf(".") + 1;

package["version"] = package["version"].slice(0, patchIndex) + version;
delete package["scripts"]["postinstall"];

fs.writeFile(packagePath, JSON.stringify(package));
