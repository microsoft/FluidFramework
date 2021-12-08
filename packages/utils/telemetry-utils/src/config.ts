/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { Lazy } from "@fluidframework/common-utils";
import { DebugLogger } from "./debugLogger";
import { ChildLogger, ITelemetryLoggerPropertyBags } from "./logger";

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
    getBoolean(name: string, defaultValue?: boolean): boolean | undefined;
    getNumber(name: string, defaultValue?: number): number | undefined;
    getString(name: string, defaultValue?: string): string | undefined;
    getBooleanArray(name: string, defaultValue?: boolean[]): boolean[] | undefined;
    getNumberArray(name: string, defaultValue?: number[]): number[] | undefined;
    getStringArray(name: string, defaultValue?: string[]): string[] | undefined;
}

/**
 * Creates a base configuration provider based on `localStorage`
 *
 * @param namespaceOverride - (optional) if provided, will be prepended to the fully qualified config key name
 * @returns A lazy initialized base configuration provider with `localStorage` as the underlying config store
 */
export const sessionStorageConfigProvider =
    (namespaceOverride?: string): Lazy<IConfigProviderBase | undefined> =>
        inMemoryConfigProvider(safeLocalStorage(), namespaceOverride);

/**
 * Creates a base configuration provider based on the supplied `Storage` instance
 *
 * @param storage - instance of `Storage` to be used as storage media for the config
 * @param namespaceOverride - (optional) if provided, will be prepended to the fully qualified config key name
 * @returns A lazy initialized base configuration provider with
 * the supplied `Storage` instance as the underlying config store
 */
export const inMemoryConfigProvider =
    (storage?: Storage, namespaceOverride?: string): Lazy<IConfigProviderBase | undefined> =>
        new Lazy<IConfigProviderBase | undefined>(() => {
            if (storage !== undefined && storage !== null) {
                return ({
                    getRawConfig: (name: string) => {
                        try {
                            const key = namespaceOverride === undefined ? name : `${namespaceOverride}.${name}`;
                            return stronglyTypedParse(storage.getItem(key) ?? undefined)?.value;
                        } catch { }
                        return undefined;
                    },
                });
            }
        });

interface ConfigTypeStringToType {
    number: number;
    string: string;
    boolean: boolean;
    ["number[]"]: number[];
    ["string[]"]: string[];
    ["boolean[]"]: boolean[];
}

type ConfigTypeStrings = keyof ConfigTypeStringToType;
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

interface stronglyTypedValue<T extends ConfigTypeStrings = ConfigTypeStrings> {
    value: ConfigTypeStringToType[T];
    type: T
}

function stronglyTypedParse(input: any): stronglyTypedValue | undefined {
    let output: ConfigTypes = input;
    let defaultReturn: stronglyTypedValue<"string"> | undefined;
    if (typeof input === "string") {
        try {
            output = JSON.parse(input);
            // we succeeded in parsing, but we don't support parsing
            // for any object as we can't do it type safely
            // so in this case, the default return will be string
            // rather than undefined, and the consumer
            // can parse, as we don't want to provide
            // a false sense of security, but just
            // casting.
            defaultReturn = { value: input, type: "string" };
        } catch { }
    }

    if (output === undefined) {
        return defaultReturn;
    }

    const outputType = typeof output;
    if (isPrimitiveType(outputType)) {
        return { value: output, type: outputType };
    }

    if (Array.isArray(output)) {
        const firstType = typeof output[0];
        if (!isPrimitiveType(firstType)) {
            return defaultReturn;
        }
        for (const v of output) {
            if (typeof v !== firstType) {
                return defaultReturn;
            }
        }
        return { value: output, type: `${firstType}[]` as ConfigTypeStrings };
    }

    return defaultReturn;
}

const safeLocalStorage = (): Storage | undefined => {
    try {
        return sessionStorage !== null ? sessionStorage : undefined;
    } catch { return undefined; }
};

interface ConfigCacheEntry extends Partial<ConfigTypeStringToType> {
    readonly raw: ConfigTypes;
    readonly name: string;
}

/**
 * Implementation of {@link IConfigProvider} which contains nested {@link IConfigProviderBase} instances
 */
export class ConfigProvider implements IConfigProvider {
    private readonly configCache = new Map<string, ConfigCacheEntry>();
    private readonly orderedBaseProviders: (IConfigProviderBase | undefined)[];
    private readonly namespace: string | undefined;
    private static readonly logger = DebugLogger.create("fluid:telemetry:configProvider");

    static create(namespace: string | undefined,
        orderedBaseProviders: (IConfigProviderBase | ITelemetryBaseLogger | undefined)[],
    ): IConfigProvider {
        const filteredProviders: (IConfigProviderBase | undefined)[] = [];
        for (const maybeProvider of orderedBaseProviders) {
            if (maybeProvider !== undefined) {
                if (isConfigProviderBase(maybeProvider)) {
                    filteredProviders.push(maybeProvider);
                } else {
                    const maybeLwc: ITelemetryBaseLogger & Partial<MonitoringContext<ITelemetryBaseLogger>> =
                        maybeProvider;
                    if (isConfigProviderBase(maybeLwc.config)) {
                        filteredProviders.push(maybeLwc.config);
                    }
                }
            }
        }
        return new ConfigProvider(namespace, filteredProviders);
    }

    private constructor(
        namespace: string | undefined,
        orderedBaseProviders: (IConfigProviderBase | undefined)[],
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
                if (baseProvider instanceof ConfigProvider) {
                    // we build up the namespace. so take the namespace of the highest
                    // base provider, and append ours below if specified
                    if (this.namespace === undefined) {
                        this.namespace = baseProvider.namespace;
                    }
                    candidateProviders.push(...baseProvider.orderedBaseProviders);
                } else {
                    this.orderedBaseProviders.push(baseProvider);
                }
            }
        }
        if (namespace !== undefined) {
            this.namespace = this.namespace === undefined ? namespace : `${this.namespace}.${namespace}`;
        }
    }

    getBoolean(name: string, defaultValue?: boolean): boolean | undefined {
        return this.getConfig(name, "boolean") ?? defaultValue;
    }

    getNumber(name: string, defaultValue?: number): number | undefined {
        return this.getConfig(name, "number") ?? defaultValue;
    }

    getString(name: string, defaultValue?: string): string | undefined {
        return this.getConfig(name, "string") ?? defaultValue;
    }

    getBooleanArray(name: string, defaultValue?: boolean[]): boolean[] | undefined {
        return this.getConfig(name, "boolean[]") ?? defaultValue;
    }

    getNumberArray(name: string, defaultValue?: number[]): number[] | undefined {
        return this.getConfig(name, "number[]") ?? defaultValue;
    }

    getStringArray(name: string, defaultValue?: string[]): string[] | undefined {
        return this.getConfig(name, "string[]") ?? defaultValue;
    }

    getRawConfig(name: string): ConfigTypes {
        return this.getCacheEntry(name)?.raw;
    }

    private getConfig<T extends ConfigTypeStrings>(
        name: string, converter: T,
    ): ConfigTypeStringToType[T] | undefined {
        const cacheValue = this.getCacheEntry(name);

        if (cacheValue?.raw === undefined) {
            ConfigProvider.logger.sendTelemetryEvent({ eventName: "ConfigValueNotSet", name: cacheValue?.name });
            return undefined;
        }

        if (converter === "string" && cacheValue[converter] === undefined) {
            return JSON.stringify(cacheValue.raw) as ConfigTypeStringToType[T];
        }

        if (converter in cacheValue) {
            return cacheValue[converter] as ConfigTypeStringToType[T];
        }

        ConfigProvider.logger.sendErrorEvent({
            eventName: "ConfigValueNotConvertible",
            name: cacheValue?.name,
            value: JSON.stringify(cacheValue),
            converter,
        });

        return undefined;
    }

    private getCacheEntry(name: string): ConfigCacheEntry | undefined {
        const namespacedName = this.namespace ? `${this.namespace}.${name}` : name;
        if (!this.configCache.has(namespacedName)) {
            for (const provider of this.orderedBaseProviders) {
                const parsed = stronglyTypedParse(provider?.getRawConfig(namespacedName));
                if (parsed !== undefined) {
                    const entry: ConfigCacheEntry = {
                        raw: parsed.value,
                        name,
                        [parsed.type]: parsed.value,
                    };
                    this.configCache.set(namespacedName, entry);
                    return entry;
                }
            }
            // configs are immutable, if the first lookup returned no results, all lookups should
            this.configCache.set(namespacedName, { raw: undefined, name: namespacedName });
        }
        return this.configCache.get(namespacedName);
    }
}

/**
 * A type containing both a telemetry logger and a configuration provider
 */
export interface MonitoringContext<T extends ITelemetryBaseLogger = ITelemetryLogger> {
    logger: T;
    config: IConfigProvider;
}

/**
 * Creates a child mixin containing both a telemetry logger and a configuration provider
 * based on the parent logger
 *
 * @param logger - instance of the logger
 * @param namespace - namespace. It will be prepended to both logging event names and config key names
 * @param properties - logger properties
 * @returns A mixin containing both a telemetry logger and a configuration provider
 */
export function mixinChildLoggerWithMonitoringContext(
    logger: ITelemetryBaseLogger,
    namespace?: string,
    properties?: ITelemetryLoggerPropertyBags,
): MonitoringContext {
    const config = ConfigProvider.create(namespace, [logger]);
    const childLogger = ChildLogger.create(logger, namespace, properties);
    return mixinMonitoringContext(childLogger, config);
}

/**
 * Attaches a config provider to a telemetry logger
 *
 * @param logger - instance of the logger
 * @param config - instance of the config provider
 * @returns A mixin containing both a telemetry logger and a configuration provider
 */
export function mixinMonitoringContext<T extends ITelemetryBaseLogger>(
    logger: T,
    config: IConfigProvider,
): MonitoringContext<T> {
    const mixin: Partial<MonitoringContext<T>> & T = logger;

    if (mixin.config !== undefined) {
        throw new Error("Logger Is already config provider");
    }
    mixin.config = config;
    mixin.logger = logger;
    return mixin as MonitoringContext<T>;
}

function isConfigProviderBase<T>(obj: T): obj is T & IConfigProviderBase {
    const maybeConfig: Partial<IConfigProviderBase> = obj;
    return maybeConfig?.getRawConfig !== undefined;
}
