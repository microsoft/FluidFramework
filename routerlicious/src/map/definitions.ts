/**
 * Description of a map delta operation
 */
export interface IMapOperation {
    type: string;
    key?: string;
    value?: IMapValue;
}

export enum ValueType {
    // The value is a collaborative object
    Collaborative,

    // The value is a plain JavaScript object
    Plain,

    // The value is a counter
    Counter,

    // The value is a set
    Set,
}

export interface ICollaborativeMapValue {
    // The type of collaborative object
    type: string;

    // The id for the collaborative object
    id: string;
}

export interface IMapValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}

export interface IMapDataCompatibility {

    data: IMapValue;

    reject: Promise<any>;
}
