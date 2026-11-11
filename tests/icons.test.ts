import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';

describe('Activity Bar icon', () => {
  it('uses an accessible, self-contained SVG in the manifest', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
      icon: string;
      contributes: { viewsContainers: { activitybar: { icon: string }[] } };
    };
    expect(manifest.icon).toBe('resources/icon.png');
    const png = await readFile(manifest.icon);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(png.readUInt32BE(16)).toBe(128);
    expect(png.readUInt32BE(20)).toBe(128);
    const path = manifest.contributes.viewsContainers.activitybar[0]?.icon;
    expect(path).toBe('resources/activity/prompts.svg');
    const source = await readFile(path!, 'utf8');
    const document = new DOMParser({
      onError: (level, message) => {
        throw new Error(`${level}: ${message}`);
      },
    }).parseFromString(source, 'image/svg+xml');
    const root = document.documentElement!;
    expect(root.localName).toBe('svg');
    expect(root.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(root.getAttribute('viewBox')).toBe('0 0 16 16');
    expect(root.getAttribute('fill')).toBe('none');
    expect(root.getAttribute('stroke')).toBe('#ffffff');
    expect(root.getAttribute('stroke-width')).toBe('0.8');
    expect(root.getAttribute('stroke-linecap')).toBe('square');
    expect(root.getAttribute('stroke-linejoin')).toBe('miter');
    expect(root.getAttribute('role')).toBe('img');
    expect(root.getAttribute('aria-label')).toBe('Prompteur circus tent');
    expect(root.getAttribute('aria-label')).toBe(
      document.getElementsByTagName('title')[0]?.textContent,
    );
    expect(root.getAttribute('aria-label')!.length).toBeGreaterThan(2);
    const elements = Array.from(document.getElementsByTagName('*'));
    expect(
      elements.every((element) => ['svg', 'title', 'path'].includes(element.localName ?? '')),
    ).toBe(true);
    const paths = Array.from(document.getElementsByTagName('path'));
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((path) => Boolean(path.getAttribute('d')))).toBe(true);
    expect(
      elements.every((element) =>
        Array.from(element.attributes).every(
          (attribute) =>
            !attribute.name.startsWith('on') && !['href', 'style'].includes(attribute.name),
        ),
      ),
    ).toBe(true);
    expect(Buffer.byteLength(source)).toBeLessThan(1600);
  });
});
