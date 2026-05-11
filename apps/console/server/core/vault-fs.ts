import path from "node:path";
import { readdir } from "node:fs/promises";
import { hiddenFileNames, vaultRoot } from "./config.js";

export function resolveVaultPath(relativePath = "") {
  if (relativePath.includes("\0")) {
    throw Object.assign(new Error("Invalid path"), { statusCode: 400 });
  }

  const cleaned = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const resolved = path.resolve(vaultRoot, cleaned);
  if (resolved !== vaultRoot && !resolved.startsWith(`${vaultRoot}${path.sep}`)) {
    throw Object.assign(new Error("Path escapes vault"), { statusCode: 400 });
  }

  return resolved;
}

export function toVaultRelative(absolutePath: string) {
  const relative = path.relative(vaultRoot, absolutePath);
  return relative === "" ? "" : relative.split(path.sep).join("/");
}

export function isVisibleNoteFile(name: string) {
  return path.extname(name).toLowerCase() === ".md" && !name.startsWith(".") && !hiddenFileNames.has(name);
}

export function isVisibleDirectory(name: string) {
  return !name.startsWith(".") && !["node_modules", "__pycache__"].includes(name);
}

export async function containsVisibleNotes(directoryPath: string): Promise<boolean> {
  const children = await readdir(directoryPath, { withFileTypes: true });

  for (const child of children) {
    if (child.isFile() && isVisibleNoteFile(child.name)) return true;

    if (child.isDirectory() && isVisibleDirectory(child.name)) {
      if (await containsVisibleNotes(path.join(directoryPath, child.name))) return true;
    }
  }

  return false;
}
