export interface InteractiveDocumentModel {
}

export interface Link {
    // Link to the resource
    href: string;
}

export interface Resource {
    // Links to related resources keyed off of the link relation
    _links?: { [rel: string]: Link | Link[] };

    _embedded?: { [rel: string]: Resource | Resource[] };
}

export interface ViewModel extends Resource {
    // The type of data being represented
    _type: string;
}

export interface View {
}

export interface Host {
}