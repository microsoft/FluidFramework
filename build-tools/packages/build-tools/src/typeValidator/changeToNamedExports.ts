/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import program from "commander";
import { IndentationText, Project } from "ts-morph";

import { findPackagesUnderPath } from "./packageJson";

/**
 * argument parsing
 */
program
	.option("-d|--packageDir <dir>", "The root directory of the package")
	.option(
		"-m|--monoRepoDir <dir>",
		"The root directory of the mono repo, under which there are packages.",
	)
	.option(
		"-p|--preinstallOnly",
		"Only prepares the package json. Doesn't generate tests. This should be done before npm install",
	)
	.option(
		"-g|--generateOnly",
		"This only generates the tests. If does not prepare the package.json",
	)
	.option("-v|--verbose", "Verbose logging mode")
	.parse(process.argv);

function writeOutLine(output: string) {
	if (program.verbose) {
		console.log(output);
	}
}

function case_insensitive_comp(strA, strB) {
	return strA.localeCompare(strB, "en", { sensitivity: "base" });
}

async function convert_package_dir(packageDir: string) {
	console.log(`I'm here ${packageDir}`);
	const project = new Project({
		manipulationSettings: {
			useTrailingCommas: true,
			indentationText: IndentationText.FourSpaces,
		},
	});
	const sourceFiles = project.addSourceFilesAtPaths([
		`${program.monoRepoDir}/${packageDir}/src/**.ts`,
		`${program.monoRepoDir}/${packageDir}/src/**/**.ts`,
		`${packageDir}/**.ts`,
	]);
	console.log(sourceFiles.length);
	sourceFiles.forEach((sourceFile) => {
		console.log(sourceFile.getBaseName());
		const exportDeclarations = sourceFile.getExportDeclarations();
		// // eslint-disable-next-line @typescript-eslint/no-explicit-any
		// const moduleSpecifiers = new Map<string, any>();
		// exportDeclarations.forEach((ed) => {
		//     const key = ed.getStructure().moduleSpecifier || "";
		//     moduleSpecifiers.set(key, ed);
		// });
		// const sortedModuleSpecifiers = Array.from(moduleSpecifiers.keys()).sort(
		//     case_insensitive_comp,
		// );
		// sortedModuleSpecifiers.forEach((key, i) => {
		//     moduleSpecifiers.get(key).setOrder(i);
		// });
		exportDeclarations.forEach((exportDeclaration) => {
			if (exportDeclaration.isNamespaceExport()) {
				const moduleSpecifierSourceFile =
					exportDeclaration.getModuleSpecifierSourceFileOrThrow();
				const namedExports = new Array<string>();
				for (const [name, _] of moduleSpecifierSourceFile.getExportedDeclarations()) {
					namedExports.push(name);
				}
				namedExports.sort(case_insensitive_comp).forEach((name) => {
					exportDeclaration.addNamedExport(name);
					console.log(
						`Added ${name} to ${sourceFile.getBaseName()} from ${moduleSpecifierSourceFile.getBaseName()}`,
					);
				});
			}
			// if (exportDeclaration.hasNamedExports()) {
			//     exportDeclaration
			//         .getLastChildByKindOrThrow(261)
			//         .replaceWithText(
			//             exportDeclaration
			//                 .getLastChildByKindOrThrow(261)
			//                 .getText()
			//                 .replace("{ ", "")
			//                 .replace(" }", "")
			//                 .split(", ")
			//                 .sort(case_insensitive_comp)
			//                 .join(", "),
			//         );
			// }
			if (exportDeclaration.getWidth() > 120) {
				exportDeclaration
					.getLastChildByKindOrThrow(261)
					.replaceWithText(
						exportDeclaration
							.getLastChildByKindOrThrow(261)
							.getText()
							.replace(/, /gi, ",\n\t")
							.replace("{ ", "{\n\t")
							.replace(" }", ",\n}"),
					);
			}
			sourceFile.saveSync();
		});
	});
	await project.save();
}

async function run(): Promise<boolean> {
	const packageDirs: string[] = [];
	if (program.monoRepoDir) {
		writeOutLine(`Finding packages in mono repo ${program.monoRepoDir}`);
		packageDirs.push(...(await findPackagesUnderPath(program.monoRepoDir)));
	} else if (program.packageDir) {
		writeOutLine(`${program.packageDir}`);
		packageDirs.push(program.packageDir);
	} else {
		console.log(program.helpInformation());
		return false;
	}

	writeOutLine(`preinstallOnly: ${program.preinstallOnly}`);
	writeOutLine(`generateOnly: ${program.generateOnly}`);

	const concurrency = 25;
	const runningGenerates: Promise<boolean>[] = [];

	packageDirs.forEach((packageDir, i) =>
		runningGenerates.push(
			(async () => {
				if (i >= concurrency) {
					await runningGenerates[i - concurrency];
				}
				const packageName = packageDir.substring(packageDir.lastIndexOf("/") + 1);
				const output = [`${(i + 1).toString()}/${packageDirs.length}`, `${packageName}`];
				try {
					await convert_package_dir(packageName);
					output.push("Done");
				} catch (error) {
					output.push("Error");
					if (typeof error === "string") {
						output.push(error);
					} else if (error instanceof Error) {
						output.push(error.message, `\n ${error.stack}`);
					} else {
						output.push(typeof error, `${error}`);
					}
					return false;
				} finally {
					writeOutLine(output.join(": "));
				}
				return true;
			})(),
		),
	);

	return (await Promise.all(runningGenerates)).every((v) => v);
}

run()
	.then((success) => process.exit(success ? 0 : 1))
	.catch(() => process.exit(2));
