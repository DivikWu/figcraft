import type { AbstractNode, LintContext } from '../../packages/quality-engine/src/types.js';

export const screenBenchmarkContext: LintContext = {
  colorTokens: new Map(),
  spacingTokens: new Map(),
  radiusTokens: new Map(),
  typographyTokens: new Map(),
  variableIds: new Map(),
};

export function benchmarkNode(overrides: Partial<AbstractNode>): AbstractNode {
  return { id: '1:1', name: 'Node', type: 'FRAME', visible: true, ...overrides };
}

function buildMobileScreen(options: {
  id: string;
  name: string;
  itemSpacing?: number;
  children: AbstractNode[];
}): AbstractNode {
  return benchmarkNode({
    id: options.id,
    name: options.name,
    role: 'screen',
    width: 402,
    height: 874,
    layoutMode: 'VERTICAL',
    itemSpacing: options.itemSpacing ?? 20,
    children: options.children,
  });
}

function _buildDesktopScreen(options: {
  id: string;
  name: string;
  itemSpacing?: number;
  children: AbstractNode[];
}): AbstractNode {
  return benchmarkNode({
    id: options.id,
    name: options.name,
    role: 'screen',
    width: 1440,
    height: 1024,
    layoutMode: 'VERTICAL',
    itemSpacing: options.itemSpacing ?? 24,
    children: options.children,
  });
}

export const screenBenchmarkRules = [
  'header-fragmented',
  'header-out-of-band',
  'cta-width-inconsistent',
  'section-spacing-collapse',
  'screen-bottom-overflow',
  'social-row-cramped',
  'nav-overcrowded',
  'stats-row-cramped',
  'root-misclassified-interactive',
  'nested-interactive-shell',
  'screen-shell-invalid',
] as const;

export interface ScreenBenchmarkCase {
  id: string;
  name: string;
  expected: 'clean' | 'flagged';
  nodes: AbstractNode[];
  minViolations?: number;
  requiredRules?: string[];
}

export const screenBenchmarkCases: ScreenBenchmarkCase[] = [
  {
    id: 'auth-welcome-clean',
    name: 'Healthy welcome screen',
    expected: 'clean',
    nodes: [
      buildMobileScreen({
        id: 'screen:welcome',
        name: 'Welcome',
        children: [
          benchmarkNode({ id: 'header:welcome', name: 'Header', role: 'header', y: 56, width: 402, height: 88 }),
          benchmarkNode({ id: 'hero:welcome', name: 'Hero', role: 'hero', y: 176, width: 402, height: 240 }),
          benchmarkNode({ id: 'actions:welcome', name: 'Actions', role: 'actions', y: 456, width: 402, height: 112 }),
          benchmarkNode({ id: 'footer:welcome', name: 'Footer', role: 'footer', y: 704, width: 402, height: 88 }),
        ],
      }),
    ],
  },
  {
    id: 'auth-sign-in-clean',
    name: 'Healthy sign-in screen',
    expected: 'clean',
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Sign In',
        role: 'screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        itemSpacing: 20,
        children: [
          benchmarkNode({ id: 'header:1', name: 'Header', role: 'header', y: 64, width: 402, height: 88 }),
          benchmarkNode({
            id: 'form:1',
            name: 'Login Form',
            role: 'form',
            y: 180,
            width: 402,
            layoutMode: 'VERTICAL',
            itemSpacing: 16,
            children: [
              benchmarkNode({ id: 'field:1', name: 'Email Input', role: 'input', width: 354, height: 48 }),
              benchmarkNode({ id: 'field:2', name: 'Password Input', role: 'input', width: 354, height: 48 }),
              benchmarkNode({ id: 'cta:1', name: 'Sign In Button', role: 'button', width: 354, height: 48 }),
            ],
          }),
          benchmarkNode({ id: 'footer:1', name: 'Footer', role: 'footer', y: 700, width: 402, height: 96 }),
        ],
      }),
    ],
  },
  {
    id: 'auth-sign-up-clean',
    name: 'Healthy sign-up screen',
    expected: 'clean',
    nodes: [
      buildMobileScreen({
        id: 'screen:sign-up',
        name: 'Sign Up',
        children: [
          benchmarkNode({ id: 'header:sign-up', name: 'Header', role: 'header', y: 56, width: 402, height: 96 }),
          benchmarkNode({
            id: 'form:sign-up',
            name: 'Signup Form',
            role: 'form',
            y: 184,
            width: 402,
            layoutMode: 'VERTICAL',
            itemSpacing: 16,
            children: [
              benchmarkNode({ id: 'field:sign-up-name', name: 'Name Input', role: 'input', width: 354, height: 48 }),
              benchmarkNode({ id: 'field:sign-up-email', name: 'Email Input', role: 'input', width: 354, height: 48 }),
              benchmarkNode({
                id: 'field:sign-up-password',
                name: 'Password Input',
                role: 'input',
                width: 354,
                height: 48,
              }),
              benchmarkNode({
                id: 'cta:sign-up',
                name: 'Create Account Button',
                role: 'button',
                width: 354,
                height: 48,
              }),
            ],
          }),
          benchmarkNode({ id: 'footer:sign-up', name: 'Footer', role: 'footer', y: 724, width: 402, height: 88 }),
        ],
      }),
    ],
  },
  {
    id: 'auth-forgot-password-clean',
    name: 'Healthy forgot-password screen',
    expected: 'clean',
    nodes: [
      buildMobileScreen({
        id: 'screen:forgot-password',
        name: 'Forgot Password',
        children: [
          benchmarkNode({
            id: 'header:forgot-password',
            name: 'Header',
            role: 'header',
            y: 56,
            width: 402,
            height: 96,
          }),
          benchmarkNode({
            id: 'form:forgot-password',
            name: 'Reset Form',
            role: 'form',
            y: 188,
            width: 402,
            layoutMode: 'VERTICAL',
            itemSpacing: 16,
            children: [
              benchmarkNode({
                id: 'field:forgot-password-email',
                name: 'Email Input',
                role: 'input',
                width: 354,
                height: 48,
              }),
              benchmarkNode({
                id: 'cta:forgot-password',
                name: 'Reset Password Button',
                role: 'button',
                width: 354,
                height: 48,
              }),
            ],
          }),
          benchmarkNode({
            id: 'footer:forgot-password',
            name: 'Footer',
            role: 'footer',
            y: 706,
            width: 402,
            height: 88,
          }),
        ],
      }),
    ],
  },
  {
    id: 'auth-sign-in-broken',
    name: 'Broken auth screen',
    expected: 'flagged',
    minViolations: 4,
    requiredRules: ['header-out-of-band', 'cta-width-inconsistent', 'screen-bottom-overflow', 'social-row-cramped'],
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Sign In',
        role: 'screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        itemSpacing: 8,
        children: [
          benchmarkNode({
            id: 'header:1',
            name: 'Header',
            role: 'header',
            type: 'FRAME',
            y: 220,
            width: 402,
            height: 88,
          }),
          benchmarkNode({
            id: 'form:1',
            name: 'Login Form',
            role: 'form',
            y: 300,
            width: 402,
            layoutMode: 'VERTICAL',
            itemSpacing: 12,
            children: [
              benchmarkNode({ id: 'field:1', name: 'Email Input', role: 'input', width: 354, height: 48 }),
              benchmarkNode({ id: 'cta:1', name: 'Sign In Button', role: 'button', width: 220, height: 48 }),
              benchmarkNode({
                id: 'social:1',
                name: 'Social Login Row',
                role: 'social_row',
                width: 260,
                height: 48,
                layoutMode: 'HORIZONTAL',
                itemSpacing: 16,
                children: [
                  benchmarkNode({ id: 'social:apple', name: 'Apple Button', role: 'button', width: 96, height: 48 }),
                  benchmarkNode({ id: 'social:google', name: 'Google Button', role: 'button', width: 96, height: 48 }),
                  benchmarkNode({
                    id: 'social:facebook',
                    name: 'Facebook Button',
                    role: 'button',
                    width: 96,
                    height: 48,
                  }),
                ],
              }),
            ],
          }),
          benchmarkNode({ id: 'actions:1', name: 'Actions', role: 'actions', y: 710, width: 402, height: 64 }),
          benchmarkNode({ id: 'footer:1', name: 'Footer', role: 'footer', y: 830, width: 402, height: 96 }),
        ],
      }),
    ],
  },
  {
    id: 'dashboard-clean',
    name: 'Healthy dashboard screen',
    expected: 'clean',
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Dashboard',
        role: 'screen',
        width: 1440,
        height: 1024,
        layoutMode: 'VERTICAL',
        itemSpacing: 24,
        children: [
          benchmarkNode({ id: 'header:1', name: 'Header', role: 'header', y: 32, width: 1440, height: 88 }),
          benchmarkNode({ id: 'hero:1', name: 'Hero', role: 'hero', y: 144, width: 1440, height: 180 }),
          benchmarkNode({ id: 'content:1', name: 'Content', role: 'content', y: 356, width: 1440, height: 520 }),
        ],
      }),
    ],
  },
  {
    id: 'settings-clean',
    name: 'Healthy settings screen',
    expected: 'clean',
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Settings',
        role: 'screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        itemSpacing: 24,
        children: [
          benchmarkNode({ id: 'header:1', name: 'Header', role: 'header', y: 56, width: 402, height: 96 }),
          benchmarkNode({ id: 'prefs:1', name: 'Preferences', role: 'content', y: 176, width: 402, height: 520 }),
          benchmarkNode({ id: 'footer:1', name: 'Footer', role: 'footer', y: 724, width: 402, height: 96 }),
        ],
      }),
    ],
  },
  {
    id: 'checkout-clean',
    name: 'Healthy checkout screen',
    expected: 'clean',
    nodes: [
      buildMobileScreen({
        id: 'screen:checkout',
        name: 'Checkout',
        children: [
          benchmarkNode({ id: 'header:checkout', name: 'Header', role: 'header', y: 56, width: 402, height: 88 }),
          benchmarkNode({ id: 'content:checkout', name: 'Content', role: 'content', y: 168, width: 402, height: 456 }),
          benchmarkNode({ id: 'actions:checkout', name: 'Actions', role: 'actions', y: 652, width: 402, height: 104 }),
        ],
      }),
    ],
  },
  {
    id: 'profile-clean',
    name: 'Healthy profile screen',
    expected: 'clean',
    nodes: [
      buildMobileScreen({
        id: 'screen:profile',
        name: 'Profile',
        children: [
          benchmarkNode({ id: 'header:profile', name: 'Header', role: 'header', y: 56, width: 402, height: 96 }),
          benchmarkNode({ id: 'hero:profile', name: 'Hero', role: 'hero', y: 176, width: 402, height: 168 }),
          benchmarkNode({ id: 'content:profile', name: 'Content', role: 'content', y: 372, width: 402, height: 340 }),
          benchmarkNode({ id: 'footer:profile', name: 'Footer', role: 'footer', y: 736, width: 402, height: 88 }),
        ],
      }),
    ],
  },
  {
    id: 'empty-state-clean',
    name: 'Healthy empty-state screen',
    expected: 'clean',
    nodes: [
      buildMobileScreen({
        id: 'screen:empty-state',
        name: 'Empty State',
        children: [
          benchmarkNode({ id: 'header:empty-state', name: 'Header', role: 'header', y: 56, width: 402, height: 88 }),
          benchmarkNode({ id: 'hero:empty-state', name: 'Hero', role: 'hero', y: 192, width: 402, height: 220 }),
          benchmarkNode({
            id: 'actions:empty-state',
            name: 'Actions',
            role: 'actions',
            y: 452,
            width: 402,
            height: 96,
          }),
        ],
      }),
    ],
  },
  {
    id: 'pricing-clean',
    name: 'Healthy pricing screen',
    expected: 'clean',
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Pricing',
        role: 'screen',
        width: 1440,
        height: 1024,
        layoutMode: 'VERTICAL',
        itemSpacing: 24,
        children: [
          benchmarkNode({ id: 'header:1', name: 'Header', role: 'header', y: 32, width: 1440, height: 88 }),
          benchmarkNode({ id: 'hero:1', name: 'Hero', role: 'hero', y: 144, width: 1440, height: 160 }),
          benchmarkNode({
            id: 'content:1',
            name: 'Content',
            role: 'content',
            y: 336,
            width: 1440,
            height: 560,
            children: [
              benchmarkNode({ id: 'card:1', name: 'Starter Card', role: 'card', y: 0, width: 320, height: 260 }),
              benchmarkNode({ id: 'card:2', name: 'Pro Card', role: 'card', y: 0, width: 320, height: 260 }),
              benchmarkNode({ id: 'card:3', name: 'Enterprise Card', role: 'card', y: 0, width: 320, height: 260 }),
            ],
          }),
        ],
      }),
    ],
  },
  {
    id: 'pricing-broken',
    name: 'Broken pricing screen',
    expected: 'flagged',
    minViolations: 3,
    requiredRules: ['header-out-of-band', 'section-spacing-collapse', 'screen-bottom-overflow'],
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Pricing',
        role: 'screen',
        width: 1440,
        height: 1024,
        layoutMode: 'VERTICAL',
        itemSpacing: 6,
        children: [
          benchmarkNode({ id: 'header:1', name: 'Header', role: 'header', y: 220, width: 1440, height: 88 }),
          benchmarkNode({ id: 'hero:1', name: 'Hero', role: 'hero', y: 340, width: 1440, height: 180 }),
          benchmarkNode({ id: 'content:1', name: 'Content', role: 'content', y: 540, width: 1440, height: 560 }),
        ],
      }),
    ],
  },
  {
    id: 'analytics-clean',
    name: 'Healthy analytics screen',
    expected: 'clean',
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Analytics',
        role: 'screen',
        width: 1440,
        height: 1024,
        layoutMode: 'VERTICAL',
        itemSpacing: 20,
        children: [
          benchmarkNode({ id: 'header:1', name: 'Header', role: 'header', y: 24, width: 1440, height: 80 }),
          benchmarkNode({ id: 'nav:1', name: 'Primary Nav', role: 'nav', y: 116, width: 1440, height: 56 }),
          benchmarkNode({ id: 'stats:1', name: 'Metrics', role: 'stats', y: 192, width: 1440, height: 120 }),
          benchmarkNode({
            id: 'list:1',
            name: 'Activity List',
            role: 'list',
            y: 340,
            width: 1440,
            height: 520,
            children: [
              benchmarkNode({ id: 'row:1', name: 'Activity Row', role: 'row', y: 0, width: 1392, height: 72 }),
              benchmarkNode({ id: 'row:2', name: 'Activity Row', role: 'row', y: 84, width: 1392, height: 72 }),
              benchmarkNode({ id: 'row:3', name: 'Activity Row', role: 'row', y: 168, width: 1392, height: 72 }),
            ],
          }),
        ],
      }),
    ],
  },
  {
    id: 'root-misclassified-auth',
    name: 'Misclassified auth root',
    expected: 'flagged',
    minViolations: 1,
    requiredRules: ['root-misclassified-interactive'],
    nodes: [
      benchmarkNode({
        id: 'screen:root-misclassified',
        name: 'Sign In',
        role: 'button',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        children: [
          benchmarkNode({ id: 'header:mis', name: 'Header', role: 'header', y: 64, width: 402, height: 88 }),
          benchmarkNode({ id: 'form:mis', name: 'Login Form', role: 'form', y: 180, width: 402, height: 320 }),
        ],
      }),
    ],
  },
  {
    id: 'nested-interactive-auth',
    name: 'Nested interactive shell in auth form',
    expected: 'flagged',
    minViolations: 1,
    requiredRules: ['nested-interactive-shell'],
    nodes: [
      benchmarkNode({
        id: 'screen:nested',
        name: 'Sign Up',
        role: 'screen',
        width: 402,
        height: 874,
        layoutMode: 'VERTICAL',
        itemSpacing: 20,
        children: [
          benchmarkNode({
            id: 'field:nested-parent',
            name: 'Email Input',
            role: 'input',
            width: 354,
            height: 48,
            y: 180,
            children: [
              benchmarkNode({ id: 'field:nested-child', name: 'Inner Input', role: 'input', width: 320, height: 48 }),
            ],
          }),
        ],
      }),
    ],
  },
  {
    id: 'analytics-broken',
    name: 'Broken analytics screen',
    expected: 'flagged',
    minViolations: 3,
    requiredRules: ['nav-overcrowded', 'stats-row-cramped', 'screen-bottom-overflow'],
    nodes: [
      benchmarkNode({
        id: 'screen:1',
        name: 'Analytics',
        role: 'screen',
        width: 1440,
        height: 1024,
        layoutMode: 'VERTICAL',
        itemSpacing: 16,
        children: [
          benchmarkNode({ id: 'header:1', name: 'Header', role: 'header', y: 24, width: 1440, height: 80 }),
          benchmarkNode({
            id: 'nav:1',
            name: 'Primary Nav',
            role: 'nav',
            y: 116,
            width: 240,
            height: 56,
            layoutMode: 'HORIZONTAL',
            itemSpacing: 16,
            children: [
              benchmarkNode({ id: 'nav:overview', name: 'Overview', width: 80, height: 40 }),
              benchmarkNode({ id: 'nav:reports', name: 'Reports', width: 80, height: 40 }),
              benchmarkNode({ id: 'nav:customers', name: 'Customers', width: 96, height: 40 }),
            ],
          }),
          benchmarkNode({
            id: 'stats:1',
            name: 'Metrics',
            role: 'stats',
            y: 192,
            width: 640,
            height: 120,
            layoutMode: 'HORIZONTAL',
            itemSpacing: 24,
            paddingLeft: 24,
            paddingRight: 24,
            children: [
              benchmarkNode({ id: 'card:1', name: 'Revenue Card', role: 'card', width: 220, height: 120 }),
              benchmarkNode({ id: 'card:2', name: 'MRR Card', role: 'card', width: 220, height: 120 }),
              benchmarkNode({ id: 'card:3', name: 'Churn Card', role: 'card', width: 220, height: 120 }),
            ],
          }),
          benchmarkNode({ id: 'list:1', name: 'Activity List', role: 'list', y: 940, width: 1440, height: 140 }),
        ],
      }),
    ],
  },
  {
    id: 'screen-shell-invalid-checkout',
    name: 'Invalid checkout shell',
    expected: 'flagged',
    minViolations: 1,
    requiredRules: ['screen-shell-invalid'],
    nodes: [
      benchmarkNode({
        id: 'screen:invalid-shell',
        name: 'Checkout',
        role: 'screen',
        width: 402,
        height: 874,
        layoutMode: 'HORIZONTAL',
        children: [
          benchmarkNode({ id: 'header:invalid-shell', name: 'Header', role: 'header', y: 64, width: 402, height: 88 }),
          benchmarkNode({
            id: 'content:invalid-shell',
            name: 'Content',
            role: 'content',
            y: 180,
            width: 402,
            height: 420,
          }),
        ],
      }),
    ],
  },
];
