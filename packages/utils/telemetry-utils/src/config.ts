/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger, ITelemetryLogger } from "@fluidframework/common-definitions";
import { Lazy } from "@fluidframework/common-utils";
import { DebugLogger } from "./debugLogger";

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
 * Creates a base configuration provider based on `localStorage`
 *
 * @returns A lazy initialized base configuration provider with `localStorage` as the underlying config store
 */
export const sessionStorageConfigProvider =
    new Lazy<IConfigProviderBase>(() =>inMemoryConfigProvider(safeSessionStorage()));

const NullConfigProvider: IConfigProviderBase = {
    getRawConfig: ()=>undefined,
};

/**
 * Creates a base configuration provider based on the supplied `Storage` instance
 *
 * @param storage - instance of `Storage` to be used as storage media for the config
 * @returns A lazy initialized base configuration provider with
 * the supplied `Storage` instance as the underlying config store
 */
export const inMemoryConfigProvider =
    (storage: Storage | undefined): IConfigProviderBase =>{
    if (storage !== undefined && storage !== null) {
        return ConfigProvider.create([{
            getRawConfig: (name: string) => {
                try {
                    return stronglyTypedParse(storage.getItem(name) ?? undefined)?.value;
                } catch { }
                return undefined;
            },
        }]);
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

const safeSessionStorage = (): Storage | undefined => {
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
    private static readonly logger = DebugLogger.create("fluid:telemetry:configProvider");

    static create(orderedBaseProviders: (IConfigProviderBase | ITelemetryBaseLogger | undefined)[],
    ): IConfigProvider {
        const filteredProviders: (IConfigProviderBase | undefined)[] = [];
        for (const maybeProvider of orderedBaseProviders) {
            if (maybeProvider !== undefined) {
                if (isConfigProviderBase(maybeProvider)) {
                    filteredProviders.push(maybeProvider);
                } else {
                    if (loggerIsMonitoringContext(maybeProvider)) {
                        filteredProviders.push(maybeProvider.config);
                    }
                }
            }
        }
        return new ConfigProvider(filteredProviders);
    }

    private constructor(
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
                    candidateProviders.push(...baseProvider.orderedBaseProviders);
                } else {
                    this.orderedBaseProviders.push(baseProvider);
                }
            }
        }
    }
    getBoolean(name: string): boolean | undefined {
        return this.getConfig(name, "boolean");
    }
    getNumber(name: string): number | undefined {
        return this.getConfig(name, "number");
    }
    getString(name: string): string | undefined {
        return this.getConfig(name, "string");
    }
    getBooleanArray(name: string): boolean[] | undefined {
        return this.getConfig(name, "boolean[]");
    }
    getNumberArray(name: string): number[] | undefined {
        return this.getConfig(name, "number[]");
    }
    getStringArray(name: string): string[] | undefined {
        return this.getConfig(name, "string[]");
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
        if (!this.configCache.has(name)) {
            for (const provider of this.orderedBaseProviders) {
                const parsed = stronglyTypedParse(provider?.getRawConfig(name));
                if (parsed !== undefined) {
                    const entry: ConfigCacheEntry = {
                        raw: parsed.value,
                        name,
                        [parsed.type]: parsed.value,
                    };
                    this.configCache.set(name, entry);
                    return entry;
                }
            }
            // configs are immutable, if the first lookup returned no results, all lookups should
            this.configCache.set(name, { raw: undefined, name });
        }
        return this.configCache.get(name);
    }
}

/**
 * A type containing both a telemetry logger and a configuration provider
 */
export interface MonitoringContext<T extends ITelemetryBaseLogger = ITelemetryLogger> {
    logger: T;
    config: IConfigProvider;
}

export function loggerIsMonitoringContext<T extends ITelemetryBaseLogger = ITelemetryLogger>(
    obj: T): obj is T & MonitoringContext<T> {
    const maybeConfig = obj as Partial<MonitoringContext<T>> | undefined;
    return isConfigProviderBase(maybeConfig?.config) && maybeConfig?.logger !== undefined;
}

export function loggerToMonitoringContext<T extends ITelemetryBaseLogger = ITelemetryLogger>(
    logger: T): MonitoringContext<T> {
    if(loggerIsMonitoringContext(logger)) {
        return logger;
    }
    return mixinMonitoringContext(logger, ConfigProvider.create([sessionStorageConfigProvider.value]));
}

export function mixinMonitoringContext<T extends ITelemetryBaseLogger = ITelemetryLogger>(
    logger: T, config: IConfigProvider) {
    if (loggerIsMonitoringContext(logger)) {
        throw new Error("Logger is already a monitoring context");
    }
    /**
     * this is the tricky bit we use for now to smuggle monitoring context around.
     * To the logger we mixin both config and  itself, so mc.logger === logger as it is self-referential.
     * We then expose it as a Monitoring context, so via types we hide the outer logger methods.
     * To layers that expect just a logger we can pass mc.logger, but this is still a MonitoringContext
     * so if a deeper layer then converts that logger to a monitoring context it can find the smuggled properties
     * of the MontoringContext and get the config provider.
     */
     const mc: T & Partial<MonitoringContext<T>> = logger;
    mc.config = config;
    mc.logger = logger;
    return mc as MonitoringContext<T>;
}

function isConfigProviderBase(obj: unknown): obj is IConfigProviderBase {
    const maybeConfig = obj as Partial<IConfigProviderBase> | undefined;
    return maybeConfig?.getRawConfig !== undefined;
}
