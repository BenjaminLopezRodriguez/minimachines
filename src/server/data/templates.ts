import manifest from "../../../templates/manifest.json";

export type TemplateGroup = "stacks" | "agents" | "general";
export type TemplateStatus = "ready" | "preview";

export type Template = {
  id: string;
  name: string;
  group: TemplateGroup;
  summary: string;
  when_to_use: string;
  when_not_to_use?: string;
  tags: string[];
  stacks: string[];
  agents: string[];
  resources: { cpu: number; memoryGb: number };
  dockerfile: string;
  status: TemplateStatus;
};

type Manifest = { templates: Template[] };

const bundled = manifest as Manifest;

/** Optional override for tests / MCP that point at a fixture root. */
export function loadTemplatesFromJson(raw: string): Template[] {
  const parsed = JSON.parse(raw) as Manifest;
  if (!parsed.templates || !Array.isArray(parsed.templates)) {
    throw new Error("manifest must contain a templates array");
  }
  return parsed.templates;
}

export function loadTemplates(): Template[] {
  if (!bundled.templates || !Array.isArray(bundled.templates)) {
    throw new Error("templates/manifest.json must contain a templates array");
  }
  return bundled.templates;
}

export function getTemplate(
  id: string,
  templates = loadTemplates(),
): Template | undefined {
  return templates.find((t) => t.id === id);
}

function haystack(t: Template): string {
  return [
    t.id,
    t.name,
    t.summary,
    t.when_to_use,
    t.when_not_to_use ?? "",
    ...t.tags,
    ...t.stacks,
    ...t.agents,
    t.group,
  ]
    .join(" ")
    .toLowerCase();
}

/** Case-insensitive substring match over catalog fields. */
export function searchTemplates(
  query: string,
  templates = loadTemplates(),
): Template[] {
  const q = query.trim().toLowerCase();
  if (!q) return templates;
  const tokens = q.split(/\s+/).filter(Boolean);
  return templates.filter((t) => {
    const text = haystack(t);
    return tokens.every((token) => text.includes(token));
  });
}

export type TemplateRecommendation = {
  template: Template;
  score: number;
  reason: string;
};

/** Keyword-overlap recommend for MCP agents (no embeddings). */
export function recommendTemplates(
  task: string,
  templates = loadTemplates(),
  limit = 5,
): TemplateRecommendation[] {
  const tokens = task
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((t) => t.length > 1);

  const scored = templates.map((template) => {
    const text = haystack(template);
    let score = 0;
    const hits: string[] = [];
    for (const token of tokens) {
      if (text.includes(token)) {
        score += template.tags.includes(token) ? 3 : 1;
        if (template.agents.includes(token)) score += 4;
        if (template.stacks.includes(token)) score += 2;
        if (template.id.includes(token)) score += 2;
        hits.push(token);
      }
    }
    const reason =
      hits.length > 0
        ? `Matched ${[...new Set(hits)].slice(0, 6).join(", ")}. ${template.when_to_use}`
        : template.when_to_use;
    return { template, score, reason };
  });

  return scored
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.template.name.localeCompare(b.template.name),
    )
    .slice(0, limit);
}
