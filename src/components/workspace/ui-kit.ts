/**
 * A small wireframe library for prototyping UI on the whiteboard: frames and
 * common controls in Excalidraw's own style, so they sit naturally next to
 * hand-drawn sketches. Shown in the canvas's Library sidebar.
 */
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

type Skeleton = Parameters<typeof convertToExcalidrawElements>[0];

const ink = "#1e1e1e";
const muted = "#868e96";
const brand = "#3558f5";
const soft = { roughness: 0, strokeColor: ink, strokeWidth: 1 } as const;

const ITEMS: { name: string; skeleton: Skeleton }[] = [
  {
    name: "Phone frame",
    skeleton: [
      { type: "rectangle", x: 0, y: 0, width: 300, height: 600, roundness: { type: 3, value: 36 }, ...soft, strokeWidth: 2 },
      { type: "rectangle", x: 110, y: 14, width: 80, height: 18, roundness: { type: 3 }, backgroundColor: ink, fillStyle: "solid", ...soft },
      { type: "line", x: 110, y: 580, points: [[0, 0], [80, 0]], ...soft, strokeWidth: 2 },
    ],
  },
  {
    name: "Browser frame",
    skeleton: [
      { type: "rectangle", x: 0, y: 0, width: 720, height: 460, roundness: { type: 3, value: 12 }, ...soft, strokeWidth: 2 },
      { type: "line", x: 0, y: 40, points: [[0, 0], [720, 0]], ...soft },
      { type: "ellipse", x: 16, y: 14, width: 12, height: 12, backgroundColor: "#ff6b6b", fillStyle: "solid", ...soft },
      { type: "ellipse", x: 36, y: 14, width: 12, height: 12, backgroundColor: "#fcc419", fillStyle: "solid", ...soft },
      { type: "ellipse", x: 56, y: 14, width: 12, height: 12, backgroundColor: "#51cf66", fillStyle: "solid", ...soft },
      { type: "rectangle", x: 200, y: 9, width: 320, height: 22, roundness: { type: 3 }, ...soft, strokeColor: muted },
      { type: "text", x: 214, y: 12, text: "localhost:3000", fontSize: 14, strokeColor: muted },
    ],
  },
  {
    name: "Nav bar",
    skeleton: [
      { type: "rectangle", x: 0, y: 0, width: 720, height: 56, ...soft },
      { type: "text", x: 20, y: 16, text: "Logo", fontSize: 20 },
      { type: "text", x: 440, y: 18, text: "Docs", fontSize: 16, strokeColor: muted },
      { type: "text", x: 510, y: 18, text: "Pricing", fontSize: 16, strokeColor: muted },
      { type: "rectangle", x: 600, y: 10, width: 100, height: 36, roundness: { type: 3 }, backgroundColor: brand, fillStyle: "solid", ...soft, strokeColor: brand, label: { text: "Sign in", strokeColor: "#ffffff", fontSize: 16 } },
    ],
  },
  {
    name: "Button",
    skeleton: [
      { type: "rectangle", x: 0, y: 0, width: 150, height: 44, roundness: { type: 3 }, backgroundColor: brand, fillStyle: "solid", ...soft, strokeColor: brand, label: { text: "Button", strokeColor: "#ffffff", fontSize: 18 } },
    ],
  },
  {
    name: "Secondary button",
    skeleton: [{ type: "rectangle", x: 0, y: 0, width: 150, height: 44, roundness: { type: 3 }, ...soft, label: { text: "Cancel", fontSize: 18 } }],
  },
  {
    name: "Text input",
    skeleton: [
      { type: "text", x: 0, y: 0, text: "Email", fontSize: 14, strokeColor: muted },
      { type: "rectangle", x: 0, y: 22, width: 280, height: 44, roundness: { type: 3 }, ...soft },
      { type: "text", x: 14, y: 34, text: "you@example.com", fontSize: 16, strokeColor: muted },
    ],
  },
  {
    name: "Card",
    skeleton: [
      { type: "rectangle", x: 0, y: 0, width: 280, height: 180, roundness: { type: 3, value: 16 }, ...soft },
      { type: "rectangle", x: 16, y: 16, width: 248, height: 80, roundness: { type: 3 }, backgroundColor: "#e9ecef", fillStyle: "solid", ...soft, strokeColor: "#e9ecef" },
      { type: "text", x: 16, y: 108, text: "Card title", fontSize: 20 },
      { type: "text", x: 16, y: 140, text: "A line of supporting text", fontSize: 14, strokeColor: muted },
    ],
  },
  {
    name: "Checkbox + toggle",
    skeleton: [
      { type: "rectangle", x: 0, y: 2, width: 20, height: 20, roundness: { type: 3 }, ...soft },
      { type: "line", x: 4, y: 12, points: [[0, 0], [5, 5], [12, -6]], ...soft, strokeColor: brand, strokeWidth: 2 },
      { type: "text", x: 30, y: 2, text: "Remember me", fontSize: 16 },
      { type: "rectangle", x: 170, y: 0, width: 44, height: 24, roundness: { type: 3, value: 12 }, backgroundColor: brand, fillStyle: "solid", ...soft, strokeColor: brand },
      { type: "ellipse", x: 192, y: 3, width: 18, height: 18, backgroundColor: "#ffffff", fillStyle: "solid", ...soft, strokeColor: "#ffffff" },
    ],
  },
  {
    name: "Avatar row",
    skeleton: [
      { type: "ellipse", x: 0, y: 0, width: 44, height: 44, backgroundColor: "#d0bfff", fillStyle: "solid", ...soft },
      { type: "text", x: 56, y: 2, text: "Ada Lovelace", fontSize: 16 },
      { type: "text", x: 56, y: 24, text: "Online", fontSize: 13, strokeColor: "#2f9e44" },
    ],
  },
];

/** Library items in the shape Excalidraw's initialData.libraryItems takes. Built once, on first use. */
let built: { id: string; status: "unpublished"; name: string; created: number; elements: ReturnType<typeof convertToExcalidrawElements> }[] | null = null;
export function uiKit() {
  built ??= ITEMS.map((item, i) => ({ id: `mm-ui-kit-${i}`, status: "unpublished" as const, name: item.name, created: 1, elements: convertToExcalidrawElements(item.skeleton) }));
  return built;
}
