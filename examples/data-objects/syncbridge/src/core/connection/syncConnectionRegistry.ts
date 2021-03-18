import { ISyncConnection } from './internalContracts';

export interface ISyncConnectionRegistry {
  registerConnection(connection: ISyncConnection): void;
  getConnection(connectionId: string): ISyncConnection | undefined;
}

/**
 * This is an in-memory registry implementation,
 * that means connections stay till the time the syn-bridge/process stays alive.
 *
 * If, in future there is a need to persist connection state across re-starts,
 * a DDS based storage (e.f. SharedDirectory) could be utilized.
 */
export class SyncConnectionRegistry {
  private readonly registry = new Map<string, ISyncConnection>();

  registerConnection = (connection: ISyncConnection): void => {
    this.registry.set(connection.getConnectionId(), connection);
  }

  getConnection = (connectionId: string): ISyncConnection | undefined => {
    return this.registry.get(connectionId);
  }
}