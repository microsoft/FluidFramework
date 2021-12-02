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
 * @alpha
 */
export interface IConfigProviderBase {
    getRawConfig(name: string): ConfigTypes;
}

interface ConfigTypeStringToType {
    number: number;
    string: string;
    boolean: boolean;
    ["number[]"]: number[];
    ["string[]"]: string[];
    ["boolean[]"]: boolean[];
}

type ConfigTypeStrings = keyof ConfigTypeStringToType;

/**
 * @alpha
 */
export interface IConfigProvider extends IConfigProviderBase {
    getBoolean(name: string, defaultValue?: boolean): boolean | undefined;
    getNumber(name: string, defaultValue?: number): number | undefined;
    getString(name: string, defaultValue?: string): string | undefined;
    getBooleanArray(name: string, defaultValue?: boolean[]): boolean[] | undefined;
    getNumberArray(name: string, defaultValue?: number[]): number[] | undefined;
    getStringArray(name: string, defaultValue?: string[]): string[] | undefined;
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

export const inMemoryConfigProvider = (storage?: Storage, namespaceOverride?: string) =>
    new Lazy<IConfigProviderBase | undefined>(() => {
        if (sessionStorage !== undefined && sessionStorage !== null) {
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

interface ConfigCacheEntry extends Partial<ConfigTypeStringToType> {
    readonly raw: ConfigTypes;
    readonly name: string;
}
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
                    const maybeLwc: loggerWithConfigBuilder<ITelemetryBaseLogger> = maybeProvider;
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
 * @alpha
 */
export type TelemetryLoggerWithConfig<T extends ITelemetryBaseLogger = ITelemetryLogger> =
    T & { readonly config: IConfigProvider };

/**
 * @alpha
 */
export function mixinChildLoggerWithConfigProvider(
    logger: ITelemetryBaseLogger,
    namespace?: string,
    properties?: ITelemetryLoggerPropertyBags,
): TelemetryLoggerWithConfig {
    const config = ConfigProvider.create(namespace, [logger]);
    const childLogger = ChildLogger.create(logger, namespace, properties);
    return mixinConfigProvider(childLogger, config);
}

type loggerWithConfigBuilder<T extends ITelemetryBaseLogger> = T & { config?: IConfigProvider };

export function mixinConfigProvider<T extends ITelemetryBaseLogger>(
    logger: T,
    config: IConfigProvider,
): TelemetryLoggerWithConfig<T> {
    const mixin: loggerWithConfigBuilder<T> = logger;

    if (mixin.config !== undefined) {
        throw new Error("Logger Is already config provider");
    }
    mixin.config = config;
    return mixin as TelemetryLoggerWithConfig<T>;
}

function isConfigProviderBase<T>(obj: T): obj is T & IConfigProviderBase {
    const maybeConfig: Partial<IConfigProviderBase> = obj;
    return maybeConfig?.getRawConfig !== undefined;
}
