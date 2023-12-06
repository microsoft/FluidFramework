const chalk = require("chalk");
const yaml = require('js-yaml');
const fs   = require('fs');
const path = require("path");
const { main } = require('./rollup-api-json');
const { rimraf } = require("rimraf");

const renderMultiVersion = process.argv[2];

let docVersions;
try {
	const versions = yaml.load(fs.readFileSync('../tools/pipelines/templates/include-doc-versions.yml', 'utf8'));
	docVersions = renderMultiVersion ? versions.variables.previousVersions : versions.variables.currentVersion;
	docVersions = docVersions.split(",");
  } catch (e) {
	console.log(e);
}

docVersions.forEach(version => {
	version = (version === 'main') ? "" : "-"+version
	
	const originalPath = path.resolve("..", "_api-extractor-temp"+version, "doc-models");
	const targetPath = path.resolve(".", "_api-extractor-temp"+version);

	rimraf(targetPath);

	main(originalPath, targetPath).then(
		() => {
			console.log(chalk.green("SUCCESS: API log files staged!"));
			process.exit(0);
		},
		(error) => {
			console.error("FAILURE: API log files could not be staged due to an error.", error);
			process.exit(1);
		},
	);
	
});
