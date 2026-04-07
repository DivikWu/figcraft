import { SCREEN_NAME_RE } from '../../constants.js';
import type { AbstractNode, LintContext, LintRule, LintViolation } from '../../types.js';

const BUTTON_NAME_RE = /button|btn|submit|cta|sign.?in|sign.?up|log.?in|登录|注册/i;
const INPUT_NAME_RE = /input|field|text.?field|search.?bar|邮箱|密码|用户名|email|password|username/i;

function isInteractiveShell(node: AbstractNode): boolean {
  // ── Declaration-driven: role overrides all heuristics ──
  if (node.role === 'button' || node.role === 'input' || node.role === 'field') return true;
  if (node.role && node.role !== 'button' && node.role !== 'input' && node.role !== 'field') return false;

  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return false;
  const hasDirectTextChild = node.children?.some((child) => child.type === 'TEXT') ?? false;
  const compactShell = (node.children?.length ?? 0) <= 3;
  return compactShell && hasDirectTextChild && (BUTTON_NAME_RE.test(node.name) || INPUT_NAME_RE.test(node.name));
}

function looksLikeScreenRoot(node: AbstractNode): boolean {
  if (node.type !== 'FRAME' && node.type !== 'COMPONENT') return false;
  if (node.role === 'screen' || node.role === 'page') return true;
  const frameLikeChildren =
    node.children?.filter((child) => child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE')
      .length ?? 0;
  return (
    SCREEN_NAME_RE.test(node.name) && (node.width ?? 0) >= 360 && (node.height ?? 0) >= 640 && frameLikeChildren >= 2
  );
}

export const rootMisclassifiedInteractiveRule: LintRule = {
  name: 'root-misclassified-interactive',
  description: 'Screen roots must not be treated as button/input shells.',
  category: 'layout',
  severity: 'error',

  check(node: AbstractNode, _ctx: LintContext): LintViolation[] {
    if (!looksLikeScreenRoot(node) || !isInteractiveShell(node)) return [];
    return [
      {
        nodeId: node.id,
        nodeName: node.name,
        rule: 'root-misclassified-interactive',
        severity: 'error',
        currentValue: node.role ?? node.name,
        suggestion: `"${node.name}" looks like a screen root but is carrying button/input semantics. Reclassify it as a screen/container and move the interactive shell to a child node.`,
        autoFixable: false,
      },
    ];
  },
};
