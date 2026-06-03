/**
 * @repo/qa-agent/no-non-literal-testid
 *
 * Forbids `data-testid` JSX attribute values that the qa-agent testid
 * scanner cannot statically resolve. This locks the registry's contract:
 * every testid in source is discoverable by regex/AST pass.
 *
 * ─── Accepted forms (§10.1 of artifacts/analysis/qa-agent-grammar-migration-plan.md)
 *
 *   1. Static string literal:
 *        <x data-testid="foo-bar" />
 *
 *   2. Template literal where every interpolation is a simple identifier
 *      or member expression:
 *        <x data-testid={`row-${id}`} />
 *        <x data-testid={`badge-${status.code}`} />
 *
 *   3. Ternary where each branch is form #1, form #2, or the bare
 *      identifier `undefined` / `void 0` (meaning "omit the attribute"):
 *        <x data-testid={ok ? "foo-a" : `foo-b-${id}`} />
 *        <x data-testid={testId ? `${testId}-row` : undefined} />
 *
 *   4. Design-system prop forward: a bare identifier or member expression
 *      on `props` where the identifier is a parameter of the enclosing
 *      *component-shaped* function AND the identifier name is in the
 *      prop-forward allowlist (`testId`, `testid`, `dataTestId`, `props`).
 *      Covers:
 *        <Button data-testid={testId} />          (destructured)
 *        <Button data-testid={props['data-testid']} />
 *        <Button data-testid={props.testId} />
 *
 *      "Component-shaped" means the enclosing function is:
 *        - a FunctionDeclaration with an uppercase name, OR
 *        - a named FunctionExpression with an uppercase name, OR
 *        - the init of a VariableDeclarator whose id is uppercase, OR
 *        - the RHS of an AssignmentExpression whose LHS Identifier /
 *          member-chain final property is uppercase.
 *
 *      This rejects the anti-pattern `.map((user) => <tr data-testid={user.id} />)`
 *      where the "param" is a closure-scoped iteration variable (lowercase
 *      anonymous arrow → not component-shaped → reject). It also rejects
 *      identifiers outside the allowlist, forcing consumers to rename
 *      custom pass-through props (e.g. `qaId` → `testId`) so scanner
 *      coverage stays auditable.
 *
 * ─── Rejected forms (§10.2) — each has a distinct messageId so IDE
 *     surfaces the fix inline.
 *
 *   | Rejected                                 | messageId              |
 *   | ---------------------------------------- | ---------------------- |
 *   | data-testid={testid}  (local const)      | localRef               |
 *   | data-testid={buildTestid(user)}          | helperCall             |
 *   | data-testid={TESTIDS.LOGIN_SUBMIT}       | importedConst          |
 *   | data-testid={cond && "foo-a"}            | logicalAnd             |
 *   | data-testid={`foo-${bar()}`}             | callInInterpolation    |
 *
 *   Plus a generic catch-all: `nonLiteral`.
 */

import {
  ESLintUtils,
  TSESTree,
  AST_NODE_TYPES,
} from "@typescript-eslint/utils";

// ─── AST helpers ────────────────────────────────────────────────────────────

/**
 * Walk up from `node` to the nearest enclosing component/function definition.
 * Returns the function node (so we can inspect its parameters) or null if
 * we walked off the top of the tree.
 */
function findEnclosingFunction(
  node: TSESTree.Node | null | undefined,
): TSESTree.FunctionLike | null {
  let cur: TSESTree.Node | undefined = node?.parent;
  while (cur) {
    switch (cur.type) {
      case AST_NODE_TYPES.FunctionDeclaration:
      case AST_NODE_TYPES.FunctionExpression:
      case AST_NODE_TYPES.ArrowFunctionExpression:
        return cur;
      default:
        cur = cur.parent;
    }
  }
  return null;
}

/**
 * Decide whether `fn` is a "component-shaped" function — i.e. the kind of
 * top-level React component where `data-testid={propName}` is a legitimate
 * pass-through. Anonymous callbacks (e.g. `.map((user) => ...)`), inline
 * event handlers, and lowercase helper functions all fail this check.
 *
 * Heuristics (component-shaped iff ANY of):
 *   (1) FunctionDeclaration with an uppercase name:
 *         function UserList({ users }) { … }
 *   (2) Named FunctionExpression with an uppercase name:
 *         const Row = function Row(props) { … }
 *   (3) The function is the init of a VariableDeclarator whose id is an
 *       uppercase Identifier:
 *         const Button = (props) => …
 *         export const Card: FC<P> = (props) => …    (TypeAnnotation wrapper)
 *   (4) The function is the RHS of an AssignmentExpression whose LHS is an
 *       uppercase Identifier or `Something.displayName = …`-style member:
 *         MyComp = (props) => …
 *         Module.Comp = (props) => …
 *
 * Any other shape (including arrow callbacks passed to `.map()`, `.filter()`,
 * `setTimeout`, etc.) is NOT component-shaped.
 */
function isComponentShapedFunction(fn: TSESTree.FunctionLike): boolean {
  const startsUppercase = (name: string): boolean => /^[A-Z]/.test(name);

  // (1) FunctionDeclaration with uppercase name.
  if (fn.type === AST_NODE_TYPES.FunctionDeclaration) {
    return !!fn.id && startsUppercase(fn.id.name);
  }

  // (2) Named FunctionExpression with uppercase name.
  if (
    fn.type === AST_NODE_TYPES.FunctionExpression &&
    fn.id &&
    startsUppercase(fn.id.name)
  ) {
    return true;
  }

  // (3), (4): inspect the parent context.
  const parent = fn.parent;
  if (!parent) return false;

  if (parent.type === AST_NODE_TYPES.VariableDeclarator) {
    if (
      parent.id.type === AST_NODE_TYPES.Identifier &&
      startsUppercase(parent.id.name)
    ) {
      return true;
    }
    return false;
  }

  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    const lhs = parent.left;
    if (lhs.type === AST_NODE_TYPES.Identifier && startsUppercase(lhs.name)) {
      return true;
    }
    // Module.Comp = …, Obj.SubComp = … — accept if the final property name
    // is uppercase.
    if (lhs.type === AST_NODE_TYPES.MemberExpression && !lhs.computed) {
      const prop = lhs.property;
      if (
        prop.type === AST_NODE_TYPES.Identifier &&
        startsUppercase(prop.name)
      ) {
        return true;
      }
    }
    return false;
  }

  return false;
}

/**
 * Allowlist of prop identifier names that may legitimately pass through a
 * `data-testid` value on a design-system component.
 *
 * Keep this short and explicit: it's easy to bypass the scanner if
 * anything closure-scoped is accepted here.
 */
const PROP_FORWARD_NAMES = new Set(["testId", "testid", "dataTestId", "props"]);

/**
 * Collect the set of identifier names that are introduced by the parameter
 * list of the given function.
 *
 *   function Foo(props) {}                   → { props }
 *   function Foo({ a, b, "data-testid": t }) → { a, b, t }
 *   ({ testId }) => {}                        → { testId }
 *   function Foo(props: Props)               → { props }
 *
 * Rest and defaults are handled; nested destructuring descends one level.
 */
function collectParamBindings(fn: TSESTree.FunctionLike): {
  params: Set<string>;
  paramObjects: Set<string>;
} {
  const params = new Set<string>();
  const paramObjects = new Set<string>();

  const visit = (
    node:
      | TSESTree.Parameter
      | TSESTree.DestructuringPattern
      | TSESTree.Node
      | null
      | undefined,
    isTop: boolean,
  ): void => {
    if (!node) return;
    switch (node.type) {
      case AST_NODE_TYPES.Identifier:
        params.add(node.name);
        if (isTop) paramObjects.add(node.name);
        return;
      case AST_NODE_TYPES.AssignmentPattern:
        visit(node.left, isTop);
        return;
      case AST_NODE_TYPES.RestElement:
        visit(node.argument, isTop);
        return;
      case AST_NODE_TYPES.ObjectPattern:
        for (const prop of node.properties) {
          if (prop.type === AST_NODE_TYPES.RestElement) {
            visit(prop.argument, false);
          } else if (prop.type === AST_NODE_TYPES.Property) {
            visit(prop.value, false);
          }
        }
        return;
      case AST_NODE_TYPES.ArrayPattern:
        for (const el of node.elements) {
          visit(el, false);
        }
        return;
      default:
        return;
    }
  };

  for (const p of fn.params) {
    visit(p, true);
  }

  return { params, paramObjects };
}

/**
 * Classify a single interpolation expression inside a template literal.
 * Returns `"ok"` for identifier / simple member expression, `"call"` if it
 * contains a CallExpression at the top level, `"other"` otherwise.
 */
function classifyTemplateExpression(
  expr: TSESTree.Expression,
): "ok" | "call" | "logical" | "other" {
  if (expr.type === AST_NODE_TYPES.CallExpression) return "call";
  if (expr.type === AST_NODE_TYPES.LogicalExpression) return "logical";
  if (expr.type === AST_NODE_TYPES.Identifier) return "ok";
  if (expr.type === AST_NODE_TYPES.MemberExpression) {
    // Disallow calls buried inside the member chain: a.b().c → reject.
    let cur: TSESTree.Node | null = expr;
    while (cur) {
      if (cur.type === AST_NODE_TYPES.CallExpression) return "call";
      if (cur.type === AST_NODE_TYPES.MemberExpression) {
        // computed index must itself be a literal or identifier
        if (cur.computed) {
          const prop = cur.property;
          if (
            prop.type !== AST_NODE_TYPES.Literal &&
            prop.type !== AST_NODE_TYPES.Identifier
          ) {
            return "other";
          }
        }
        cur = cur.object;
      } else if (cur.type === AST_NODE_TYPES.Identifier) {
        return "ok";
      } else if (cur.type === AST_NODE_TYPES.ThisExpression) {
        return "ok";
      } else {
        return "other";
      }
    }
    return "ok";
  }
  return "other";
}

/**
 * Is this expression a plain string literal?
 */
function isStringLiteral(expr: TSESTree.Node): expr is TSESTree.StringLiteral {
  return expr.type === AST_NODE_TYPES.Literal && typeof expr.value === "string";
}

/**
 * Is this expression a template literal where every interpolation is
 * classified as `ok` by classifyTemplateExpression?
 */
function templateIsLiteral(
  expr: TSESTree.TemplateLiteral,
): { ok: true } | { ok: false; messageId: MessageId } {
  for (const e of expr.expressions) {
    const c = classifyTemplateExpression(e);
    if (c === "call") return { ok: false, messageId: "callInInterpolation" };
    if (c === "logical") return { ok: false, messageId: "logicalAnd" };
    if (c === "other") return { ok: false, messageId: "nonLiteral" };
  }
  return { ok: true };
}

// ─── Rule definition ────────────────────────────────────────────────────────

type MessageId =
  | "localRef"
  | "helperCall"
  | "importedConst"
  | "logicalAnd"
  | "callInInterpolation"
  | "nonLiteral";

const createRule = ESLintUtils.RuleCreator(
  (name) =>
    "https://github.com/soar-lms/frontend/blob/main/artifacts/analysis/qa-agent-grammar-migration-plan.md#" +
    name,
);

export const noNonLiteralTestid = createRule<[], MessageId>({
  name: "no-non-literal-testid",
  meta: {
    type: "problem",
    docs: {
      description:
        "data-testid values must be statically resolvable by the qa-agent testid scanner (string literal, simple template literal, ternary of those, or pass-through of a component prop).",
    },
    schema: [],
    messages: {
      localRef:
        "data-testid references local identifier '{{name}}'. Inline the literal value. If this is a component prop, the rule auto-detects it from the enclosing function's parameters.",
      helperCall:
        "data-testid is built by a helper call ({{callee}}). Inline the template literal the helper would return.",
      importedConst:
        "data-testid references an imported/namespaced constant ({{name}}). Replace with the literal string.",
      logicalAnd:
        "data-testid uses a logical-AND expression. Use a ternary with both branches literal: cond ? 'foo-a' : 'foo-b'.",
      callInInterpolation:
        "data-testid template literal contains a call expression inside `${…}`. Lift the call into a const bound to a simple identifier, then interpolate that identifier.",
      nonLiteral:
        "data-testid value must be a static string literal, a simple template literal, a ternary of those, or a pass-through of a component prop.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name.type !== AST_NODE_TYPES.JSXIdentifier) return;
        if (node.name.name !== "data-testid") return;

        const value = node.value;
        if (!value) return; // <x data-testid /> — boolean shorthand; ignore.

        // Form #1a: string literal attribute value → accept.
        if (value.type === AST_NODE_TYPES.Literal) {
          if (typeof value.value === "string") return;
          // number / boolean / null literal — not valid testid
          context.report({ node: value, messageId: "nonLiteral" });
          return;
        }

        if (value.type !== AST_NODE_TYPES.JSXExpressionContainer) return;
        const expr = value.expression;
        if (!expr || expr.type === AST_NODE_TYPES.JSXEmptyExpression) return;

        check(expr, node);

        function check(e: TSESTree.Expression, reportOn: TSESTree.Node): void {
          // Form #1b: literal inside {} → accept.
          if (isStringLiteral(e)) return;

          // Form #2: template literal with simple interpolations → accept.
          if (e.type === AST_NODE_TYPES.TemplateLiteral) {
            const res = templateIsLiteral(e);
            if (res.ok) return;
            context.report({ node: reportOn, messageId: res.messageId });
            return;
          }

          // Form #3: ternary where both branches are form #1b or #2.
          // Also allow a branch to be the identifier `undefined` (or the
          // `void 0` literal dance) — that means "omit the attribute",
          // which JSX handles as absent and the scanner ignores. This
          // keeps the `testId ? `${testId}-x` : undefined` idiom
          // rule-compliant without weakening the registry contract.
          if (e.type === AST_NODE_TYPES.ConditionalExpression) {
            const branches: TSESTree.Expression[] = [e.consequent, e.alternate];
            for (const b of branches) {
              if (isStringLiteral(b)) continue;
              if (
                b.type === AST_NODE_TYPES.Identifier &&
                b.name === "undefined"
              ) {
                continue;
              }
              if (
                b.type === AST_NODE_TYPES.UnaryExpression &&
                b.operator === "void"
              ) {
                continue;
              }
              if (b.type === AST_NODE_TYPES.TemplateLiteral) {
                const res = templateIsLiteral(b);
                if (res.ok) continue;
                context.report({ node: reportOn, messageId: res.messageId });
                return;
              }
              context.report({ node: reportOn, messageId: "nonLiteral" });
              return;
            }
            return;
          }

          // Form #4: pass-through of a component prop.
          //
          // Tightened (see §10.1 of the plan + the code-review follow-up
          // for Finding 2): accepting any identifier that's a parameter
          // of *any* enclosing function wrongly passes closure-param
          // member access inside callbacks like `.map((user) => ...)`,
          // even though the testid value is genuinely dynamic and the
          // scanner can't register it. Two constraints combined:
          //
          //   (a) The enclosing function must be "component-shaped"
          //       (capitalised name, or assigned to a capitalised
          //       VariableDeclarator / AssignmentExpression).
          //   (b) The bare identifier / member-chain base must match
          //       a prop-forward allowlist: testId, testid, dataTestId,
          //       or `props` (for `props['data-testid']` / `props.testId`).
          //
          // An anonymous arrow in `.map(fn)` fails (a). A component that
          // legitimately destructures `data-testid` under a custom name
          // not in the allowlist must rename it or use the `props`-access
          // form.
          if (e.type === AST_NODE_TYPES.Identifier) {
            if (PROP_FORWARD_NAMES.has(e.name)) {
              const fn = findEnclosingFunction(node);
              if (
                fn &&
                isComponentShapedFunction(fn) &&
                collectParamBindings(fn).params.has(e.name)
              ) {
                return;
              }
            }
            context.report({
              node: reportOn,
              messageId: "localRef",
              data: { name: e.name },
            });
            return;
          }

          if (e.type === AST_NODE_TYPES.MemberExpression) {
            // Walk to base: props.a.b / props['data-testid'] / ns.TESTIDS.X
            let base: TSESTree.Node = e;
            while (base.type === AST_NODE_TYPES.MemberExpression) {
              base = base.object;
            }
            if (base.type === AST_NODE_TYPES.Identifier) {
              const fn = findEnclosingFunction(node);
              const bindings = fn ? collectParamBindings(fn) : null;

              // Accept: base identifier in allowlist AND it's a param of
              // a component-shaped enclosing function.
              if (
                PROP_FORWARD_NAMES.has(base.name) &&
                fn &&
                isComponentShapedFunction(fn) &&
                bindings?.paramObjects.has(base.name)
              ) {
                return;
              }

              // Closure-param member access (e.g. `user.id` inside a
              // `.map((user) => …)` callback): the identifier is a
              // function parameter SOMEWHERE up the chain, but either
              // the enclosing function isn't component-shaped or the
              // name isn't in the allowlist. Report as a local ref —
              // this is a closure-scoped value the scanner can't
              // register, not a module-level constant import.
              if (bindings?.paramObjects.has(base.name)) {
                context.report({
                  node: reportOn,
                  messageId: "localRef",
                  data: { name: printMemberChain(e) },
                });
                return;
              }

              // Otherwise: `TESTIDS.LOGIN_SUBMIT`, `someModule.X` — a
              // module-level / imported constant lookup.
              const printed = printMemberChain(e);
              context.report({
                node: reportOn,
                messageId: "importedConst",
                data: { name: printed },
              });
              return;
            }
            context.report({ node: reportOn, messageId: "nonLiteral" });
            return;
          }

          if (e.type === AST_NODE_TYPES.LogicalExpression) {
            context.report({ node: reportOn, messageId: "logicalAnd" });
            return;
          }

          if (e.type === AST_NODE_TYPES.CallExpression) {
            const callee = e.callee;
            let calleeName = "helper";
            if (callee.type === AST_NODE_TYPES.Identifier) {
              calleeName = callee.name;
            } else if (callee.type === AST_NODE_TYPES.MemberExpression) {
              calleeName = printMemberChain(callee);
            }
            context.report({
              node: reportOn,
              messageId: "helperCall",
              data: { callee: calleeName },
            });
            return;
          }

          context.report({ node: reportOn, messageId: "nonLiteral" });
        }
      },
    };
  },
});

/**
 * Pretty-print a member expression chain like `ns.TESTIDS.LOGIN_SUBMIT`
 * for use in error messages. Best-effort; falls back to "<expr>" on
 * exotic shapes.
 */
function printMemberChain(expr: TSESTree.Node): string {
  const parts: string[] = [];
  let cur: TSESTree.Node | null = expr;
  while (cur) {
    if (cur.type === AST_NODE_TYPES.MemberExpression) {
      if (cur.property.type === AST_NODE_TYPES.Identifier && !cur.computed) {
        parts.unshift(cur.property.name);
      } else if (cur.property.type === AST_NODE_TYPES.Literal && cur.computed) {
        parts.unshift(`[${JSON.stringify(cur.property.value)}]`);
      } else {
        parts.unshift("<expr>");
      }
      cur = cur.object;
    } else if (cur.type === AST_NODE_TYPES.Identifier) {
      parts.unshift(cur.name);
      cur = null;
    } else if (cur.type === AST_NODE_TYPES.ThisExpression) {
      parts.unshift("this");
      cur = null;
    } else {
      parts.unshift("<expr>");
      cur = null;
    }
  }
  return parts.join(".").replace(/\.(\[[^\]]+\])/g, "$1");
}
