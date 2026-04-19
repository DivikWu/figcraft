import { isButtonKind, isLinkKind } from '../../interactive/taxonomy.js';
import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';
import { tr } from '../../types.js';

const BUTTON_NAME_RE = /button|btn|submit|cta|sign.?in|sign.?up|log.?in|登录|注册/i;
const INPUT_NAME_RE = /input|field|text.?field|search.?bar|邮箱|密码|用户名|email|password|username/i;

function isInteractiveShell(node: AbstractNode): boolean {
  // ── Classifier takes precedence ──
  const ikind = node.interactive?.kind;
  if (ikind) {
    if (isButtonKind(ikind)) return true;
    if (isLinkKind(ikind)) return false; // links aren't "shells"; don't double-report
    // Other kinds (toggle/checkbox/etc.) — treat as shell
    return true;
  }
  // ── Declaration-driven: role overrides all heuristics ──
  if (node.role === 'button' || node.role === 'input' || node.role === 'field') return true;
  if (node.role && node.role !== 'button' && node.role !== 'input' && node.role !== 'field') return false;

  if (node.type !== 'FRAME' && node.type !== 'COMPONENT' && node.type !== 'INSTANCE') return false;
  const hasDirectTextChild = node.children?.some((child) => child.type === 'TEXT') ?? false;
  const compactShell = (node.children?.length ?? 0) <= 3;
  return compactShell && hasDirectTextChild && (BUTTON_NAME_RE.test(node.name) || INPUT_NAME_RE.test(node.name));
}

export const nestedInteractiveShellRule: LintRule = {
  name: 'nested-interactive-shell',
  description: 'Interactive shells should not be wrapped inside another interactive shell.',
  category: 'layout',
  severity: 'error',
  // Inside a mis-wrapped button/input shell, structural checks on the inner shell
  // will double-report what's really one problem — collapse the wrapper first.
  suppressesInSubtree: [
    'button-solid-structure',
    'button-outline-structure',
    'button-ghost-structure',
    'button-text-structure',
    'button-icon-structure',
    'link-standalone-structure',
    'input-field-structure',
  ],

  check(node: AbstractNode, ctx: LintContext): LintViolation[] {
    if (!isInteractiveShell(node) || !node.children || node.children.length === 0) return [];

    return node.children
      .filter((child) => child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE')
      .filter(isInteractiveShell)
      .map((child) => ({
        nodeId: child.id,
        nodeName: child.name,
        rule: 'nested-interactive-shell',
        severity: 'error' as const,
        currentValue: `${node.name} -> ${child.name}`,
        suggestion: tr(
          ctx.lang,
          `"${child.name}" is nested inside interactive shell "${node.name}". Collapse duplicate button/input wrappers so only one shell owns the interaction.`,
          `「${child.name}」嵌套在交互容器「${node.name}」内。请合并重复的 button/input 包装,确保只有一个容器拥有交互。`,
        ),
        autoFixable: false,
      }));
  },
};
