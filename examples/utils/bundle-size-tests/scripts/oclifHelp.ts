/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Command } from "@oclif/core";

/**
 * Renders simple help text for a single-command oclif script from its static
 * metadata (`description`, `flags`, `examples`). Used because oclif's built-in
 * `--help` machinery needs a full `Config`, which is heavyweight for scripts
 * that are invoked directly via jiti rather than through a CLI bin.
 *
 * Intercepts `--help` / `-h` in argv before `Command.run`, prints, and exits.
 *
 * @param argv - The argument list that will be passed to the command
 * @param commandName - The name to use in the synopsis line (e.g. `compareBundles.ts`)
 * @param CommandClass - The oclif Command subclass whose metadata to render
 * @returns true if help was printed (caller should not invoke `.run`)
 */
export function maybePrintHelp(
	argv: string[],
	commandName: string,
	CommandClass: typeof Command,
): boolean {
	if (!argv.includes("--help") && !argv.includes("-h")) {
		return false;
	}

	const description = CommandClass.description ?? "";
	const flags = (CommandClass.flags ?? {}) as Record<
		string,
		{
			type?: string;
			description?: string;
			default?: unknown;
			options?: readonly string[];
			required?: boolean;
		}
	>;
	const examples = (CommandClass.examples ?? []).map((e) =>
		typeof e === "string" ? e : (e.command ?? ""),
	);

	console.log(`Usage:\n  jiti ./scripts/${commandName} [flags]\n`);
	if (description.length > 0) {
		console.log(`${description}\n`);
	}

	const flagEntries = Object.entries(flags);
	if (flagEntries.length > 0) {
		console.log("Flags:");
		for (const [name, def] of flagEntries) {
			const isBoolean = def.type === "boolean";
			const valuePart = isBoolean
				? ""
				: def.options
					? ` <${def.options.join("|")}>`
					: " <value>";
			const defaultPart =
				def.default !== undefined && !isBoolean
					? ` (default: ${String(def.default)})`
					: isBoolean && def.default === true
						? " (default: true)"
						: "";
			const requiredPart = def.required ? " (required)" : "";
			console.log(
				`  --${name}${valuePart}${defaultPart}${requiredPart}\n      ${
					def.description ?? ""
				}`,
			);
		}
		console.log();
	}

	if (examples.length > 0) {
		console.log("Examples:");
		for (const example of examples) {
			console.log(
				`  ${example
					.replaceAll("<%= config.bin %> <%= command.id %>", `jiti ./scripts/${commandName}`)
					.replaceAll("<%= config.bin %>", "jiti")
					.replaceAll("<%= command.id %>", commandName)}`,
			);
		}
		console.log();
	}

	return true;
}
