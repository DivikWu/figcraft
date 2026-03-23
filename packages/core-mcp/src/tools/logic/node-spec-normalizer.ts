export type NodeSpecLike = Record<string, unknown>;

export const PLATFORM_PRESETS: Record<string, { width: number; height: number }> = {
  ios: { width: 402, height: 874 },
  android: { width: 412, height: 915 },
  web: { width: 1440, height: 1024 },
};

const ORCHESTRATION_MARGIN_KEYS = ['marginHorizontal', 'marginLeft', 'marginRight'] as const;

export function cloneSpec<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function ensureRecord(value: unknown): Record<string, unknown> {
  return (value && typeof value === 'object' && !Array.isArray(value))
    ? value as Record<string, unknown>
    : {};
}

function inferRoleFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const lower = name.toLowerCase();
  if (lower.includes('header')) return 'header';
  if (lower.includes('hero')) return 'hero';
  if (lower.includes('nav') || lower.includes('navigation') || lower.includes('tabs')) return 'nav';
  if (lower.includes('form')) return 'form';
  if (lower.includes('stats') || lower.includes('metrics')) return 'stats';
  if (lower.includes('list')) return 'list';
  if (lower.includes('row')) return 'row';
  if (lower.includes('content') || lower.includes('body') || lower.includes('preferences')) return 'content';
  if (lower.includes('card')) return 'card';
  if (lower.includes('footer')) return 'footer';
  if (lower.includes('action')) return 'actions';
  return undefined;
}

function readNumericProp(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractMarginInsets(props: Record<string, unknown>): { left?: number; right?: number } {
  const both = readNumericProp(props.marginHorizontal);
  const left = readNumericProp(props.marginLeft) ?? both;
  const right = readNumericProp(props.marginRight) ?? both;
  return { left, right };
}

function stripOrchestrationProps(props: Record<string, unknown>): Record<string, unknown> {
  const next = { ...props };
  for (const key of ORCHESTRATION_MARGIN_KEYS) delete next[key];
  return next;
}

function shouldWrapForInsets(props: Record<string, unknown>): boolean {
  const { left, right } = extractMarginInsets(props);
  return (left ?? 0) > 0 || (right ?? 0) > 0;
}

function makeInsetWrapper(node: NodeSpecLike, props: Record<string, unknown>): NodeSpecLike {
  const { left, right } = extractMarginInsets(props);
  const inner = cloneSpec(node);
  const innerProps = ensureRecord(inner.props);
  inner.props = stripOrchestrationProps(innerProps);
  if (inner.type !== 'text' && (inner.props as Record<string, unknown>).layoutAlign == null) {
    (inner.props as Record<string, unknown>).layoutAlign = 'STRETCH';
  }

  const wrapperProps: Record<string, unknown> = {
    autoLayout: true,
    layoutDirection: 'VERTICAL',
    layoutAlign: 'STRETCH',
  };
  if ((left ?? 0) > 0) wrapperProps.paddingLeft = left;
  if ((right ?? 0) > 0) wrapperProps.paddingRight = right;

  return {
    type: 'frame',
    name: `${typeof node.name === 'string' ? node.name : 'Content'} Wrapper`,
    props: wrapperProps,
    children: [inner],
  };
}

function inferScreenItemSpacing(props: Record<string, unknown>): number {
  const width = readNumericProp(props.width);
  return width != null && width >= 1000 ? 24 : 20;
}

export function applyRoleDefaults(
  node: NodeSpecLike,
  options: {
    inferRole?: boolean;
  } = {},
): NodeSpecLike {
  const props = ensureRecord(node.props);
  if (options.inferRole && node.role == null && typeof node.name === 'string') {
    node.role = inferRoleFromName(node.name);
  }

  const role = typeof node.role === 'string' ? node.role.toLowerCase() : undefined;
  if (node.type !== 'frame') {
    node.props = props;
    return node;
  }

  if (role === 'screen') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.primaryAxisAlignItems == null) props.primaryAxisAlignItems = 'MIN';
    if (props.itemSpacing == null) props.itemSpacing = inferScreenItemSpacing(props);
  } else if (role && props.layoutAlign == null) {
    props.layoutAlign = 'STRETCH';
  }

  if (role === 'header') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.itemSpacing == null) props.itemSpacing = 8;
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
    if (props.paddingTop == null) props.paddingTop = 20;
    if (props.paddingBottom == null) props.paddingBottom = 8;
  } else if (role === 'hero') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.itemSpacing == null) props.itemSpacing = 12;
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
    if (props.paddingTop == null) props.paddingTop = 24;
    if (props.paddingBottom == null) props.paddingBottom = 24;
  } else if (role === 'nav') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'HORIZONTAL';
    if (props.itemSpacing == null) props.itemSpacing = 12;
    if (props.primaryAxisAlignItems == null) props.primaryAxisAlignItems = 'SPACE_BETWEEN';
    if (props.counterAxisAlignItems == null) props.counterAxisAlignItems = 'CENTER';
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
    if (props.paddingTop == null) props.paddingTop = 8;
    if (props.paddingBottom == null) props.paddingBottom = 8;
  } else if (role === 'content') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.itemSpacing == null) props.itemSpacing = 20;
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
  } else if (role === 'list') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.itemSpacing == null) props.itemSpacing = 12;
    if (props.layoutAlign == null) props.layoutAlign = 'STRETCH';
  } else if (role === 'row') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'HORIZONTAL';
    if (props.itemSpacing == null) props.itemSpacing = 12;
    if (props.counterAxisAlignItems == null) props.counterAxisAlignItems = 'CENTER';
    if (props.layoutAlign == null) props.layoutAlign = 'STRETCH';
  } else if (role === 'stats') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'HORIZONTAL';
    if (props.itemSpacing == null) props.itemSpacing = 16;
    if (props.counterAxisAlignItems == null) props.counterAxisAlignItems = 'CENTER';
    if (props.layoutAlign == null) props.layoutAlign = 'STRETCH';
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
  } else if (role === 'form') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.itemSpacing == null) props.itemSpacing = 16;
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
  } else if (role === 'card') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.itemSpacing == null) props.itemSpacing = 12;
    if (props.paddingLeft == null) props.paddingLeft = 16;
    if (props.paddingRight == null) props.paddingRight = 16;
    if (props.paddingTop == null) props.paddingTop = 16;
    if (props.paddingBottom == null) props.paddingBottom = 16;
    if (props.cornerRadius == null) props.cornerRadius = 16;
  } else if (role === 'actions' || role === 'footer') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
    if (props.itemSpacing == null) props.itemSpacing = 12;
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
  } else if (role === 'social_row') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'HORIZONTAL';
    if (props.itemSpacing == null) props.itemSpacing = 12;
    if (props.counterAxisAlignItems == null) props.counterAxisAlignItems = 'CENTER';
  } else if (role === 'system_bar') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'HORIZONTAL';
    if (props.primaryAxisAlignItems == null) props.primaryAxisAlignItems = 'SPACE_BETWEEN';
    if (props.counterAxisAlignItems == null) props.counterAxisAlignItems = 'CENTER';
    if (props.paddingLeft == null) props.paddingLeft = 16;
    if (props.paddingRight == null) props.paddingRight = 16;
    if (props.paddingTop == null) props.paddingTop = 12;
    if (props.paddingBottom == null) props.paddingBottom = 12;
  } else if (role === 'button') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'HORIZONTAL';
    if (props.primaryAxisAlignItems == null) props.primaryAxisAlignItems = 'CENTER';
    if (props.counterAxisAlignItems == null) props.counterAxisAlignItems = 'CENTER';
    if (props.layoutAlign == null) props.layoutAlign = 'STRETCH';
    if (props.height == null && props.minHeight == null) props.height = 48;
    if (props.paddingLeft == null) props.paddingLeft = 24;
    if (props.paddingRight == null) props.paddingRight = 24;
  } else if (role === 'input' || role === 'field') {
    if (props.autoLayout == null) props.autoLayout = true;
    if (props.layoutDirection == null) props.layoutDirection = 'HORIZONTAL';
    if (props.counterAxisAlignItems == null) props.counterAxisAlignItems = 'CENTER';
    if (props.layoutAlign == null) props.layoutAlign = 'STRETCH';
    if (props.height == null && props.minHeight == null) props.height = 48;
    if (props.paddingLeft == null) props.paddingLeft = 16;
    if (props.paddingRight == null) props.paddingRight = 16;
    if (props.cornerRadius == null) props.cornerRadius = 8;
    if (props.stroke == null) props.stroke = '#E0E0E0';
    if (props.strokeWeight == null) props.strokeWeight = 1;
  }

  node.props = props;
  return node;
}

export function normalizeNodeTree(
  nodeInput: NodeSpecLike,
  options: {
    defaultType?: string;
    defaultName?: string;
    inferRole?: boolean;
  } = {},
): NodeSpecLike {
  const node = cloneSpec(nodeInput);
  node.type ??= options.defaultType;
  node.name ??= options.defaultName;
  applyRoleDefaults(node, { inferRole: options.inferRole === true });

  if (Array.isArray(node.children)) {
    node.children = node.children.map((child, index) =>
      normalizeNodeTree(child as NodeSpecLike, {
        inferRole: false,
        defaultName: `Child ${index + 1}`,
      }));
  }

  const props = ensureRecord(node.props);
  if (shouldWrapForInsets(props)) {
    return makeInsetWrapper(node, props);
  }

  node.props = stripOrchestrationProps(props);
  return node;
}

export function normalizeNodeForest(
  nodes: NodeSpecLike[],
  options: {
    inferRole?: boolean;
  } = {},
): NodeSpecLike[] {
  return nodes.map((node, index) => normalizeNodeTree(node, {
    inferRole: options.inferRole === true,
    defaultName: `Node ${index + 1}`,
  }));
}

export function buildScreenShellSpec(
  shellInput: NodeSpecLike | undefined,
  params: {
    name?: string;
    platform?: string;
    hasSystemBar?: boolean;
  },
): NodeSpecLike {
  const shell = cloneSpec(shellInput ?? {});
  shell.type ??= 'frame';
  shell.name ??= params.name ?? 'Screen';
  shell.role ??= 'screen';

  const props = ensureRecord(shell.props);
  const preset = params.platform ? PLATFORM_PRESETS[params.platform.toLowerCase()] : undefined;
  if (preset) {
    if (props.width == null) props.width = preset.width;
    if (props.height == null) props.height = preset.height;
  }
  if (props.autoLayout == null) props.autoLayout = true;
  if (props.layoutDirection == null) props.layoutDirection = 'VERTICAL';
  if (props.itemSpacing == null) props.itemSpacing = params.platform?.toLowerCase() === 'web' ? 24 : 20;
  if (props.primaryAxisAlignItems == null) props.primaryAxisAlignItems = 'MIN';
  if (params.hasSystemBar) {
    if (props.paddingLeft == null) props.paddingLeft = 0;
    if (props.paddingRight == null) props.paddingRight = 0;
    if (props.paddingTop == null) props.paddingTop = 0;
  }
  shell.props = props;

  return normalizeNodeTree(shell, { inferRole: false });
}
