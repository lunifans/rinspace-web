import { describe, expect, it } from 'vitest';
import vectors from '../../contracts/tag-normalization-v1.json';
import { normalizeCanonicalTagName } from './tagNameNormalization';

describe('canonical Tag name normalization', () => {
  it('matches the language-neutral vectors', () => {
    expect(vectors.schema).toBe('tag-normalization/v1');
    for (const vector of vectors.vectors) {
      expect(normalizeCanonicalTagName(vector.input)).toBe(vector.normalized);
    }
  });
});
