import { Provider } from "nconf";
import registerDebug from "debug";
import { IDbFactory } from "./database";

export interface IBackendDescriptor {
    path: string, // Path of the module to load
    config: any, // configuration that will be passed into the constructor
    name: string // name of the backend
    factory: string // name of the constructor
}

const creator = (name, path, configuration: any, ctr) => async () => {
    debug(`Using ${name} Backend`);
    const extension = await import(`${path}`);
    const thingyFactory = extension[ctr];
    return new thingyFactory(configuration) as IDbFactory;
};

const debug = registerDebug("fluid:backend");

export class DbFactoryFactory {
    private readonly backends: Map<string, () => Promise<IDbFactory>>;

    constructor(config: Provider, dbServices: IBackendDescriptor[], private readonly defaultBackend: string) {
        const available_backends: Map<string, () => Promise<IDbFactory>> = new Map(
            dbServices.map((desc) => [desc.name, creator(desc.name, desc.path, desc.config, desc.factory)]),
        );

        if (process.env.LOADEXTENSIONS) {
            const EXTENSIONS = config.get("extensions:db") as IBackendDescriptor[] || [];
            EXTENSIONS.forEach((ext) => {
                available_backends.set(ext.name, creator(ext.name, ext.path, ext.config, ext.factory));
            });
        }

        debug("Available Backends:", available_backends);

        this.backends = available_backends;
    }
    async create(backendOverride?: string): Promise<IDbFactory> {
        const backend = backendOverride || this.defaultBackend;

        if (this.backends.has(backend)) {
            return this.backends.get(backend)();
        } else {
            throw new Error(`Unknown backend specified: ${backend}`);
        }
    }
}
