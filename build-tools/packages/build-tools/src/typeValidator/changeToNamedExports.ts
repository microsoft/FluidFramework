/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import program from "commander";
import { Project } from "ts-morph";

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

async function convert_package_dir(packageDir: string) {
    console.log(`I'm here ${packageDir}`);
    const project = new Project({
        manipulationSettings: {
            useTrailingCommas: true,
        },
    });
    const sourceFiles = project.addSourceFilesAtPaths([
        `${program.monoRepoDir}/${packageDir}/src/**.ts`,
        `${program.monoRepoDir}/${packageDir}/src/**/**.ts`,
        `${program.monoRepoDir}/${packageDir}/src/**.tsx`,
        `${program.monoRepoDir}/${packageDir}/src/**/**.tsx`,
    ]);
    console.log(sourceFiles.length);
    sourceFiles.forEach((sourceFile) => {
        console.log(sourceFile.getBaseName());
        const exportDeclarations = sourceFile.getExportDeclarations();
        exportDeclarations.forEach((exportDeclaration) => {
            if (exportDeclaration.isNamespaceExport()) {
                const moduleSpecifierSourceFile =
                    exportDeclaration.getModuleSpecifierSourceFileOrThrow();
                for (const [name, _] of moduleSpecifierSourceFile.getExportedDeclarations()) {
                    exportDeclaration.addNamedExport(name);
                    console.log(
                        `Added ${name} to ${sourceFile.getBaseName()} from ${moduleSpecifierSourceFile.getBaseName()}`,
                    );
                }
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
