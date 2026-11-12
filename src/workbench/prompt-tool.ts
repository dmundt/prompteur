import * as vscode from 'vscode';
import type { LibraryService } from '../application/library';
import type { Entry, Scope } from '../core/documents';
import type { VariableKey } from '../core/render';

export type PromptToolInput =
  { query: string; scope?: Scope; path?: never } | { query?: never; scope: Scope; path: string };

interface RenderedPrompt {
  text: string;
  missing: VariableKey[];
}

const matchLimit = 10;

export class PromptLibraryTool implements vscode.LanguageModelTool<PromptToolInput> {
  constructor(
    private readonly service: LibraryService,
    private readonly hasWorkspace: () => boolean,
    private readonly isTrusted: () => boolean,
    private readonly render: (entry: Entry) => Promise<RenderedPrompt>,
  ) {}

  prepareInvocation(): vscode.PreparedToolInvocation {
    return {
      invocationMessage: 'Searching Prompteur prompts',
      confirmationMessages: {
        title: 'Share a prompt with Copilot?',
        message:
          'Search local Prompteur libraries and return a matching prompt to Copilot. A rendered prompt can include the active selection, clipboard text, filename, or workspace name when its template requests those variables.',
      },
    };
  }

  async invoke(
    { input }: vscode.LanguageModelToolInvocationOptions<PromptToolInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    if (!input || typeof input !== 'object')
      throw new Error('Provide a search query or a prompt scope and path.');
    if (input.scope !== undefined && input.scope !== 'user' && input.scope !== 'workspace')
      throw new Error('Choose the User or Workspace prompt library.');
    if ('path' in input) {
      if ('query' in input || !input.scope || typeof input.path !== 'string' || !input.path.trim())
        throw new Error('Select a prompt with scope and path only; omit query.');
    } else if (typeof input.query !== 'string' || !input.query.trim()) {
      throw new Error('Enter text to search Prompteur prompts.');
    } else if (input.query.length > 256) {
      throw new Error('Search Prompteur prompts with at most 256 characters.');
    }
    const query = input.query?.trim() ?? '';
    if (input.scope === 'workspace' && !this.hasWorkspace())
      throw new Error('Workspace prompt library is unavailable in this window.');
    if (input.scope === 'workspace' && !this.isTrusted())
      throw new Error('Trust this workspace before sharing its prompts with Copilot.');

    const workspaceOmitted = !input.scope && this.hasWorkspace() && !this.isTrusted();
    const scopes: Scope[] = input.scope
      ? [input.scope]
      : ['user', ...(this.hasWorkspace() && this.isTrusted() ? ['workspace' as const] : [])];
    const entries = (await Promise.all(scopes.map((scope) => this.service.get(scope)))).flatMap(
      (snapshot) => snapshot.entries,
    );
    let matches: Entry[];
    if (input.path !== undefined) {
      matches = entries.filter((entry) => entry.path === input.path);
    } else {
      const exact = entries
        .filter((entry) => entry.data.name.trim().toLowerCase() === query.toLowerCase())
        .sort(
          (left, right) =>
            left.data.name.localeCompare(right.data.name) || left.path.localeCompare(right.path),
        );
      matches = exact.length
        ? exact
        : (await Promise.all(scopes.map((scope) => this.service.search(scope, query)))).flat();
    }
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    if (scopes.includes('workspace') && !this.isTrusted())
      throw new Error('Trust this workspace before sharing its prompts with Copilot.');
    if (!matches.length)
      return this.result(
        JSON.stringify(
          {
            status: 'not_found',
            ...(input.path === undefined ? { query } : { scope: input.scope, path: input.path }),
            workspaceOmittedForTrust: workspaceOmitted,
          },
          null,
          2,
        ),
      );

    if (matches.length > 1) {
      const candidates = matches.slice(0, matchLimit).map(({ data, path, scope }) => ({
        name: data.name,
        description: data.description,
        category: data.category,
        scope,
        path,
      }));
      return this.result(
        JSON.stringify(
          {
            status: 'ambiguous',
            query,
            workspaceOmittedForTrust: workspaceOmitted,
            matches: candidates,
            truncated: matches.length > matchLimit,
          },
          null,
          2,
        ),
      );
    }

    const entry = matches[0]!;
    const rendered = await this.render(entry);
    if (token.isCancellationRequested) throw new vscode.CancellationError();
    return this.result(
      JSON.stringify(
        {
          status: 'match',
          workspaceOmittedForTrust: workspaceOmitted,
          prompt: {
            name: entry.data.name,
            category: entry.data.category,
            scope: entry.scope,
            path: entry.path,
          },
          missing: rendered.missing,
          content: rendered.text,
        },
        null,
        2,
      ),
    );
  }

  private result(text: string): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
  }
}
