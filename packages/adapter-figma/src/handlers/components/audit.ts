/**
 * Component audit + publish preflight handlers.
 *
 * Both handlers walk the page tree to enumerate components and flag quality
 * issues (missing descriptions, unwired text nodes, empty components, etc.).
 * They share two small tree-walking helpers — kept module-private here rather
 * than in a shared module since no other handler uses them.
 */

import { registerHandler } from '../../registry.js';
import { findNodeByIdAsync } from '../../utils/node-lookup.js';

// ─── Tree-walking helpers (shared by audit_components + preflight_library_publish) ───

function countDescendants(node: SceneNode): number {
  let count = 0;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count++;
      count += countDescendants(child);
    }
  }
  return count;
}

function countTextNodes(node: SceneNode): number {
  let count = 0;
  if (node.type === 'TEXT') return 1;
  if ('children' in node) {
    for (const child of (node as ChildrenMixin).children) {
      count += countTextNodes(child);
    }
  }
  return count;
}

export function registerComponentAuditHandlers(): void {
  registerHandler('audit_components', async (params) => {
    const nodeIds = params.nodeIds as string[] | undefined;

    let targets: SceneNode[];
    if (nodeIds && nodeIds.length > 0) {
      const resolved = await Promise.all(nodeIds.map((id) => findNodeByIdAsync(id)));
      targets = resolved.filter((n): n is SceneNode => n !== null && 'type' in n);
    } else {
      targets = [...figma.currentPage.children];
    }

    const components: Array<Record<string, unknown>> = [];
    const issues: Array<{ nodeId: string; name: string; issue: string }> = [];

    function walk(node: SceneNode) {
      if (node.type === 'COMPONENT') {
        const comp = node as ComponentNode;
        const propDefs = comp.componentPropertyDefinitions;
        const propCount = Object.keys(propDefs).length;
        const childCount = countDescendants(comp);
        const textChildren = countTextNodes(comp);
        const textProps = Object.values(propDefs).filter((d) => d.type === 'TEXT').length;
        const boolProps = Object.values(propDefs).filter((d) => d.type === 'BOOLEAN').length;
        const instanceSwapProps = Object.values(propDefs).filter((d) => d.type === 'INSTANCE_SWAP').length;

        const entry: Record<string, unknown> = {
          id: comp.id,
          name: comp.name,
          key: comp.key,
          description: comp.description || null,
          propertyCount: propCount,
          textProperties: textProps,
          booleanProperties: boolProps,
          instanceSwapProperties: instanceSwapProps,
          childCount,
          textChildCount: textChildren,
          hasAutoLayout: 'layoutMode' in comp && comp.layoutMode !== 'NONE',
          width: comp.width,
          height: comp.height,
        };
        components.push(entry);

        // Issue detection
        if (!comp.description) {
          issues.push({ nodeId: comp.id, name: comp.name, issue: 'Missing description' });
        }
        if (textChildren > 0 && textProps === 0) {
          issues.push({
            nodeId: comp.id,
            name: comp.name,
            issue: `${textChildren} text node(s) but no TEXT properties exposed`,
          });
        }
        if (propCount === 0 && childCount > 1) {
          issues.push({ nodeId: comp.id, name: comp.name, issue: 'No properties defined despite having children' });
        }
        if (childCount === 0) {
          issues.push({ nodeId: comp.id, name: comp.name, issue: 'Empty component (no children)' });
        }
      }
      if (node.type === 'COMPONENT_SET') {
        const set = node as ComponentSetNode;
        const variants = set.children.filter((c) => c.type === 'COMPONENT');
        components.push({
          id: set.id,
          name: set.name,
          isComponentSet: true,
          variantCount: variants.length,
          propertyCount: Object.keys(set.componentPropertyDefinitions).length,
          description: set.description || null,
        });
        if (!set.description) {
          issues.push({ nodeId: set.id, name: set.name, issue: 'Missing description on component set' });
        }
        if (variants.length === 1) {
          issues.push({ nodeId: set.id, name: set.name, issue: 'Component set with only 1 variant' });
        }
        // Walk variants
        for (const v of variants) walk(v);
        return; // don't walk children again
      }
      if ('children' in node) {
        for (const child of (node as ChildrenMixin).children) walk(child);
      }
    }

    for (const t of targets) walk(t);

    return {
      summary: {
        totalComponents: components.length,
        totalIssues: issues.length,
      },
      components,
      issues,
    };
  });

  // ─── Publish Preflight (P0-1) ───
  // Aggregate health check before publishing a library: scan components, variables,
  // and styles in a single pass, surface blockers/warnings with structured fixes.
  registerHandler('preflight_library_publish', async (params) => {
    const opts = (params || {}) as {
      checkComponents?: boolean;
      checkVariables?: boolean;
      checkStyles?: boolean;
    };
    const checkComponents = opts.checkComponents !== false;
    const checkVariables = opts.checkVariables !== false;
    const checkStyles = opts.checkStyles !== false;

    type Issue = {
      severity: 'blocker' | 'warning';
      category: 'component' | 'variable' | 'style';
      target: string;
      nodeId?: string;
      message: string;
      suggestion?: string;
    };
    const issues: Issue[] = [];

    let componentCount = 0;
    let componentSetCount = 0;

    const inspectComponent = (comp: ComponentNode, inSet: boolean) => {
      if (!inSet && !comp.description.trim()) {
        issues.push({
          severity: 'blocker',
          category: 'component',
          target: comp.name,
          nodeId: comp.id,
          message: 'Component missing description',
          suggestion: `update_component(nodeId:"${comp.id}", description:"...")`,
        });
      }
      const textCount = countTextNodes(comp);
      const propDefs = comp.componentPropertyDefinitions;
      const textProps = Object.values(propDefs).filter((d) => d.type === 'TEXT').length;
      if (textCount > 0 && textProps === 0) {
        issues.push({
          severity: 'warning',
          category: 'component',
          target: comp.name,
          nodeId: comp.id,
          message: `${textCount} text node(s) but no TEXT properties exposed`,
          suggestion: `add_component_property(nodeId:"${comp.id}", propertyName:"label", type:"TEXT")`,
        });
      }
      if (countDescendants(comp) === 0) {
        issues.push({
          severity: 'warning',
          category: 'component',
          target: comp.name,
          nodeId: comp.id,
          message: 'Empty component (no children)',
        });
      }
    };

    if (checkComponents) {
      const walk = (node: SceneNode) => {
        if (node.type === 'COMPONENT_SET') {
          componentSetCount++;
          const set = node as ComponentSetNode;
          const variants = set.children.filter((c) => c.type === 'COMPONENT') as ComponentNode[];
          if (!set.description.trim()) {
            issues.push({
              severity: 'blocker',
              category: 'component',
              target: set.name,
              nodeId: set.id,
              message: 'Component set missing description',
              suggestion: `update_component(nodeId:"${set.id}", description:"...")`,
            });
          }
          if (variants.length === 1) {
            issues.push({
              severity: 'warning',
              category: 'component',
              target: set.name,
              nodeId: set.id,
              message: 'Component set has only 1 variant — consider converting to standalone component',
            });
          }
          for (const v of variants) {
            componentCount++;
            inspectComponent(v, true);
          }
          return;
        }
        if (node.type === 'COMPONENT') {
          componentCount++;
          inspectComponent(node as ComponentNode, false);
        }
        if ('children' in node) {
          for (const child of (node as ChildrenMixin).children) walk(child);
        }
      };
      for (const page of figma.root.children) {
        for (const child of page.children) walk(child);
      }
    }

    let variableCount = 0;
    if (checkVariables) {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      for (const collection of collections) {
        // Primitives (Raw) collections often intentionally have no scopes — exempt them.
        const isPrimitive = /primitive|raw|base/i.test(collection.name);
        for (const varId of collection.variableIds) {
          const variable = await figma.variables.getVariableByIdAsync(varId);
          if (!variable) continue;
          variableCount++;

          if (!isPrimitive) {
            const scopes = variable.scopes || [];
            if (scopes.length === 0 || scopes.includes('ALL_SCOPES')) {
              issues.push({
                severity: 'blocker',
                category: 'variable',
                target: `${collection.name}/${variable.name}`,
                message: 'Semantic variable has no explicit scopes (or uses ALL_SCOPES)',
                suggestion: `variables_ep(method:"update", variableId:"${variable.id}", scopes:["ALL_FILLS"])`,
              });
            }
          }

          const codeSyntaxKeys = Object.keys(variable.codeSyntax || {});
          if (codeSyntaxKeys.length === 0) {
            issues.push({
              severity: 'warning',
              category: 'variable',
              target: `${collection.name}/${variable.name}`,
              message: 'Variable missing code syntax (blocks Dev Mode expression)',
              suggestion: `variables_ep(method:"set_code_syntax", variableId:"${variable.id}", syntax:{WEB:"var(--...)"})`,
            });
          }
        }
      }
    }

    let styleCount = 0;
    if (checkStyles) {
      const [paintStyles, textStyles, effectStyles] = await Promise.all([
        figma.getLocalPaintStylesAsync(),
        figma.getLocalTextStylesAsync(),
        figma.getLocalEffectStylesAsync(),
      ]);
      for (const style of [...paintStyles, ...textStyles, ...effectStyles]) {
        styleCount++;
        if (!style.description?.trim()) {
          issues.push({
            severity: 'warning',
            category: 'style',
            target: `${style.type}:${style.name}`,
            message: 'Style missing description',
          });
        }
      }
    }

    const blockers = issues.filter((i) => i.severity === 'blocker');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return {
      ready: blockers.length === 0,
      summary: {
        components: componentCount,
        componentSets: componentSetCount,
        variables: variableCount,
        styles: styleCount,
        blockerCount: blockers.length,
        warningCount: warnings.length,
      },
      blockers,
      warnings,
      _note:
        blockers.length > 0
          ? 'Fix blockers before publishing. Also run lint_fix_all for token/contrast issues.'
          : warnings.length > 0
            ? 'Ready to publish with warnings. Recommended: run lint_fix_all first, then publish via Figma Assets panel → Publish.'
            : 'All structural checks passed. Run lint_fix_all for final token/contrast polish, then publish via Figma Assets panel → Publish.',
    };
  });
}
