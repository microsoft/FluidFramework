import { IChaincodeFactory, ICodeLoader } from "@prague/container-definitions";

export class TestLoader implements ICodeLoader {
    private readonly typeToFactory: Map<string, Promise<IChaincodeFactory> | IChaincodeFactory>;

    constructor(factories: ReadonlyArray<[string, Promise<IChaincodeFactory> | IChaincodeFactory]>) {
        this.typeToFactory = new Map(factories);
    }

    public load<T>(source: string): Promise<T> {
        const factory = this.typeToFactory.get(source);

        if (factory === undefined) {
            throw new Error(`TestLoader: Missing IChainCodeFactory for '${source}'.`);
        }

        return Promise.resolve(factory as any);
    }
}
