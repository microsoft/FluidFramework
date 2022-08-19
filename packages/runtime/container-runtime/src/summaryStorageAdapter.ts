import { FetchSource, IDocumentStorageService, IDocumentStorageServicePolicies, ISummaryContext }
    from "@fluidframework/driver-definitions";
import { ICreateBlobResponse, ISnapshotTree, ISummaryBlob, ISummaryHandle,
    ISummaryTree, IVersion, SummaryObject, SummaryType }
    from "@fluidframework/protocol-definitions";
/**
 * This class uses Delegation Pattern to intercept methods of IDocumentStorageService implementation
 * and adds the plugable postprocessing of summary data structures prior sending to Fluid Server
 * and plugable preprocessing of summary data structures received from Fluid Server.
 */
class SummaryStorageAdapter implements IDocumentStorageService {
    constructor(private readonly _delegate: IDocumentStorageService, private readonly _hooks: SummaryStorageHooks) { }
    public get repositoryUrl(): string {
        return this._delegate.repositoryUrl;
    }
    public get policies(): IDocumentStorageServicePolicies | undefined {
        return this._delegate.policies;
    }
    public async getSnapshotTree(version?: IVersion | undefined, scenarioName?: string | undefined):
        Promise<ISnapshotTree | null> {
        const tree = await this._delegate.getSnapshotTree(version, scenarioName);
        return this._hooks.onPostGetSnapshotTree(tree);
    }
    public async getVersions(versionId: string | null, count: number,
        scenarioName?: string | undefined, fetchSource?: FetchSource | undefined): Promise<IVersion[]> {
        return this._delegate.getVersions(versionId, count, scenarioName, fetchSource);
    }
    public async createBlob(file: ArrayBufferLike): Promise<ICreateBlobResponse> {
        const prepFile: ArrayBufferLike = this._hooks.onPreCreateBlob(file);
        return this._delegate.createBlob(prepFile);
    }
    public async readBlob(id: string): Promise<ArrayBufferLike> {
        const blob = await this._delegate.readBlob(id);
        const postBlob = this._hooks.onPostReadBlob(blob);
        return postBlob;
    }
    public async uploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext): Promise<string> {
        const { prepSummary, prepContext } = this._hooks.onPreUploadSummaryWithContext(summary, context);
        return this._delegate.uploadSummaryWithContext(prepSummary, prepContext);
    }
    public async downloadSummary(handle: ISummaryHandle): Promise<ISummaryTree> {
        const summary = await this._delegate.downloadSummary(handle);
        return this._hooks.onPostDownloadSummary(summary);
    }
}
/**
 * The implementation of this interface can be used to plugin the postprocessing / preprocessing
 * functionality into the SummaryStorageAdapter
 */
export interface SummaryStorageHooks {
    onPreCreateBlob(file: ArrayBufferLike): ArrayBufferLike;
    onPostReadBlob(file: ArrayBufferLike): ArrayBufferLike;
    onPreUploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext):
        { prepSummary: ISummaryTree; prepContext: ISummaryContext; };
    onPostGetSnapshotTree(tree: ISnapshotTree | null): ISnapshotTree | null;
    onPostDownloadSummary(summary: ISummaryTree): ISummaryTree;
}

/**
 * This class enables usage of multiple hooks at the SummaryStorageAdapter where the sending hooks are
 * executed in the order of stored hooks and the receiving hooks are executed in the reverse order.
 */
class SummaryStorageMultipleHooks implements SummaryStorageHooks {
    constructor(private readonly _hooks: SummaryStorageHooks[]) { }

    public onPreCreateBlob(file: ArrayBufferLike): ArrayBufferLike {
        let ret = file;
        this._hooks.forEach((hook) => ret = hook.onPreCreateBlob(ret));
        return ret;
    }
    public onPostReadBlob(file: ArrayBufferLike): ArrayBufferLike {
        let ret = file;
        this._hooks.reverse().forEach((hook) => ret = hook.onPostReadBlob(ret));
        return ret;
    }
    public onPreUploadSummaryWithContext(summary: ISummaryTree, context: ISummaryContext):
        { prepSummary: ISummaryTree; prepContext: ISummaryContext; } {
        let ret = { prepSummary: summary, prepContext: context };
        this._hooks.forEach((hook) => ret = hook.onPreUploadSummaryWithContext(ret.prepSummary, ret.prepContext));
        return ret;
    }
    public onPostGetSnapshotTree(tree: ISnapshotTree | null): ISnapshotTree | null {
        let ret = tree;
        this._hooks.reverse().forEach((hook) => ret = hook.onPostGetSnapshotTree(ret));
        return ret;
    }
    public onPostDownloadSummary(summary: ISummaryTree): ISummaryTree {
        let ret = summary;
        this._hooks.reverse().forEach((hook) => ret = hook.onPostDownloadSummary(ret));
        return ret;
    }
}

/**
 * This function instantiates the SummaryStorageAdapter
 * @param storage - The IDocumentStorageService delegate to be intercepted.
 * @param hooks - The interception code.
 * @returns The instance of SummaryStorageAdapter
 */
export function buildSummaryStorageAdapter(storage: IDocumentStorageService, hooks: SummaryStorageHooks[]):
    IDocumentStorageService {
    return new SummaryStorageAdapter(storage, new SummaryStorageMultipleHooks(hooks));
}

/**
 * This function traverses through the given tree: ISummaryTree object and extracts all paths which
 * are leading into SummaryObject instances with the type SummaryType.Blob. The extracted paths are written
 * into the given Array parameter 'paths'. This method can be invoked recursively where the
 * parameter currentPath shows the path, where we are currently with traversing.
 * @param paths - The accumulator of the result.
 * @param currentPath - The path where we are currently with traversing.
 * @param tree - The tree to be traversed
 */
export function listBlobPaths(paths: string[][], currentPath: string[], tree: ISummaryTree) {
    const treePairs = tree.tree;
    Object.entries(treePairs).forEach(([key, value]) => {
        const summaryObj = treePairs[key];
        if (summaryObj.type === SummaryType.Blob) {
            const blobPath: string[] = [... currentPath];
            blobPath.push(key);
            paths.push(blobPath);
        } else if (summaryObj.type === SummaryType.Tree) {
            const subTree = summaryObj;
            const subPath = [... currentPath];
            subPath.push(key);
            listBlobPaths(paths, subPath, subTree);
        }
    });
}

/**
 * This function replaces the given SummaryObject in the given tree at the given path by the given newSummaryObj.
 * @param tree - The tree where the SummaryObject should be replaced
 * @param path - The path at which the given SummaryObject should be replaced
 * @param newSummaryObj - The replacement
 */
export function replaceSummaryObject(tree: ISummaryTree, path: string[], newSummaryObj: SummaryObject) {
    const subTree = readLastSubTree(tree, path);
    subTree.tree[path[path.length - 1]] = newSummaryObj;
}

/**
 * This function returns the ISummaryBlob object located at the given path within the give tree.
 * @param tree - The tree to get the blob from.
 * @param path - The path at which the blob is located.
 * @returns The ISummaryBlob object located at the given path within the give tree.
 */
export function getBlobAtPath(tree: ISummaryTree, path: string[]): ISummaryBlob {
    const subTree = readLastSubTree(tree, path);
    return subTree.tree[path[path.length - 1]] as ISummaryBlob;
}

function readLastSubTree(tree: ISummaryTree, path: string[]) {
    let subTree = tree;
    for (let i = 0; i < path.length - 1; i++) {
        const subObj = subTree.tree[path[i]];
        if (!subObj) {
            throw new Error(`Path does not exist in the SummaryTree : ${path.toString()}`);
        } else
        if (subObj.type === SummaryType.Tree) {
            subTree = subObj;
        } else {
            throw new Error(`Path does not exist in the SummaryTree : ${path.toString()}`);
        }
    }
    return subTree;
}
