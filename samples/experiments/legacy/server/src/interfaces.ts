export interface InteractiveDocumentModel {
}

export interface ILink {
    // Link to the resource
    href: string;
}

export interface IResource {
    // Links to related resources keyed off of the link relation
    _links?: { [rel: string]: ILink | ILink[] };

    _embedded?: { [rel: string]: IResource | IResource[] };
}

export interface IViewModel extends IResource {
    // The type of data being represented
    _type: string;
}

export interface IView extends IResource {
    // The type of interactive document the view can render
    type: string;

    // URL for the view of the data
    url: string;
}

export interface IViews extends IResource {
}

export interface IHost {
}
