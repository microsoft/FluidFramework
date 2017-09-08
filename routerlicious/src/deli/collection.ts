export interface ICollection<T> {
    findOne(id: string): Promise<T>;

    upsert(id: string, values: any): Promise<void>;
}
