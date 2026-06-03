/**
 * RuleTester suite for `@repo/qa-agent/no-non-literal-testid`.
 *
 * Covers §10.1 of artifacts/analysis/qa-agent-grammar-migration-plan.md —
 * one valid case per accepted form (1–4), and §10.2 — one invalid case
 * per rejected form with the expected messageId asserted.
 */

import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";

import { noNonLiteralTestid } from "../rules/no-non-literal-testid.js";

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.itOnly = it.only;
RuleTester.describe = describe;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaFeatures: { jsx: true },
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-non-literal-testid", noNonLiteralTestid, {
  valid: [
    // Form #1 — static string literal.
    { code: `const x = <div data-testid="login-submit" />;` },

    // Form #2 — template literal with simple identifier interpolation.
    {
      code: "function Row({ id }) { return <div data-testid={`row-${id}`} />; }",
    },

    // Form #2 — member-expression interpolation.
    {
      code: "function Row({ status }) { return <span data-testid={`badge-${status.code}`} />; }",
    },

    // Form #3 — ternary where both branches are literal / simple template.
    {
      code: "function Card({ isFirst, id }) { return <div data-testid={isFirst ? 'la-list-first-card' : `la-card-${id}`} />; }",
    },

    // Form #3 — ternary with `undefined` as the "no-attribute" branch.
    // Documented in-rule: this is the idiomatic opt-in scoped-testid
    // pattern used by packages/ui/src/components/data-table.tsx.
    {
      code: "function T({ testId, id }) { return <div data-testid={testId ? `${testId}-row-${id}` : undefined} />; }",
    },

    // Form #4 — pass-through of a component prop (destructured).
    {
      code: "function Badge({ testId }) { return <span data-testid={testId} />; }",
    },

    // Form #4 — pass-through via `props['data-testid']`.
    {
      code: "function Badge(props) { return <span data-testid={props['data-testid']} />; }",
    },

    // Form #4 — pass-through via `props.testId`.
    {
      code: "function Badge(props) { return <span data-testid={props.testId} />; }",
    },

    // Form #4 — arrow component assigned to an uppercase VariableDeclarator.
    {
      code: "const Badge = ({ testId }) => <span data-testid={testId} />;",
    },

    // Form #4 — `const Badge: FC<Props> = (props) => …`
    {
      code: "const Badge: FC<Props> = (props) => <span data-testid={props.testId} />;",
    },

    // Form #4 — Module.SubComponent assignment style.
    {
      code: "function Row() { return null; } Row.Header = (props) => <th data-testid={props.testId} />;",
    },
  ],

  invalid: [
    // Rejected — local const reference.
    {
      code: "function Foo() { const testid = 'x'; return <div data-testid={testid} />; }",
      errors: [
        {
          messageId: "localRef",
          data: { name: "testid" },
        },
      ],
    },

    // Rejected — helper call expression.
    {
      code: "function buildTestid(u) { return 'row-' + u; } function Foo({ user }) { return <div data-testid={buildTestid(user)} />; }",
      errors: [
        {
          messageId: "helperCall",
          data: { callee: "buildTestid" },
        },
      ],
    },

    // Rejected — imported / namespaced constant.
    {
      code: "import { TESTIDS } from './testids'; function Foo() { return <div data-testid={TESTIDS.LOGIN_SUBMIT} />; }",
      errors: [
        {
          messageId: "importedConst",
          data: { name: "TESTIDS.LOGIN_SUBMIT" },
        },
      ],
    },

    // Rejected — logical AND with a literal.
    {
      code: "function Foo({ cond }) { return <div data-testid={cond && 'foo-a'} />; }",
      errors: [
        {
          messageId: "logicalAnd",
        },
      ],
    },

    // Rejected — template literal with a call expression interpolation.
    {
      code: "function Foo({ role }) { return <div data-testid={`register-role-${role.toLowerCase()}`} />; }",
      errors: [
        {
          messageId: "callInInterpolation",
        },
      ],
    },

    // Rejected — closure param member access inside a `.map()` callback.
    // The enclosing arrow `(user) => …` is anonymous and lowercase, so
    // it fails the component-shaped heuristic. `user` is also NOT in the
    // prop-forward allowlist. Even though `user` is technically a
    // parameter of *some* enclosing function, the scanner cannot register
    // `user.id`, so this must be rejected.
    {
      code: "function UserList({ users }) { return users.map((user) => <tr data-testid={user.id} />); }",
      errors: [{ messageId: "localRef" }],
    },

    // Rejected — closure param bare identifier inside a `.map()` callback.
    {
      code: "function UserList({ users }) { return users.map((user) => <tr data-testid={user} />); }",
      errors: [{ messageId: "localRef" }],
    },

    // Rejected — even when the enclosing function IS component-shaped,
    // an identifier outside the allowlist is rejected. Consumers must
    // rename to `testId` / `testid` / `dataTestId`.
    {
      code: "function Button({ qaId }) { return <button data-testid={qaId} />; }",
      errors: [{ messageId: "localRef", data: { name: "qaId" } }],
    },

    // Rejected — lowercase helper function is not component-shaped, even
    // though its param name is in the allowlist.
    {
      code: "const renderRow = ({ testId }) => <tr data-testid={testId} />;",
      errors: [{ messageId: "localRef" }],
    },
  ],
});
