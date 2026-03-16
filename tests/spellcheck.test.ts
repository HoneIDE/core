import { describe, test, expect } from 'bun:test';
import { SpellChecker } from '../src/spellcheck/spell-checker';

describe('SpellChecker', () => {
  test('loads dictionary', () => {
    const checker = new SpellChecker();
    expect(checker.getDictionarySize()).toBeGreaterThan(500);
  });

  test('common words are correct', () => {
    const checker = new SpellChecker();
    expect(checker.isCorrect('function')).toBe(true);
    expect(checker.isCorrect('const')).toBe(true);
    expect(checker.isCorrect('return')).toBe(true);
    expect(checker.isCorrect('the')).toBe(true);
    expect(checker.isCorrect('import')).toBe(true);
  });

  test('misspelled words detected', () => {
    const checker = new SpellChecker();
    expect(checker.isCorrect('funciton')).toBe(false);
    expect(checker.isCorrect('cosnt')).toBe(false);
    expect(checker.isCorrect('retrun')).toBe(false);
  });

  test('single-char words are always correct', () => {
    const checker = new SpellChecker();
    expect(checker.isCorrect('a')).toBe(true);
    expect(checker.isCorrect('x')).toBe(true);
    expect(checker.isCorrect('z')).toBe(true);
  });

  test('all-uppercase short words (acronyms) are correct', () => {
    const checker = new SpellChecker();
    expect(checker.isCorrect('API')).toBe(true);
    expect(checker.isCorrect('URL')).toBe(true);
    expect(checker.isCorrect('HTTP')).toBe(true);
  });

  test('numbers are always correct', () => {
    const checker = new SpellChecker();
    expect(checker.isCorrect('123')).toBe(true);
    expect(checker.isCorrect('42')).toBe(true);
  });

  test('custom words can be added', () => {
    const checker = new SpellChecker();
    expect(checker.isCorrect('foobar')).toBe(false);
    checker.addWord('foobar');
    expect(checker.isCorrect('foobar')).toBe(true);
  });

  test('custom words can be removed', () => {
    const checker = new SpellChecker();
    checker.addWord('foobar');
    expect(checker.isCorrect('foobar')).toBe(true);
    checker.removeWord('foobar');
    expect(checker.isCorrect('foobar')).toBe(false);
  });

  test('case insensitive', () => {
    const checker = new SpellChecker();
    expect(checker.isCorrect('Function')).toBe(true);
    expect(checker.isCorrect('FUNCTION')).toBe(true);
    expect(checker.isCorrect('function')).toBe(true);
  });

  test('extractWords splits on non-alpha', () => {
    const checker = new SpellChecker();
    const words = checker.extractWords('hello world 123 test');
    expect(words.length).toBe(3); // hello, world, test (123 skipped by length)
    expect(words[0].word).toBe('hello');
    expect(words[0].column).toBe(0);
    expect(words[1].word).toBe('world');
    expect(words[1].column).toBe(6);
  });

  test('extractWords splits camelCase', () => {
    const checker = new SpellChecker();
    const words = checker.extractWords('getUserName');
    expect(words.length).toBe(3); // get, User, Name
    expect(words[0].word).toBe('get');
    expect(words[1].word).toBe('User');
    expect(words[2].word).toBe('Name');
  });

  test('checkLine returns errors for misspelled words', () => {
    const checker = new SpellChecker();
    const errors = checker.checkLine('the funciton retrun', 0);
    expect(errors.length).toBe(2); // funciton, retrun
    expect(errors[0].word).toBe('funciton');
    expect(errors[1].word).toBe('retrun');
  });

  test('checkLine returns empty for correct text', () => {
    const checker = new SpellChecker();
    const errors = checker.checkLine('the function returns a value', 0);
    expect(errors.length).toBe(0);
  });

  test('suggest generates transposition suggestions', () => {
    const checker = new SpellChecker();
    const suggestions = checker.suggest('cosnt');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain('const');
  });

  test('disabled checker returns no errors', () => {
    const checker = new SpellChecker();
    checker.setEnabled(false);
    const errors = checker.checkLine('funciton retrun', 0);
    expect(errors.length).toBe(0);
  });
});
