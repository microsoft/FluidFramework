/**
 * Description of a map delta operation
 */
export interface IMapOperation {
    type: string;
    key?: string;
    value?: IMapValue;
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
