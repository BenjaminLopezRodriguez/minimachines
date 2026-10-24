import assert from "node:assert/strict";
import test from "node:test";
import { filterMachines } from "./dashboard-machines";
import type { Machine } from "~/server/data/machines";

const base = {
  title: "Build task",
  task: "",
  agent: "any",
  region: "us-east",
  cpu: 4,
  memoryGb: 8,
  uptime: "5m",
  lastActive: "now",
};
const machines: Machine[] = [
  {
    ...base,
    id: "vm_stopped",
    name: "Alpha",
    status: "stopped",
    task: "Archive docs",
  },
  {
    ...base,
    id: "vm_python",
    name: "Python tests",
    status: "running",
    agent: "claude",
    task: "Validate checkout",
  },
  { ...base, id: "vm_start", name: "New build", status: "starting" },
  { ...base, id: "vm_error", name: "Failed build", status: "error" },
];

void test("active sorting surfaces usable and starting machines without losing errors", () => {
  assert.deepEqual(
    filterMachines(machines, "", "all", "active").map((m) => m.id),
    ["vm_python", "vm_start", "vm_error", "vm_stopped"],
  );
  assert.deepEqual(
    machines.map((m) => m.id),
    ["vm_stopped", "vm_python", "vm_start", "vm_error"],
  );
});
void test("search finds machine identity, task, agent, and region without case sensitivity", () => {
  for (const query of ["  CHECKOUT ", "claude", "vm_python", "Python tests"])
    assert.deepEqual(
      filterMachines(machines, query, "all", "name").map((m) => m.id),
      ["vm_python"],
    );
  assert.equal(filterMachines(machines, "us-east", "all", "name").length, 4);
});
void test("status and text filters combine and no-match results stay empty", () => {
  assert.equal(
    filterMachines(machines, "checkout", "stopped", "name").length,
    0,
  );
  assert.equal(
    filterMachines(machines, "", "error", "name")[0]?.id,
    "vm_error",
  );
  assert.equal(filterMachines([], "", "all", "active").length, 0);
});
void test("alphabetical sorting is independent of machine state", () => {
  assert.deepEqual(
    filterMachines(machines, "", "all", "name").map((m) => m.name),
    ["Alpha", "Failed build", "New build", "Python tests"],
  );
});
