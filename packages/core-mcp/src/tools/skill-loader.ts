/**
 * Shared skill loading utilities — unified path resolution and environment detection.
 *
 * Used by mode.ts (design rules) and creation-guide.ts (creation guides).
 * Ensures both modules use the same probe logic for dev vs packaged environments.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const selfDir = dirname(fileURLToPath(import.meta.url));

/** Absolute path to the skills/ directory (source of truth in dev environments). */
export const skillsDir = join(selfDir, '..', '..', '..', '..', 'skills');

/**
 * Whether to load skills from source (skills/*.SKILL.md) or fallback (dist/*.md).
 * Probes ui-ux-fundamentals as the canonical skill — it's always present in dev.
 */
export const useSkills = existsSync(join(skillsDir, 'ui-ux-fundamentals', 'SKILL.md'));
