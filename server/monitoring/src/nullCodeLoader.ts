import { ICodeLoader } from "@prague/container-definitions";

export class NullCodeLoader implements ICodeLoader {
    public async load<T>(pkg: string): Promise<T> {
        return;
    }
}
