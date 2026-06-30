import type { Locator, Page } from "playwright";
import type { LocatorSpec } from "../dsl/index.js";

const MAX_VISIBLE_CHECKS = 50;
const MAX_NEAREST_MATCHES = 5;

export interface NearestLocatorMatch {
  kind: string;
  text?: string;
  role?: string;
  selector?: string;
  testId?: string;
  placeholder?: string;
  score: number;
  reason: string;
}

export interface LocatorDiagnostics {
  selector: string;
  strategy: LocatorSpec["strategy"];
  matchedCount: number;
  visibleCount: number;
  nearestMatches: NearestLocatorMatch[];
  guidance: string[];
}

export interface LocatorInspectionOptions {
  expectedState?: "visible" | "hidden";
}

export function resolveLocator(page: Page, locator: LocatorSpec): Locator {
  switch (locator.strategy) {
    case "role":
      return page.getByRole(locator.role, { name: locator.name });
    case "label":
      return page.getByLabel(locator.name, { exact: true });
    case "placeholder":
      return page.getByPlaceholder(locator.text);
    case "text":
      return page.getByText(locator.text);
    case "testid":
      return page.getByTestId(locator.id);
    case "css":
      return page.locator(locator.selector);
    default: {
      const _exhaustive: never = locator;
      throw new Error(`Unknown locator strategy: ${(_exhaustive as LocatorSpec).strategy}`);
    }
  }
}

export function describeLocator(locator: LocatorSpec): string {
  switch (locator.strategy) {
    case "role":
      return `${locator.role} "${locator.name}"`;
    case "label":
      return `field "${locator.name}"`;
    case "placeholder":
      return `placeholder "${locator.text}"`;
    case "text":
      return `text "${locator.text}"`;
    case "testid":
      return `testid:${locator.id}`;
    case "css":
      return `css:${locator.selector}`;
  }
}

export async function inspectLocator(
  page: Page,
  locator: LocatorSpec,
  options: LocatorInspectionOptions = {},
): Promise<LocatorDiagnostics> {
  const resolved = resolveLocator(page, locator);
  const matchedCount = await safeCount(resolved);
  const visibleCount = await countVisible(resolved, matchedCount);
  const nearestMatches = await nearestLocatorMatches(page, locator);

  return {
    selector: describeLocator(locator),
    strategy: locator.strategy,
    matchedCount,
    visibleCount,
    nearestMatches,
    guidance: locatorGuidance(locator, matchedCount, visibleCount, nearestMatches, options),
  };
}

interface DomCandidate {
  kind: string;
  text?: string;
  role?: string;
  selector?: string;
  testId?: string;
  placeholder?: string;
}

async function safeCount(locator: Locator): Promise<number> {
  try {
    return await locator.count();
  } catch {
    return 0;
  }
}

async function countVisible(locator: Locator, matchedCount: number): Promise<number> {
  let visibleCount = 0;
  const checks = Math.min(matchedCount, MAX_VISIBLE_CHECKS);

  for (let i = 0; i < checks; i++) {
    try {
      if (await locator.nth(i).isVisible()) {
        visibleCount++;
      }
    } catch {
      // Detached elements can disappear during diagnostics; skip them.
    }
  }

  return visibleCount;
}

async function nearestLocatorMatches(
  page: Page,
  locator: LocatorSpec,
): Promise<NearestLocatorMatch[]> {
  const target = locatorTargetText(locator);
  if (!target || locator.strategy === "css") return [];

  const targetKind = locatorTargetKind(locator);
  const candidates = await collectDomCandidates(page);
  const ranked = candidates
    .map((candidate) => {
      const candidateText = candidateTextFor(locator, candidate);
      const score = scoreCandidate(target, targetKind, locator, candidate, candidateText);
      return {
        ...candidate,
        text: candidate.text,
        score,
        reason: matchReason(locator, targetKind, candidate, target, candidateText, score),
      };
    })
    .filter((candidate) => candidate.score >= 0.35)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const kindSort = kindPriority(locator, a) - kindPriority(locator, b);
      if (kindSort !== 0) return kindSort;
      return (a.text ?? "").localeCompare(b.text ?? "");
    });

  return dedupeMatches(ranked).slice(0, MAX_NEAREST_MATCHES);
}

function locatorTargetText(locator: LocatorSpec): string | undefined {
  switch (locator.strategy) {
    case "role":
    case "label":
      return locator.name;
    case "placeholder":
    case "text":
      return locator.text;
    case "testid":
      return locator.id;
    case "css":
      return locator.selector;
  }
}

function locatorTargetKind(locator: LocatorSpec): string {
  switch (locator.strategy) {
    case "role":
      return locator.role;
    case "label":
      return "field";
    case "placeholder":
      return "placeholder";
    case "text":
      return "text";
    case "testid":
      return "testid";
    case "css":
      return "css";
  }
}

function candidateTextFor(locator: LocatorSpec, candidate: DomCandidate): string {
  if (locator.strategy === "testid") return candidate.testId ?? candidate.text ?? "";
  if (locator.strategy === "placeholder") return candidate.placeholder ?? candidate.text ?? "";
  return candidate.text ?? candidate.placeholder ?? candidate.testId ?? "";
}

function scoreCandidate(
  target: string,
  targetKind: string,
  locator: LocatorSpec,
  candidate: DomCandidate,
  candidateText: string,
): number {
  if (!candidateText) return 0;

  let score = stringSimilarity(target, candidateText);
  const candidateKind = candidate.role ?? candidate.kind;

  if (candidateKind === targetKind) {
    score += 0.2;
  }

  if (locator.strategy === "label" && (candidate.kind === "label" || candidate.kind === "field")) {
    score += 0.15;
  }

  if (locator.strategy === "placeholder" && candidate.placeholder) {
    score += 0.2;
  }

  if (locator.strategy === "testid" && candidate.testId) {
    score += 0.2;
  }

  if (normalizeText(target) === normalizeText(candidateText)) {
    score += 0.15;
  }

  return Math.min(score, 1);
}

function matchReason(
  locator: LocatorSpec,
  targetKind: string,
  candidate: DomCandidate,
  target: string,
  candidateText: string,
  score: number,
): string {
  const candidateKind = candidate.role ?? candidate.kind;
  const exactText = normalizeText(target) === normalizeText(candidateText);

  if (locator.strategy === "role" && exactText && candidateKind !== targetKind) {
    return `Visible text matches "${target}", but it is exposed as ${candidateKind}, not ${targetKind}.`;
  }

  if (candidateKind === targetKind || (locator.strategy === "label" && candidate.kind === "label")) {
    return `Closest visible ${targetKind} candidate.`;
  }

  if (score >= 0.8) {
    return `Similar visible ${candidateKind} candidate.`;
  }

  return `Nearby visible ${candidateKind} candidate.`;
}

function kindPriority(locator: LocatorSpec, candidate: DomCandidate): number {
  const targetKind = locatorTargetKind(locator);
  const candidateKind = candidate.role ?? candidate.kind;
  if (candidateKind === targetKind) return 0;
  if (locator.strategy === "label" && candidate.kind === "label") return 1;
  if (candidate.kind === "text") return 2;
  return 3;
}

function dedupeMatches(candidates: NearestLocatorMatch[]): NearestLocatorMatch[] {
  const seen = new Set<string>();
  const result: NearestLocatorMatch[] = [];

  for (const candidate of candidates) {
    const key = [
      candidate.kind,
      candidate.role ?? "",
      candidate.text ?? "",
      candidate.testId ?? "",
      candidate.placeholder ?? "",
      candidate.selector ?? "",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }

  return result;
}

function locatorGuidance(
  locator: LocatorSpec,
  matchedCount: number,
  visibleCount: number,
  nearestMatches: NearestLocatorMatch[],
  options: LocatorInspectionOptions,
): string[] {
  const target = locatorTargetText(locator) ?? describeLocator(locator);
  const targetKind = locatorTargetKind(locator);
  const wrongKindExact = nearestMatches.find((match) =>
    match.reason.includes("not " + targetKind)
  );

  if (options.expectedState === "hidden" && visibleCount > 0) {
    return [
      `${describeLocator(locator)} matched ${matchedCount} element(s), including ${visibleCount} visible element(s), but the contract expected it to be hidden. Hide or remove the element, or change the contract if it should remain visible.`,
    ];
  }

  if (wrongKindExact) {
    return [
      `Target text exists but not as ${targetKind}. Fix the accessible HTML so it exposes ${targetKind} semantics, or change the contract target kind to ${wrongKindExact.kind}.`,
    ];
  }

  if (matchedCount > 0 && visibleCount === 0) {
    return [`${describeLocator(locator)} matched ${matchedCount} element(s), but none were visible.`];
  }

  switch (locator.strategy) {
    case "role":
      return [`No visible ${locator.role} matched "${target}". Check the accessible role and name, or change the contract target kind if the UI intentionally uses different semantics.`];
    case "label":
      return [`No field label matched "${target}". Add a label or aria-label to the control, or change the contract to placeholder, testid, or css only when semantics are unavailable.`];
    case "placeholder":
      return [`No placeholder matched "${target}". Check the placeholder copy or prefer field labels for stable form contracts.`];
    case "text":
      return [`No visible text matched "${target}". Check the rendered copy or choose a more specific semantic target.`];
    case "testid":
      return [`No element with data-testid "${target}" was found. Check the test id value or prefer semantic targets when possible.`];
    case "css":
      return [`CSS locator "${target}" matched no visible elements. Prefer semantic targets when the UI exposes them.`];
  }
}

async function collectDomCandidates(page: Page): Promise<DomCandidate[]> {
  return await page.evaluate<DomCandidate[]>(String.raw`(() => {
    const result = [];
    const seen = new Set();

    function add(candidate) {
      const text = normalize(candidate.text);
      const placeholder = normalize(candidate.placeholder);
      const testId = normalize(candidate.testId);
      if (!text && !placeholder && !testId) return;

      const normalized = { ...candidate };
      if (text) normalized.text = text;
      if (placeholder) normalized.placeholder = placeholder;
      if (testId) normalized.testId = testId;

      const key = [
        normalized.kind,
        normalized.role ?? "",
        normalized.text ?? "",
        normalized.placeholder ?? "",
        normalized.testId ?? "",
        normalized.selector ?? "",
      ].join("|");
      if (seen.has(key)) return;
      seen.add(key);
      result.push(normalized);
    }

    function normalize(value) {
      return (value ?? "").replace(/\s+/g, " ").trim();
    }

    function isVisible(element) {
      if (!(element instanceof HTMLElement)) return false;
      if (element.hidden) return false;
      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function cssEscape(value) {
      const css = window.CSS;
      if (css?.escape) return css.escape(value);
      return value.replace(/["\\]/g, "\\$&");
    }

    function selectorFor(element) {
      const id = element.getAttribute("id");
      if (id) return "#" + cssEscape(id);
      const testId = element.getAttribute("data-testid");
      if (testId) return '[data-testid="' + cssEscape(testId) + '"]';
      return element.tagName.toLowerCase();
    }

    function inferredKind(element) {
      const role = element.getAttribute("role");
      if (role) return role;

      const tag = element.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return "heading";
      if (tag === "button") return "button";
      if (tag === "a" && element.hasAttribute("href")) return "link";
      if (tag === "label") return "label";
      if (tag === "select") return "combobox";
      if (tag === "textarea") return "textbox";
      if (tag === "input") {
        const input = element;
        if (input.type === "checkbox") return "checkbox";
        if (input.type === "radio") return "radio";
        if (["button", "submit", "reset"].includes(input.type)) return "button";
        return "field";
      }
      return "text";
    }

    function controlLabel(element) {
      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      ) {
        const labels = Array.from(element.labels ?? [])
          .map((label) => normalize(label.innerText || label.textContent))
          .filter(Boolean);
        if (labels.length > 0) return labels.join(" ");
      }

      const ariaLabel = normalize(element.getAttribute("aria-label"));
      if (ariaLabel) return ariaLabel;

      return "";
    }

    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      if (!(element instanceof HTMLElement)) continue;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"].includes(element.tagName)) continue;
      if (!isVisible(element)) continue;

      const selector = selectorFor(element);
      const role = element.getAttribute("role") ?? undefined;
      const kind = inferredKind(element);
      const text = normalize(
        element.getAttribute("aria-label") ||
          (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)
            ? element.value
            : "") ||
          element.innerText ||
          element.textContent,
      );

      if (text && text.length <= 140 && element.tagName !== "BODY" && element.tagName !== "HTML") {
        add({ kind, role, text, selector });
      }

      if (element instanceof HTMLLabelElement) {
        add({ kind: "label", text, selector });
      }

      const label = controlLabel(element);
      if (label) {
        add({ kind: "field", text: label, role: role ?? inferredKind(element), selector });
      }

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        const placeholder = normalize(element.getAttribute("placeholder"));
        if (placeholder) {
          add({ kind: "placeholder", text: placeholder, placeholder, selector });
        }
      }

      const testId = normalize(element.getAttribute("data-testid"));
      if (testId) {
        add({ kind: "testid", text: text || testId, testId, selector });
      }
    }

    return result;
  })()`);
}

function stringSimilarity(a: string, b: string): number {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (right.includes(left) || left.includes(right)) return 0.85;

  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}
