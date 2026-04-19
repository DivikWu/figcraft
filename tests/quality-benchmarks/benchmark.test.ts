/**
 * Quality benchmark tests — standard UI scenarios evaluated against lint rules.
 *
 * Each scenario defines a "golden" AbstractNode tree representing a well-designed UI,
 * plus quality criteria (rules that MUST pass). This catches regressions when lint
 * rules are modified: if a rule change causes a previously clean scenario to fail,
 * the benchmark flags it.
 *
 * To add a new scenario: add an entry to SCENARIOS below.
 * To update a baseline: fix the node tree to pass the new rule, don't weaken the criteria.
 */

import { describe, expect, it } from 'vitest';
import { getAvailableRules, runLint } from '../../packages/quality-engine/src/engine.js';
import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

const emptyCtx: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

// ─── Helper ───

function n(overrides: Partial<AbstractNode> & { id: string; name: string }): AbstractNode {
  return { type: 'FRAME', ...overrides };
}

function text(id: string, name: string, chars: string, fontSize = 16): AbstractNode {
  return {
    id,
    name,
    type: 'TEXT',
    characters: chars,
    fontSize,
    textAutoResize: 'HEIGHT',
    width: 350,
    height: 24,
    parentWidth: 402,
  };
}

// ─── Scenario type ───

interface BenchmarkScenario {
  name: string;
  description: string;
  nodes: AbstractNode[];
  /** Rules that MUST produce zero violations for this scenario. */
  mustPass: string[];
  /** Rules that SHOULD pass but are allowed to have minor violations. */
  shouldPass?: string[];
}

// ─── Scenarios ───

const SCENARIOS: BenchmarkScenario[] = [
  {
    name: 'iOS Login - Minimal',
    description: 'Standard iOS login screen with email/password fields, CTA, social login',
    nodes: [
      n({
        id: '1:1',
        name: 'Login Screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'SPACE_BETWEEN',
        paddingLeft: 24,
        paddingRight: 24,
        paddingTop: 60,
        paddingBottom: 34,
        fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
        clipsContent: true,
        children: [
          // Top content
          n({
            id: '2:1',
            name: 'Top Content',
            layoutMode: 'VERTICAL',
            itemSpacing: 24,
            width: 354,
            height: 120,
            children: [
              text('3:1', 'Heading', 'Welcome back', 28),
              text('3:2', 'Subheading', 'Sign in to continue', 16),
            ],
          }),
          // Form
          n({
            id: '2:2',
            name: 'Form',
            layoutMode: 'VERTICAL',
            itemSpacing: 16,
            width: 354,
            height: 250,
            children: [
              // Email input
              n({
                id: '4:1',
                name: 'Email Input',
                layoutMode: 'HORIZONTAL',
                width: 354,
                height: 52,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 14,
                paddingBottom: 14,
                cornerRadius: 12,
                strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }],
                strokeWeight: 1,
                children: [text('5:1', 'Email Placeholder', 'Email address', 16)],
              }),
              // Password input
              n({
                id: '4:2',
                name: 'Password Input',
                layoutMode: 'HORIZONTAL',
                width: 354,
                height: 52,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 14,
                paddingBottom: 14,
                cornerRadius: 12,
                strokes: [{ type: 'SOLID', color: '#E0E0E0', visible: true }],
                strokeWeight: 1,
                children: [text('5:2', 'Password Placeholder', 'Password', 16)],
              }),
              // CTA button
              n({
                id: '4:3',
                name: 'Sign In Button',
                layoutMode: 'HORIZONTAL',
                width: 354,
                height: 52,
                counterAxisAlignItems: 'CENTER',
                primaryAxisAlignItems: 'CENTER',
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 14,
                paddingBottom: 14,
                cornerRadius: 12,
                fills: [{ type: 'SOLID', color: '#1A1A2E', visible: true }],
                children: [
                  {
                    id: '5:3',
                    name: 'CTA Text',
                    type: 'TEXT',
                    characters: 'Sign In',
                    fontSize: 16,
                    width: 50,
                    height: 20,
                    parentWidth: 354,
                  } as AbstractNode,
                ],
              }),
            ],
          }),
          // Bottom content
          n({
            id: '2:3',
            name: 'Bottom Content',
            layoutMode: 'VERTICAL',
            itemSpacing: 16,
            width: 354,
            height: 100,
            children: [
              text('6:1', 'Divider Label', 'or continue with', 14),
              n({
                id: '6:2',
                name: 'Social Login Row',
                layoutMode: 'HORIZONTAL',
                itemSpacing: 12,
                width: 354,
                height: 48,
                children: [
                  n({
                    id: '7:1',
                    name: 'Google Icon',
                    width: 48,
                    height: 48,
                    cornerRadius: 12,
                    layoutMode: 'HORIZONTAL',
                    counterAxisAlignItems: 'CENTER',
                    primaryAxisAlignItems: 'CENTER',
                    paddingLeft: 12,
                    paddingRight: 12,
                    fills: [{ type: 'SOLID', color: '#F5F5F5', visible: true }],
                    children: [text('8:1', 'G Icon', 'G', 16)],
                  }),
                  n({
                    id: '7:2',
                    name: 'Apple Icon',
                    width: 48,
                    height: 48,
                    cornerRadius: 12,
                    layoutMode: 'HORIZONTAL',
                    counterAxisAlignItems: 'CENTER',
                    primaryAxisAlignItems: 'CENTER',
                    paddingLeft: 12,
                    paddingRight: 12,
                    fills: [{ type: 'SOLID', color: '#000000', visible: true }],
                    children: [text('8:2', 'A Icon', 'A', 16)],
                  }),
                ],
              }),
              text('6:3', 'Sign Up Link', "Don't have an account? Sign up", 14),
            ],
          }),
        ],
      }),
    ],
    mustPass: [
      'default-name', // All nodes have semantic names
      'input-field-structure', // Inputs have stroke + padding + cornerRadius
      'mobile-dimensions', // Screen is 402×874
      'empty-container', // No empty containers
    ],
    shouldPass: ['button-solid-structure', 'text-overflow', 'no-autolayout'],
  },

  {
    name: 'Dashboard - Stats + Chart',
    description: 'Mobile dashboard with stats row, chart placeholder, and activity list',
    nodes: [
      n({
        id: '1:1',
        name: 'Dashboard Screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'MIN',
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 16,
        paddingBottom: 16,
        itemSpacing: 16,
        fills: [{ type: 'SOLID', color: '#F5F5F5', visible: true }],
        children: [
          // Header
          n({
            id: '2:1',
            name: 'Header',
            layoutMode: 'HORIZONTAL',
            itemSpacing: 12,
            width: 370,
            height: 40,
            children: [text('3:1', 'Dashboard Title', 'Dashboard', 20)],
          }),
          // Stats row
          n({
            id: '2:2',
            name: 'Stats Row',
            layoutMode: 'HORIZONTAL',
            itemSpacing: 12,
            width: 370,
            height: 80,
            children: [
              n({
                id: '4:1',
                name: 'Stat Card / Revenue',
                layoutMode: 'VERTICAL',
                itemSpacing: 4,
                width: 116,
                height: 80,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 12,
                paddingBottom: 12,
                cornerRadius: 12,
                fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
                children: [text('5:1', 'Revenue Label', 'Revenue', 12), text('5:2', 'Revenue Value', '$12,400', 24)],
              }),
              n({
                id: '4:2',
                name: 'Stat Card / Users',
                layoutMode: 'VERTICAL',
                itemSpacing: 4,
                width: 116,
                height: 80,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 12,
                paddingBottom: 12,
                cornerRadius: 12,
                fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
                children: [text('5:3', 'Users Label', 'Users', 12), text('5:4', 'Users Value', '1,240', 24)],
              }),
              n({
                id: '4:3',
                name: 'Stat Card / Orders',
                layoutMode: 'VERTICAL',
                itemSpacing: 4,
                width: 116,
                height: 80,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 12,
                paddingBottom: 12,
                cornerRadius: 12,
                fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
                children: [text('5:5', 'Orders Label', 'Orders', 12), text('5:6', 'Orders Value', '384', 24)],
              }),
            ],
          }),
          // Chart area
          n({
            id: '2:3',
            name: 'Chart Area',
            layoutMode: 'VERTICAL',
            itemSpacing: 12,
            width: 370,
            height: 260,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 16,
            paddingBottom: 16,
            cornerRadius: 12,
            fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
            children: [
              text('6:1', 'Chart Title', 'Revenue this month', 16),
              n({
                id: '6:2',
                name: 'Chart Placeholder',
                width: 338,
                height: 200,
                fills: [{ type: 'SOLID', color: '#F0F0F0', visible: true }],
                children: [text('7:1', 'Chart Label', 'Chart visualization', 14)],
              }),
            ],
          }),
          // Activity list
          n({
            id: '2:4',
            name: 'Recent Activity',
            layoutMode: 'VERTICAL',
            itemSpacing: 0,
            width: 370,
            height: 200,
            children: [
              text('8:1', 'Section Header', 'Recent activity', 14),
              n({
                id: '9:1',
                name: 'Activity Item / Order #1234',
                layoutMode: 'HORIZONTAL',
                itemSpacing: 12,
                width: 370,
                height: 52,
                paddingLeft: 12,
                paddingRight: 12,
                paddingTop: 14,
                paddingBottom: 14,
                children: [
                  text('10:1', 'Activity Title', 'New order #1234', 16),
                  text('10:2', 'Activity Time', '2m ago', 14),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
    mustPass: ['default-name', 'empty-container', 'mobile-dimensions', 'no-autolayout'],
    shouldPass: ['stats-row-cramped', 'wcag-text-size'],
  },

  {
    name: 'Settings Screen',
    description: 'iOS settings with section headers and toggle rows',
    nodes: [
      n({
        id: '1:1',
        name: 'Settings Screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'MIN',
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 16,
        paddingBottom: 34,
        itemSpacing: 24,
        fills: [{ type: 'SOLID', color: '#F2F2F7', visible: true }],
        children: [
          // Header
          n({
            id: '2:1',
            name: 'Header',
            layoutMode: 'HORIZONTAL',
            width: 402,
            height: 44,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 10,
            paddingBottom: 10,
            children: [text('3:1', 'Settings Title', 'Settings', 20)],
          }),
          // Account section
          n({
            id: '2:2',
            name: 'Section / Account',
            layoutMode: 'VERTICAL',
            itemSpacing: 0,
            width: 402,
            height: 160,
            children: [
              text('4:1', 'Account Header', 'ACCOUNT', 12),
              n({
                id: '4:2',
                name: 'Settings Row / Profile',
                layoutMode: 'HORIZONTAL',
                itemSpacing: 12,
                width: 402,
                height: 52,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 14,
                paddingBottom: 14,
                fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
                children: [text('5:1', 'Profile Label', 'Profile', 16), text('5:2', 'Chevron', '>', 16)],
              }),
              n({
                id: '4:3',
                name: 'Settings Row / Notifications',
                layoutMode: 'HORIZONTAL',
                itemSpacing: 12,
                width: 402,
                height: 52,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 14,
                paddingBottom: 14,
                fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
                children: [text('5:3', 'Notifications Label', 'Notifications', 16)],
              }),
            ],
          }),
        ],
      }),
    ],
    mustPass: ['default-name', 'empty-container', 'mobile-dimensions'],
    shouldPass: ['form-consistency'],
  },

  {
    name: 'Profile Screen',
    description: 'User profile with avatar, stats, and action buttons',
    nodes: [
      n({
        id: '1:1',
        name: 'Profile Screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'MIN',
        paddingLeft: 0,
        paddingRight: 0,
        paddingTop: 0,
        paddingBottom: 34,
        itemSpacing: 0,
        fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
        children: [
          // Hero area
          n({
            id: '2:1',
            name: 'Hero Area',
            layoutMode: 'VERTICAL',
            counterAxisAlignItems: 'CENTER',
            width: 402,
            height: 280,
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 40,
            paddingBottom: 24,
            itemSpacing: 12,
            children: [
              n({
                id: '3:1',
                name: 'Avatar',
                width: 96,
                height: 96,
                cornerRadius: 9999,
                fills: [{ type: 'SOLID', color: '#E0E0E0', visible: true }],
                children: [text('4:0', 'Avatar Initial', 'J', 32)],
              }),
              text('3:2', 'User Name', 'Jane Cooper', 22),
              text('3:3', 'User Handle', '@janecooper', 14),
              n({
                id: '3:4',
                name: 'Action Row',
                layoutMode: 'HORIZONTAL',
                itemSpacing: 12,
                width: 200,
                height: 48,
                children: [
                  n({
                    id: '4:1',
                    name: 'Edit Profile Button',
                    layoutMode: 'HORIZONTAL',
                    width: 130,
                    height: 48,
                    counterAxisAlignItems: 'CENTER',
                    primaryAxisAlignItems: 'CENTER',
                    paddingLeft: 16,
                    paddingRight: 16,
                    paddingTop: 12,
                    paddingBottom: 12,
                    cornerRadius: 12,
                    fills: [{ type: 'SOLID', color: '#1A1A2E', visible: true }],
                    children: [text('5:1', 'Edit Label', 'Edit Profile', 16)],
                  }),
                ],
              }),
            ],
          }),
          // Stats row
          n({
            id: '2:2',
            name: 'Stats Row',
            layoutMode: 'HORIZONTAL',
            itemSpacing: 0,
            width: 402,
            height: 60,
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 12,
            paddingBottom: 12,
            children: [
              n({
                id: '6:1',
                name: 'Stat / Posts',
                layoutMode: 'VERTICAL',
                counterAxisAlignItems: 'CENTER',
                width: 123,
                height: 36,
                children: [text('7:1', 'Posts Value', '142', 18), text('7:2', 'Posts Label', 'Posts', 12)],
              }),
              n({
                id: '6:2',
                name: 'Stat / Followers',
                layoutMode: 'VERTICAL',
                counterAxisAlignItems: 'CENTER',
                width: 123,
                height: 36,
                children: [text('7:3', 'Followers Value', '2.4K', 18), text('7:4', 'Followers Label', 'Followers', 12)],
              }),
              n({
                id: '6:3',
                name: 'Stat / Following',
                layoutMode: 'VERTICAL',
                counterAxisAlignItems: 'CENTER',
                width: 123,
                height: 36,
                children: [text('7:5', 'Following Value', '380', 18), text('7:6', 'Following Label', 'Following', 12)],
              }),
            ],
          }),
        ],
      }),
    ],
    mustPass: ['default-name', 'empty-container', 'mobile-dimensions'],
    shouldPass: ['button-solid-structure', 'stats-row-cramped'],
  },

  {
    name: 'Card Grid - Products',
    description: 'Product card grid with images, titles, and prices',
    nodes: [
      n({
        id: '1:1',
        name: 'Products Screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        primaryAxisAlignItems: 'MIN',
        paddingLeft: 16,
        paddingRight: 16,
        paddingTop: 16,
        paddingBottom: 16,
        itemSpacing: 16,
        fills: [{ type: 'SOLID', color: '#FFFFFF', visible: true }],
        children: [
          text('2:0', 'Page Title', 'Products', 24),
          // Card row 1
          n({
            id: '2:1',
            name: 'Card Row 1',
            layoutMode: 'HORIZONTAL',
            itemSpacing: 12,
            width: 370,
            height: 240,
            children: [
              n({
                id: '3:1',
                name: 'Card / Headphones',
                layoutMode: 'VERTICAL',
                width: 179,
                height: 240,
                cornerRadius: 16,
                clipsContent: true,
                fills: [{ type: 'SOLID', color: '#FAFAFA', visible: true }],
                children: [
                  n({
                    id: '4:1',
                    name: 'Card Image',
                    width: 179,
                    height: 140,
                    fills: [{ type: 'SOLID', color: '#F0F0F0', visible: true }],
                    children: [text('5:0', 'Image Label', 'Product photo', 12)],
                  }),
                  n({
                    id: '4:2',
                    name: 'Card Content',
                    layoutMode: 'VERTICAL',
                    itemSpacing: 4,
                    width: 179,
                    height: 100,
                    paddingLeft: 12,
                    paddingRight: 12,
                    paddingTop: 12,
                    paddingBottom: 12,
                    children: [
                      text('5:1', 'Product Name', 'Wireless Headphones', 16),
                      text('5:2', 'Product Price', '$79.99', 14),
                    ],
                  }),
                ],
              }),
              n({
                id: '3:2',
                name: 'Card / Speaker',
                layoutMode: 'VERTICAL',
                width: 179,
                height: 240,
                cornerRadius: 16,
                clipsContent: true,
                fills: [{ type: 'SOLID', color: '#FAFAFA', visible: true }],
                children: [
                  n({
                    id: '4:3',
                    name: 'Card Image',
                    width: 179,
                    height: 140,
                    fills: [{ type: 'SOLID', color: '#F0F0F0', visible: true }],
                    children: [text('5:3', 'Image Label', 'Product photo', 12)],
                  }),
                  n({
                    id: '4:4',
                    name: 'Card Content',
                    layoutMode: 'VERTICAL',
                    itemSpacing: 4,
                    width: 179,
                    height: 100,
                    paddingLeft: 12,
                    paddingRight: 12,
                    paddingTop: 12,
                    paddingBottom: 12,
                    children: [
                      text('5:4', 'Product Name', 'Portable Speaker', 16),
                      text('5:5', 'Product Price', '$49.99', 14),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
    mustPass: ['default-name', 'empty-container', 'mobile-dimensions'],
    shouldPass: ['no-autolayout'],
  },
];

// ─── Test runner ───

describe('Quality Benchmarks', () => {
  const allRuleNames = getAvailableRules().map((r) => r.name);
  const resolveRuleNames = (name: string): string[] => (allRuleNames.includes(name) ? [name] : []);

  for (const scenario of SCENARIOS) {
    describe(scenario.name, () => {
      const report = runLint(scenario.nodes, emptyCtx);

      // Collect violations by rule
      const violationsByRule = new Map<string, number>();
      for (const cat of report.categories) {
        violationsByRule.set(cat.rule, (violationsByRule.get(cat.rule) ?? 0) + cat.nodes.length);
      }

      for (const ruleName of scenario.mustPass) {
        it(`MUST PASS: ${ruleName}`, () => {
          const resolved = resolveRuleNames(ruleName);
          expect(resolved.length, `Rule "${ruleName}" not found in engine`).toBeGreaterThan(0);
          const count = resolved.reduce((sum, r) => sum + (violationsByRule.get(r) ?? 0), 0);
          expect(count, `${scenario.name} has ${count} "${ruleName}" violation(s)`).toBe(0);
        });
      }

      if (scenario.shouldPass) {
        for (const ruleName of scenario.shouldPass) {
          it(`SHOULD PASS: ${ruleName}`, () => {
            const resolved = resolveRuleNames(ruleName);
            expect(resolved.length, `Rule "${ruleName}" not found in engine`).toBeGreaterThan(0);
            const count = resolved.reduce((sum, r) => sum + (violationsByRule.get(r) ?? 0), 0);
            // shouldPass allows up to 2 minor violations
            expect(
              count,
              `${scenario.name} has ${count} "${ruleName}" violation(s) (should ideally be 0)`,
            ).toBeLessThanOrEqual(2);
          });
        }
      }

      it('quality score summary', () => {
        const totalViolations = report.summary.violations;
        const mustPassFailed = scenario.mustPass.filter((r) => (violationsByRule.get(r) ?? 0) > 0);
        console.log(
          `  📊 ${scenario.name}: ${totalViolations} violation(s), ` +
            `${mustPassFailed.length}/${scenario.mustPass.length} mustPass failed` +
            (violationsByRule.size > 0
              ? ` [${[...violationsByRule.entries()].map(([r, c]) => `${r}:${c}`).join(', ')}]`
              : ''),
        );
        expect(mustPassFailed).toHaveLength(0);
      });
    });
  }
});
