import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runLint } from '../packages/quality-engine/src/engine.js';
import type { LintReport } from '../packages/quality-engine/src/engine.js';
import type { AbstractNode } from '../packages/quality-engine/src/types.js';
import { screenBenchmarkCases, screenBenchmarkContext, screenBenchmarkRules } from '../tests/helpers/screen-benchmark-fixtures.js';
import { createDocumentLogic } from '../packages/core-mcp/src/tools/logic/write-node-logic.js';
import { createScreenLogic } from '../packages/core-mcp/src/tools/logic/create-screen-logic.js';

export interface BenchmarkResult {
  id: string;
  name: string;
  expected: 'clean' | 'flagged';
  passed: boolean;
  violations: number;
  bySeverity: LintReport['summary']['bySeverity'];
  triggeredRules: string[];
  rootMisclassificationCount: number;
  nestedInteractiveCount: number;
  screenShellInvalidCount: number;
  criticalCount: number;
  manualPatchesNeededEstimate: number;
  reason?: string;
}

export interface LogicPathComparison {
  id: string;
  name: string;
  passed: boolean;
  reason?: string;
  raw: {
    isError: boolean;
    finalViolations: number;
    criticalCount: number;
    fixedCount: number;
    stageCount: number;
    patchCallCount: number;
    patchNodeCount: number;
    lintFixCallCount: number;
    warningCount: number;
    structuralErrorCount: number;
    maxStageRemaining: number;
    rootMisclassificationCount: number;
    nestedInteractiveCount: number;
    screenShellInvalidCount: number;
    manualPatchesNeededEstimate: number;
    remainingRules: string[];
  };
  orchestrated: {
    isError: boolean;
    finalViolations: number;
    criticalCount: number;
    fixedCount: number;
    stageCount: number;
    patchCallCount: number;
    patchNodeCount: number;
    lintFixCallCount: number;
    warningCount: number;
    structuralErrorCount: number;
    maxStageRemaining: number;
    rootMisclassificationCount: number;
    nestedInteractiveCount: number;
    screenShellInvalidCount: number;
    manualPatchesNeededEstimate: number;
    remainingRules: string[];
  };
}

export interface LogicPathAggregate {
  cases: number;
  passed: number;
  failed: number;
  zeroResidualCases: number;
  totalFinalViolations: number;
  totalCriticalCount: number;
  totalFixedCount: number;
  totalPatchCallCount: number;
  totalPatchNodeCount: number;
  totalLintFixCallCount: number;
  totalWarningCount: number;
  totalStructuralErrorCount: number;
  totalRootMisclassificationCount: number;
  totalNestedInteractiveCount: number;
  totalScreenShellInvalidCount: number;
  totalManualPatchesNeededEstimate: number;
  maxStageRemaining: number;
  maxPatchCallCount: number;
  maxManualPatchesNeededEstimate: number;
  averageFinalViolations: number;
  averageStageCount: number;
  averageManualPatchesNeededEstimate: number;
}

export interface LogicPathSummary {
  cases: number;
  passed: number;
  failed: number;
  overallPassRate: number;
  authPassRate: number;
  improvedCases: number;
  reducedWarningCases: number;
  reducedResidualCases: number;
  raw: LogicPathAggregate;
  orchestrated: LogicPathAggregate;
}

export interface BenchmarkPayload {
  generatedAt: string;
  summary: {
    cases: number;
    passed: number;
    failed: number;
    rules: string[];
    overallPassRate: number;
  };
  results: BenchmarkResult[];
  ruleFrequency: Record<string, number>;
  logicPathComparisons: LogicPathComparison[];
  logicPathSummary?: LogicPathSummary;
}

export interface BenchmarkGateThresholds {
  overallPassRate: number;
  authPassRate: number;
  maxCriticalCount: number;
  maxRootMisclassificationCount: number;
  maxNestedInteractiveCount: number;
  maxScreenShellInvalidCount: number;
  maxPatchCallCount: number;
  maxResidualManualPatches: number;
}

export const DEFAULT_BENCHMARK_THRESHOLDS: BenchmarkGateThresholds = {
  overallPassRate: 0.8,
  authPassRate: 0.9,
  maxCriticalCount: 0,
  maxRootMisclassificationCount: 0,
  maxNestedInteractiveCount: 0,
  maxScreenShellInvalidCount: 0,
  maxPatchCallCount: 5,
  maxResidualManualPatches: 5,
};

function evaluateCase(report: LintReport, benchmark: typeof screenBenchmarkCases[number]): BenchmarkResult {
  const triggeredRules = report.categories.map((category) => category.rule);
  const missingRules = (benchmark.requiredRules ?? []).filter((rule) => !triggeredRules.includes(rule));
  const allViolations = report.categories.flatMap((category) => category.nodes);
  const countByRule = (rule: string) => report.categories.find((category) => category.rule === rule)?.count ?? 0;
  const manualPatchesNeededEstimate = allViolations.filter((violation) => !violation.autoFixable).length;

  const baseResult = {
    rootMisclassificationCount: countByRule('root-misclassified-interactive'),
    nestedInteractiveCount: countByRule('nested-interactive-shell'),
    screenShellInvalidCount: countByRule('screen-shell-invalid'),
    criticalCount: report.summary.bySeverity.error,
    manualPatchesNeededEstimate,
  };

  if (benchmark.expected === 'clean') {
    return {
      id: benchmark.id,
      name: benchmark.name,
      expected: benchmark.expected,
      passed: report.summary.violations === 0,
      violations: report.summary.violations,
      bySeverity: report.summary.bySeverity,
      triggeredRules,
      ...baseResult,
      reason: report.summary.violations === 0 ? undefined : `expected clean screen, found ${report.summary.violations} violations`,
    };
  }

  const enoughViolations = report.summary.violations >= (benchmark.minViolations ?? 1);
  const passed = enoughViolations && missingRules.length === 0;
  const reasons: string[] = [];
  if (!enoughViolations) reasons.push(`expected at least ${benchmark.minViolations ?? 1} violations, found ${report.summary.violations}`);
  if (missingRules.length > 0) reasons.push(`missing expected rules: ${missingRules.join(', ')}`);

  return {
    id: benchmark.id,
    name: benchmark.name,
    expected: benchmark.expected,
    passed,
    violations: report.summary.violations,
    bySeverity: report.summary.bySeverity,
    triggeredRules,
    ...baseResult,
    reason: reasons.length > 0 ? reasons.join('; ') : undefined,
  };
}

function formatSeverity(bySeverity: LintReport['summary']['bySeverity']): string {
  return `error=${bySeverity.error} warning=${bySeverity.warning} info=${bySeverity.info} hint=${bySeverity.hint}`;
}

type NodeSpecLike = Record<string, unknown>;
type RemainingViolation = Record<string, unknown>;

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function extractRemainingViolations(lint: Record<string, unknown> | undefined): RemainingViolation[] {
  return Array.isArray(lint?.remainingViolations)
    ? lint!.remainingViolations as RemainingViolation[]
    : [];
}

function countRemainingRule(violations: RemainingViolation[], rule: string): number {
  return violations.filter((violation) => violation.rule === rule).length;
}

function summarizeResidualViolations(lint: Record<string, unknown> | undefined): {
  rootMisclassificationCount: number;
  nestedInteractiveCount: number;
  screenShellInvalidCount: number;
  manualPatchesNeededEstimate: number;
  remainingRules: string[];
} {
  const remainingViolations = extractRemainingViolations(lint);
  const remainingRules = [...new Set(remainingViolations
    .map((violation) => typeof violation.rule === 'string' ? violation.rule : null)
    .filter((rule): rule is string => !!rule))];

  return {
    rootMisclassificationCount: countRemainingRule(remainingViolations, 'root-misclassified-interactive'),
    nestedInteractiveCount: countRemainingRule(remainingViolations, 'nested-interactive-shell'),
    screenShellInvalidCount: countRemainingRule(remainingViolations, 'screen-shell-invalid'),
    manualPatchesNeededEstimate: remainingViolations.filter((violation) => violation.autoFixable !== true).length,
    remainingRules,
  };
}

function toSpecType(type: string): string {
  const lower = type.toLowerCase();
  return lower === 'component' ? 'frame' : lower;
}

function toLayoutDirection(layoutMode: string | undefined): 'HORIZONTAL' | 'VERTICAL' | undefined {
  if (layoutMode === 'HORIZONTAL' || layoutMode === 'VERTICAL') return layoutMode;
  return undefined;
}

function abstractNodeToNodeSpec(node: AbstractNode): NodeSpecLike {
  const spec: NodeSpecLike = {
    type: toSpecType(node.type),
    name: node.name,
  };
  if (node.role) spec.role = node.role;

  const props: Record<string, unknown> = {};
  if (node.width != null) props.width = node.width;
  if (node.height != null) props.height = node.height;
  if (node.x != null) props.x = node.x;
  if (node.y != null) props.y = node.y;
  if (node.layoutMode && node.layoutMode !== 'NONE') {
    props.autoLayout = true;
    props.layoutDirection = toLayoutDirection(node.layoutMode);
  }
  if (node.itemSpacing != null) props.itemSpacing = node.itemSpacing;
  if (node.paddingLeft != null) props.paddingLeft = node.paddingLeft;
  if (node.paddingRight != null) props.paddingRight = node.paddingRight;
  if (node.paddingTop != null) props.paddingTop = node.paddingTop;
  if (node.paddingBottom != null) props.paddingBottom = node.paddingBottom;
  if (node.primaryAxisAlignItems != null) props.primaryAxisAlignItems = node.primaryAxisAlignItems;
  if (node.counterAxisAlignItems != null) props.counterAxisAlignItems = node.counterAxisAlignItems;
  if (node.layoutAlign != null) props.layoutAlign = node.layoutAlign;
  if (node.characters != null) props.content = node.characters;
  if (node.textAutoResize != null) props.textAutoResize = node.textAutoResize;
  if (Object.keys(props).length > 0) spec.props = props;
  if (node.children && node.children.length > 0) {
    spec.children = node.children.map(abstractNodeToNodeSpec);
  }
  return spec;
}

function specToAbstractNode(spec: NodeSpecLike, nextId: () => string): AbstractNode {
  const props = ((spec.props && typeof spec.props === 'object' && !Array.isArray(spec.props))
    ? spec.props
    : {}) as Record<string, unknown>;
  const node: AbstractNode = {
    id: nextId(),
    name: typeof spec.name === 'string' ? spec.name : 'Node',
    type: String(spec.type ?? 'frame').toUpperCase(),
  };
  if (typeof spec.role === 'string') node.role = spec.role;
  if (typeof props.width === 'number') node.width = props.width;
  if (typeof props.height === 'number') node.height = props.height;
  if (typeof props.x === 'number') node.x = props.x;
  if (typeof props.y === 'number') node.y = props.y;
  if (props.autoLayout === true) {
    node.layoutMode = toLayoutDirection(typeof props.layoutDirection === 'string' ? props.layoutDirection : undefined) ?? 'VERTICAL';
  }
  if (typeof props.itemSpacing === 'number') node.itemSpacing = props.itemSpacing;
  if (typeof props.paddingLeft === 'number') node.paddingLeft = props.paddingLeft;
  if (typeof props.paddingRight === 'number') node.paddingRight = props.paddingRight;
  if (typeof props.paddingTop === 'number') node.paddingTop = props.paddingTop;
  if (typeof props.paddingBottom === 'number') node.paddingBottom = props.paddingBottom;
  if (typeof props.primaryAxisAlignItems === 'string') node.primaryAxisAlignItems = props.primaryAxisAlignItems;
  if (typeof props.counterAxisAlignItems === 'string') node.counterAxisAlignItems = props.counterAxisAlignItems;
  if (typeof props.layoutAlign === 'string') node.layoutAlign = props.layoutAlign;
  if (typeof props.content === 'string') node.characters = props.content;
  if (typeof props.textAutoResize === 'string') node.textAutoResize = props.textAutoResize;
  if (Array.isArray(spec.children) && spec.children.length > 0) {
    node.children = spec.children.map((child) => specToAbstractNode(child as NodeSpecLike, nextId));
  }
  return node;
}

function createBenchmarkBridge() {
  const roots: AbstractNode[] = [];
  const nodeIndex = new Map<string, AbstractNode>();
  let idCounter = 1;
  const stats = {
    patchCallCount: 0,
    patchNodeCount: 0,
    lintFixCallCount: 0,
  };

  const nextId = () => `bench:${idCounter++}`;

  const applyAutoLayoutGeometry = (parent: AbstractNode) => {
    if (!parent.children || parent.children.length === 0) return;
    if (!parent.layoutMode || parent.layoutMode === 'NONE') return;

    const itemSpacing = parent.itemSpacing ?? 0;
    const paddingLeft = parent.paddingLeft ?? 0;
    const paddingTop = parent.paddingTop ?? 0;
    const paddingRight = parent.paddingRight ?? 0;

    let cursor = parent.layoutMode === 'VERTICAL' ? paddingTop : paddingLeft;
    for (const child of parent.children) {
      if (parent.layoutMode === 'VERTICAL') {
        child.x = paddingLeft;
        child.y = cursor;
        cursor += (child.height ?? 0) + itemSpacing;
        if (child.layoutAlign === 'STRETCH' && parent.width != null && child.width == null) {
          child.width = Math.max(0, parent.width - paddingLeft - paddingRight);
        }
      } else {
        child.x = cursor;
        child.y = paddingTop;
        cursor += (child.width ?? 0) + itemSpacing;
      }
      applyAutoLayoutGeometry(child);
    }
  };

  const registerTree = (node: AbstractNode) => {
    nodeIndex.set(node.id, node);
    if (node.children) {
      for (const child of node.children) registerTree(child);
    }
  };

  const bridge = {
    request: async (method: string, params: Record<string, unknown> = {}) => {
      if (method === 'create_document') {
        const specs = (params.nodes as NodeSpecLike[] | undefined) ?? [];
        const created = specs.map((spec) => specToAbstractNode(spec, nextId));
        const parentId = typeof params.parentId === 'string' ? params.parentId : undefined;
        if (parentId) {
          const parent = nodeIndex.get(parentId);
          if (!parent) throw new Error(`Unknown benchmark parent: ${parentId}`);
          parent.children = [...(parent.children ?? []), ...created];
          applyAutoLayoutGeometry(parent);
        } else {
          roots.push(...created);
        }
        created.forEach((node) => {
          applyAutoLayoutGeometry(node);
          registerTree(node);
        });
        return {
          ok: true,
          created: created.map((node) => ({ id: node.id, name: node.name, type: node.type })),
        };
      }

      if (method === 'lint_check') {
        const nodeIds = Array.isArray(params.nodeIds) ? params.nodeIds as string[] : [];
        const scopedNodes = nodeIds.length > 0
          ? nodeIds.map((id) => nodeIndex.get(id)).filter((node): node is AbstractNode => !!node)
          : roots;
        return runLint(deepClone(scopedNodes), screenBenchmarkContext, {
          rules: [...screenBenchmarkRules],
          minSeverity: (params.minSeverity as 'error' | 'warning' | 'info' | 'hint' | undefined) ?? 'warning',
          maxViolations: typeof params.maxViolations === 'number' ? params.maxViolations : 200,
        });
      }

      if (method === 'lint_fix') {
        stats.lintFixCallCount += 1;
        const violations = Array.isArray(params.violations) ? params.violations as Array<{ autoFixable?: boolean }> : [];
        return {
          fixed: violations.filter((violation) => violation.autoFixable === true).length,
          failed: 0,
          errors: [],
        };
      }

      if (method === 'patch_nodes') {
        const patches = Array.isArray(params.patches)
          ? params.patches as Array<{ nodeId: string; props?: Record<string, unknown> }>
          : [];
        stats.patchCallCount += 1;
        stats.patchNodeCount += patches.length;
        for (const patch of patches) {
          const node = nodeIndex.get(patch.nodeId);
          if (!node || !patch.props) continue;
          for (const [key, value] of Object.entries(patch.props)) {
            (node as Record<string, unknown>)[key] = value;
          }
        }
        roots.forEach((root) => applyAutoLayoutGeometry(root));
        return {
          success: patches.length,
          failed: 0,
          results: patches.map((patch) => ({ item: patch.nodeId, ok: true })),
        };
      }

      if (method === 'create_section') {
        return { id: nextId(), name: typeof params.name === 'string' ? params.name : 'Section' };
      }

      throw new Error(`Unsupported benchmark bridge request: ${method}`);
    },
  } as any;

  return { bridge, stats };
}

function inferPlatformFromScreen(node: AbstractNode): 'ios' | 'android' | 'web' {
  if ((node.width ?? 0) >= 1000) return 'web';
  if ((node.width ?? 0) >= 410) return 'android';
  return 'ios';
}

function buildRawScreenSpec(root: AbstractNode): NodeSpecLike {
  const rawScreen: NodeSpecLike = {
    type: 'frame',
    name: root.name,
    role: 'screen',
  };
  if (root.children && root.children.length > 0) {
    rawScreen.children = root.children.map(abstractNodeToNodeSpec);
  }
  return rawScreen;
}

function buildGenerationPathMetrics(input: {
  isError: boolean;
  lint: Record<string, unknown> | undefined;
  fixedCount: number;
  stageCount: number;
  patchCallCount: number;
  patchNodeCount: number;
  lintFixCallCount: number;
  warningCount: number;
  structuralErrorCount: number;
  maxStageRemaining: number;
}): LogicPathComparison['raw'] {
  const final = input.lint?.final as Record<string, unknown> | undefined;
  const residual = summarizeResidualViolations(input.lint);
  return {
    isError: input.isError,
    finalViolations: typeof final?.violations === 'number'
      ? final.violations as number
      : (typeof input.lint?.remaining === 'number' ? input.lint.remaining as number : 0),
    criticalCount: typeof final?.criticalCount === 'number' ? final.criticalCount as number : 0,
    fixedCount: input.fixedCount,
    stageCount: input.stageCount,
    patchCallCount: input.patchCallCount,
    patchNodeCount: input.patchNodeCount,
    lintFixCallCount: input.lintFixCallCount,
    warningCount: input.warningCount,
    structuralErrorCount: input.structuralErrorCount,
    maxStageRemaining: input.maxStageRemaining,
    rootMisclassificationCount: residual.rootMisclassificationCount,
    nestedInteractiveCount: residual.nestedInteractiveCount,
    screenShellInvalidCount: residual.screenShellInvalidCount,
    manualPatchesNeededEstimate: residual.manualPatchesNeededEstimate,
    remainingRules: residual.remainingRules,
  };
}

async function buildLogicPathComparisons(): Promise<LogicPathComparison[]> {
  const comparisons: LogicPathComparison[] = [];

  for (const benchmark of screenBenchmarkCases) {
    if (benchmark.expected !== 'clean') continue;
    const root = benchmark.nodes[0];
    if (!root) continue;

    const rawRunner = createBenchmarkBridge();
    const rawResponse = await createDocumentLogic(rawRunner.bridge, {
      nodes: [buildRawScreenSpec(root)],
      includePostCreateLintViolations: true,
    });
    const rawParsed = JSON.parse(rawResponse.content[0].text);

    const sections = (root.children ?? []).map(abstractNodeToNodeSpec);
    const orchestratedRunner = createBenchmarkBridge();
    const orchestratedResponse = await createScreenLogic(orchestratedRunner.bridge, {
      name: root.name,
      platform: inferPlatformFromScreen(root),
      sections,
    });
    const orchestratedParsed = JSON.parse(orchestratedResponse.content[0].text);

    const rawMetrics = buildGenerationPathMetrics({
      isError: Boolean(rawResponse.isError),
      lint: rawParsed.postCreateLint as Record<string, unknown> | undefined,
      fixedCount: rawParsed.postCreateLint?.fixed ?? 0,
      stageCount: 1,
      patchCallCount: rawRunner.stats.patchCallCount,
      patchNodeCount: rawRunner.stats.patchNodeCount,
      lintFixCallCount: rawRunner.stats.lintFixCallCount,
      warningCount: Array.isArray(rawParsed.warnings) ? rawParsed.warnings.length : 0,
      structuralErrorCount: Array.isArray(rawParsed.structuralErrors) ? rawParsed.structuralErrors.length : 0,
      maxStageRemaining: rawParsed.postCreateLint?.remaining ?? 0,
    });
    const orchestratedMetrics = buildGenerationPathMetrics({
      isError: Boolean(orchestratedResponse.isError),
      lint: orchestratedParsed.finalLint as Record<string, unknown> | undefined,
      fixedCount: orchestratedParsed.pipelineSummary?.fixed ?? 0,
      stageCount: orchestratedParsed.pipelineSummary?.stageCount ?? 0,
      patchCallCount: orchestratedRunner.stats.patchCallCount,
      patchNodeCount: orchestratedRunner.stats.patchNodeCount,
      lintFixCallCount: orchestratedRunner.stats.lintFixCallCount,
      warningCount: orchestratedParsed.pipelineSummary?.warningCount ?? 0,
      structuralErrorCount: orchestratedParsed.pipelineSummary?.structuralErrors ?? 0,
      maxStageRemaining: orchestratedParsed.pipelineSummary?.maxStageRemaining ?? 0,
    });

    const reasons: string[] = [];
    if (orchestratedMetrics.isError) reasons.push('pipeline returned an error');
    if (orchestratedMetrics.finalViolations > 0) reasons.push(`residual violations=${orchestratedMetrics.finalViolations}`);
    if (orchestratedMetrics.criticalCount > 0) reasons.push(`critical=${orchestratedMetrics.criticalCount}`);
    if (orchestratedMetrics.rootMisclassificationCount > 0) reasons.push(`root=${orchestratedMetrics.rootMisclassificationCount}`);
    if (orchestratedMetrics.nestedInteractiveCount > 0) reasons.push(`nested=${orchestratedMetrics.nestedInteractiveCount}`);
    if (orchestratedMetrics.screenShellInvalidCount > 0) reasons.push(`shell=${orchestratedMetrics.screenShellInvalidCount}`);
    if (orchestratedMetrics.patchCallCount > DEFAULT_BENCHMARK_THRESHOLDS.maxPatchCallCount) {
      reasons.push(`patchCalls=${orchestratedMetrics.patchCallCount}`);
    }
    if (orchestratedMetrics.manualPatchesNeededEstimate > DEFAULT_BENCHMARK_THRESHOLDS.maxResidualManualPatches) {
      reasons.push(`manualFixEstimate=${orchestratedMetrics.manualPatchesNeededEstimate}`);
    }

    comparisons.push({
      id: benchmark.id,
      name: benchmark.name,
      passed: reasons.length === 0,
      reason: reasons.length > 0 ? reasons.join('; ') : undefined,
      raw: rawMetrics,
      orchestrated: orchestratedMetrics,
    });
  }

  return comparisons;
}

function summarizeLogicPathComparisons(comparisons: LogicPathComparison[]): LogicPathSummary {
  const aggregate = (
    items: Array<LogicPathComparison['raw'] | LogicPathComparison['orchestrated']>,
    passFlags: boolean[],
  ): LogicPathAggregate => {
    const cases = items.length;
    const passed = passFlags.filter(Boolean).length;
    const failed = cases - passed;
    const totalFinalViolations = items.reduce((sum, item) => sum + (item.finalViolations ?? 0), 0);
    const totalCriticalCount = items.reduce((sum, item) => sum + (item.criticalCount ?? 0), 0);
    const totalFixedCount = items.reduce((sum, item) => sum + (item.fixedCount ?? 0), 0);
    const totalPatchCallCount = items.reduce((sum, item) => sum + (item.patchCallCount ?? 0), 0);
    const totalPatchNodeCount = items.reduce((sum, item) => sum + (item.patchNodeCount ?? 0), 0);
    const totalLintFixCallCount = items.reduce((sum, item) => sum + (item.lintFixCallCount ?? 0), 0);
    const totalWarningCount = items.reduce((sum, item) => sum + (item.warningCount ?? 0), 0);
    const totalStructuralErrorCount = items.reduce((sum, item) => sum + (item.structuralErrorCount ?? 0), 0);
    const totalRootMisclassificationCount = items.reduce((sum, item) => sum + (item.rootMisclassificationCount ?? 0), 0);
    const totalNestedInteractiveCount = items.reduce((sum, item) => sum + (item.nestedInteractiveCount ?? 0), 0);
    const totalScreenShellInvalidCount = items.reduce((sum, item) => sum + (item.screenShellInvalidCount ?? 0), 0);
    const totalManualPatchesNeededEstimate = items.reduce((sum, item) => sum + (item.manualPatchesNeededEstimate ?? 0), 0);
    const totalStageCount = items.reduce((sum, item) => sum + (item.stageCount ?? 0), 0);
    const maxStageRemaining = items.reduce((max, item) => Math.max(max, item.maxStageRemaining ?? 0), 0);
    const maxPatchCallCount = items.reduce((max, item) => Math.max(max, item.patchCallCount ?? 0), 0);
    const maxManualPatchesNeededEstimate = items.reduce((max, item) => Math.max(max, item.manualPatchesNeededEstimate ?? 0), 0);
    const zeroResidualCases = items.filter((item) => (item.finalViolations ?? 0) === 0 && (item.criticalCount ?? 0) === 0 && !item.isError).length;

    return {
      cases,
      passed,
      failed,
      zeroResidualCases,
      totalFinalViolations,
      totalCriticalCount,
      totalFixedCount,
      totalPatchCallCount,
      totalPatchNodeCount,
      totalLintFixCallCount,
      totalWarningCount,
      totalStructuralErrorCount,
      totalRootMisclassificationCount,
      totalNestedInteractiveCount,
      totalScreenShellInvalidCount,
      totalManualPatchesNeededEstimate,
      maxStageRemaining,
      maxPatchCallCount,
      maxManualPatchesNeededEstimate,
      averageFinalViolations: cases === 0 ? 0 : Number((totalFinalViolations / cases).toFixed(2)),
      averageStageCount: cases === 0 ? 0 : Number((totalStageCount / cases).toFixed(2)),
      averageManualPatchesNeededEstimate: cases === 0 ? 0 : Number((totalManualPatchesNeededEstimate / cases).toFixed(2)),
    };
  };

  const raw = aggregate(comparisons.map((comparison) => comparison.raw), comparisons.map(() => false));
  const orchestrated = aggregate(comparisons.map((comparison) => comparison.orchestrated), comparisons.map((comparison) => comparison.passed));
  const improvedCases = comparisons.filter((comparison) =>
    comparison.orchestrated.finalViolations < comparison.raw.finalViolations ||
    comparison.orchestrated.criticalCount < comparison.raw.criticalCount,
  ).length;
  const reducedWarningCases = comparisons.filter((comparison) =>
    comparison.orchestrated.warningCount < comparison.raw.warningCount,
  ).length;
  const reducedResidualCases = comparisons.filter((comparison) =>
    comparison.orchestrated.maxStageRemaining < comparison.raw.maxStageRemaining,
  ).length;

  return {
    cases: comparisons.length,
    passed: comparisons.filter((comparison) => comparison.passed).length,
    failed: comparisons.filter((comparison) => !comparison.passed).length,
    overallPassRate: comparisons.length === 0 ? 1 : comparisons.filter((comparison) => comparison.passed).length / comparisons.length,
    authPassRate: (() => {
      const authComparisons = comparisons.filter((comparison) => isAuthCase({ id: comparison.id, name: comparison.name } as BenchmarkResult));
      return authComparisons.length === 0 ? 1 : authComparisons.filter((comparison) => comparison.passed).length / authComparisons.length;
    })(),
    improvedCases,
    reducedWarningCases,
    reducedResidualCases,
    raw,
    orchestrated,
  };
}

export async function collectBenchmarkPayload(): Promise<BenchmarkPayload> {
  const results: BenchmarkResult[] = [];
  const aggregateRules = new Map<string, number>();

  for (const benchmark of screenBenchmarkCases) {
    const report = runLint(benchmark.nodes, screenBenchmarkContext, {
      rules: [...screenBenchmarkRules],
      minSeverity: 'warning',
    });
    const result = evaluateCase(report, benchmark);
    results.push(result);
    for (const rule of result.triggeredRules) {
      aggregateRules.set(rule, (aggregateRules.get(rule) ?? 0) + 1);
    }
  }

  const passedCount = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed);
  const logicPathComparisons = await buildLogicPathComparisons();

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      cases: results.length,
      passed: passedCount,
      failed: failed.length,
      rules: [...screenBenchmarkRules],
      overallPassRate: results.length === 0 ? 1 : passedCount / results.length,
    },
    results,
    ruleFrequency: Object.fromEntries([...aggregateRules.entries()].sort((a, b) => b[1] - a[1])),
    logicPathComparisons,
    logicPathSummary: summarizeLogicPathComparisons(logicPathComparisons),
  };
}

export function renderBenchmarkReport(payload: BenchmarkPayload): string {
  const lines: string[] = [];
  const logicSummary = payload.logicPathSummary ?? summarizeLogicPathComparisons(payload.logicPathComparisons);
  lines.push('FigCraft screen quality benchmarks');
  lines.push('================================');
  lines.push(`Rule regression: ${payload.summary.cases} cases  Passed: ${payload.summary.passed}  Failed: ${payload.summary.failed}`);
  lines.push(`Generation quality: ${logicSummary.cases} cases  Passed: ${logicSummary.passed}  Failed: ${logicSummary.failed}`);
  lines.push('');

  lines.push('Rule regression results');
  lines.push('-----------------------');
  for (const result of payload.results) {
    lines.push(`${result.passed ? 'PASS' : 'FAIL'}  ${result.id}  (${result.name})`);
    lines.push(`  Violations: ${result.violations}`);
    lines.push(`  Severity:   ${formatSeverity(result.bySeverity)}`);
    lines.push(`  Rules:      ${result.triggeredRules.length > 0 ? result.triggeredRules.join(', ') : 'none'}`);
    lines.push(`  Structural: root=${result.rootMisclassificationCount} nested=${result.nestedInteractiveCount} shell=${result.screenShellInvalidCount}`);
    lines.push(`  Manual:     ${result.manualPatchesNeededEstimate} non-auto-fix violation(s)`);
    if (result.reason) lines.push(`  Note:       ${result.reason}`);
    lines.push('');
  }

  lines.push('Rule frequency');
  lines.push('--------------');
  const topRules = Object.entries(payload.ruleFrequency);
  if (topRules.length === 0) {
    lines.push('No benchmark violations triggered.');
  } else {
    for (const [rule, count] of topRules) {
      lines.push(`${rule}: ${count}`);
    }
  }

  lines.push('');
  lines.push('Generation quality summary');
  lines.push('--------------------------');
  lines.push(`Cases: ${logicSummary.cases}  Passed: ${logicSummary.passed}  Failed: ${logicSummary.failed}  PassRate: ${(logicSummary.overallPassRate * 100).toFixed(1)}%  AuthPassRate: ${(logicSummary.authPassRate * 100).toFixed(1)}%`);
  lines.push(`Improved vs raw: ${logicSummary.improvedCases}  WarningReductions: ${logicSummary.reducedWarningCases}  PeakResidualReductions: ${logicSummary.reducedResidualCases}`);
  lines.push(`Raw: zeroResidual=${logicSummary.raw.zeroResidualCases}/${logicSummary.raw.cases} finalViolations=${logicSummary.raw.totalFinalViolations} critical=${logicSummary.raw.totalCriticalCount} warnings=${logicSummary.raw.totalWarningCount} structuralErrors=${logicSummary.raw.totalStructuralErrorCount} root=${logicSummary.raw.totalRootMisclassificationCount} nested=${logicSummary.raw.totalNestedInteractiveCount} shell=${logicSummary.raw.totalScreenShellInvalidCount} patchCalls=${logicSummary.raw.totalPatchCallCount} maxPatchCalls=${logicSummary.raw.maxPatchCallCount} residualManual=${logicSummary.raw.totalManualPatchesNeededEstimate} avgViolations=${logicSummary.raw.averageFinalViolations}`);
  lines.push(`Orchestrated: zeroResidual=${logicSummary.orchestrated.zeroResidualCases}/${logicSummary.orchestrated.cases} finalViolations=${logicSummary.orchestrated.totalFinalViolations} critical=${logicSummary.orchestrated.totalCriticalCount} warnings=${logicSummary.orchestrated.totalWarningCount} structuralErrors=${logicSummary.orchestrated.totalStructuralErrorCount} root=${logicSummary.orchestrated.totalRootMisclassificationCount} nested=${logicSummary.orchestrated.totalNestedInteractiveCount} shell=${logicSummary.orchestrated.totalScreenShellInvalidCount} patchCalls=${logicSummary.orchestrated.totalPatchCallCount} maxPatchCalls=${logicSummary.orchestrated.maxPatchCallCount} residualManual=${logicSummary.orchestrated.totalManualPatchesNeededEstimate} avgManual=${logicSummary.orchestrated.averageManualPatchesNeededEstimate} avgViolations=${logicSummary.orchestrated.averageFinalViolations} avgStages=${logicSummary.orchestrated.averageStageCount}`);
  lines.push('');

  lines.push('Generation quality results');
  lines.push('--------------------------');
  for (const comparison of payload.logicPathComparisons) {
    lines.push(`${comparison.passed ? 'PASS' : 'FAIL'}  ${comparison.id}  (${comparison.name})`);
    lines.push(`  Raw:          violations=${comparison.raw.finalViolations} critical=${comparison.raw.criticalCount} root=${comparison.raw.rootMisclassificationCount} nested=${comparison.raw.nestedInteractiveCount} shell=${comparison.raw.screenShellInvalidCount} patchCalls=${comparison.raw.patchCallCount} residualManual=${comparison.raw.manualPatchesNeededEstimate} stages=${comparison.raw.stageCount}`);
    lines.push(`  Orchestrated: violations=${comparison.orchestrated.finalViolations} critical=${comparison.orchestrated.criticalCount} root=${comparison.orchestrated.rootMisclassificationCount} nested=${comparison.orchestrated.nestedInteractiveCount} shell=${comparison.orchestrated.screenShellInvalidCount} patchCalls=${comparison.orchestrated.patchCallCount} residualManual=${comparison.orchestrated.manualPatchesNeededEstimate} stages=${comparison.orchestrated.stageCount}`);
    if (comparison.reason) lines.push(`  Note:         ${comparison.reason}`);
  }
  return lines.join('\n');
}

export interface GateEvaluation {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; actual: number; expected: string }>;
}

function isAuthCase(result: { id: string; name: string }): boolean {
  return /^auth-|sign-|forgot|welcome|root-misclassified-auth|nested-interactive-auth/.test(result.id) ||
    /sign in|sign up|forgot password|welcome/i.test(result.name);
}

export function evaluateBenchmarkGate(
  payload: BenchmarkPayload,
  thresholds: BenchmarkGateThresholds = DEFAULT_BENCHMARK_THRESHOLDS,
): GateEvaluation {
  const generationResults = payload.logicPathComparisons;
  const authResults = generationResults.filter(isAuthCase);
  const qualityPassRate = generationResults.length === 0 ? 1 : generationResults.filter((result) => result.passed).length / generationResults.length;
  const authPassRate = authResults.length === 0 ? 1 : authResults.filter((result) => result.passed).length / authResults.length;
  const maxCriticalCount = generationResults.reduce((max, result) => Math.max(max, result.orchestrated.criticalCount), 0);
  const totalRootMisclassificationCount = generationResults.reduce((sum, result) => sum + result.orchestrated.rootMisclassificationCount, 0);
  const totalNestedInteractiveCount = generationResults.reduce((sum, result) => sum + result.orchestrated.nestedInteractiveCount, 0);
  const totalScreenShellInvalidCount = generationResults.reduce((sum, result) => sum + result.orchestrated.screenShellInvalidCount, 0);
  const maxPatchCallCount = generationResults.reduce((max, result) => Math.max(max, result.orchestrated.patchCallCount), 0);
  const maxResidualManualPatches = generationResults.reduce((max, result) => Math.max(max, result.orchestrated.manualPatchesNeededEstimate), 0);

  const checks = [
    {
      name: 'overallPassRate',
      ok: qualityPassRate >= thresholds.overallPassRate,
      actual: qualityPassRate,
      expected: `>= ${thresholds.overallPassRate}`,
    },
    {
      name: 'authPassRate',
      ok: authPassRate >= thresholds.authPassRate,
      actual: authPassRate,
      expected: `>= ${thresholds.authPassRate}`,
    },
    {
      name: 'maxCriticalCount',
      ok: maxCriticalCount <= thresholds.maxCriticalCount,
      actual: maxCriticalCount,
      expected: `<= ${thresholds.maxCriticalCount}`,
    },
    {
      name: 'rootMisclassificationCount',
      ok: totalRootMisclassificationCount <= thresholds.maxRootMisclassificationCount,
      actual: totalRootMisclassificationCount,
      expected: `<= ${thresholds.maxRootMisclassificationCount}`,
    },
    {
      name: 'nestedInteractiveCount',
      ok: totalNestedInteractiveCount <= thresholds.maxNestedInteractiveCount,
      actual: totalNestedInteractiveCount,
      expected: `<= ${thresholds.maxNestedInteractiveCount}`,
    },
    {
      name: 'screenShellInvalidCount',
      ok: totalScreenShellInvalidCount <= thresholds.maxScreenShellInvalidCount,
      actual: totalScreenShellInvalidCount,
      expected: `<= ${thresholds.maxScreenShellInvalidCount}`,
    },
    {
      name: 'maxPatchCallCount',
      ok: maxPatchCallCount <= thresholds.maxPatchCallCount,
      actual: maxPatchCallCount,
      expected: `<= ${thresholds.maxPatchCallCount}`,
    },
    {
      name: 'maxResidualManualPatches',
      ok: maxResidualManualPatches <= thresholds.maxResidualManualPatches,
      actual: maxResidualManualPatches,
      expected: `<= ${thresholds.maxResidualManualPatches}`,
    },
  ];

  return { ok: checks.every((check) => check.ok), checks };
}

export async function writeBenchmarkArtifacts(
  payload: BenchmarkPayload,
  options: {
    outJson?: string;
    historyDir?: string;
    saveHistory?: boolean;
  } = {},
): Promise<{ latestPath?: string; historyPath?: string }> {
  let latestPath: string | undefined;
  let historyPath: string | undefined;

  if (options.outJson) {
    await mkdir(path.dirname(options.outJson), { recursive: true });
    await writeFile(options.outJson, JSON.stringify(payload, null, 2));
    latestPath = options.outJson;
  }

  if (options.historyDir && options.saveHistory) {
    await mkdir(options.historyDir, { recursive: true });
    const stamp = payload.generatedAt.replace(/[:.]/g, '-');
    historyPath = path.join(options.historyDir, `${stamp}.json`);
    await writeFile(historyPath, JSON.stringify(payload, null, 2));
  }

  return { latestPath, historyPath };
}

export async function readBenchmarkPayload(filePath: string): Promise<BenchmarkPayload> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as BenchmarkPayload;
}

export async function findPreviousBenchmarkPayload(historyDir: string, latestGeneratedAt?: string): Promise<BenchmarkPayload | null> {
  let entries: string[] = [];
  try {
    entries = await readdir(historyDir);
  } catch {
    return null;
  }

  const jsonFiles = entries.filter((entry) => entry.endsWith('.json'));
  const dated = await Promise.all(jsonFiles.map(async (entry) => {
    const fullPath = path.join(historyDir, entry);
    const info = await stat(fullPath);
    return { fullPath, mtimeMs: info.mtimeMs };
  }));
  dated.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const entry of dated) {
    const payload = await readBenchmarkPayload(entry.fullPath);
    if (!latestGeneratedAt || payload.generatedAt !== latestGeneratedAt) {
      return payload;
    }
  }
  return null;
}

export function renderBenchmarkDashboard(current: BenchmarkPayload, previous: BenchmarkPayload | null): string {
  const qualityResults = current.results.filter((result) => result.expected === 'clean');
  const qualityPassRate = qualityResults.length === 0 ? 1 : qualityResults.filter((result) => result.passed).length / qualityResults.length;
  const qualityRoot = qualityResults.reduce((sum, result) => sum + result.rootMisclassificationCount, 0);
  const qualityNested = qualityResults.reduce((sum, result) => sum + result.nestedInteractiveCount, 0);
  const qualityShell = qualityResults.reduce((sum, result) => sum + result.screenShellInvalidCount, 0);
  const logicSummary = current.logicPathSummary ?? summarizeLogicPathComparisons(current.logicPathComparisons);
  const lines: string[] = [];
  lines.push('# FigCraft Benchmark Dashboard');
  lines.push('');
  lines.push(`Generated: ${current.generatedAt}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- All cases: ${current.summary.cases}`);
  lines.push(`- All cases passed: ${current.summary.passed}`);
  lines.push(`- All cases failed: ${current.summary.failed}`);
  lines.push(`- All-case pass rate: ${(current.summary.overallPassRate * 100).toFixed(1)}%`);
  lines.push(`- Clean-only rule-regression pass rate: ${(qualityPassRate * 100).toFixed(1)}%`);
  lines.push(`- Generation quality cases: ${logicSummary.cases}`);
  lines.push(`- Generation quality passed: ${logicSummary.passed}`);
  lines.push(`- Generation quality failed: ${logicSummary.failed}`);
  lines.push(`- Generation quality pass rate: ${(logicSummary.overallPassRate * 100).toFixed(1)}%`);
  lines.push(`- Auth generation pass rate: ${(logicSummary.authPassRate * 100).toFixed(1)}%`);
  lines.push('');

  if (previous) {
    const passDelta = current.summary.passed - previous.summary.passed;
    const failDelta = current.summary.failed - previous.summary.failed;
    const previousLogicSummary = previous.logicPathSummary ?? summarizeLogicPathComparisons(previous.logicPathComparisons);
    const generationPassDelta = logicSummary.passed - previousLogicSummary.passed;
    const generationFailDelta = logicSummary.failed - previousLogicSummary.failed;
    lines.push('## Delta vs Previous');
    lines.push('');
    lines.push(`- Rule passed delta: ${passDelta >= 0 ? '+' : ''}${passDelta}`);
    lines.push(`- Rule failed delta: ${failDelta >= 0 ? '+' : ''}${failDelta}`);
    lines.push(`- Generation passed delta: ${generationPassDelta >= 0 ? '+' : ''}${generationPassDelta}`);
    lines.push(`- Generation failed delta: ${generationFailDelta >= 0 ? '+' : ''}${generationFailDelta}`);
    lines.push('');
  }

  lines.push('## Generation Summary');
  lines.push('');
  lines.push(`- Compared clean cases: ${logicSummary.cases}`);
  lines.push(`- Passed cases: ${logicSummary.passed}`);
  lines.push(`- Failed cases: ${logicSummary.failed}`);
  lines.push(`- Improved cases: ${logicSummary.improvedCases}`);
  lines.push(`- Reduced warning cases: ${logicSummary.reducedWarningCases}`);
  lines.push(`- Reduced peak stage residual cases: ${logicSummary.reducedResidualCases}`);
  lines.push(`- Raw zero-residual cases: ${logicSummary.raw.zeroResidualCases}/${logicSummary.raw.cases}`);
  lines.push(`- Orchestrated zero-residual cases: ${logicSummary.orchestrated.zeroResidualCases}/${logicSummary.orchestrated.cases}`);
  lines.push(`- Raw total final violations: ${logicSummary.raw.totalFinalViolations}`);
  lines.push(`- Orchestrated total final violations: ${logicSummary.orchestrated.totalFinalViolations}`);
  lines.push(`- Raw total critical count: ${logicSummary.raw.totalCriticalCount}`);
  lines.push(`- Orchestrated total critical count: ${logicSummary.orchestrated.totalCriticalCount}`);
  lines.push(`- Raw total patch calls: ${logicSummary.raw.totalPatchCallCount}`);
  lines.push(`- Orchestrated total patch calls: ${logicSummary.orchestrated.totalPatchCallCount}`);
  lines.push(`- Raw total patch nodes: ${logicSummary.raw.totalPatchNodeCount}`);
  lines.push(`- Orchestrated total patch nodes: ${logicSummary.orchestrated.totalPatchNodeCount}`);
  lines.push(`- Raw total lint-fix calls: ${logicSummary.raw.totalLintFixCallCount}`);
  lines.push(`- Orchestrated total lint-fix calls: ${logicSummary.orchestrated.totalLintFixCallCount}`);
  lines.push(`- Raw total warnings: ${logicSummary.raw.totalWarningCount}`);
  lines.push(`- Orchestrated total warnings: ${logicSummary.orchestrated.totalWarningCount}`);
  lines.push(`- Raw total structural errors: ${logicSummary.raw.totalStructuralErrorCount}`);
  lines.push(`- Orchestrated total structural errors: ${logicSummary.orchestrated.totalStructuralErrorCount}`);
  lines.push(`- Orchestrated root misclassification count: ${logicSummary.orchestrated.totalRootMisclassificationCount}`);
  lines.push(`- Orchestrated nested interactive count: ${logicSummary.orchestrated.totalNestedInteractiveCount}`);
  lines.push(`- Orchestrated screen shell invalid count: ${logicSummary.orchestrated.totalScreenShellInvalidCount}`);
  lines.push(`- Orchestrated max patch calls per screen: ${logicSummary.orchestrated.maxPatchCallCount}`);
  lines.push(`- Orchestrated max residual manual fixes per screen: ${logicSummary.orchestrated.maxManualPatchesNeededEstimate}`);
  lines.push(`- Raw max stage residual: ${logicSummary.raw.maxStageRemaining}`);
  lines.push(`- Orchestrated max stage residual: ${logicSummary.orchestrated.maxStageRemaining}`);
  lines.push(`- Orchestrated average stage count: ${logicSummary.orchestrated.averageStageCount}`);
  lines.push('');

  lines.push('## Structural Metrics');
  lines.push('');
  const totalRoot = current.results.reduce((sum, result) => sum + result.rootMisclassificationCount, 0);
  const totalNested = current.results.reduce((sum, result) => sum + result.nestedInteractiveCount, 0);
  const totalShell = current.results.reduce((sum, result) => sum + result.screenShellInvalidCount, 0);
  lines.push(`- All-case root misclassification count: ${totalRoot}`);
  lines.push(`- All-case nested interactive count: ${totalNested}`);
  lines.push(`- All-case screen shell invalid count: ${totalShell}`);
  lines.push(`- Clean-only root misclassification count: ${qualityRoot}`);
  lines.push(`- Clean-only nested interactive count: ${qualityNested}`);
  lines.push(`- Clean-only screen shell invalid count: ${qualityShell}`);
  lines.push('');

  lines.push('## Top Failing Rules');
  lines.push('');
  const topRules = Object.entries(current.ruleFrequency);
  if (topRules.length === 0) {
    lines.push('- None');
  } else {
    for (const [rule, count] of topRules.slice(0, 10)) {
      lines.push(`- ${rule}: ${count}`);
    }
  }
  lines.push('');

  lines.push('## Generation Comparison');
  lines.push('');
  for (const comparison of current.logicPathComparisons) {
    lines.push(`- ${comparison.id}: ${comparison.passed ? 'PASS' : 'FAIL'} raw=${comparison.raw.finalViolations}/${comparison.raw.criticalCount} orchestrated=${comparison.orchestrated.finalViolations}/${comparison.orchestrated.criticalCount} patchCalls=${comparison.orchestrated.patchCallCount} manual=${comparison.orchestrated.manualPatchesNeededEstimate} stages=${comparison.orchestrated.stageCount}`);
  }

  return lines.join('\n');
}
