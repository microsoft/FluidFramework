/* eslint-disable max-depth */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Package, type Logger } from "@fluidframework/build-tools";
import { Flags } from "@oclif/core";
import path from "node:path";
import { Project } from "ts-morph";
import { BaseCommand } from "../../base";

type ApiLevel = "internal" | "public" | "alpha" | "beta";

/**
 * Renames all d.ts files in the lib/ folder to .d.mts.
 *
 * @remarks
 * This command is primarily used in our build system to rename type declarations in ESM builds.
 */
export default class UpdateFluidImportsCommand extends BaseCommand<
	typeof UpdateFluidImportsCommand
> {
	static readonly description =
		`Rewrite imports for Fluid Framework APIs to use the correct subpath import (/alpha, /beta. etc.)`;

	static readonly flags = {
		organize: Flags.boolean({
			description:
				"Organize the imports in any file that is modified. Note that this can make it more difficult to see the rewritten import changes.",
		}),
		onlyInternal: Flags.boolean({
			description: "Use /internal for all non-public APIs instead of /alpha or /beta.",
		}),
		...BaseCommand.flags,
	};

	public async run(): Promise<void> {
		const pkg = new Package("./package.json", "n/a");
		await updateImports(
			pkg,
			typeMapData,
			this.flags.onlyInternal,
			this.flags.organize,
			this.logger,
		);
	}
}

/**
 * Returns the ApiLevel for an API based on provided data.
 */
function getApiLevelForImportName(
	name: string,
	data: MemberData,
	defaultValue: ApiLevel,
	onlyInternal: boolean,
): ApiLevel {
	if (data.alpha?.includes(name) === true) return onlyInternal ? "internal" : "alpha";
	if (data.beta?.includes(name) === true) return onlyInternal ? "internal" : "beta";
	if (data.public?.includes(name) === true) return "public";
	if (data.internal?.includes(name) === true) return "internal";
	return defaultValue;
}

async function updateImports(
	pkg: Package,
	mappingData: MapData,
	// Refactor to include this in the mappingData itself?
	onlyInternal: boolean,
	organizeImports: boolean,
	log?: Logger,
): Promise<void> {
	const project = new Project({
		tsConfigFilePath: path.join(pkg.directory, "tsconfig.json"),
	});
	const sourceFiles = project
		.getSourceFiles()
		// Filter out type files - this may not be correct in projects with manually defined declarations.
		.filter((sourceFile) => sourceFile.getExtension() !== ".d.ts");

	// Iterate over each source file, looking for Fluid imports
	for (const sourceFile of sourceFiles) {
		log?.verbose(`Source file: ${sourceFile.getBaseName()}`);

		// Get all of the import declarations. This is basically every `import foo from bar` statement in the file.
		const imports = sourceFile.getImportDeclarations();

		/**
		 * True if the sourceFile has changed.
		 */
		let sourceFileChanged = false;

		/**
		 * A mapping of new module specifier to named import. We'll populate this as we scan the existing imports, then
		 * write new remapped imports to the file.
		 */
		const newImports: Map<string, string[]> = new Map();

		// TODO: Optimize later if needed
		// Collect the existing declarations
		for (const importDeclaration of imports) {
			const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
			if (moduleSpecifier.startsWith("@fluid")) {
				log?.verbose(`Found a fluid import: '${moduleSpecifier}'`);
				const modulePieces = moduleSpecifier.split("/");
				const subpath = modulePieces.length === 3 ? modulePieces[2] : "public";
				log?.verbose(`subpath: ${subpath}`);
				const data = mappingData.get(moduleSpecifier);

				// eslint-disable-next-line unicorn/no-negated-condition
				if (data !== undefined) {
					// TODO: Handle default import if needed.
					// const defaultImport = importDeclaration.getDefaultImport();
					const namedImports = importDeclaration.getNamedImports();

					log?.info(`Iterating named imports...`);
					for (const importSpecifier of namedImports) {
						const alias = importSpecifier.getAliasNode();
						if (alias !== undefined) {
							log?.info(`Got an alias: ${alias.getText()}`);
						}

						const name = importSpecifier.getName();
						// fullImportSpecifierText includes surrounding text like "type" and whitespace. The surrounding whitespace
						// is trimmed, but leading or trailing text like "type" or "as foo" is still included. This is the string
						// that will be used in the new imports.
						const fullImportSpecifierText = importSpecifier.getFullText().trim();
						const expectedLevel = getApiLevelForImportName(name, data, "public", onlyInternal);

						log?.verbose(`Found import named: '${fullImportSpecifierText}' (${expectedLevel})`);
						const newSpecifier =
							expectedLevel === "public"
								? moduleSpecifier
								: `${moduleSpecifier}/${expectedLevel}`;

						if (!newImports.has(newSpecifier)) {
							newImports.set(newSpecifier, []);
						}
						newImports.get(newSpecifier)?.push(fullImportSpecifierText);
					}

					// Delete this declaration; we've collected all the imports from it and will output them in new nodes later.
					// This does re-order code, but that seems like a fact of life here. The organize flag can be used to add some
					// determinism to the output.
					importDeclaration.remove();
					sourceFileChanged = true;
					log?.info(`REMOVED import from ${moduleSpecifier}`);
				} else {
					log?.verbose(`Skipping.`);
				}
			}
		}

		for (const [newSpecifier, names] of newImports) {
			// TODO: Not sure this check is necessary.
			if (names.length > 0) {
				sourceFile.addImportDeclaration({
					namedImports: names,
					moduleSpecifier: newSpecifier,
				});
			}
			log?.info(`ADDED import from ${newSpecifier}`);
		}

		if (sourceFileChanged && organizeImports) {
			log?.info(`Organizing imports in: ${sourceFile.getBaseName()}`);
			sourceFile.organizeImports();
		}
	}
	await project.save();
}

// This raw data comes from this one-liner:
//
// rg -UPNo -g '**/api-report/*.api.md' --multiline-dotall --heading '\s*@(alpha|beta|public|internal).*?export\s*(\w*)\s(\w*).*?(?:\{|;)' -r '{ "scope": "$1", "kind": "$2", "name": "$3" }'
//
// It's transformed into a more usable format in the code below.
interface MemberDataRaw {
	scope: ApiLevel;
	kind: string;
	name: string;
}

const typeMapDataRaw: Record<string, MemberDataRaw[]> = {
	"@fluidframework/container-runtime": [
		{ scope: "internal", kind: "const", name: "agentSchedulerId" },
		{ scope: "internal", kind: "const", name: "AllowInactiveRequestHeaderKey" },
		{ scope: "alpha", kind: "const", name: "AllowTombstoneRequestHeaderKey" },
		{ scope: "internal", kind: "class", name: "ChannelCollectionFactory" },
		{ scope: "internal", kind: "type", name: "CompatModeBehavior" },
		{ scope: "alpha", kind: "enum", name: "CompressionAlgorithms" },
		{ scope: "alpha", kind: "enum", name: "ContainerMessageType" },
		{ scope: "alpha", kind: "class", name: "ContainerRuntime" },
		{ scope: "internal", kind: "interface", name: "ContainerRuntimeMessage" },
		{ scope: "alpha", kind: "const", name: "DefaultSummaryConfiguration" },
		{ scope: "internal", kind: "function", name: "detectOutboundReferences" },
		{ scope: "alpha", kind: "type", name: "EnqueueSummarizeResult" },
		{ scope: "internal", kind: "class", name: "FluidDataStoreRegistry" },
		{ scope: "alpha", kind: "type", name: "GCFeatureMatrix" },
		{ scope: "alpha", kind: "const", name: "GCNodeType" },
		{ scope: "alpha", kind: "type", name: "GCNodeType" },
		{ scope: "alpha", kind: "type", name: "GCVersion" },
		{ scope: "alpha", kind: "interface", name: "IAckedSummary" },
		{ scope: "alpha", kind: "interface", name: "IAckSummaryResult" },
		{ scope: "alpha", kind: "interface", name: "IBaseSummarizeResult" },
		{ scope: "alpha", kind: "interface", name: "IBlobManagerLoadInfo" },
		{ scope: "alpha", kind: "interface", name: "IBroadcastSummaryResult" },
		{ scope: "alpha", kind: "interface", name: "ICancellableSummarizerController" },
		{ scope: "alpha", kind: "interface", name: "ICancellationToken" },
		{ scope: "internal", kind: "interface", name: "IChunkedOp" },
		{ scope: "alpha", kind: "interface", name: "IClientSummaryWatcher" },
		{ scope: "alpha", kind: "interface", name: "ICompressionRuntimeOptions" },
		{ scope: "alpha", kind: "interface", name: "IConnectableRuntime" },
		{ scope: "internal", kind: "interface", name: "IContainerRuntimeMessageCompatDetails" },
		{ scope: "alpha", kind: "interface", name: "IContainerRuntimeMetadata" },
		{ scope: "alpha", kind: "interface", name: "IContainerRuntimeOptions" },
		{ scope: "alpha", kind: "interface", name: "ICreateContainerMetadata" },
		{ scope: "alpha", kind: "interface", name: "IEnqueueSummarizeOptions" },
		{ scope: "alpha", kind: "interface", name: "IGCMetadata" },
		{ scope: "alpha", kind: "interface", name: "IGCRuntimeOptions" },
		{ scope: "alpha", kind: "interface", name: "IGCStats" },
		{ scope: "alpha", kind: "interface", name: "IGeneratedSummaryStats" },
		{ scope: "alpha", kind: "interface", name: "IGenerateSummaryTreeResult" },
		{ scope: "alpha", kind: "interface", name: "IMarkPhaseStats" },
		{ scope: "alpha", kind: "interface", name: "INackSummaryResult" },
		{ scope: "alpha", kind: "const", name: "InactiveResponseHeaderKey" },
		{ scope: "alpha", kind: "interface", name: "IOnDemandSummarizeOptions" },
		{ scope: "alpha", kind: "interface", name: "IRefreshSummaryAckOptions" },
		{ scope: "alpha", kind: "interface", name: "IRetriableFailureResult" },
		{ scope: "alpha", kind: "interface", name: "ISerializedElection" },
		{ scope: "internal", kind: "function", name: "isRuntimeMessage" },
		{ scope: "alpha", kind: "interface", name: "ISubmitSummaryOpResult" },
		{ scope: "alpha", kind: "interface", name: "ISubmitSummaryOptions" },
		{ scope: "alpha", kind: "interface", name: "ISummarizeEventProps" },
		{ scope: "alpha", kind: "interface", name: "ISummarizeOptions" },
		{ scope: "alpha", kind: "interface", name: "ISummarizer" },
		{ scope: "alpha", kind: "interface", name: "ISummarizeResults" },
		{ scope: "alpha", kind: "interface", name: "ISummarizerEvents" },
		{ scope: "alpha", kind: "interface", name: "ISummarizerInternalsProvider" },
		{ scope: "alpha", kind: "interface", name: "ISummarizerRuntime" },
		{ scope: "internal", kind: "interface", name: "ISummarizingWarning" },
		{ scope: "alpha", kind: "interface", name: "ISummary" },
		{ scope: "alpha", kind: "interface", name: "ISummaryAckMessage" },
		{ scope: "alpha", kind: "interface", name: "ISummaryBaseConfiguration" },
		{ scope: "alpha", kind: "type", name: "ISummaryCancellationToken" },
		{ scope: "alpha", kind: "interface", name: "ISummaryCollectionOpEvents" },
		{ scope: "alpha", kind: "type", name: "ISummaryConfiguration" },
		{ scope: "alpha", kind: "interface", name: "ISummaryConfigurationDisableHeuristics" },
		{ scope: "alpha", kind: "interface", name: "ISummaryConfigurationDisableSummarizer" },
		{ scope: "alpha", kind: "interface", name: "ISummaryConfigurationHeuristics" },
		{ scope: "alpha", kind: "type", name: "ISummaryMetadataMessage" },
		{ scope: "alpha", kind: "interface", name: "ISummaryNackMessage" },
		{ scope: "alpha", kind: "interface", name: "ISummaryOpMessage" },
		{ scope: "alpha", kind: "interface", name: "ISummaryRuntimeOptions" },
		{ scope: "alpha", kind: "interface", name: "ISweepPhaseStats" },
		{ scope: "alpha", kind: "interface", name: "IUploadSummaryResult" },
		{ scope: "internal", kind: "const", name: "neverCancelledSummaryToken" },
		{ scope: "alpha", kind: "type", name: "OpActionEventListener" },
		{ scope: "alpha", kind: "type", name: "OpActionEventName" },
		{
			scope: "internal",
			kind: "interface",
			name: "RecentlyAddedContainerRuntimeMessageDetails",
		},
		{ scope: "internal", kind: "enum", name: "RuntimeHeaders" },
		{ scope: "internal", kind: "enum", name: "RuntimeMessage" },
		{ scope: "alpha", kind: "interface", name: "SubmitSummaryFailureData" },
		{ scope: "alpha", kind: "type", name: "SubmitSummaryResult" },
		{ scope: "alpha", kind: "class", name: "Summarizer" },
		{ scope: "alpha", kind: "type", name: "SummarizeResultPart" },
		{ scope: "alpha", kind: "type", name: "SummarizerStopReason" },
		{ scope: "alpha", kind: "class", name: "SummaryCollection" },
		{ scope: "alpha", kind: "type", name: "SummaryStage" },
		{ scope: "alpha", kind: "const", name: "TombstoneResponseHeaderKey" },
		{ scope: "internal", kind: "interface", name: "UnknownContainerRuntimeMessage" },
		{ scope: "internal", kind: "function", name: "unpackRuntimeMessage" },
	],
	"@fluidframework/container-runtime-definitions": [
		{ scope: "alpha", kind: "interface", name: "IContainerRuntime" },
		{ scope: "alpha", kind: "type", name: "IContainerRuntimeBaseWithCombinedEvents" },
		{ scope: "alpha", kind: "interface", name: "IContainerRuntimeEvents" },
		{
			scope: "alpha",
			kind: "interface",
			name: "IContainerRuntimeWithResolveHandle_Deprecated",
		},
	],
};

interface MemberData {
	internal?: string[];
	public?: string[];
	alpha?: string[];
	beta?: string[];
}

// Load the raw data into a more useable form
type MapData = Map<string, MemberData>;
const typeMapData: MapData = new Map();
for (const [moduleName, members] of Object.entries(typeMapDataRaw)) {
	const entry = typeMapData.get(moduleName) ?? {};
	for (const member of members) {
		switch (member.scope) {
			case "internal": {
				if (entry.internal === undefined) {
					entry.internal = [member.name];
				} else {
					entry.internal.push(member.name);
				}
				break;
			}
			case "public": {
				if (entry.public === undefined) {
					entry.public = [member.name];
				} else {
					entry.public.push(member.name);
				}
				break;
			}
			case "alpha": {
				if (entry.alpha === undefined) {
					entry.alpha = [member.name];
				} else {
					entry.alpha.push(member.name);
				}
				break;
			}
			default: {
				throw new Error(`Unknown API level: ${member.scope}`);
			}
		}
	}
	typeMapData.set(moduleName, entry);
}
