# Phase 3 工程优化计划

> 状态（2026-04-20）：部分完成，剩余 3.1 和 3.3a 待做，完成后可删除。

## 已完成

- [x] Phase 1: Biome lint/format + Husky + coverage + CI (`b143b2f`)
- [x] Phase 2: 60 new tests — describeFix + adapter utils (`d4bee2e`)
- [x] 3.3b Quality Engine 规则清单（`docs/generated/lint-rules.md` + `scripts/generate-lint-rules-doc.ts`）

## 待办

- [ ] 3.1 TypeScript Project References（见下文详细计划）
- [ ] 3.3a DTCG 用户流程指南（`docs/dtcg-workflow.md`）
- [~] 3.2 Changeset 版本管理（已决定跳过，详见下文）

---

## 3.1 TypeScript Project References

**目标**: 启用增量编译，加速 `tsc` 和 IDE 跨包跳转。

**当前状态**: 6 个包各有 `tsconfig.json`，无 `composite`/`references`，每次 `tsc --noEmit` 全量编译。

**改动清单**:

1. **每个包的 tsconfig.json 加 `composite: true`**:
   - `packages/shared/tsconfig.json`
   - `packages/relay/tsconfig.json` (depends on shared)
   - `packages/quality-engine/tsconfig.json` (depends on shared)
   - `packages/adapter-figma/tsconfig.json` (depends on shared, quality-engine)
   - `packages/core-mcp/tsconfig.json` (depends on shared, relay, quality-engine)
   - `packages/figcraft-design/tsconfig.json` (depends on core-mcp)

2. **根 tsconfig.json 加 `references`** (按依赖拓扑序):
   ```json
   {
     "references": [
       { "path": "packages/shared" },
       { "path": "packages/relay" },
       { "path": "packages/quality-engine" },
       { "path": "packages/adapter-figma" },
       { "path": "packages/core-mcp" },
       { "path": "packages/figcraft-design" }
     ]
   }
   ```

3. **改 typecheck 脚本**:
   - 当前: `tsc --noEmit && tsc --noEmit -p tsconfig.plugin.json`
   - 改为: `tsc --build && tsc --noEmit -p tsconfig.plugin.json`
   - 注意: `--build` 不支持 `--noEmit`，会产生 `.d.ts` 到各包 `dist/`

4. **处理 rootDir 冲突**:
   - `figcraft-design/tsconfig.json` 的 `rootDir: ".."` 指向 monorepo 根——`composite` 要求 `rootDir` 在包内
   - 需要改为 `rootDir: "src"` 并调整 imports
   - `adapter-figma` 同理

**风险**:
- `composite` 要求所有 import 路径都能解析到 `.d.ts`，可能暴露隐式依赖
- `--build` 会在各包 `dist/` 生成 `.d.ts`，需确认 tsup 和 esbuild 不冲突
- Plugin 用独立 `tsconfig.plugin.json`（bundler resolution），不参与 project references

**预估**: 半天，主要在调试 rootDir 和隐式依赖问题。

---

## ~~3.2 Changeset 版本管理~~ (跳过)

**原因**: 当前只发布 `figcraft-design` 一个包，手动 `npm version` 够用。等多包发布时再引入。

---

## 3.3 文档补齐

**目标**: 补两份缺失文档。

### 3.3a DTCG 用户流程指南

**位置**: `docs/dtcg-workflow.md`

**内容大纲**:
1. 什么是 DTCG (W3C Design Token Community Group) 格式
2. 准备 Token JSON 文件（结构示例）
3. 使用 `sync_tokens(filePath)` 同步到 Figma
   - 类型映射表（color → COLOR variable, dimension → FLOAT variable, etc.）
   - alias 解析行为
   - 复合类型 (typography → Text Style, shadow → Effect Style)
4. 使用 `diff_tokens` 对比差异
5. 常见问题排查

**信息来源**: `packages/core-mcp/src/dtcg.ts` + `CLAUDE.md` 的 DTCG 映射表 + `content/prompts/sync-tokens.yaml`

### 3.3b Quality Engine 规则清单

**位置**: `docs/generated/lint-rules.md` (自动生成)

**方案**: 写一个脚本 `scripts/generate-lint-rules-doc.ts`，从 `packages/quality-engine/src/engine.ts` 的 `ALL_RULES` 数组读取每条规则的:
- `id`, `description`, `category`, `severity`
- `autoFixable` (boolean)
- `describeFix` 存在与否
- `ai.preventionHint` (给 AI 的预防提示)

输出 Markdown 表格，加入 `npm run docs:rules` 脚本。

**预估**: 2-3 小时。

---

## 执行顺序

| 顺序 | 任务 | 预估 | 依赖 |
|------|------|------|------|
| 1 | 3.3b 规则清单脚本 | 1h | 无 |
| 2 | 3.3a DTCG 流程文档 | 1-2h | 无 |
| 3 | 3.1 Project References | 半天 | 无 (可独立进行) |

建议先做 3.3（确定性高、立即有用），3.1 视需要再做。
