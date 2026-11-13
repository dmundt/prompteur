import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { decodeMarkdown } from '../../src/core/documents';
import type { PromptTree } from '../../src/workbench/tree';
import { assertLocalDuration } from '../timing';

function replaceWindowMethod(name: string, value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(vscode.window, name);
  Object.defineProperty(vscode.window, name, { configurable: true, value });
  return () => {
    if (descriptor) Object.defineProperty(vscode.window, name, descriptor);
    else Reflect.deleteProperty(vscode.window, name);
  };
}

function waitForTreeRefresh(tree: PromptTree): { promise: Promise<void>; dispose: () => void } {
  let subscription: vscode.Disposable | undefined;
  let timeout: ReturnType<typeof setTimeout>;
  const promise = new Promise<void>((resolve, reject) => {
    subscription = tree.onDidChangeTreeData(() => resolve());
    timeout = setTimeout(
      () => reject(new Error('Tree did not refresh after a configuration change')),
      3000,
    );
  });
  return {
    promise,
    dispose: () => {
      clearTimeout(timeout);
      subscription?.dispose();
    },
  };
}

export async function run(): Promise<void> {
  const skipClipboard = process.env.PROMPTEUR_TEST_SKIP_CLIPBOARD === '1';
  assert.equal(
    vscode.workspace.workspaceFolders?.[0]?.uri.scheme,
    'file',
    'Smoke fixture must open a local workspace',
  );
  const extension = vscode.extensions.getExtension('dmundt.prompteur');
  assert.ok(extension, 'Development extension must be available');
  const start = performance.now();
  const originalCreateTreeView = vscode.window.createTreeView.bind(vscode.window);
  let promptTree: PromptTree | undefined;
  const restoreCreateTreeView = replaceWindowMethod(
    'createTreeView',
    <T>(id: string, options: vscode.TreeViewOptions<T>): vscode.TreeView<T> => {
      if (id === 'prompteur.prompts')
        promptTree = options.treeDataProvider as unknown as PromptTree;
      return originalCreateTreeView(id, options);
    },
  );
  try {
    await extension.activate();
  } finally {
    restoreCreateTreeView();
  }
  const activation = performance.now() - start;
  process.stdout.write(`[host] Activation: ${activation.toFixed(1)} ms\n`);
  assert.ok(promptTree, 'Prompt tree provider must be registered');
  const tree = promptTree;
  if (typeof vscode.lm?.registerTool === 'function')
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'prompteur_findPrompt'),
      'Copilot prompt search tool must register when the host supports Language Model Tools',
    );
  assertLocalDuration(activation, 200, 'Activation');
  let inputCount = 0;
  const restoreDescriptionInput = replaceWindowMethod('showInputBox', async () => {
    inputCount++;
    return inputCount === 1 ? 'research' : 'Test research category';
  });
  const restoreWarning = replaceWindowMethod('showWarningMessage', async () => 'Add Category');
  try {
    await vscode.commands.executeCommand('prompteur.addCategory');
  } finally {
    restoreWarning();
    restoreDescriptionInput();
  }
  const categoriesFor = async (scope: 'user' | 'workspace'): Promise<string[]> =>
    (await tree.getChildren({ kind: 'scope', scope }))
      .filter((node) => node.kind === 'category')
      .map((node) => {
        const label = tree.getTreeItem(node).label;
        if (typeof label !== 'string') throw new Error('Category label must be a string');
        return label;
      });
  const scopeLabels = async (): Promise<(string | vscode.TreeItemLabel | undefined)[]> =>
    (await tree.getChildren({ kind: 'root' })).map((node) => tree.getTreeItem(node).label);
  const initialScopeLabels = await scopeLabels();
  const setCountMode = async (mode: 'filtered' | 'total' | 'hidden'): Promise<void> => {
    const refresh = waitForTreeRefresh(tree);
    try {
      await vscode.workspace
        .getConfiguration('prompteur')
        .update('categoryCountMode', mode, vscode.ConfigurationTarget.Global);
      await refresh.promise;
    } finally {
      refresh.dispose();
    }
  };
  assert.deepEqual(await categoriesFor('user'), ['Plan (1)', 'Research (1)', 'Review (2)']);
  assert.deepEqual(await categoriesFor('workspace'), ['Plan (1)', 'Research (1)', 'Review (2)']);
  await setCountMode('total');
  assert.deepEqual(await categoriesFor('user'), ['Plan (1)', 'Research (1)', 'Review (2)']);
  await setCountMode('hidden');
  assert.deepEqual(await categoriesFor('workspace'), ['Plan', 'Research', 'Review']);
  tree.query = 'needle';
  tree.refresh();
  await setCountMode('filtered');
  assert.deepEqual(await categoriesFor('user'), ['Research (1)', 'Review (1)']);
  assert.deepEqual(await categoriesFor('workspace'), ['Research (1)', 'Review (1)']);
  await setCountMode('total');
  assert.deepEqual(await categoriesFor('user'), ['Research (1)', 'Review (2)']);
  await setCountMode('hidden');
  assert.deepEqual(await categoriesFor('workspace'), ['Research', 'Review']);
  for (const scope of ['user', 'workspace'] as const) {
    const nodes = await tree.getChildren({ kind: 'scope', scope });
    assert.equal(nodes.filter((node) => node.kind === 'problem').length, 1);
    assert.equal(nodes.filter((node) => node.kind === 'category').length, 2);
  }
  const restoreGrouping = waitForTreeRefresh(tree);
  try {
    await vscode.workspace
      .getConfiguration('prompteur')
      .update('groupByCategory', false, vscode.ConfigurationTarget.Global);
    await restoreGrouping.promise;
  } finally {
    restoreGrouping.dispose();
  }
  for (const scope of ['user', 'workspace'] as const) {
    const nodes = await tree.getChildren({ kind: 'scope', scope });
    assert.equal(nodes.filter((node) => node.kind === 'category').length, 0);
    assert.equal(nodes.filter((node) => node.kind === 'entry').length, 2);
  }
  assert.deepEqual(await scopeLabels(), initialScopeLabels);
  tree.query = '';
  tree.refresh();
  await vscode.workspace
    .getConfiguration('prompteur')
    .update('groupByCategory', true, vscode.ConfigurationTarget.Global);
  await setCountMode('filtered');
  process.stdout.write(
    '[host] Category counts passed for live filtered/total/hidden modes, both scopes, custom and invalid categories, and flat view\n',
  );
  const document = await vscode.workspace.openTextDocument({
    language: 'typescript',
    content: 'const answer = 42;',
  });
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  const prompt = { kind: 'entry', scope: 'workspace', entry: { path: 'prompts/review.prompt.md' } };
  assert.ok(!(await vscode.commands.getCommands()).includes('prompteur.insert'));
  assert.equal(vscode.workspace.isTrusted, false, 'Fixture workspace must start untrusted');
  await assert.rejects(
    async () => vscode.commands.executeCommand('prompteur.copy', prompt),
    /Trust/,
  );

  const bundled = vscode.Uri.joinPath(
    extension.extensionUri,
    'resources',
    'starter',
    'prompts',
    'review-code.prompt.md',
  );
  const original = await vscode.workspace.fs.readFile(bundled);
  await vscode.commands.executeCommand('prompteur.addStarters', { kind: 'scope', scope: 'user' });
  const starter = {
    kind: 'entry',
    scope: 'user',
    entry: { path: 'prompts/review-code.prompt.md' },
  };
  if (!skipClipboard) {
    const clipboard = await vscode.env.clipboard.readText();
    try {
      await vscode.env.clipboard.writeText('prompteur-host-clipboard-check');
      assert.equal(
        await vscode.env.clipboard.readText(),
        'prompteur-host-clipboard-check',
        'Native clipboard provider must round-trip text before testing extension copy',
      );
      editor.selection = new vscode.Selection(
        document.positionAt(0),
        document.positionAt(document.getText().length),
      );
      await vscode.commands.executeCommand('prompteur.copy', starter);
      assert.match(
        await vscode.env.clipboard.readText(),
        /^\r?\n?Review the selected code or available diff:/,
      );
      assert.equal(document.getText(), 'const answer = 42;');
    } finally {
      await vscode.env.clipboard.writeText(clipboard);
    }
  }
  await vscode.commands.executeCommand('prompteur.copyPrompt', starter);
  await assert.rejects(
    async () => vscode.commands.executeCommand('prompteur.copyPrompt', prompt),
    /Trust/,
  );
  await assert.rejects(
    async () =>
      vscode.commands.executeCommand('prompteur.pastePrompt', {
        kind: 'scope',
        scope: 'workspace',
      }),
    /Trust/,
  );
  const beforePaste = new Set(vscode.workspace.textDocuments);
  await vscode.commands.executeCommand('prompteur.pastePrompt', {
    kind: 'category',
    scope: 'user',
    category: 'explain',
  });
  const pasted = vscode.workspace.textDocuments.find(
    (item) => !beforePaste.has(item) && !item.isUntitled && item.uri.scheme === 'file',
  );
  assert.ok(pasted, 'Paste Prompt must create and open a saved library copy');
  assert.deepEqual(decodeMarkdown(pasted.getText()), {
    ...decodeMarkdown(Buffer.from(original).toString('utf8')),
    category: 'explain',
  });
  assert.equal(
    Buffer.from(await vscode.workspace.fs.readFile(pasted.uri)).toString('utf8'),
    pasted.getText(),
    'The pasted prompt must persist its category override and original content',
  );
  const userStarter = vscode.Uri.joinPath(pasted.uri, '..', 'review-code.prompt.md');
  assert.notEqual(pasted.uri.toString(), userStarter.toString());
  assert.deepEqual(await vscode.workspace.fs.readFile(userStarter), original);

  const beforePreview = new Set(vscode.workspace.textDocuments);
  await vscode.commands.executeCommand('prompteur.preview', starter);
  const preview = vscode.workspace.textDocuments.find(
    (item) => !beforePreview.has(item) && item.isUntitled && item.languageId === 'plaintext',
  );
  assert.ok(preview, 'Preview must open a plaintext snapshot');
  assert.match(preview.getText(), /Review/);
  assert.match(preview.getText(), /const answer = 42;/);
  assert.deepEqual(await vscode.workspace.fs.readFile(bundled), original);
  process.stdout.write(
    `[host] Untrusted workspace guards, personal prompt use, prompt-record transfer, source/context preservation, starter integrity and plaintext preview passed; single-line input not exercised; clipboard ${skipClipboard ? 'explicitly skipped' : 'passed'}\n`,
  );
}
