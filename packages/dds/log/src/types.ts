import { IFluidHandle } from "@fluidframework/core-interfaces";

export const blockSize = 256 as const;

export interface ILeafNode<T = unknown> {
    /**
     * Handle to the blob contents containing the serialized children.  Undefined
     * if the blob has not been uploaded, a Promise if the upload is in progress,
     * and a concrete handle reference once the upload completes.
     */
    h?: IFluidHandle<ArrayBufferLike> | Promise<IFluidHandle<ArrayBufferLike>>

    /**
     * Children
     */
    c?: T[];
}

export interface IInteriorNode<T = unknown> extends ILeafNode<LogNode<T>> {
    /** Count of populated leaf nodes (used for eviction.) */
    p: number;
}

export type LogNode<T = unknown> = IInteriorNode<T> | ILeafNode<T>;
