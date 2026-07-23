import { MinimachineError } from "./errors.js";

export type MinimachineOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type Machine = {
  id: string;
  name: string;
  title: string;
  agent: string;
  task: string;
  status: string;
  region: string;
  cpu: number;
  memoryGb: number;
  templateId?: string;
  dockerfile?: string;
  ownerUserId?: string;
};

export type Template = {
  id: string;
  name: string;
  summary: string;
  when_to_use?: string;
  tags: string[];
  stacks: string[];
  agents: string[];
  resources: { cpu: number; memoryGb: number };
  status: string;
  group: string;
};

export type ExecResult = {
  id: string;
  machineId: string;
  cmd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
};

export type Job = {
  id: string;
  machineId: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  input: unknown;
  artifacts: { path: string; contentType?: string }[];
  createdAt: string;
  updatedAt: string;
};

type ErrorBody = { error?: { code?: string; message?: string } };

export class Minimachine {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: MinimachineOptions) {
    if (!opts.apiKey?.trim()) {
      throw new Error("apiKey is required");
    }
    this.apiKey = opts.apiKey.trim();
    this.baseUrl = (opts.baseUrl ?? "https://minimachin.es").replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  readonly templates = {
    list: async (opts?: { query?: string }): Promise<Template[]> => {
      const q = opts?.query?.trim();
      const path = q
        ? `/api/v1/templates?q=${encodeURIComponent(q)}`
        : "/api/v1/templates";
      const data = await this.request<{ templates: Template[] }>(path);
      return data.templates;
    },
    recommend: async (task: string): Promise<(Template & { score: number; reason: string })[]> => {
      const data = await this.request<{
        recommendations: (Template & { score: number; reason: string })[];
      }>(`/api/v1/templates/recommend?task=${encodeURIComponent(task)}`);
      return data.recommendations;
    },
  };

  readonly machines = {
    create: async (input: {
      templateId: string;
      name?: string;
      task?: string;
    }): Promise<Machine> => {
      const data = await this.request<{ machine: Machine }>("/api/v1/machines", {
        method: "POST",
        body: JSON.stringify(input),
        headers: { "content-type": "application/json" },
      });
      return data.machine;
    },
    list: async (): Promise<Machine[]> => {
      const data = await this.request<{ machines: Machine[] }>("/api/v1/machines");
      return data.machines;
    },
    get: async (id: string): Promise<Machine> => {
      const data = await this.request<{ machine: Machine }>(
        `/api/v1/machines/${encodeURIComponent(id)}`,
      );
      return data.machine;
    },
    stop: async (id: string): Promise<Machine> => {
      const data = await this.request<{ machine: Machine }>(
        `/api/v1/machines/${encodeURIComponent(id)}/stop`,
        { method: "POST" },
      );
      return data.machine;
    },
    exec: async (
      id: string,
      input: { cmd: string; cwd?: string; env?: Record<string, string> },
    ): Promise<ExecResult> => {
      const data = await this.request<{ exec: ExecResult }>(
        `/api/v1/machines/${encodeURIComponent(id)}/exec`,
        {
          method: "POST",
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
        },
      );
      return data.exec;
    },
    putFile: async (
      id: string,
      path: string,
      content: string | Uint8Array,
    ): Promise<{ path: string; bytes: number }> => {
      const bytes =
        typeof content === "string"
          ? Buffer.from(content, "utf8")
          : Buffer.from(content);
      const data = await this.request<{ file: { path: string; bytes: number } }>(
        `/api/v1/machines/${encodeURIComponent(id)}/files/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        {
          method: "PUT",
          body: bytes,
          headers: { "content-type": "application/octet-stream" },
        },
      );
      return data.file;
    },
    getFile: async (id: string, path: string): Promise<Uint8Array> => {
      const res = await this.raw(
        `/api/v1/machines/${encodeURIComponent(id)}/files/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
      );
      if (!res.ok) {
        await this.throwFromResponse(res);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
  };

  readonly jobs = {
    create: async (
      machineId: string,
      input: { type: string; input?: unknown; assets?: unknown },
    ): Promise<Job> => {
      const data = await this.request<{ job: Job }>(
        `/api/v1/machines/${encodeURIComponent(machineId)}/jobs`,
        {
          method: "POST",
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
        },
      );
      return data.job;
    },
    get: async (id: string): Promise<Job> => {
      const data = await this.request<{ job: Job }>(
        `/api/v1/jobs/${encodeURIComponent(id)}`,
      );
      return data.job;
    },
    wait: async (
      id: string,
      opts?: { timeoutMs?: number; intervalMs?: number },
    ): Promise<Job> => {
      const timeoutMs = opts?.timeoutMs ?? 60_000;
      const intervalMs = opts?.intervalMs ?? 500;
      const started = Date.now();
      for (;;) {
        const job = await this.jobs.get(id);
        if (job.status === "succeeded" || job.status === "failed") return job;
        if (Date.now() - started > timeoutMs) {
          throw new MinimachineError({
            status: 408,
            code: "timeout",
            message: `Timed out waiting for job ${id}`,
          });
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    },
  };

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.raw(path, init);
    if (!res.ok) {
      await this.throwFromResponse(res);
    }
    return (await res.json()) as T;
  }

  private raw(path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${this.apiKey}`);
    return this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers });
  }

  private async throwFromResponse(res: Response): Promise<never> {
    let code = "http_error";
    let message = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as ErrorBody;
      if (body.error?.code) code = body.error.code;
      if (body.error?.message) message = body.error.message;
    } catch {
      // ignore non-JSON
    }
    throw new MinimachineError({ status: res.status, code, message });
  }
}
