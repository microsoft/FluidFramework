// @ts-check

/** @type {import("npm-check-updates").RunOptions} */
const config = {
	dep: ["dev", "optional", "peer"],
	target: "semver",
	reject: ["@types/node", "@biomejs/biome", /.*oclif.*/],

	root: true,
	upgrade: true,
	workspaces: true,
};

module.exports = config;
