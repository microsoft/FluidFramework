const download = require("download");
const versions = require("./data/versions.json");

const renderMultiVersion = process.argv[2];

docVersions = renderMultiVersion
	? versions.params.previousVersions.concat(versions.params.currentVersion)
	: [versions.params.currentVersion];

const downloadConfigs = [];

docVersions.forEach((version) => {
	version = version === versions.params.currentVersion ? "" : "-" + version;
	const downloadConfig = {
		url: `https://fluidframework.blob.core.windows.net/api-extractor-json/latest${version}.tar.gz`,
		destination: `../_api-extractor-temp${version}/doc-models/`,
	};
	downloadConfigs.push(downloadConfig);
	console.log("DOWNLOAD CONFIGS", downloadConfigs);
});

(async () => {
	await Promise.all(
		downloadConfigs.map((config) => {
			download(config.url, config.destination, { extract: true });
		}),
	);
})();
