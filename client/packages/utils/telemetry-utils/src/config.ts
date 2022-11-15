/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { Lazy } from "@fluidframework/common-utils";

export type ConfigTypes = string | number | boolean | number[] | string[] | boolean[] | undefined;

/**
 * Base interface for providing configurations to enable/disable/control features
 */
export interface IConfigProviderBase {
    getRawConfig(name: string): ConfigTypes;
}

/**
 * Explicitly typed interface for reading configurations
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
 */
export const sessionStorageConfigProvider =
    new Lazy<IConfigProviderBase>(() => inMemoryConfigProvider(safeSessionStorage()));

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
export const inMemoryConfigProvider =
    (storage: Storage | undefined): IConfigProviderBase => {
    if (storage !== undefined && storage !== null) {
        return new CachedConfigProvider({
            getRawConfig: (name: string) => {
                try {
                    return stronglyTypedParse(storage.getItem(name) ?? undefined)?.raw;
                } catch { }
                return undefined;
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
        case "string":
            return true;
        default:
            return false;
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
            output = JSON.parse(input);
            // we succeeded in parsing, but we don't support parsing
            // for any object as we can't do it type safely
            // so in this case, the default return will be string
            // rather than undefined, and the consumer
            // can parse, as we don't want to provide
            // a false sense of security by just
            // casting.
            defaultReturn = { raw: input, string: input };
        } catch { }
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

/** `sessionStorage` is undefined in some environments such as Node */
const safeSessionStorage = (): Storage | undefined => {
    return globalThis.sessionStorage;
};

/**
 * Implementation of {@link IConfigProvider} which contains nested {@link IConfigProviderBase} instances
 */
export class CachedConfigProvider implements IConfigProvider {
    private readonly configCache = new Map<string, StronglyTypedValue>();
    private readonly orderedBaseProviders: (IConfigProviderBase | undefined)[];

    constructor(
        ... orderedBaseProviders: (IConfigProviderBase | undefined)[]
    ) {
        this.orderedBaseProviders = [];
        const knownProviders = new Set<IConfigProviderBase>();
        const candidateProviders = [...orderedBaseProviders];
        while (candidateProviders.length > 0) {
            const baseProvider = candidateProviders.shift()!;
            if (baseProvider !== undefined
                && isConfigProviderBase(baseProvider)
                && !knownProviders.has(baseProvider)
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
    getBoolean(name: string): boolean | undefined {
        return this.getCacheEntry(name)?.boolean;
    }
    getNumber(name: string): number | undefined {
        return this.getCacheEntry(name)?.number;
    }
    getString(name: string): string | undefined {
        return this.getCacheEntry(name)?.string;
    }
    getBooleanArray(name: string): boolean[] | undefined {
        return this.getCacheEntry(name)?.["boolean[]"];
    }
    getNumberArray(name: string): number[] | undefined {
        return this.getCacheEntry(name)?.["number[]"];
    }
    getStringArray(name: string): string[] | undefined {
        return this.getCacheEntry(name)?.["string[]"];
    }

    getRawConfig(name: string): ConfigTypes {
        return this.getCacheEntry(name)?.raw;
    }

    private getCacheEntry(name: string): StronglyTypedValue | undefined {
        if (!this.configCache.has(name)) {
            for (const provider of this.orderedBaseProviders) {
                const parsed = stronglyTypedParse(provider?.getRawConfig(name));
                if (parsed !== undefined) {
                    this.configCache.set(name, parsed);
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
 * A type containing both a telemetry logger and a configuration provider
 */
export interface MonitoringContext<
    L extends ITelemetryBaseLogger = ITelemetryLogger,
> {
    config: IConfigProvider;
    logger: L;
}

export function loggerIsMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLogger>(
    obj: L): obj is L & MonitoringContext<L> {
    const maybeConfig = obj as Partial<MonitoringContext<L>> | undefined;
    return isConfigProviderBase(maybeConfig?.config) && maybeConfig?.logger !== undefined;
}

export function loggerToMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLogger>(
    logger: L): MonitoringContext<L> {
    if (loggerIsMonitoringContext<L>(logger)) {
        return logger;
    }
    return mixinMonitoringContext<L>(logger, sessionStorageConfigProvider.value);
}

export function mixinMonitoringContext<L extends ITelemetryBaseLogger = ITelemetryLogger>(
    logger: L, ... configs: (IConfigProviderBase | undefined)[]) {
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
    mc.config = new CachedConfigProvider(...configs);
    mc.logger = logger;
    return mc as MonitoringContext<L>;
}

function isConfigProviderBase(obj: unknown): obj is IConfigProviderBase {
    const maybeConfig = obj as Partial<IConfigProviderBase> | undefined;
    return typeof (maybeConfig?.getRawConfig) === "function";
}
