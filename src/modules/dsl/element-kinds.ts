// ─── Element-Kind Vocabulary ────────────────────────────────────────────────
//
// Single source of truth for the recommended `{kind}` slot vocabulary used in
// the declarative Gherkin grammar (see
// `docs/gherkin.md` §Element-Kind Vocabulary).
//
// The markdown reference is regenerated from this module by
// `scripts/generate-element-kinds-doc.mjs`. Do not hand-edit
// the markdown tables between the BEGIN/END markers — edit this file and
// re-run the generator.
//
// The compiler imports `RECOMMENDED_KINDS`, `isRecommendedKind()`, and
// `suggestKinds()` for the `unknown-element-kind` warning path.

export type ElementKindCategory =
  | "layout"
  | "navigation"
  | "forms"
  | "actions"
  | "data"
  | "feedback"
  | "media";

export interface ElementKindDef {
  /** Kebab-case token. Unique across the vocabulary. */
  kind: string;
  category: ElementKindCategory;
  /** One-line human description. Used verbatim in the generated docs. */
  description: string;
}

export const ELEMENT_KINDS: readonly ElementKindDef[] = [
  // Layout
  {
    kind: "page",
    category: "layout",
    description: "Top-level page root container",
  },
  {
    kind: "section",
    category: "layout",
    description: "A major section within a page",
  },
  {
    kind: "panel",
    category: "layout",
    description: "A contained panel or card body",
  },
  { kind: "card", category: "layout", description: "A card component" },
  {
    kind: "sidebar",
    category: "layout",
    description: "Sidebar navigation landmark",
  },
  {
    kind: "header",
    category: "layout",
    description: "Page or section header",
  },
  {
    kind: "footer",
    category: "layout",
    description: "Page or section footer",
  },
  {
    kind: "container",
    category: "layout",
    description: "Generic container/wrapper",
  },
  // Navigation
  {
    kind: "link",
    category: "navigation",
    description: "Anchor / navigation link",
  },
  { kind: "tab", category: "navigation", description: "Tab panel trigger" },
  {
    kind: "breadcrumb",
    category: "navigation",
    description: "Breadcrumb navigation bar",
  },
  {
    kind: "menu",
    category: "navigation",
    description: "Dropdown or context menu",
  },
  {
    kind: "menu-item",
    category: "navigation",
    description: "Item within a menu",
  },
  // Forms
  {
    kind: "field",
    category: "forms",
    description: "A form control addressed by visible label",
  },
  {
    kind: "form",
    category: "forms",
    description: "`<form>` element or form container",
  },
  {
    kind: "input",
    category: "forms",
    description: "Text, number, date, textarea, or similar input",
  },
  {
    kind: "select",
    category: "forms",
    description: "Dropdown / combobox select",
  },
  { kind: "checkbox", category: "forms", description: "Checkbox input" },
  { kind: "radio", category: "forms", description: "Radio button input" },
  { kind: "toggle", category: "forms", description: "Toggle / switch control" },
  { kind: "file-input", category: "forms", description: "File upload input" },
  {
    kind: "placeholder",
    category: "forms",
    description: "Input addressed by placeholder text",
  },
  // Actions
  { kind: "button", category: "actions", description: "`<button>` element" },
  {
    kind: "submit",
    category: "actions",
    description:
      "Form submit button (when emphasis on submit semantics is needed)",
  },
  {
    kind: "icon-button",
    category: "actions",
    description: "Icon-only button",
  },
  // Data
  { kind: "table", category: "data", description: "Data table" },
  { kind: "row", category: "data", description: "Table row or list item row" },
  { kind: "cell", category: "data", description: "Table cell" },
  { kind: "list", category: "data", description: "List container" },
  {
    kind: "heading",
    category: "data",
    description: "`<h1>`–`<h6>` or prominent heading text",
  },
  { kind: "text", category: "data", description: "Visible text content" },
  { kind: "label", category: "data", description: "Descriptive label" },
  { kind: "badge", category: "data", description: "Status badge or tag" },
  {
    kind: "value",
    category: "data",
    description: "Rendered data value (read-only)",
  },
  // Feedback
  {
    kind: "toast",
    category: "feedback",
    description: "Toast / snackbar notification",
  },
  { kind: "dialog", category: "feedback", description: "Modal dialog" },
  { kind: "alert", category: "feedback", description: "Inline alert / banner" },
  {
    kind: "error",
    category: "feedback",
    description: "Validation error message",
  },
  { kind: "spinner", category: "feedback", description: "Loading spinner" },
  {
    kind: "skeleton",
    category: "feedback",
    description: "Skeleton loading placeholder",
  },
  { kind: "empty", category: "feedback", description: "Empty-state indicator" },
  // Media
  { kind: "image", category: "media", description: "Image element" },
  { kind: "icon", category: "media", description: "Icon element" },
  { kind: "avatar", category: "media", description: "User avatar" },
] as const;

export const RECOMMENDED_KINDS: ReadonlySet<string> = new Set(
  ELEMENT_KINDS.map((k) => k.kind),
);

/**
 * Ordered list of categories. Matches the order of section headings in the
 * generated markdown vocabulary tables.
 */
export const ELEMENT_KIND_CATEGORIES: readonly ElementKindCategory[] = [
  "layout",
  "navigation",
  "forms",
  "actions",
  "data",
  "feedback",
  "media",
] as const;

export function isRecommendedKind(kind: string): boolean {
  return RECOMMENDED_KINDS.has(kind);
}

// ─── Levenshtein distance ───────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  // Two-row DP for O(min(m,n)) space.
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/**
 * Suggest up to `limit` kinds from `ELEMENT_KINDS` that resemble `input`.
 *
 * Candidate threshold: Levenshtein distance ≤ 4 OR similarity ratio ≥ 0.6,
 * where ratio = 1 - distance / max(len(input), len(candidate)).
 *
 * Results sorted by distance ascending (ties broken by alphabetical kind).
 */
export function suggestKinds(
  input: string,
  limit: number = 3,
): ElementKindDef[] {
  if (limit <= 0) return [];
  const scored: { def: ElementKindDef; distance: number }[] = [];
  for (const def of ELEMENT_KINDS) {
    const distance = levenshtein(input, def.kind);
    const maxLen = Math.max(input.length, def.kind.length);
    const ratio = maxLen === 0 ? 1 : 1 - distance / maxLen;
    if (distance <= 4 || ratio >= 0.6) {
      scored.push({ def, distance });
    }
  }
  scored.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.def.kind.localeCompare(b.def.kind);
  });
  return scored.slice(0, limit).map((s) => s.def);
}

/**
 * Grouped view of the vocabulary. Returns a record with one entry per
 * `ElementKindCategory`; the entries within each category preserve the order
 * they appear in `ELEMENT_KINDS`.
 */
export function kindsByCategory(): Record<
  ElementKindCategory,
  ElementKindDef[]
> {
  const out: Record<ElementKindCategory, ElementKindDef[]> = {
    layout: [],
    navigation: [],
    forms: [],
    actions: [],
    data: [],
    feedback: [],
    media: [],
  };
  for (const def of ELEMENT_KINDS) {
    out[def.category].push(def);
  }
  return out;
}
