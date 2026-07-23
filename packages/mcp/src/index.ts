import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  createMachine,
  listMachines,
} from "../../../src/server/data/machine-store";
import {
  loadTemplates,
  recommendTemplates,
  searchTemplates,
} from "../../../src/server/data/templates";

const server = new McpServer({
  name: "minimachines",
  version: "0.1.0",
});

function catalogRow(t: ReturnType<typeof loadTemplates>[number]) {
  return {
    id: t.id,
    name: t.name,
    summary: t.summary,
    when_to_use: t.when_to_use,
    when_not_to_use: t.when_not_to_use,
    tags: t.tags,
    stacks: t.stacks,
    agents: t.agents,
    resources: t.resources,
    status: t.status,
    group: t.group,
    dockerfile: t.dockerfile,
  };
}

server.tool(
  "list_templates",
  "List AI-optimized machine templates. Optional query filters by name, tags, stacks, agents, and when_to_use.",
  { query: z.string().optional().describe("Optional search query") },
  async ({ query }) => {
    const templates = query?.trim()
      ? searchTemplates(query)
      : loadTemplates();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(templates.map(catalogRow), null, 2),
        },
      ],
    };
  },
);

server.tool(
  "recommend_template",
  "Recommend machine templates for a work task using keyword overlap on LLM-oriented descriptions.",
  {
    task: z
      .string()
      .min(1)
      .describe("Natural-language description of the work the agent will do"),
  },
  async ({ task }) => {
    const recs = recommendTemplates(task).map((r) => ({
      ...catalogRow(r.template),
      score: r.score,
      reason: r.reason,
    }));
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(recs, null, 2),
        },
      ],
    };
  },
);

server.tool(
  "create_machine",
  "Create a mocked machine from a template id (no real provisioner yet).",
  {
    templateId: z.string().min(1).describe("Template id from list_templates"),
    name: z.string().optional().describe("Optional machine name"),
    task: z.string().optional().describe("Optional task / activity label"),
  },
  async ({ templateId, name, task }) => {
    try {
      const machine = createMachine({ templateId, name, task });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(machine, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create failed";
      return {
        isError: true,
        content: [{ type: "text" as const, text: message }],
      };
    }
  },
);

server.tool(
  "list_machines",
  "List the current mocked fleet (shared with the dashboard).",
  {},
  async () => {
    const machines = listMachines();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(machines, null, 2),
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
