import { LocalReference } from "@prague/merge-tree";

export type PagePosition = LocalReference[];

export interface IPaginationProvider {
    paginate(start: PagePosition, budget: number): PagePosition;
}
