export function normalizeText(value: string) {
  return value
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, "")
    .replace(/[“”"'‘’]/g, "");
}
