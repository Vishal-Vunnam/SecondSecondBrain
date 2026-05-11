export function cleanScalar(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function escapeYamlString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function parseFrontmatter(content: string) {
  const lines = content.split(/\r?\n/);
  if (lines[0] !== "---") return { data: {} as Record<string, string | string[]>, body: content };

  const end = lines.findIndex((line, index) => index > 0 && line === "---");
  if (end === -1) return { data: {} as Record<string, string | string[]>, body: content };

  const data: Record<string, string | string[]> = {};
  let currentArrayKey: string | null = null;

  for (const line of lines.slice(1, end)) {
    const arrayMatch = line.match(/^\s*-\s+(.*)$/);
    if (arrayMatch && currentArrayKey) {
      const existing = data[currentArrayKey];
      data[currentArrayKey] = [...(Array.isArray(existing) ? existing : []), cleanScalar(arrayMatch[1])];
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const [, key, rawValue] = keyMatch;
    currentArrayKey = null;
    if (rawValue === "") {
      data[key] = "";
      if (key === "links" || key === "tags" || key === "ingredients") currentArrayKey = key;
      continue;
    }

    const inlineArray = rawValue.match(/^\[(.*)\]$/);
    if (inlineArray) {
      data[key] = inlineArray[1]
        .split(",")
        .map((item) => cleanScalar(item))
        .filter(Boolean);
      continue;
    }

    data[key] = cleanScalar(rawValue);
  }

  return {
    data,
    body: lines.slice(end + 1).join("\n").trim(),
  };
}

export function extractMarkdownTitle(body: string, fallback: string) {
  const titleLine = body.split(/\r?\n/).find((line) => line.startsWith("# "));
  return titleLine?.replace(/^#\s+/, "").trim() || fallback.replace(/\.md$/i, "");
}

export function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "task";
}

export function cleanOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
