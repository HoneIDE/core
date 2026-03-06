/**
 * Projects domain handler — wraps Workspace.
 */

import type { DomainHandler } from '../sdk-handler';
import type { Workspace, WorkspaceFolder } from '../../workspace/workspace';

export interface ProjectDescriptor {
  id: string;
  name: string;
  path: string;
  isOpen: boolean;
}

function folderToDescriptor(f: WorkspaceFolder, isOpen: boolean): ProjectDescriptor {
  return {
    id: f.path, // use path as ID for now
    name: f.name,
    path: f.path,
    isOpen,
  };
}

export class ProjectsHandler implements DomainHandler {
  readonly domain = 'projects';
  private workspace: Workspace;
  private activeProjectId: string = '';

  constructor(workspace: Workspace) {
    this.workspace = workspace;
  }

  async handle(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (operation) {
      case 'list':
        return this.list();
      case 'open':
        return this.open(payload);
      case 'close':
        return this.close(payload);
      case 'active':
        return this.active();
      case 'setActive':
        return this.setActive(payload);
      default:
        throw new Error(`Unknown operation: projects.${operation}`);
    }
  }

  getSubscribableEvents(): string[] {
    return ['onChanged'];
  }

  private list(): Record<string, unknown> {
    const folders = this.workspace.folders;
    const projects: ProjectDescriptor[] = [];
    for (let i = 0; i < folders.length; i++) {
      projects.push(folderToDescriptor(folders[i], this.workspace.isOpen));
    }
    return { projects };
  }

  private async open(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const path = payload.path as string;
    const name = (payload.name as string) || undefined;
    this.workspace.addFolder(path, name);
    const folders = this.workspace.folders;
    const last = folders[folders.length - 1];
    const project = folderToDescriptor(last, this.workspace.isOpen);
    if (!this.activeProjectId) {
      this.activeProjectId = project.id;
    }
    return { project };
  }

  private close(payload: Record<string, unknown>): Record<string, unknown> {
    const projectId = payload.projectId as string;
    this.workspace.removeFolder(projectId);
    if (this.activeProjectId === projectId) {
      const folders = this.workspace.folders;
      this.activeProjectId = folders.length > 0 ? folders[0].path : '';
    }
    return { success: true };
  }

  private active(): Record<string, unknown> {
    if (!this.activeProjectId) {
      return { project: null };
    }
    const folders = this.workspace.folders;
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].path === this.activeProjectId) {
        return { project: folderToDescriptor(folders[i], this.workspace.isOpen) };
      }
    }
    return { project: null };
  }

  private setActive(payload: Record<string, unknown>): Record<string, unknown> {
    const projectId = payload.projectId as string;
    const folders = this.workspace.folders;
    for (let i = 0; i < folders.length; i++) {
      if (folders[i].path === projectId) {
        this.activeProjectId = projectId;
        return { success: true };
      }
    }
    return { success: false };
  }
}
