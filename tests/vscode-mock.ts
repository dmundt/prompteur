import * as fs from 'node:fs/promises';
import { posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class Disposable {
  constructor(private readonly action: () => void = () => undefined) {}
  dispose() {
    this.action();
  }
}
export class EventEmitter<T> {
  private readonly listeners = new Set<(value: T) => unknown>();
  event = (listener: (value: T) => unknown) => {
    this.listeners.add(listener);
    return new Disposable(() => this.listeners.delete(listener));
  };
  fire(value: T) {
    for (const listener of this.listeners) listener(value);
  }
  dispose() {
    this.listeners.clear();
  }
}
export class TreeItem {
  [key: string]: unknown;
  constructor(
    public label: string,
    public collapsibleState = 0,
  ) {}
}
export class ThemeIcon {
  constructor(public id: string) {}
}
export class MarkdownString {
  value = '';
  isTrusted?: boolean | { enabledCommands?: readonly string[] };
  appendMarkdown(value: string) {
    this.value += value;
    return this;
  }
  appendText(value: string) {
    this.value += value.replace(/[\\`*_{}[\]<>|]/g, '\\$&');
    return this;
  }
}
export class LanguageModelTextPart {
  constructor(public value: string) {}
}
export class LanguageModelToolResult {
  constructor(public content: LanguageModelTextPart[]) {}
}
export class CancellationError extends Error {}
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 };
export class DataTransferItem {
  constructor(public value: unknown) {}
}
export class RelativePattern {
  constructor(
    public base: unknown,
    public pattern: string,
  ) {}
}
export class Uri {
  constructor(
    public path: string,
    public scheme = 'file',
  ) {}
  get fsPath() {
    return this.scheme === 'file' ? fileURLToPath(this.toString()) : this.path;
  }
  toString() {
    return `${this.scheme}://${this.path}`;
  }
  static file(path: string) {
    const url = pathToFileURL(path);
    return new Uri(decodeURIComponent(url.pathname));
  }
  static parse(value: string) {
    const url = new URL(value);
    return new Uri(url.pathname, url.protocol.slice(0, -1));
  }
  static joinPath(root: Uri, ...parts: string[]) {
    return new Uri(posix.join(root.path, ...parts), root.scheme);
  }
}
export const watchers: MockWatcher[] = [];
export class MockWatcher {
  change = new EventEmitter<Uri>();
  create = new EventEmitter<Uri>();
  delete = new EventEmitter<Uri>();
  onDidChange = this.change.event;
  onDidCreate = this.create.event;
  onDidDelete = this.delete.event;
  dispose() {
    this.change.dispose();
    this.create.dispose();
    this.delete.dispose();
  }
}
export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}
export class Range {
  start: Position;
  end: Position;
  constructor(
    start: Position | number,
    end: Position | number,
    endLine?: number,
    endCharacter?: number,
  ) {
    this.start = typeof start === 'number' ? new Position(start, end as number) : start;
    this.end = typeof end === 'number' ? new Position(endLine!, endCharacter!) : end;
  }
}
export class ThemeColor {
  constructor(public id: string) {}
}
export class Diagnostic {
  constructor(
    public range: Range,
    public message: string,
    public severity: number,
  ) {}
}
export const DiagnosticSeverity = { Error: 0, Warning: 1 };
export const TextEdit = { replace: (range: Range, newText: string) => ({ range, newText }) };
const opened = new EventEmitter<FakeDocument>();
const changed = new EventEmitter<{ document: FakeDocument }>();
const closed = new EventEmitter<FakeDocument>();
const willSave = new EventEmitter<{
  document: FakeDocument;
  waitUntil: (edits: Promise<unknown>) => void;
}>();
const activeChanged = new EventEmitter<FakeEditor | undefined>();
export const configurationChanged = new EventEmitter<{
  affectsConfiguration: (section: string) => boolean;
}>();

export class FakeDocument {
  isDirty = false;
  isClosed = false;
  languageId = 'markdown';
  constructor(
    public uri: Uri,
    public source: string,
  ) {}
  get fileName() {
    return this.uri.fsPath;
  }
  getText(range?: Range) {
    return range
      ? this.source.slice(this.offsetAt(range.start), this.offsetAt(range.end))
      : this.source;
  }
  positionAt(offset: number) {
    const before = this.source.slice(0, offset).split('\n');
    return new Position(before.length - 1, before.at(-1)!.length);
  }
  offsetAt(position: Position) {
    return (
      this.source
        .split('\n')
        .slice(0, position.line)
        .reduce((sum, line) => sum + line.length + 1, 0) + position.character
    );
  }
  change(source: string) {
    this.source = source;
    this.isDirty = true;
    changed.fire({ document: this });
  }
}
export class FakeEditor {
  selection = new Range(new Position(0, 0), new Position(0, 0));
  selections = [this.selection];
  viewColumn = 1;
  acceptEdits = true;
  decorations: Range[] = [];
  constructor(public document: FakeDocument) {}
  setDecorations(_: unknown, ranges: Range[]) {
    this.decorations = ranges;
  }
  async edit(action: (builder: { replace: (range: Range, text: string) => void }) => void) {
    if (!this.acceptEdits) return false;
    const edits: { range: Range; text: string }[] = [];
    action({
      replace: (range, text) => {
        edits.push({ range, text });
      },
    });
    let source = this.document.source;
    for (const edit of edits.sort(
      (left, right) =>
        this.document.offsetAt(right.range.start) - this.document.offsetAt(left.range.start),
    )) {
      source =
        source.slice(0, this.document.offsetAt(edit.range.start)) +
        edit.text +
        source.slice(this.document.offsetAt(edit.range.end));
    }
    this.document.change(source);
    return true;
  }
}
export class FakeMemento {
  values = new Map<string, unknown>();
  syncedKeys: readonly string[] = [];
  get<T>(key: string, fallback?: T): T {
    return (this.values.get(key) ?? fallback) as T;
  }
  setKeysForSync(keys: readonly string[]) {
    this.syncedKeys = keys;
  }
  async update(key: string, value: unknown) {
    this.values.set(key, value);
  }
}
export const responses = {
  quick: [] as (string | number | null)[],
  input: [] as (string | null)[],
  warning: [] as (string | null)[],
};
export const quickPicks: FakeQuickPick[] = [];
export const commandExecutions: { id: string; args: unknown[] }[] = [];
export const messages = {
  errors: [] as string[],
  warnings: [] as string[],
  info: [] as string[],
  preview: '',
};
export const views = new Map<
  string,
  { treeDataProvider: unknown; dragAndDropController?: unknown }
>();
export const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
export const providers = new Map<string, { provideTextDocumentContent: () => string }>();
export const languageModelTools = new Map<string, unknown>();
export const lm = {
  registerTool(name: string, tool: unknown) {
    languageModelTools.set(name, tool);
    return new Disposable(() => languageModelTools.delete(name));
  },
};
export class FakeInputBox {
  title = '';
  value = '';
  valueChanged = new EventEmitter<string>();
  accepted = new EventEmitter<void>();
  hidden = new EventEmitter<void>();
  onDidChangeValue = this.valueChanged.event;
  onDidAccept = this.accepted.event;
  onDidHide = this.hidden.event;
  show() {}
  hide() {
    this.hidden.fire();
  }
  dispose() {
    this.valueChanged.dispose();
    this.accepted.dispose();
    this.hidden.dispose();
  }
}
export class FakeQuickPick {
  title = '';
  items: { label: string; value: string }[] = [];
  activeItems: { label: string; value: string }[] = [];
  selectedItems: { label: string; value: string }[] = [];
  private readonly accepted = new EventEmitter<void>();
  private readonly hidden = new EventEmitter<void>();
  onDidAccept = this.accepted.event;
  onDidHide = this.hidden.event;
  show() {
    quickPicks.push(this);
    const response = responses.quick.length ? responses.quick.shift() : undefined;
    if (response === null) {
      this.hidden.fire();
      return;
    }
    const selected =
      typeof response === 'number'
        ? this.items[response]
        : typeof response === 'string'
          ? this.items.find((item) => item.label === response || item.value === response)
          : (this.activeItems[0] ?? this.items[0]);
    if (!selected) {
      this.hidden.fire();
      return;
    }
    this.selectedItems = [selected];
    this.accepted.fire();
  }
  dispose() {
    this.accepted.dispose();
    this.hidden.dispose();
  }
}
export const inputBoxes: FakeInputBox[] = [];
export const window = {
  activeTextEditor: undefined as FakeEditor | undefined,
  visibleTextEditors: [] as FakeEditor[],
  onDidChangeActiveTextEditor: activeChanged.event,
  createTextEditorDecorationType: () => new Disposable(),
  createTreeView: (id: string, options: { treeDataProvider: unknown }) => {
    views.set(id, options);
    return new Disposable(() => views.delete(id));
  },
  createInputBox: () => {
    const box = new FakeInputBox();
    inputBoxes.push(box);
    return box;
  },
  createQuickPick: () => new FakeQuickPick(),
  async showInputBox(options?: { validateInput?: (value: string) => string | undefined }) {
    const value = responses.input.length ? (responses.input.shift() ?? undefined) : 'Test';
    if (value !== undefined && options?.validateInput?.(value)) return undefined;
    return value;
  },
  async showQuickPick(items: readonly unknown[]) {
    const response = responses.quick.length ? responses.quick.shift() : 0;
    if (response === null) return undefined;
    if (typeof response === 'number') return items[response];
    return items.find((item) =>
      typeof item === 'string' ? item === response : (item as { label: string }).label === response,
    );
  },
  async showWarningMessage(message: string, _: unknown, ...choices: string[]) {
    messages.warnings.push(message);
    return responses.warning.length ? (responses.warning.shift() ?? undefined) : choices[0];
  },
  async showErrorMessage(message: string) {
    messages.errors.push(message);
  },
  async showInformationMessage(message: string) {
    messages.info.push(message);
  },
  async showTextDocument(value: Uri | FakeDocument) {
    let document: FakeDocument;
    if (value instanceof FakeDocument) document = value;
    else {
      const existing = workspace.textDocuments.find(
        (item) => item.uri.toString() === value.toString(),
      );
      const provider = providers.get(value.scheme);
      document =
        existing ??
        new FakeDocument(
          value,
          provider
            ? provider.provideTextDocumentContent()
            : await fs.readFile(value.fsPath, 'utf8'),
        );
      if (provider) {
        document.source = provider.provideTextDocumentContent();
        document.languageId = 'plaintext';
        messages.preview = document.source;
      }
      if (!existing) {
        workspace.textDocuments.push(document);
        opened.fire(document);
      }
    }
    let editor = this.visibleTextEditors.find((item) => item.document === document);
    if (!editor) {
      editor = new FakeEditor(document);
      this.visibleTextEditors.push(editor);
    }
    this.activeTextEditor = editor;
    activeChanged.fire(editor);
    return editor;
  },
};
export const collections: Map<string, Diagnostic[]>[] = [];
export const languages = {
  createDiagnosticCollection: () => {
    const values = new Map<string, Diagnostic[]>();
    collections.push(values);
    return {
      set: (uri: Uri, diagnostics: Diagnostic[]) => values.set(uri.toString(), diagnostics),
      delete: (uri: Uri) => values.delete(uri.toString()),
      dispose: () => values.clear(),
    };
  },
};
export const workspace = {
  workspaceFolders: [] as { uri: Uri; name: string }[],
  isTrusted: true,
  textDocuments: [] as FakeDocument[],
  configuration: new Map<string, unknown>(),
  getConfiguration: (section = '') => ({
    get: (key: string, fallback?: unknown) =>
      workspace.configuration.get(section ? `${section}.${key}` : key) ?? fallback,
  }),
  async openTextDocument(options: { language: string; content: string }) {
    const document = new FakeDocument(
      new Uri(`/Untitled-${workspace.textDocuments.length + 1}`, 'untitled'),
      options.content,
    );
    document.languageId = options.language;
    workspace.textDocuments.push(document);
    opened.fire(document);
    return document;
  },
  getWorkspaceFolder: (uri: Uri) =>
    workspace.workspaceFolders.find((folder) => uri.path.startsWith(`${folder.uri.path}/`)),
  createFileSystemWatcher: () => {
    const watcher = new MockWatcher();
    watchers.push(watcher);
    return watcher;
  },
  registerTextDocumentContentProvider: (
    scheme: string,
    provider: { provideTextDocumentContent: () => string },
  ) => {
    providers.set(scheme, provider);
    return new Disposable(() => providers.delete(scheme));
  },
  onDidOpenTextDocument: opened.event,
  onDidChangeTextDocument: changed.event,
  onDidCloseTextDocument: closed.event,
  onDidChangeConfiguration: configurationChanged.event,
  onWillSaveTextDocument: willSave.event,
  fs: {
    stat: async (uri: Uri) => fs.stat(uri.fsPath),
    readFile: async (uri: Uri) => fs.readFile(uri.fsPath),
    writeFile: async (uri: Uri, data: Uint8Array) => fs.writeFile(uri.fsPath, data),
  },
};
export const env = {
  clipboard: {
    value: '',
    async readText() {
      return this.value;
    },
    async writeText(value: string) {
      this.value = value;
    },
  },
};
export const commands = {
  registerCommand: (id: string, handler: (...args: unknown[]) => Promise<unknown>) => {
    handlers.set(id, handler);
    return new Disposable(() => handlers.delete(id));
  },
  async executeCommand(id: string, ...args: unknown[]) {
    commandExecutions.push({ id, args });
    if (id === 'workbench.action.openSettings') return;
    if (id === 'markdown.showPreviewToSide') {
      messages.preview = providers.get('prompteur-preview')!.provideTextDocumentContent();
      return;
    }
    return handlers.get(id)?.(...args);
  },
};
export function reset() {
  for (const queue of Object.values(responses)) queue.splice(0);
  messages.errors = [];
  messages.warnings = [];
  messages.info = [];
  messages.preview = '';
  workspace.textDocuments = [];
  workspace.workspaceFolders = [];
  workspace.isTrusted = true;
  workspace.configuration.clear();
  configurationChanged.dispose();
  window.activeTextEditor = undefined;
  window.visibleTextEditors = [];
  handlers.clear();
  commandExecutions.splice(0);
  quickPicks.splice(0);
  views.clear();
  providers.clear();
  languageModelTools.clear();
  collections.splice(0);
  inputBoxes.splice(0);
  watchers.splice(0);
  env.clipboard.value = '';
}
export async function saveDocument(document: FakeDocument) {
  const operations: Promise<unknown>[] = [];
  willSave.fire({
    document,
    waitUntil: (edits) => {
      operations.push(edits);
    },
  });
  const lists = (await Promise.all(operations)) as { range: Range; newText: string }[][];
  for (const edits of lists) for (const edit of edits) document.source = edit.newText;
  await fs.writeFile(document.uri.fsPath, document.source);
  document.isDirty = false;
}
