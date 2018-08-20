export interface ICodeLoader {
    load(url: string): Promise<void>;
}
