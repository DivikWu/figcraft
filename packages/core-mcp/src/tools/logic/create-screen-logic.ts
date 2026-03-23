import type { Bridge } from '../../bridge.js';
import type { McpResponse } from './node-logic.js';
import type { CreateDocumentExtra } from './write-node-logic.js';
import { createDocumentLogic, runScopedPostCreateLint } from './write-node-logic.js';
import {
  buildScreenShellSpec,
  cloneSpec,
  ensureRecord,
  normalizeNodeTree,
} from './node-spec-normalizer.js';

const MAX_PATCH_CALLS_PER_SCREEN = 5;

type SafePatch = { nodeId: string; props: Record<string, unknown> };

function parseJsonContent(response: McpResponse): Record<string, unknown> {
  return JSON.parse(response.content[0].text) as Record<string, unknown>;
}

function buildStageSummary(stage: string, payload: Record<string, unknown> | undefined, fallbackNodeIds: string[] = []): Record<string, unknown> {
  const postCreateLint = payload?.postCreateLint as Record<string, unknown> | undefined;
  const warnings = Array.isArray(payload?.warnings) ? payload!.warnings as unknown[] : [];
  const patchAutoFix = ensureRecord(payload?.patchAutoFix);
  return {
    stage,
    ok: payload?.ok !== false,
    createdCount: Array.isArray(payload?.created) ? (payload!.created as unknown[]).length : 0,
    nodeIds: (postCreateLint?.scopedNodeIds as string[] | undefined) ?? fallbackNodeIds,
    lint: postCreateLint ?? null,
    warningCount: warnings.length,
    patchCallCount: typeof patchAutoFix.patchCallCount === 'number' ? patchAutoFix.patchCallCount as number : 0,
    patchNodeCount: typeof patchAutoFix.patchNodeCount === 'number' ? patchAutoFix.patchNodeCount as number : 0,
    patchRules: Array.isArray(patchAutoFix.patchRules) ? patchAutoFix.patchRules : [],
    structuralErrors: Array.isArray(payload?.structuralErrors) ? payload!.structuralErrors : [],
    debugStats: (payload?.debugStats as Record<string, unknown> | undefined) ?? {},
  };
}

function aggregateStageMetrics(stages: Array<Record<string, unknown>>): Record<string, unknown> {
  return stages.reduce<Record<string, number>>((acc, stage) => {
    const lint = stage.lint as Record<string, unknown> | null;
    const initial = lint?.initial as Record<string, unknown> | undefined;
    const final = lint?.final as Record<string, unknown> | undefined;
    acc.stageCount += 1;
    acc.createdCount += typeof stage.createdCount === 'number' ? stage.createdCount as number : 0;
    acc.warningCount += typeof stage.warningCount === 'number' ? stage.warningCount as number : 0;
    acc.patchCallCount += typeof stage.patchCallCount === 'number' ? stage.patchCallCount as number : 0;
    acc.patchNodeCount += typeof stage.patchNodeCount === 'number' ? stage.patchNodeCount as number : 0;
    acc.fixable += typeof lint?.fixable === 'number' ? lint.fixable as number : 0;
    acc.fixed += typeof lint?.fixed === 'number' ? lint.fixed as number : 0;
    acc.remaining += typeof lint?.remaining === 'number' ? lint.remaining as number : 0;
    acc.initialViolations += typeof initial?.violations === 'number' ? initial.violations as number : 0;
    acc.finalViolations += typeof final?.violations === 'number' ? final.violations as number : 0;
    acc.criticalCount += typeof final?.criticalCount === 'number' ? final.criticalCount as number : 0;
    acc.maxStageRemaining = Math.max(
      acc.maxStageRemaining,
      typeof lint?.remaining === 'number' ? lint.remaining as number : 0,
    );
    acc.structuralErrors += Array.isArray(stage.structuralErrors) ? (stage.structuralErrors as unknown[]).length : 0;
    return acc;
  }, {
    stageCount: 0,
    createdCount: 0,
    warningCount: 0,
    patchCallCount: 0,
    patchNodeCount: 0,
    fixable: 0,
    fixed: 0,
    remaining: 0,
    initialViolations: 0,
    finalViolations: 0,
    criticalCount: 0,
    maxStageRemaining: 0,
    structuralErrors: 0,
  });
}

function buildPatchPropsFromViolation(violation: Record<string, unknown>): Record<string, unknown> | null {
  const rule = typeof violation.rule === 'string' ? violation.rule : '';
  const fixData = ensureRecord(violation.fixData);

  if ((rule === 'form-consistency' || rule === 'cta-width-inconsistent')
    && typeof fixData.layoutAlign === 'string') {
    return { layoutAlign: fixData.layoutAlign };
  }

  if (rule === 'overflow-parent'
    && fixData.fix === 'stretch'
    && typeof fixData.layoutAlign === 'string') {
    return { layoutAlign: fixData.layoutAlign };
  }

  if (rule === 'unbounded-hug'
    && fixData.fix === 'stretch-self'
    && typeof fixData.layoutAlign === 'string') {
    return { layoutAlign: fixData.layoutAlign };
  }

  if (rule === 'section-spacing-collapse'
    && typeof fixData.itemSpacing === 'number') {
    return { itemSpacing: fixData.itemSpacing };
  }

  if (rule === 'no-autolayout'
    && typeof fixData.layoutMode === 'string') {
    return { layoutMode: fixData.layoutMode };
  }

  return null;
}

function buildSafePatchesFromLint(lint: Record<string, unknown> | undefined): { patches: SafePatch[]; rules: string[] } {
  const remainingViolations = Array.isArray(lint?.remainingViolations)
    ? lint!.remainingViolations as Array<Record<string, unknown>>
    : [];
  const patchByNode = new Map<string, Record<string, unknown>>();
  const rules = new Set<string>();

  for (const violation of remainingViolations) {
    const nodeId = typeof violation.nodeId === 'string' ? violation.nodeId : undefined;
    const rule = typeof violation.rule === 'string' ? violation.rule : undefined;
    if (!nodeId || !rule) continue;
    const props = buildPatchPropsFromViolation(violation);
    if (!props) continue;
    patchByNode.set(nodeId, {
      ...(patchByNode.get(nodeId) ?? {}),
      ...props,
    });
    rules.add(rule);
  }

  return {
    patches: [...patchByNode.entries()].map(([nodeId, props]) => ({ nodeId, props })),
    rules: [...rules],
  };
}

async function applySafePatchPass(
  bridge: Bridge,
  lint: Record<string, unknown> | undefined,
  options: {
    maxViolations: number;
    patchBudget: { remainingCalls: number };
  },
): Promise<{ lint: Record<string, unknown> | undefined; patchAutoFix: Record<string, unknown> }> {
  if (!lint || options.patchBudget.remainingCalls <= 0) {
    return {
      lint,
      patchAutoFix: {
        attempted: false,
        patchCallCount: 0,
        patchNodeCount: 0,
        patchRules: [],
      },
    };
  }

  const nodeIds = Array.isArray(lint.scopedNodeIds) ? lint.scopedNodeIds as string[] : [];
  const { patches, rules } = buildSafePatchesFromLint(lint);
  if (nodeIds.length === 0 || patches.length === 0) {
    return {
      lint,
      patchAutoFix: {
        attempted: false,
        patchCallCount: 0,
        patchNodeCount: 0,
        patchRules: [],
      },
    };
  }

  options.patchBudget.remainingCalls -= 1;
  try {
    await bridge.request('patch_nodes', { patches }, 60_000);
    const refreshedLint = await runScopedPostCreateLint(bridge, nodeIds, options.maxViolations, {
      includeRemainingViolations: true,
    });
    return {
      lint: refreshedLint,
      patchAutoFix: {
        attempted: true,
        patchCallCount: 1,
        patchNodeCount: patches.length,
        patchRules: rules,
      },
    };
  } catch (error) {
    return {
      lint,
      patchAutoFix: {
        attempted: true,
        patchCallCount: 1,
        patchNodeCount: patches.length,
        patchRules: rules,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function buildSectionSpec(sectionInput: Record<string, unknown>, index: number): Record<string, unknown> {
  return normalizeNodeTree(sectionInput, {
    defaultType: 'frame',
    defaultName: `Section ${index + 1}`,
    inferRole: true,
  });
}

export async function createScreenLogic(
  bridge: Bridge,
  params: {
    name?: string;
    parentId?: string;
    platform?: string;
    hasSystemBar?: boolean;
    wrapInSection?: boolean;
    shell?: Record<string, unknown>;
    sections?: Array<Record<string, unknown>>;
    autoLint?: boolean;
    finalLint?: boolean;
  },
  extra?: CreateDocumentExtra,
): Promise<McpResponse> {
  const patchBudget = { remainingCalls: MAX_PATCH_CALLS_PER_SCREEN };
  const shellSpec = buildScreenShellSpec(params.shell, {
    name: params.name,
    platform: params.platform,
    hasSystemBar: params.hasSystemBar,
  });

  const shellResponse = await createDocumentLogic(
    bridge,
    {
      parentId: params.parentId,
      nodes: [shellSpec],
      autoLint: params.autoLint,
      includePostCreateLintViolations: true,
    },
    extra,
  );
  if (shellResponse.isError) return shellResponse;

  const shellResult = parseJsonContent(shellResponse);
  if (params.autoLint !== false) {
    const shellPatch = await applySafePatchPass(bridge, shellResult.postCreateLint as Record<string, unknown> | undefined, {
      maxViolations: 200,
      patchBudget,
    });
    shellResult.postCreateLint = shellPatch.lint;
    shellResult.patchAutoFix = shellPatch.patchAutoFix;
  }
  const root = Array.isArray(shellResult.created) ? shellResult.created[0] as Record<string, unknown> | undefined : undefined;
  const rootId = root?.id as string | undefined;
  const rootName = (root?.name as string | undefined) ?? params.name ?? 'Screen';
  const pipelineStages: Array<Record<string, unknown>> = [
    buildStageSummary('shell', shellResult),
  ];

  if (!rootId) {
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'create_screen could not determine the created screen root' }, null, 2) }],
      isError: true,
    };
  }

  let canvasSection: Record<string, unknown> | undefined;
  if (params.wrapInSection) {
    try {
      canvasSection = await bridge.request('create_section', {
        name: `${rootName} Section`,
        childIds: [rootId],
      }) as Record<string, unknown>;
    } catch (err) {
      canvasSection = {
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const sectionInputs = params.sections ?? [];
  const sectionResults: Array<Record<string, unknown>> = [];
  for (let i = 0; i < sectionInputs.length; i++) {
    const sectionSpec = buildSectionSpec(sectionInputs[i], i);
    const sectionResponse = await createDocumentLogic(
      bridge,
      {
        parentId: rootId,
        nodes: [sectionSpec],
        autoLint: params.autoLint,
        includePostCreateLintViolations: true,
      },
      extra,
    );

    const parsed = parseJsonContent(sectionResponse);
    if (params.autoLint !== false) {
      const sectionPatch = await applySafePatchPass(bridge, parsed.postCreateLint as Record<string, unknown> | undefined, {
        maxViolations: 200,
        patchBudget,
      });
      parsed.postCreateLint = sectionPatch.lint;
      parsed.patchAutoFix = sectionPatch.patchAutoFix;
    }
    pipelineStages.push(buildStageSummary(`section:${i + 1}`, parsed));
    sectionResults.push({
      index: i,
      name: sectionSpec.name,
      ok: !sectionResponse.isError && parsed.ok !== false,
      result: parsed,
    });
    if (sectionResponse.isError || parsed.ok === false) {
      const partialPayload = {
        ok: false,
        failedStage: `section:${i + 1}`,
        screen: shellResult,
        screenRootId: rootId,
        canvasSection,
        sections: sectionResults,
        pipelineStages,
        pipelineSummary: aggregateStageMetrics(pipelineStages),
        finalLint: undefined,
      };
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(partialPayload, null, 2),
        }],
        isError: true,
      };
    }
  }

  let finalLint: Record<string, unknown> | undefined;
  if (params.finalLint !== false) {
    try {
      finalLint = await runScopedPostCreateLint(bridge, [rootId], 400, {
        includeRemainingViolations: true,
      });
      const finalPatch = await applySafePatchPass(bridge, finalLint, {
        maxViolations: 400,
        patchBudget,
      });
      finalLint = {
        ...(finalPatch.lint ?? {}),
        patchAutoFix: finalPatch.patchAutoFix,
      };
    } catch (err) {
      finalLint = {
        scopedNodeIds: [rootId],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  if (finalLint) {
    pipelineStages.push({
      stage: 'final',
      ok: !(finalLint.error),
      createdCount: 0,
      nodeIds: [rootId],
      lint: finalLint,
      patchCallCount: typeof finalLint.patchAutoFix === 'object' && finalLint.patchAutoFix && typeof (finalLint.patchAutoFix as Record<string, unknown>).patchCallCount === 'number'
        ? (finalLint.patchAutoFix as Record<string, unknown>).patchCallCount as number
        : 0,
      patchNodeCount: typeof finalLint.patchAutoFix === 'object' && finalLint.patchAutoFix && typeof (finalLint.patchAutoFix as Record<string, unknown>).patchNodeCount === 'number'
        ? (finalLint.patchAutoFix as Record<string, unknown>).patchNodeCount as number
        : 0,
      patchRules: typeof finalLint.patchAutoFix === 'object' && finalLint.patchAutoFix && Array.isArray((finalLint.patchAutoFix as Record<string, unknown>).patchRules)
        ? (finalLint.patchAutoFix as Record<string, unknown>).patchRules
        : [],
      structuralErrors: [],
      debugStats: {},
    });
  }

  const ok = (shellResult.ok !== false)
    && sectionResults.every((section) => section.ok !== false)
    && (canvasSection == null || !('error' in canvasSection));

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        ok,
        screen: shellResult,
        screenRootId: rootId,
        canvasSection,
        sections: sectionResults,
        pipelineStages,
        pipelineSummary: aggregateStageMetrics(pipelineStages),
        finalLint,
      }, null, 2),
    }],
    isError: !ok,
  };
}
