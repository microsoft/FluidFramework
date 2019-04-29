// TODO this is probably too map specific - but is used to serailize objects in certain cases
export enum ValueType {
    // The value is a shared object
    Shared,

    // The value is a plain JavaScript object
    Plain,

    // The value is a counter
    Counter,

    // The value is a set
    Set,
}
