import { z } from "zod";

// A region in CSS pixels (not DPR-scaled — the canvas component handles that).
// Max dimensions are validated here; whether the region fits a specific canvas
// is checked at command-handling time since canvas size is a runtime concern.
const Region = z.object({
  x: z.number().min(0),
  y: z.number().min(0),
  width: z.number().positive().max(2000),
  height: z.number().positive().max(2000),
});

const Color = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
}).default({ r: 30, g: 38, b: 58 });

// Fill a rectangle with settled ink immediately — no animation.
const RectCommand = z.object({
  type: z.literal("rect"),
  region: Region,
  color: Color,
});

// Animate a string of text appearing as handwritten ink strokes.
const TextCommand = z.object({
  type: z.literal("text"),
  content: z.string().min(1).max(500),
  font: z.string().default("Caveat"),
  size: z.number().positive().max(200).default(32),
  color: Color,
  region: Region,
});

// Animate an SVG path appearing as ink strokes, following the path's draw order.
const PathCommand = z.object({
  type: z.literal("path"),
  d: z.string().min(1),
  color: Color,
  region: Region,
});

// Discriminated union: the `type` field routes to the right schema.
// Adding a new command type = add a new z.object() above and include it here.
export const DrawCommand = z.discriminatedUnion("type", [
  RectCommand,
  TextCommand,
  PathCommand,
]);
