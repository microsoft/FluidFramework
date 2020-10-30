import { IDirectory } from '@fluidframework/map';

// TODO: Maybe store change events. But not required.
//  Thus, we may not add (for now).
export interface IKeyValueStore {
  readonly path: string;
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

export class SyncKeyValueStore implements IKeyValueStore {
  protected directory: IDirectory;
  public constructor(readonly path: string, workingDirectory: IDirectory) {
    this.directory = workingDirectory;
  }

  get<T = any>(key: string): T | undefined {
    return this.directory.get(key);
  }

  set<T>(key: string, value: T): void {
    this.directory.set(key, value);
  }
}
