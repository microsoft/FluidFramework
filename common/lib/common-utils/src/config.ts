import { Lazy } from "./lazy";

const isLocalStorageAvailable = new Lazy(()=>{
    const localStorageTestKey = "FluidCommonUtilsLocalStorageTestKey";
    try {
        localStorage.setItem(localStorageTestKey, "v");
        localStorage.removeItem(localStorageTestKey);
        return true;
    } catch (e) {
        return false;
    }
});

export function createLocalStorageConfigurationProxy<C extends Record<string, unknown>>(
    namspace: string, target: C): Readonly<C> {
    if (isLocalStorageAvailable.value) {
        return new Proxy<C>(
            target,
            new LocalStorageConfigurationProxyHandler<C>(namspace));
    }
    return target;
}

export class LocalStorageConfigurationProxyHandler<T extends Record<string, unknown>> implements ProxyHandler<T> {
    private readonly configCache = new Map<string, unknown>();
    constructor(private readonly namespace: string) {
        if (!isLocalStorageAvailable.value) {
            throw new Error("Local Storage Not Available.");
        }
    }

    public get(target: T, p: string): any {
        // return the cached value if we have it
        if (this.configCache.has(p)) {
            return this.configCache.get(p);
        }

        // construct the local storage key;
        const localStorageKey = `${this.namespace}.${p}`;

        const value = localStorage.getItem(localStorageKey);
        if (value !== null) {
            try {
                // naively try to parse the value, only strings will fail
                this.configCache.set(p, JSON.parse(value));
            } catch {
                this.configCache.set(p, value);
            }
            return this.configCache.get(p);
        }
        const targetValue = target[p];
        switch (typeof targetValue) {
            case "object":
                // the target property is an object, so construct a new proxy for it
                return this.configCache.set(
                    p,
                    new Proxy(targetValue ?? {},  new LocalStorageConfigurationProxyHandler(localStorageKey)))
                    .get(p);

            case "undefined":
                // we don't know the type of the prop, see if sub-props exist, in which case assume
                // this is an object so return a proxy to that object
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith(localStorageKey) === true) {
                        return this.configCache.set(
                            p,
                            new Proxy({}, new LocalStorageConfigurationProxyHandler(localStorageKey)))
                        .get(p);
                    }
                }

            default:
                // not a object, and not in local storage, so return the in-memory value
                return this.configCache.set(p, targetValue).get(p);
            }
    }
}
