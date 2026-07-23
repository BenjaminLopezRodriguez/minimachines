#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { Minimachine } from "./client.js";
import { MinimachineError } from "./errors.js";

function clientFromEnv() {
  const apiKey = process.env.MINIMACHINE_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMACHINE_API_KEY is required");
  }
  return new Minimachine({
    apiKey,
    baseUrl: process.env.MINIMACHINE_BASE_URL,
  });
}

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errText(err: unknown) {
  const message =
    err instanceof MinimachineError
      ? `${err.code}: ${err.message}`
      : err instanceof Error
        ? err.message
        : "Unknown error";
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

const server = new McpServer({
  name: "minimachine",
  version: "0.1.0",
});

server.tool(
  "list_templates",
  "List AI-optimized machine templates from minimachin.es",
  { query: z.string().optional().describe("Optional search query") },
  async ({ query }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.templates.list({ query }));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "recommend_template",
  "Recommend templates for a natural-language task",
  { task: z.string().min(1) },
  async ({ task }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.templates.recommend(task));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "create_machine",
  "Create a machine session from a template id",
  {
    templateId: z.string().min(1),
    name: z.string().optional(),
    task: z.string().optional(),
  },
  async (input) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.machines.create(input));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "list_machines",
  "List machines for the authenticated account",
  {},
  async () => {
    try {
      const mm = clientFromEnv();
      return text(await mm.machines.list());
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "get_machine",
  "Get a machine by id",
  { id: z.string().min(1) },
  async ({ id }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.machines.get(id));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "stop_machine",
  "Stop a machine session",
  { id: z.string().min(1) },
  async ({ id }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.machines.stop(id));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "exec",
  "Run a command on a machine (stubbed until real provisioner)",
  {
    id: z.string().min(1),
    cmd: z.string().min(1),
    cwd: z.string().optional(),
  },
  async ({ id, cmd, cwd }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.machines.exec(id, { cmd, cwd }));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "put_file",
  "Upload a UTF-8 text file to a machine",
  {
    id: z.string().min(1),
    path: z.string().min(1),
    content: z.string(),
  },
  async ({ id, path, content }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.machines.putFile(id, path, content));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "get_file",
  "Download a file from a machine as UTF-8 text",
  {
    id: z.string().min(1),
    path: z.string().min(1),
  },
  async ({ id, path }) => {
    try {
      const mm = clientFromEnv();
      const bytes = await mm.machines.getFile(id, path);
      return text({ path, content: new TextDecoder().decode(bytes) });
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "create_job",
  "Create an offload job (e.g. render) on a machine",
  {
    machineId: z.string().min(1),
    type: z.string().min(1),
    input: z.record(z.unknown()).optional(),
  },
  async ({ machineId, type, input }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.jobs.create(machineId, { type, input }));
    } catch (err) {
      return errText(err);
    }
  },
);

server.tool(
  "get_job",
  "Get job status and artifacts",
  { id: z.string().min(1) },
  async ({ id }) => {
    try {
      const mm = clientFromEnv();
      return text(await mm.jobs.get(id));
    } catch (err) {
      return errText(err);
    }
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
