import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { decodeMarkdown } from '../../src/core/documents';
import { assertLocalDuration } from '../timing';

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
  await extension.activate();
  const activation = performance.now() - start;
  process.stdout.write(`[host] Activation: ${activation.toFixed(1)} ms\n`);
  if (typeof vscode.lm?.registerTool === 'function')
    assert.ok(
      vscode.lm.tools.some((tool) => tool.name === 'prompteur_findPrompt'),
      'Copilot prompt search tool must register when the host supports Language Model Tools',
    );
  assertLocalDuration(activation, 200, 'Activation');
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
