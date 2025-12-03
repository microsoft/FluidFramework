/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IndentationText, Project } from "ts-morph";

function case_insensitive_comp(strA: string, strB: string): number {
	return strA.localeCompare(strB, "en", { sensitivity: "base" });
}

async function convert_package_dir(packageDir: string): Promise<void> {
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
	for (const sourceFile of sourceFiles) {
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
		for (const exportDeclaration of exportDeclarations) {
			if (exportDeclaration.isNamespaceExport()) {
				const moduleSpecifierSourceFile =
					exportDeclaration.getModuleSpecifierSourceFileOrThrow();
				const namedExports = new Array<string>();
				for (const [name] of moduleSpecifierSourceFile.getExportedDeclarations()) {
					namedExports.push(name);
				}
				for (const name of namedExports.sort(case_insensitive_comp)) {
					exportDeclaration.addNamedExport(name);
					console.log(
						`Added ${name} to ${sourceFile.getBaseName()} from ${moduleSpecifierSourceFile.getBaseName()}`,
					);
				}
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
		}
	}
	await project.save();
}

async function run(): Promise<boolean> {
	const packageDir = ".";
	await convert_package_dir(packageDir);
	return true;
}

run()
	// eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit
	.then((success) => process.exit(success ? 0 : 1))
	// eslint-disable-next-line n/no-process-exit, unicorn/no-process-exit, unicorn/prefer-top-level-await
	.catch(() => process.exit(2));
