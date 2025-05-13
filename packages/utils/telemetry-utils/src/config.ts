/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ConfigTypes,
	IConfigProviderBase,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { Lazy } from "@fluidframework/core-utils/internal";

import { createChildLogger, tagCodeArtifacts } from "./logger.js";
import type { ITelemetryLoggerExt } from "./telemetryTypes.js";

/**
 * Explicitly typed interface for reading configurations.
 *
 * @internal
 */
export interface IConfigProvider extends IConfigProviderBase {
	getBoolean(name: string): boolean | undefined;
	getNumber(name: string): number | undefined;
	getString(name: string): string | undefined;
	getBooleanArray(name: string): boolean[] | undefined;
	getNumberArray(name: string): number[] | undefined;
	getStringArray(name: string): string[] | undefined;
}
/**
 * Creates a base configuration provider based on `sessionStorage`
 *
 * @returns A lazy initialized base configuration provider with `sessionStorage` as the underlying config store
 *
 * @internal
 */
export const sessionStorageConfigProvider = new Lazy<IConfigProviderBase>(() =>
	inMemoryConfigProvider(safeSessionStorage()),
);

const NullConfigProvider: IConfigProviderBase = {
	getRawConfig: () => undefined,
};

/**
 * Creates a base configuration provider based on the supplied `Storage` instance
 *
 * @param storage - instance of `Storage` to be used as storage media for the config
 * @returns A base configuration provider with
 * the supplied `Storage` instance as the underlying config store
 */
export const inMemoryConfigProvider = (storage: Storage | undefined): IConfigProviderBase => {
	if (storage !== undefined && storage !== null) {
		return new CachedConfigProvider(undefined, {
			getRawConfig: (name: string): ConfigTypes | undefined => {
				try {
					return stronglyTypedParse(storage.getItem(name) ?? undefined)?.raw;
				} catch {
					return undefined;
				}
			},
		});
	}
	return NullConfigProvider;
};

interface ConfigTypeStringToType {
	number: number;
	string: string;
	boolean: boolean;
	["number[]"]: number[];
	["string[]"]: string[];
	["boolean[]"]: boolean[];
}

type PrimitiveTypeStrings = "number" | "string" | "boolean";

function isPrimitiveType(type: string): type is PrimitiveTypeStrings {
	switch (type) {
		case "boolean":
		case "number":
		case "string": {
			return true;
		}
		default: {
			return false;
		}
	}
}

interface StronglyTypedValue extends Partial<ConfigTypeStringToType> {
	raw: ConfigTypes;
}
/**
 * Takes any supported config type, and returns the value with a strong type. If the type of
 * the config is not a supported type undefined will be returned.
 * The user of this function should cache the result to avoid duplicated work.
 *
 * Strings will be attempted to be parsed and coerced into a strong config type.
 * if it is not possible to parsed and coerce a string to a strong config type the original string
 * will be return with a string type for the consumer to handle further if necessary.
 */
function stronglyTypedParse(input: ConfigTypes): StronglyTypedValue | undefined {
	let output: ConfigTypes = input;
	let defaultReturn: Pick<StronglyTypedValue, "raw" | "string"> | undefined;
	// we do special handling for strings to try and coerce
	// them into a config type if we can. This makes it easy
	// for config sources like sessionStorage which only
	// holds strings
	if (typeof input === "string") {
		try {
			output = JSON.parse(input) as ConfigTypes;
			// we succeeded in parsing, but we don't support parsing
			// for any object as we can't do it type safely
			// so in this case, the default return will be string
			// rather than undefined, and the consumer
			// can parse, as we don't want to provide
			// a false sense of security by just
			// casting.
			defaultReturn = { raw: input, string: input };
		} catch {
			// No-op
		}
	}

	if (output === undefined) {
		return defaultReturn;
	}

	const outputType = typeof output;
	if (isPrimitiveType(outputType)) {
		return { ...defaultReturn, raw: input, [outputType]: output };
	}

	if (Array.isArray(output)) {
		const firstType = typeof output[0];
		// ensure the first elements is a primitive type
		if (!isPrimitiveType(firstType)) {
			return defaultReturn;
		}
		// ensue all the elements types are homogeneous
		// aka they all have the same type as the first
		for (const v of output) {
			if (typeof v !== firstType) {
				return defaultReturn;
			}
		}
		return { ...defaultReturn, raw: input, [`${firstType}[]`]: output };
	}

	return defaultReturn;
}

/**
 * `sessionStorage` is undefined in some environments such as Node and web pages with session storage disabled.
 */
const safeSessionStorage = (): Storage | undefined => {
	// For some configurations accessing "globalThis.sessionStorage" throws
	// "'sessionStorage' property from 'Window': Access is denied for this document" rather than returning undefined.
	// Therefor check for it before accessing.
	try {
		// Using globalThis and checking for undefined is preferred over just accessing global sessionStorage
		// since it avoids an exception when running in node.
		// In some cases this has returned null when disabled in the browser, so ensure its undefined in that case:
		return globalThis.sessionStorage ?? undefined;
	} catch {
		// For browsers which error on the above when session storage is disabled:
		return undefined;
	}
};

/**
 * Creates a wrapper on top of an existing config provider which allows for
 * specifying feature gates if not present in the original provider.
 *
 * @param original - the original config provider
 * @param defaults - default feature gate configs to be used if not specified by the original provider
 * @returns A config provider that looks for any requested feature gates in the original provider and falls
 * back to the values specified in the `defaults` feature gates if they're not present in the original.
 *
 * @internal
 */
export const wrapConfigProviderWithDefaults = (
	original: IConfigProviderBase | undefined,
	defaults: Record<string, ConfigTypes>,
): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => original?.getRawConfig(name) ?? defaults[name],
});

/**
 * Implementation of {@link IConfigProvider} which contains nested {@link IConfigProviderBase} instances
 */
export class CachedConfigProvider implements IConfigProvider {
	private readonly configCache = new Map<string, StronglyTypedValue>();
	private readonly orderedBaseProviders: (IConfigProviderBase | undefined)[];

	public constructor(
		private readonly logger?: ITelemetryBaseLogger,
		...orderedBaseProviders: (IConfigProviderBase | undefined)[]
	) {
		this.orderedBaseProviders = [];
		const knownProviders = new Set<IConfigProviderBase>();
		const candidateProviders = [...orderedBaseProviders];
		while (candidateProviders.length > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const baseProvider = candidateProviders.shift()!;
			if (
				baseProvider !== undefined &&
				isConfigProviderBase(baseProvider) &&
				!knownProviders.has(baseProvider)
			) {
				knownProviders.add(baseProvider);
				if (baseProvider instanceof CachedConfigProvider) {
					candidateProviders.push(...baseProvider.orderedBaseProviders);
				} else {
					this.orderedBaseProviders.push(baseProvider);
				}
			}
		}
	}
	public getBoolean(name: string): boolean | undefined {
		return this.getCacheEntry(name)?.boolean;
	}
	public getNumber(name: string): number | undefined {
		return this.getCacheEntry(name)?.number;
	}
	public getString(name: string): string | undefined {
		return this.getCacheEntry(name)?.string;
	}
	public getBooleanArray(name: string): boolean[] | undefined {
		return this.getCacheEntry(name)?.["boolean[]"];
	}
	public getNumberArray(name: string): number[] | undefined {
		return this.getCacheEntry(name)?.["number[]"];
	}
	public getStringArray(name: string): string[] | undefined {
		return this.getCacheEntry(name)?.["string[]"];
	}

	public getRawConfig(name: string): ConfigTypes {
		return this.getCacheEntry(name)?.raw;
	}

	private getCacheEntry(name: string): StronglyTypedValue | undefined {
		if (!this.configCache.has(name)) {
			for (const provider of this.orderedBaseProviders) {
				const parsed = stronglyTypedParse(provider?.getRawConfig(name));
				if (parsed !== undefined) {
					this.configCache.set(name, parsed);
					this.logger?.send({
						category: "generic",
						eventName: "ConfigRead",
						...tagCodeArtifacts({
							configName: name,
							configValue: JSON.stringify(parsed),
						}),
					});
					return parsed;
				}
			}
			// configs are immutable, if the first lookup returned no results, all lookups should
			this.configCache.set(name, { raw: undefined });
		}
		return this.configCache.get(name);
	}
}

/**
 * A type containing both a telemetry logger and a configuration provider.
 *
 * @internal
 */
export interface MonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLoggerExt> {
	config: IConfigProvider;
	logger: L;
}

/**
 * Determines whether or not the provided object is a {@link MonitoringContext}.
 * @remarks Can be used for type-narrowing.
 *
 * @internal
 */
export function loggerIsMonitoringContext<
	L extends ITelemetryBaseLogger = ITelemetryLoggerExt,
>(obj: L): obj is L & MonitoringContext<L> {
	const maybeConfig = obj as Partial<MonitoringContext<L>> | undefined;
	return isConfigProviderBase(maybeConfig?.config) && maybeConfig?.logger !== undefined;
}

/**
 * Creates a {@link MonitoringContext} from the provided logger, if it isn't already one.
 *
 * @internal
 */
export function loggerToMonitoringContext<
	L extends ITelemetryBaseLogger = ITelemetryLoggerExt,
>(logger: L): MonitoringContext<L> {
	if (loggerIsMonitoringContext<L>(logger)) {
		return logger;
	}
	return mixinMonitoringContext<L>(logger, sessionStorageConfigProvider.value);
}

/**
 * Creates a {@link MonitoringContext} from the provided logger.
 *
 * @remarks
 * Assumes that the provided logger is not itself already a {@link MonitoringContext}, and will throw an error if it is.
 * If you are unsure, use {@link loggerToMonitoringContext} instead.
 *
 * @throws If the provided logger is already a {@link MonitoringContext}.
 *
 * @internal
 */
export function mixinMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLoggerExt>(
	logger: L,
	...configs: (IConfigProviderBase | undefined)[]
): MonitoringContext<L> {
	if (loggerIsMonitoringContext<L>(logger)) {
		throw new Error("Logger is already a monitoring context");
	}
	/**
	 * this is the tricky bit we use for now to smuggle monitoring context around.
	 * To the logger we mixin both config and  itself, so mc.logger === logger as it is self-referential.
	 * We then expose it as a Monitoring context, so via types we hide the outer logger methods.
	 * To layers that expect just a logger we can pass mc.logger, but this is still a MonitoringContext
	 * so if a deeper layer then converts that logger to a monitoring context it can find the smuggled properties
	 * of the MonitoringContext and get the config provider.
	 */
	const mc: L & Partial<MonitoringContext<L>> = logger;
	mc.config = new CachedConfigProvider(logger, ...configs);
	mc.logger = logger;
	return mc as MonitoringContext<L>;
}

function isConfigProviderBase(obj: unknown): obj is IConfigProviderBase {
	const maybeConfig = obj as Partial<IConfigProviderBase> | undefined;
	return typeof maybeConfig?.getRawConfig === "function";
}

/**
 * Creates a child logger with a {@link MonitoringContext}.
 *
 * @see {@link loggerToMonitoringContext}
 * @internal
 */
export function createChildMonitoringContext(
	props: Parameters<typeof createChildLogger>[0],
): MonitoringContext {
	return loggerToMonitoringContext(createChildLogger(props));
}

/**
 * @internal
 * */
export type OptionConfigReaders<T extends object> = {
	[K in keyof T]?: K extends string
		? (config: IConfigProvider, name: `Fluid.${string}.${K}`) => T[K] | undefined
		: undefined;
};

/**
 * Creates a proxy object that allows for reading configuration values from a IConfigProviderBase,
 * and default to the provided options if the configuration value is not present.
 *
 * @param config - the configuration provider to read values from.
 * @param namespace - the namespace to use when reading configuration values.
 * @param configReaders - a mapping of option keys to configuration value readers.
 * @param defaultOptions - the default options to use if the configuration value is not present.
 *
 * @internal
 * */
export function createConfigBasedOptionsProxy<T extends object>(
	config: IConfigProviderBase,
	namespace: `Fluid.${string}`,
	configReaders: OptionConfigReaders<T>,
	defaultOptions?: Partial<T>,
): Readonly<Partial<T>> {
	const realConfig =
		config instanceof CachedConfigProvider
			? config
			: new CachedConfigProvider(undefined, config);

	const keys = new Set<string>([
		...Object.keys(defaultOptions ?? {}),
		...Object.keys(configReaders),
	]);

	return new Proxy<Partial<T>>(Object.freeze({}), {
		get: (_, prop: string & keyof T): unknown => {
			const reader = configReaders[prop];
			const value = reader?.(realConfig, `${namespace}.${prop}`);
			if (value !== undefined) {
				return value;
			}
			return defaultOptions?.[prop];
		},
		has: (_, prop: string): boolean => keys.has(prop),
		// we don't want the keys of this object to be enumerable
		// as accessing them will trigger a config read, which
		// should only happen when the value is accessed via
		// a previously known key.
		ownKeys: (): (string | symbol)[] => {
			throw new TypeError("OptionsProxy keys are not enumerable");
		},
	});
}
