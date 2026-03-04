import { describe, it, expect } from 'vitest';
import { validateAnswers } from './response';
import type { Question } from '../types';

function makeQuestion(
  overrides: Partial<Question> & { id: string; type: Question['type'] },
): Question {
  return {
    text: 'Test question',
    required: false,
    display_order: 1,
    ...overrides,
  };
}

describe('validateAnswers', () => {
  describe('nps_score validation', () => {
    const questions: Question[] = [makeQuestion({ id: 'nps', type: 'nps_score', required: true })];

    it('accepts valid score 0', () => {
      const { sanitized, errors } = validateAnswers({ nps: 0 }, questions);
      expect(errors).toEqual([]);
      expect(sanitized.nps).toBe(0);
    });

    it('accepts valid score 10', () => {
      const { sanitized, errors } = validateAnswers({ nps: 10 }, questions);
      expect(errors).toEqual([]);
      expect(sanitized.nps).toBe(10);
    });

    it('rejects score above 10', () => {
      const { errors } = validateAnswers({ nps: 11 }, questions);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('nps');
    });

    it('rejects negative score', () => {
      const { errors } = validateAnswers({ nps: -1 }, questions);
      expect(errors).toHaveLength(1);
    });

    it('rejects non-integer score', () => {
      const { errors } = validateAnswers({ nps: 7.5 }, questions);
      expect(errors).toHaveLength(1);
    });

    it('rejects string that is not a valid number', () => {
      const { errors } = validateAnswers({ nps: 'abc' }, questions);
      expect(errors).toHaveLength(1);
    });
  });

  describe('required field validation', () => {
    const questions: Question[] = [makeQuestion({ id: 'q1', type: 'free_text', required: true })];

    it('returns error when required field is missing', () => {
      const { errors } = validateAnswers({}, questions);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('q1 is required');
    });

    it('returns error when required field is empty string', () => {
      const { errors } = validateAnswers({ q1: '' }, questions);
      expect(errors).toHaveLength(1);
    });

    it('returns error when required field is null', () => {
      const { errors } = validateAnswers({ q1: null }, questions);
      expect(errors).toHaveLength(1);
    });
  });

  describe('optional field validation', () => {
    const questions: Question[] = [makeQuestion({ id: 'q1', type: 'free_text', required: false })];

    it('skips validation when optional field is missing', () => {
      const { sanitized, errors } = validateAnswers({}, questions);
      expect(errors).toEqual([]);
      expect(sanitized).toEqual({});
    });
  });

  describe('free_text validation', () => {
    it('accepts and returns text', () => {
      const questions: Question[] = [makeQuestion({ id: 'comment', type: 'free_text' })];
      const { sanitized, errors } = validateAnswers({ comment: 'Great!' }, questions);
      expect(errors).toEqual([]);
      expect(sanitized.comment).toBe('Great!');
    });

    it('truncates text exceeding max_length', () => {
      const questions: Question[] = [
        makeQuestion({ id: 'comment', type: 'free_text', max_length: 5 }),
      ];
      const { sanitized } = validateAnswers({ comment: 'Hello World' }, questions);
      expect(sanitized.comment).toBe('Hello');
    });
  });

  describe('rating validation', () => {
    const questions: Question[] = [
      makeQuestion({ id: 'rate', type: 'rating', min_value: 1, max_value: 5 }),
    ];

    it('accepts value within range', () => {
      const { sanitized, errors } = validateAnswers({ rate: 3 }, questions);
      expect(errors).toEqual([]);
      expect(sanitized.rate).toBe(3);
    });

    it('rejects value below min', () => {
      const { errors } = validateAnswers({ rate: 0 }, questions);
      expect(errors).toHaveLength(1);
    });

    it('rejects value above max', () => {
      const { errors } = validateAnswers({ rate: 6 }, questions);
      expect(errors).toHaveLength(1);
    });

    it('uses default range 1-5 when not specified', () => {
      const qs: Question[] = [makeQuestion({ id: 'rate', type: 'rating' })];
      const { sanitized, errors } = validateAnswers({ rate: 3 }, qs);
      expect(errors).toEqual([]);
      expect(sanitized.rate).toBe(3);
    });
  });

  describe('single_select validation', () => {
    const questions: Question[] = [
      makeQuestion({
        id: 'choice',
        type: 'single_select',
        options: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      }),
    ];

    it('accepts valid option value', () => {
      const { sanitized, errors } = validateAnswers({ choice: 'a' }, questions);
      expect(errors).toEqual([]);
      expect(sanitized.choice).toBe('a');
    });

    it('ignores invalid option value', () => {
      const { sanitized } = validateAnswers({ choice: 'c' }, questions);
      expect(sanitized.choice).toBeUndefined();
    });
  });

  describe('radio validation', () => {
    const questions: Question[] = [
      makeQuestion({
        id: 'radio',
        type: 'radio',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      }),
    ];

    it('accepts valid radio value', () => {
      const { sanitized } = validateAnswers({ radio: 'yes' }, questions);
      expect(sanitized.radio).toBe('yes');
    });
  });

  describe('multi_select validation', () => {
    const questions: Question[] = [
      makeQuestion({
        id: 'tags',
        type: 'multi_select',
        options: [
          { value: 'x', label: 'X' },
          { value: 'y', label: 'Y' },
          { value: 'z', label: 'Z' },
        ],
      }),
    ];

    it('accepts array of valid values', () => {
      const { sanitized, errors } = validateAnswers({ tags: ['x', 'z'] }, questions);
      expect(errors).toEqual([]);
      expect(sanitized.tags).toEqual(['x', 'z']);
    });

    it('filters out invalid values from array', () => {
      const { sanitized } = validateAnswers({ tags: ['x', 'invalid'] }, questions);
      expect(sanitized.tags).toEqual(['x']);
    });

    it('treats non-array as empty', () => {
      const { sanitized } = validateAnswers({ tags: 'x' }, questions);
      expect(sanitized.tags).toBeUndefined();
    });
  });

  describe('unknown question ids', () => {
    it('ignores answers for questions not in config', () => {
      const questions: Question[] = [makeQuestion({ id: 'q1', type: 'free_text' })];
      const { sanitized } = validateAnswers({ q1: 'hello', unknown: 'ignored' }, questions);
      expect(sanitized.q1).toBe('hello');
      expect(sanitized).not.toHaveProperty('unknown');
    });
  });
});
