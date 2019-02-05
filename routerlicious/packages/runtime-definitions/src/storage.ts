// TODO consider a rename to channel
export interface IObjectAttributes {
    sequenceNumber: number;

    type: string;
}

/**
 * A distributed object is enough information to fully load a distributed object. The object may then require
 * a server call to load in more state.
 */
export interface IDistributedObject {
    // The ID for the distributed object
    id: string;

    // The type of the distributed object
    type: string;

    // The sequence number for the object
    sequenceNumber: number;
}
