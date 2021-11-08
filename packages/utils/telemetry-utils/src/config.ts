/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryLogger } from "@fluidframework/common-definitions";

export interface IConfigProviderBase{
    getRawConfig(name: string): string | undefined;
}

export interface TypeConverters{
    number: TypeConverter<number>;
    string: TypeConverter<string>;
    boolean: TypeConverter<boolean>;
    numberArray: TypeConverter<number[]>
    stringArray: TypeConverter<string[]>
    booleanArray: TypeConverter<boolean[]>
    never: TypeConverter<never>
}

export type TypeConverter<T> = (v: string | undefined) => T | undefined;
export type TypeConverterNames = keyof TypeConverters;

export interface IConfigProvider extends IConfigProviderBase{
    getConfig<T extends TypeConverterNames>(
        name: string, converter: T,
    ): ReturnType<TypeConverters[T]> | undefined;
}

const converters: TypeConverters = {
    number: (v)=>v === undefined ? undefined : Number.parseFloat(v),
    string: (v)=>v,
    boolean: (v)=>{
        switch(v?.trim().toLocaleLowerCase()) {
            case "true": case "1": return true;
            case "false": case "0": return false;
            default: return undefined;
        }
    },
    numberArray: (v)=>parseArray(v, (e): e is number =>typeof e === "number"),
    stringArray: (v)=>parseArray(v, (e): e is string =>typeof e === "string"),
    booleanArray: (v)=>parseArray(v, (e): e is boolean=>typeof e === "boolean"),
    never: ()=>undefined,
};

function parseArray<T>(v: string | undefined, is: (e: unknown) => e is T) {
    if(v !== undefined) {
        try{
            const p = JSON.parse(v);
            if(Array.isArray(p) && !p.includes((e)=>!is(e))) {
                return p as T[];
            }
        }catch{}
    }
    return undefined;
}

type ReturnToProp<T> ={[P in keyof T]?: T[P] extends (...args: any) => any ? ReturnType<T[P]> : never};

interface ConfigCacheEntry extends ReturnToProp<TypeConverters> {
    readonly raw: string | undefined;
}

export function tryCreateSessionStorageConfigProvider(): IConfigProviderBase | undefined {
    if(sessionStorage !== undefined && sessionStorage !== null && typeof sessionStorage === "object") {
        return {
           getRawConfig: (name: string)=> {
                try{
                    return sessionStorage.getItem(name) ?? undefined;
                } catch{}
               return undefined;
           },
        };
    }
}

export function tryCreateObjectConfigProvider(
    namespace: string, obj: Record<string, string>): IConfigProviderBase | undefined {
        return {
           getRawConfig: (name: string)=> {
               const nname = name.startsWith(namespace) ? name.substr(namespace.length) : name;
               return obj[nname];
           },
        };
    }
export class ConfigProvider implements IConfigProvider {
    private readonly configCache = new Map<string, ConfigCacheEntry | undefined>();
    private readonly orderedBaseProviders: (IConfigProviderBase| undefined)[];

    constructor(private readonly namespace: string, ... orderedBaseProviders: (IConfigProviderBase | undefined)[]) {
        this.orderedBaseProviders = [... orderedBaseProviders];
    }

    getRawConfig(name: string): string | undefined {
        return this.getCacheEntry(name)?.raw;
    }

    public getConfig<T extends TypeConverterNames>(
        name: string, converter: T,
    ): ReturnType<TypeConverters[T]> | undefined {
        const cacheValue = this.getCacheEntry(name);

        if(cacheValue === undefined) {
            return undefined;
        }

        if(converter in cacheValue) {
            return cacheValue[converter] as ReturnType<TypeConverters[T]>;
        }

        const value: any = converters[converter]?.(cacheValue.raw);

        if(value !== undefined) {
            cacheValue[converter] = value;
            return value as ReturnType<TypeConverters[T]>;
        }
        return undefined;
    }

    private getCacheEntry(name: string): ConfigCacheEntry | undefined {
        const nname = `${this.namespace}.${name}`;
        if(!this.configCache.has(nname)) {
            for(const provider of this.orderedBaseProviders) {
                const str = provider?.getRawConfig(nname);
                if(str !== undefined) {
                    const entry: ConfigCacheEntry = {
                        raw: str,
                    };
                    this.configCache.set(nname, entry);
                    return entry;
                }
            }
            // configs are immutable, if the first lookup returned no results, all lookups should
            this.configCache.set(nname, undefined);
        }
        return this.configCache.get(nname);
    }
}

export type ITelemetryLoggerWithConfig = ITelemetryLogger & IConfigProvider;

export function mixinConfigProvider(logger: ITelemetryLogger, config: IConfigProvider): ITelemetryLoggerWithConfig {
    const mixin: ITelemetryLogger & Partial<IConfigProvider> = logger;
    mixin.getConfig = config.getConfig.bind(config);
    mixin.getRawConfig = config.getRawConfig.bind(config);
    return mixin as ITelemetryLoggerWithConfig;
}
