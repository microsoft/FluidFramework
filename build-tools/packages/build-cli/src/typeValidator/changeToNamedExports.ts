/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IndentationText, Project } from "ts-morph";

function case_insensitive_comp(strA, strB) {
	return strA.localeCompare(strB, "en", { sensitivity: "base" });
}

async function convert_package_dir(packageDir: string) {
	console.log(`I'm here ${packageDir}`);
	const project = new Project({
		manipulationSettings: {
			useTrailingCommas: true,
			indentationText: IndentationText.Tab,
		},
	});
	const sourceFiles = project.addSourceFilesAtPaths([
		`${packageDir}/src/**.ts`,
		`${packageDir}/src/**/**.ts`,
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
				for (const [name] of moduleSpecifierSourceFile.getExportedDeclarations()) {
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
	const packageDir = ".";
	await convert_package_dir(packageDir);
	return true;
}

run()
	.then((success) => process.exit(success ? 0 : 1))
	.catch(() => process.exit(2));
