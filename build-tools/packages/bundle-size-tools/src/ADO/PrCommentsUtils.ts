/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { WebApi, getBearerHandler } from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { CommentThreadStatus } from 'azure-devops-node-api/interfaces/GitInterfaces';

export class prCommentsUtils {
  private gitApi: Promise<IGitApi>;
  private connection: WebApi;
  private repoId: string;
  private pullRequestId: number;

  constructor(collectionUrl: string, pullRequestId: number, repoId: string, accessToken: string) {
    this.connection = new WebApi(collectionUrl, getBearerHandler(accessToken));

    this.repoId = repoId;
    this.pullRequestId = pullRequestId;
    this.gitApi = this.connection.getGitApi();
  }

  /**
   * Creates or updates a thread on the specified PR based on the threadType.
   *
   * Only one thread per threadType will exist on each PR, if a thread with the same type already exists, this will be updated
   * Pass undefined as a threadType to force the creation of a new one.
   *
   * @param message - the message to write on the thread. You can pass HTML
   * @param threadType - the identifier of your thread
   */
  public async createOrUpdateThread(message: string, threadType: string | undefined) {
    const gitApi = await this.gitApi;
    const existingThread = (threadType && (await this.getThreadByType(threadType))) || undefined;

    if (existingThread && existingThread.id) {
      const comment = {
        content: message
      };

      await gitApi.updateComment(comment, this.repoId, this.pullRequestId, existingThread.id, 1);
    } else {
      const comment = {
        content: message,
        properties: {
          type: threadType
        }
      };

      const commentThread = {
        comments: [comment],
        properties: {
          type: threadType
        }
      };

      await gitApi.createThread(commentThread, this.repoId, this.pullRequestId);
    }
  }

  /**
   * Creates or replaces a thread by deleting the existing thread on the specified PR based on the threadType.
   *
   * @param message - the message to write on the thread. You can pass HTML
   * @param threadType - the identifier of your thread
   */
  public async createOrReplaceThread(message: string, threadType: string | undefined) {
    const gitApi = await this.gitApi;
    const existingThread = (threadType && (await this.getThreadByType(threadType))) || undefined;

    if (existingThread && existingThread.id) {
      await gitApi.deleteComment(this.repoId, this.pullRequestId, existingThread.id, 1);
    }

    await this.createOrUpdateThread(message, threadType);
  }

  /**
   * Creates a new comment on the existing thread based on the type.
   *
   * @param message - the message to write on the thread. You can pass HTML
   * @param threadType - the identifier of your thread
   */
  public async appendCommentToThread(message: string, threadType: string) {
    const gitApi = await this.gitApi;
    const existingThread = await this.getThreadByType(threadType);

    if (!existingThread || !existingThread.id) {
      throw Error(`Comment thread of type "${threadType}" does not exist`);
    }

    const comment = {
      content: message
    };

    await gitApi.createComment(comment, this.repoId, this.pullRequestId, existingThread.id);
  }

  /**
   * Updates the status of an existing thread based on the type.
   *
   * @param threadType - the identifier of your thread
   * @param commentThreadStatus - the new value of the thread status
   */
  public async updateThreadStatus(threadType: string, commentThreadStatus: CommentThreadStatus) {
    const gitApi = await this.gitApi;
    const existingThread = await this.getThreadByType(threadType);

    if (!existingThread || !existingThread.id) {
      throw Error(`Comment thread of type "${threadType}" does not exist`);
    }

    const thread = {
      status: commentThreadStatus
    };

    await gitApi.updateThread(thread, this.repoId, this.pullRequestId, existingThread.id);
  }

  private async getThreadByType(threadType: string) {
    const gitApi = await this.gitApi;
    const threads = await gitApi.getThreads(this.repoId, this.pullRequestId);

    return threads.find((thread) => {
      return thread.properties?.type?.$value === threadType && !thread.isDeleted;
    });
  }
}
