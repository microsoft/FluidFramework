/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { untar } from "@andrewbranch/untar.js";
import { type Logger, type PackageJson } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import execa from "execa";
import { Gunzip } from "fflate";
import globby from "globby";
import latestVersion from "latest-version";
import { BaseCommand, getTarballName, readLines } from "../../library/index.js";

interface TarballMetadata {
	name: string;
	version: string;
	filePath: string;
	fileName: string;
}

/**
 * Publishes a tarball to the package registry unless the version is already published.
 */
export default class PublishTarballCommand extends BaseCommand<typeof PublishTarballCommand> {
	static readonly summary =
		"Publishes tarballs to the package registry unless the version is already published.";

	static readonly description =
		"Used to publish a portion of tarballs from a folder based on an input file. The file can contain package names or tarball names.";

	static readonly flags = {
		dir: Flags.directory({
			description:
				"A directory containing tarballs to publish. Tarballs must have the file extension tgz.",
			exists: true,
			default: ".",
		}),
		orderFile: Flags.file({
			description:
				"A file with package names that should be published. Such files can be created using `flub list`.",
			exists: true,
			required: true,
		}),
		tarball: Flags.boolean({
			description:
				"Use this flag to indicate that the orderFile contains tarball names instead of package names. Such files can be created using `flub list --tarball`. This option is deprecated and for backwards compatibility only.",
			// This flag does depend on orderFile, but orderFile is currently required, so the constraint isn't needed.
			// In the future if orderFile becomes optional this should be uncommented.
			// dependsOn: ["orderFile"],
			deprecated: {
				message: "This option is deprecated and for backwards compatibility only.",
			},
		}),
		retry: Flags.integer({
			description: `Number of times to retry publishing a package that fails to publish.`,
			default: 0,
		}),
		dryRun: Flags.boolean({
			aliases: ["dry-run"],
			description:
				"Does everything except publish to the registry. This flag will be passed to 'npm publish'.",
			default: false,
		}),
		access: Flags.string({
			description: "This flag will be passed to 'npm publish'.",
			options: ["public", "restricted"],
		}),
		publishArgs: Flags.string({
			description:
				"This string will be passed to 'npm publish' verbatim. Use this to pass additional custom args to npm publish like --tag.",
		}),
	};

	public async run(): Promise<void> {
		const {
			access,
			dir,
			dryRun,
			orderFile,
			retry,
			tarball: orderFileIsTarballs,
			publishArgs: rawPublishArgs,
		} = this.flags;
		const publishArgs: string[] = (rawPublishArgs ?? "").split(" ");
		if (access !== undefined) {
			publishArgs.push("--access", access);
		}
		if (dryRun) {
			publishArgs.push("--dry-run");
		}

		const packageOrder = await readLines(orderFile).then((lines) =>
			// filter out empty lines
			lines.filter((line) => line !== undefined && line !== ""),
		);

		const tarballs = await globby(["*.tgz"], { cwd: dir, absolute: true });
		const tarballMetadata = new Map<string, TarballMetadata>();

		const mapPromises: Promise<void>[] = [];
		for (const tarballPath of tarballs) {
			mapPromises.push(
				extractPackageJsonFromTarball(tarballPath).then((json) => {
					const tarballName = getTarballName(json);
					tarballMetadata.set(tarballName, {
						name: json.name,
						version: json.version,
						filePath: tarballPath,
						fileName: path.basename(tarballPath),
					});
				}),
			);
		}
		await Promise.all(mapPromises);

		for (const entry of packageOrder) {
			const lookupEntry = orderFileIsTarballs ? entry : getTarballName(entry);
			const toPublish = tarballMetadata.get(lookupEntry);
			if (toPublish === undefined) {
				this.error(`No tarball found matching '${entry}'`, { exit: 1 });
			}

			let tryCount = 0;
			let status: PublishStatus;

			do {
				this.info(`Publishing ${toPublish.fileName}, attempt ${tryCount + 1}`);
				// We publish one package at a time, in order, and we don't continue until the current package is successfully
				// published. This ensures that no packages are published to npm without their dependencies first being
				// published. Note that despite publishing in order, npm itself may still make packages available in a different
				// order - but we have no control over that.
				// eslint-disable-next-line no-await-in-loop
				status = await publishTarball(toPublish, this.logger, publishArgs);
				tryCount++;
			} while (status === "Error" && tryCount <= retry);

			switch (status) {
				case "AlreadyPublished": {
					this.info(`Already published ${toPublish.fileName}, skipping`);
					break;
				}

				case "SuccessfullyPublished": {
					const countText = tryCount === 0 ? "" : ` (attempt ${tryCount}/${retry})`;
					this.info(`Published ${toPublish.fileName}${countText}`);
					break;
				}

				case "Error": {
					this.error(
						`Fatal error publishing ${toPublish.fileName}, total attempts: ${tryCount}`,
					);
				}

				default: {
					this.error(`Unexpected publish status: ${status}`, { exit: 1 });
				}
			}
		}
	}
}

/**
 * Reads package.json from a gzipped tarball.
 *
 * Implementation from
 * https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/3729bc2a3ca2ef7dda5c22fef81f89e1abe5dacf/packages/core/src/createPackage.ts#L296
 */
async function extractPackageJsonFromTarball(
	tarballPath: string,
): Promise<Readonly<PackageJson>> {
	const tarball = new Uint8Array(await readFile(tarballPath));

	// Use streaming API to work around https://github.com/101arrowz/fflate/issues/207
	let unzipped: Uint8Array;

	{
		// eslint-disable-next-line no-return-assign -- assigning the chunk to unzipped is intentional
		const gunzip = new Gunzip((chunk: Uint8Array) => (unzipped = chunk));
		gunzip.push(tarball, /* final */ true);
	}
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const data = untar(unzipped!);
	// eslint-disable-next-line unicorn/prefer-string-slice -- substring is clearer than slice in this case
	const prefix = data[0].filename.substring(0, data[0].filename.indexOf("/") + 1);
	const packageJsonText = data.find((f) => f.filename === `${prefix}package.json`)?.fileData;
	const packageJson = JSON.parse(new TextDecoder().decode(packageJsonText)) as PackageJson;
	return packageJson;
}

type PublishStatus = "SuccessfullyPublished" | "AlreadyPublished" | "Error";

async function publishTarball(
	tarball: TarballMetadata,
	log: Logger,
	publishArgs: string[],
): Promise<PublishStatus> {
	try {
		const publishedVersion = await latestVersion(tarball.name, {
			version: tarball.version,
		});
		if (publishedVersion !== "" && publishedVersion !== undefined) {
			return "AlreadyPublished";
		}
	} catch (error) {
		// Assume package or version is not published, so just continue and try to publish
		log.verbose(`Version appears unpublished; expected error: ${error}`);
	}

	const args = ["publish", tarball.fileName, "--access", "public"];
	if (publishArgs !== undefined) {
		args.push(...publishArgs);
	}
	const tarballDirectory = path.dirname(tarball.filePath);
	log.verbose(`Executing publish command in ${tarballDirectory}: pnpm ${args.join(" ")}`);
	try {
		const publishOutput = await execa("npm", args, {
			cwd: tarballDirectory,
		});

		if (publishOutput.exitCode !== 0) {
			return handlePublishError(log, tarball.name, publishOutput.stderr);
		}
	} catch (error) {
		const err = error as Error;
		return handlePublishError(log, tarball.name, err.message, err.stack);
	}

	return "SuccessfullyPublished";
}

function handlePublishError(
	log: Logger,
	name: string,
	message: string,
	stack?: string,
): "Error" {
	log.warning(`Failed to publish ${name}`);
	log.verbose(message);
	if (stack !== undefined) {
		log.verbose(stack);
	}
	return "Error";
}
