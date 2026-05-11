import { constants } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { maxFileBytes, vaultRoot } from "../core/config.js";
import { readJsonBody, sendJson } from "../core/http.js";
import {
  isVisibleDirectory,
  isVisibleNoteFile,
  resolveVaultPath,
  toVaultRelative,
} from "../core/vault-fs.js";

export type VaultEntry = {
  name: string;
  path: string;
  type: "directory" | "file";
  size: number;
  modifiedAt: string;
  children?: VaultEntry[];
};

async function listVaultEntriesAt(directoryPath: string, recursive: boolean): Promise<VaultEntry[]> {
  const entries = await Promise.all(
    (await readdir(directoryPath, { withFileTypes: true }))
      .filter((entry) => {
        if (entry.isDirectory()) return isVisibleDirectory(entry.name);
        if (entry.isFile()) return isVisibleNoteFile(entry.name);
        return false;
      })
      .map(async (entry): Promise<VaultEntry | null> => {
        const entryPath = path.join(directoryPath, entry.name);
        const entryStat = await stat(entryPath);

        const base: VaultEntry = {
          name: entry.name,
          path: toVaultRelative(entryPath),
          type: entry.isDirectory() ? "directory" : "file",
          size: entryStat.size,
          modifiedAt: entryStat.mtime.toISOString(),
        };

        if (recursive && entry.isDirectory()) {
          base.children = await listVaultEntriesAt(entryPath, true);
        }
        return base;
      }),
  );
  const visible = entries.filter((entry): entry is VaultEntry => entry !== null);
  visible.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return visible;
}

async function listVaultEntries(res: ServerResponse, url: URL) {
  const relativePath = url.searchParams.get("path") ?? "";
  const recursive = url.searchParams.get("recursive") === "1";
  const directoryPath = resolveVaultPath(relativePath);
  const directoryStat = await stat(directoryPath);

  if (!directoryStat.isDirectory()) {
    sendJson(res, 400, { error: "Path is not a directory" });
    return;
  }

  const visibleEntries = await listVaultEntriesAt(directoryPath, recursive);

  sendJson(res, 200, {
    path: toVaultRelative(directoryPath),
    parentPath: directoryPath === vaultRoot ? null : toVaultRelative(path.dirname(directoryPath)),
    entries: visibleEntries,
  });
}

async function createVaultFolder(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (typeof body !== "object" || body === null || typeof (body as { path?: unknown }).path !== "string") {
    sendJson(res, 400, { error: "Expected JSON body with path string" });
    return;
  }
  const folderPath = resolveVaultPath((body as { path: string }).path);
  if (folderPath === vaultRoot) {
    sendJson(res, 400, { error: "Cannot create vault root" });
    return;
  }
  try {
    await access(folderPath, constants.F_OK);
    sendJson(res, 409, { error: "Folder already exists" });
    return;
  } catch {}
  await mkdir(folderPath, { recursive: true });
  const folderStat = await stat(folderPath);
  sendJson(res, 200, {
    name: path.basename(folderPath),
    path: toVaultRelative(folderPath),
    type: "directory",
    size: folderStat.size,
    modifiedAt: folderStat.mtime.toISOString(),
  });
}

async function renameVaultEntry(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);
  if (
    typeof body !== "object" || body === null ||
    typeof (body as { from?: unknown }).from !== "string" ||
    typeof (body as { to?: unknown }).to !== "string"
  ) {
    sendJson(res, 400, { error: "Expected JSON body with from and to strings" });
    return;
  }
  const fromPath = resolveVaultPath((body as { from: string }).from);
  const toPath = resolveVaultPath((body as { to: string }).to);
  if (fromPath === vaultRoot || toPath === vaultRoot) {
    sendJson(res, 400, { error: "Cannot rename vault root" });
    return;
  }
  try {
    await access(toPath, constants.F_OK);
    sendJson(res, 409, { error: "Destination already exists" });
    return;
  } catch {}
  await mkdir(path.dirname(toPath), { recursive: true });
  await rename(fromPath, toPath);
  const toStat = await stat(toPath);
  sendJson(res, 200, {
    name: path.basename(toPath),
    path: toVaultRelative(toPath),
    type: toStat.isDirectory() ? "directory" : "file",
    size: toStat.size,
    modifiedAt: toStat.mtime.toISOString(),
  });
}

async function deleteVaultEntry(res: ServerResponse, url: URL) {
  const relativePath = url.searchParams.get("path") ?? "";
  const targetPath = resolveVaultPath(relativePath);
  if (targetPath === vaultRoot) {
    sendJson(res, 400, { error: "Cannot delete vault root" });
    return;
  }
  await rm(targetPath, { recursive: true, force: true });
  sendJson(res, 200, { deleted: true });
}

async function readVaultFile(res: ServerResponse, url: URL) {
  const relativePath = url.searchParams.get("path") ?? "";
  const filePath = resolveVaultPath(relativePath);
  const fileStat = await stat(filePath);

  if (!fileStat.isFile()) {
    sendJson(res, 400, { error: "Path is not a file" });
    return;
  }

  if (fileStat.size > maxFileBytes) {
    sendJson(res, 413, { error: "File is too large to open in the console" });
    return;
  }

  sendJson(res, 200, {
    path: toVaultRelative(filePath),
    name: path.basename(filePath),
    content: await readFile(filePath, "utf8"),
    modifiedAt: fileStat.mtime.toISOString(),
    size: fileStat.size,
  });
}

async function writeVaultFile(req: IncomingMessage, res: ServerResponse) {
  const body = await readJsonBody(req);

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as { path?: unknown }).path !== "string" ||
    typeof (body as { content?: unknown }).content !== "string"
  ) {
    sendJson(res, 400, { error: "Expected JSON body with path and content strings" });
    return;
  }

  const filePath = resolveVaultPath((body as { path: string }).path);
  const content = (body as { content: string }).content;
  if (Buffer.byteLength(content, "utf8") > maxFileBytes) {
    sendJson(res, 413, { error: "File content is too large to save from the console" });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  const fileStat = await stat(filePath);

  sendJson(res, 200, {
    path: toVaultRelative(filePath),
    name: path.basename(filePath),
    content,
    modifiedAt: fileStat.mtime.toISOString(),
    size: fileStat.size,
  });
}

export async function routeVault(req: IncomingMessage, res: ServerResponse, url: URL) {
  if (url.pathname === "/api/vault/tree" && req.method === "GET") {
    await listVaultEntries(res, url);
    return true;
  }
  if (url.pathname === "/api/vault/file" && req.method === "GET") {
    await readVaultFile(res, url);
    return true;
  }
  if (url.pathname === "/api/vault/file" && req.method === "PUT") {
    await writeVaultFile(req, res);
    return true;
  }
  if (url.pathname === "/api/vault/folder" && req.method === "POST") {
    await createVaultFolder(req, res);
    return true;
  }
  if (url.pathname === "/api/vault/rename" && req.method === "POST") {
    await renameVaultEntry(req, res);
    return true;
  }
  if (url.pathname === "/api/vault/entry" && req.method === "DELETE") {
    await deleteVaultEntry(res, url);
    return true;
  }
  return false;
}
