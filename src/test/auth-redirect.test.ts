import { describe, expect, it } from 'vitest';
import { createAuthCallbackUrl, getSafeReturnPath } from '@/lib/auth-redirect';

describe('auth redirect handling', () => {
  it.each([
    ['/account', '/account'],
    ['/checkout?item=steel', '/checkout?item=steel'],
    ['//example.com', '/account'],
    ['https://example.com/account', '/account'],
    ['/\\example.com', '/account'],
  ])('accepts only safe in-app return paths (%s)', (input, expected) => {
    expect(getSafeReturnPath(input)).toBe(expected);
  });

  it('builds a same-origin auth callback with the requested return path', () => {
    expect(createAuthCallbackUrl('https://shop.example', '/account?tab=orders'))
      .toBe('https://shop.example/auth?next=%2Faccount%3Ftab%3Dorders');
  });
});
