/**
 * Tests for CJK font compatibility warning (I5).
 * Verifies the CJK script detection regex and platform font resolution.
 */

import { describe, expect, it } from 'vitest';

// Re-implement the detection logic for unit testing (same regex from write-nodes-create.ts)
const CJK_RE =
  /[\u4E00-\u9FFF\u3400-\u4DBF\u{20000}-\u{2A6DF}\u{2A700}-\u{2B73F}\u{2B740}-\u{2B81F}\u{2B820}-\u{2CEAF}\u{2CEB0}-\u{2EBEF}\u{30000}-\u{3134F}\u3000-\u303F\uFF00-\uFFEF]/u;
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF]/;
const HANGUL_RE = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uD7B0-\uD7FF]/;

type Platform = 'ios' | 'android' | 'web' | 'unknown';

const PLATFORM_FONTS: Record<Platform, { latin: string; cjkSC: string; cjkJP: string; cjkKR: string }> = {
  ios: { latin: 'SF Pro Text', cjkSC: 'PingFang SC', cjkJP: 'Hiragino Sans', cjkKR: 'Apple SD Gothic Neo' },
  android: { latin: 'Roboto', cjkSC: 'Noto Sans SC', cjkJP: 'Noto Sans JP', cjkKR: 'Noto Sans KR' },
  web: { latin: 'Inter', cjkSC: 'Noto Sans SC', cjkJP: 'Noto Sans JP', cjkKR: 'Noto Sans KR' },
  unknown: { latin: 'Inter', cjkSC: 'Inter', cjkJP: 'Inter', cjkKR: 'Inter' },
};

function platformDefaultFont(platform: Platform, content: string): string {
  const fonts = PLATFORM_FONTS[platform];
  if (!content) return fonts.latin;
  if (HANGUL_RE.test(content)) return fonts.cjkKR;
  if (KANA_RE.test(content)) return fonts.cjkJP;
  if (CJK_RE.test(content)) return fonts.cjkSC;
  return fonts.latin;
}

function detectCjkConflict(
  explicitFont: string,
  content: string,
  platform: Platform,
): { language: string; recommended: string } | null {
  const detectedCjk = HANGUL_RE.test(content)
    ? 'Korean'
    : KANA_RE.test(content)
      ? 'Japanese'
      : CJK_RE.test(content)
        ? 'Chinese'
        : null;
  if (!detectedCjk) return null;
  const recommended = platformDefaultFont(platform, content);
  if (recommended === explicitFont) return null;
  return { language: detectedCjk, recommended };
}

describe('CJK script detection', () => {
  it('detects Chinese characters', () => {
    expect(CJK_RE.test('你好世界')).toBe(true);
    expect(CJK_RE.test('Hello')).toBe(false);
  });

  it('detects Japanese kana', () => {
    expect(KANA_RE.test('こんにちは')).toBe(true);
    expect(KANA_RE.test('Hello')).toBe(false);
  });

  it('detects Korean hangul', () => {
    expect(HANGUL_RE.test('안녕하세요')).toBe(true);
    expect(HANGUL_RE.test('Hello')).toBe(false);
  });

  it('detects mixed CJK + latin', () => {
    expect(CJK_RE.test('Hello 你好')).toBe(true);
  });
});

describe('platformDefaultFont', () => {
  it('returns PingFang SC for Chinese on iOS', () => {
    expect(platformDefaultFont('ios', '你好')).toBe('PingFang SC');
  });

  it('returns Noto Sans SC for Chinese on Android', () => {
    expect(platformDefaultFont('android', '你好')).toBe('Noto Sans SC');
  });

  it('returns Hiragino Sans for Japanese on iOS', () => {
    expect(platformDefaultFont('ios', 'こんにちは')).toBe('Hiragino Sans');
  });

  it('returns Apple SD Gothic Neo for Korean on iOS', () => {
    expect(platformDefaultFont('ios', '안녕하세요')).toBe('Apple SD Gothic Neo');
  });

  it('returns latin font for English text', () => {
    expect(platformDefaultFont('ios', 'Hello')).toBe('SF Pro Text');
    expect(platformDefaultFont('web', 'Hello')).toBe('Inter');
  });

  it('prioritizes Korean over CJK for mixed content', () => {
    expect(platformDefaultFont('ios', '한글 and 中文')).toBe('Apple SD Gothic Neo');
  });
});

describe('CJK font conflict detection', () => {
  it('warns when Inter is used for Chinese on iOS', () => {
    const conflict = detectCjkConflict('Inter', '你好世界', 'ios');
    expect(conflict).not.toBeNull();
    expect(conflict!.language).toBe('Chinese');
    expect(conflict!.recommended).toBe('PingFang SC');
  });

  it('warns when Roboto is used for Japanese on iOS', () => {
    const conflict = detectCjkConflict('Roboto', 'こんにちは', 'ios');
    expect(conflict).not.toBeNull();
    expect(conflict!.language).toBe('Japanese');
    expect(conflict!.recommended).toBe('Hiragino Sans');
  });

  it('no warning when correct CJK font is used', () => {
    const conflict = detectCjkConflict('PingFang SC', '你好', 'ios');
    expect(conflict).toBeNull();
  });

  it('no warning for English content with any font', () => {
    const conflict = detectCjkConflict('Inter', 'Hello World', 'ios');
    expect(conflict).toBeNull();
  });

  it('no warning on unknown platform (falls back to Inter for CJK)', () => {
    const conflict = detectCjkConflict('Inter', '你好', 'unknown');
    expect(conflict).toBeNull();
  });

  it('warns when SF Pro is used for Korean on iOS', () => {
    const conflict = detectCjkConflict('SF Pro Text', '안녕하세요', 'ios');
    expect(conflict).not.toBeNull();
    expect(conflict!.language).toBe('Korean');
    expect(conflict!.recommended).toBe('Apple SD Gothic Neo');
  });
});
