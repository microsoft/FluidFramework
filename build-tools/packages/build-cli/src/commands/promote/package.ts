import { readFile } from "node:fs/promises";
import { Flags } from "@oclif/core";
import { BaseCommand } from "../../library/index.js";

/**
 * Promotes a package to the Release view in Azure DevOps Artifacts.
 */
export default class PromotePackageCommand extends BaseCommand<typeof PromotePackageCommand> {
	static readonly summary =
		"Promotes a package to the Release view in Azure DevOps Artifacts.";

	static readonly description =
		"Used to promote a package to the Release view if it's a release build and in the build feed.";

	static readonly flags = {
		feedKind: Flags.string({
			description: "Name of the feed",
			required: true,
		}),
		version: Flags.string({
			description: "Version of the package",
			required: true,
		}),
		orderFile: Flags.file({
			description:
				"A file with package names that should be published. Such files can be created using `flub list`.",
			exists: true,
			required: true,
		}),
		release: Flags.string({
			description: "release",
			exists: true,
			required: true,
		}),
		token: Flags.string({
			description: "Azure DevOps access token",
			env: "SYSTEM_ACCESSTOKEN",
			required: true,
		}),
	};

	public async run(): Promise<void> {
		const { feedKind, version, orderFile, token, release } = this.flags;

		this.log(`Feed Name: ${feedKind}`);
		this.log(`version: ${version}`);
		this.log(`release: ${release}`);
		return;

		if (feedKind !== "build") {
			this.log("Skipping promotion: not a release build or not the build feed");
			return;
		}

		// const packageOrder = await readLines(orderFile).then((lines) =>
		// 	// filter out empty lines
		// 	lines.filter((line) => line !== undefined && line !== ""),
		// );
		const packageOrder = ["@fluidframework/tool-utils"];
		await Promise.all(
			packageOrder.map(async (packageName) =>
				this.promotePackage(packageName, version, token),
			),
		);
	}

	private readonly getFeedPromotionUrl = (packageName: string, version: string): string =>
		`https://pkgs.dev.azure.com/fluidframework/internal/_apis/packaging/feeds/build/npm/${packageName}/versions/${version}?api-version=7.1-preview.1`;

	private readonly promotePackage = async (
		packageName: string,
		version: string,
		token: string,
	): Promise<boolean> => {
		const url = this.getFeedPromotionUrl(packageName, version);
		try {
			const response = await fetch(url, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					"Accept": "application/json",
					"Authorization": `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
				},
				body: JSON.stringify({
					views: {
						op: "add",
						path: "/views/-",
						value: "Release",
					},
				}),
			});

			if (!response.ok) {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const errorData = await response.json();
				// this.error(
				// 	// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unsafe-member-access
				// 	`Failed to promote package. Status: ${response.status}, Message: ${errorData.message || "Unknown error"}`,
				// );
			}

			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			const responseData = await response.json();
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
			return responseData.success;
		} catch (error: unknown) {
			if (error instanceof Error) {
				this.error("Failed to promote package due to network error:", error.message);
				return false;
			}
		}
	};
}

/**
 * Reads a file into an array of strings, one line per array element. Dupilcated from publish tarballs
 */
async function readLines(filePath: string): Promise<string[]> {
	const content = await readFile(filePath, "utf8");
	const lines = content.split(/\r?\n/);
	return lines;
}
