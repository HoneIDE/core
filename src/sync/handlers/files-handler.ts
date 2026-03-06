/**
 * Files domain handler — filesystem operations with hash tracking.
 */

import type { DomainHandler } from '../sdk-handler';
import { hashContent, applyPatch } from '../../queue/diff-applier';

export interface FileSystemAdapter {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  moveFile(oldPath: string, newPath: string): Promise<void>;
  readDirectory(path: string): Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>>;
  exists(path: string): Promise<boolean>;
}

export class FilesHandler implements DomainHandler {
  readonly domain = 'files';
  private fs: FileSystemAdapter;
  private projectPaths: Map<string, string>; // projectId → root path

  constructor(fs: FileSystemAdapter, projectPaths?: Map<string, string>) {
    this.fs = fs;
    this.projectPaths = projectPaths ?? new Map();
  }

  /** Register a project's root path for resolving file paths. */
  setProjectPath(projectId: string, rootPath: string): void {
    this.projectPaths.set(projectId, rootPath);
  }

  async handle(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (operation) {
      case 'tree':
        return this.tree(payload);
      case 'read':
        return this.read(payload);
      case 'write':
        return this.write(payload);
      case 'patch':
        return this.patch(payload);
      case 'delete':
        return this.del(payload);
      case 'move':
        return this.move(payload);
      default:
        throw new Error(`Unknown operation: files.${operation}`);
    }
  }

  getSubscribableEvents(): string[] {
    return ['onChanged'];
  }

  private resolvePath(projectId: string, filePath: string): string {
    const root = this.projectPaths.get(projectId);
    if (root) {
      return root + '/' + filePath;
    }
    return filePath;
  }

  private async tree(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const projectId = payload.projectId as string;
    const path = (payload.path as string) || '';
    const fullPath = this.resolvePath(projectId, path);
    const entries = await this.fs.readDirectory(fullPath);
    return { entries };
  }

  private async read(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const projectId = payload.projectId as string;
    const path = payload.path as string;
    const fullPath = this.resolvePath(projectId, path);
    const content = await this.fs.readFile(fullPath);
    return { content, hash: hashContent(content), encoding: 'utf-8' };
  }

  private async write(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const projectId = payload.projectId as string;
    const path = payload.path as string;
    const content = payload.content as string;
    const fullPath = this.resolvePath(projectId, path);
    await this.fs.writeFile(fullPath, content);
    return { hash: hashContent(content), success: true };
  }

  private async patch(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const projectId = payload.projectId as string;
    const path = payload.path as string;
    const diff = payload.diff as string;
    const fullPath = this.resolvePath(projectId, path);
    const content = await this.fs.readFile(fullPath);
    const result = applyPatch(content, diff);
    if (!result.success) {
      throw new Error(`Patch failed: ${result.error}`);
    }
    await this.fs.writeFile(fullPath, result.newContent);
    return { hash: hashContent(result.newContent), success: true };
  }

  private async del(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const projectId = payload.projectId as string;
    const path = payload.path as string;
    const fullPath = this.resolvePath(projectId, path);
    await this.fs.deleteFile(fullPath);
    return { success: true };
  }

  private async move(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const projectId = payload.projectId as string;
    const oldPath = payload.oldPath as string;
    const newPath = payload.newPath as string;
    await this.fs.moveFile(this.resolvePath(projectId, oldPath), this.resolvePath(projectId, newPath));
    return { success: true };
  }
}
