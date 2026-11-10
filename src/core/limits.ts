export const documentByteLimit = 1024 * 1024;
export const generatedByteLimit = 32 * documentByteLimit;
export const libraryByteLimit = 128 * documentByteLimit;
export const libraryEntryLimit = 50_000;
export const yamlDepthLimit = 64;

export function assertTextBudget(text: string, maximum = documentByteLimit): void {
  if (Buffer.byteLength(text, 'utf8') > maximum)
    throw new Error(`Input exceeds ${maximum} byte limit`);
}
