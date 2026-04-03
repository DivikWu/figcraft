/**
 * Tests for HandlerError class and assertHandler utility.
 */

import { describe, expect, it } from 'vitest';
import { assertHandler, HandlerError } from '../../packages/adapter-figma/src/utils/handler-error.js';

describe('HandlerError', () => {
  it('sets name, message, and default code', () => {
    const err = new HandlerError('something broke');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('HandlerError');
    expect(err.message).toBe('something broke');
    expect(err.code).toBe('HANDLER_ERROR');
  });

  it('accepts custom error code', () => {
    const err = new HandlerError('not found', 'NODE_NOT_FOUND');
    expect(err.code).toBe('NODE_NOT_FOUND');
  });
});

describe('assertHandler', () => {
  it('does not throw when condition is truthy', () => {
    expect(() => assertHandler(true, 'should not throw')).not.toThrow();
    expect(() => assertHandler(1, 'should not throw')).not.toThrow();
    expect(() => assertHandler('non-empty', 'should not throw')).not.toThrow();
  });

  it('throws HandlerError when condition is falsy', () => {
    expect(() => assertHandler(false, 'oops')).toThrow(HandlerError);
    expect(() => assertHandler(null, 'oops')).toThrow(HandlerError);
    expect(() => assertHandler(0, 'oops')).toThrow(HandlerError);
    expect(() => assertHandler('', 'oops')).toThrow(HandlerError);
  });

  it('thrown error has correct message and code', () => {
    try {
      assertHandler(false, 'missing node', 'NODE_NOT_FOUND');
    } catch (err) {
      expect(err).toBeInstanceOf(HandlerError);
      expect((err as HandlerError).message).toBe('missing node');
      expect((err as HandlerError).code).toBe('NODE_NOT_FOUND');
    }
  });
});
