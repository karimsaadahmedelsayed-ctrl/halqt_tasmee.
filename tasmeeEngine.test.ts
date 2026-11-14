import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeArabic,
  normalizeList,
  isNearMatch,
  TasmeeMatcher,
  toArabicNumerals,
  getSurahWords
} from './tasmeeEngine';

test('normalizeArabic strips harakat and standardizes letters', () => {
  const input = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
  const expected = "بسم الله الرحمن الرحيم";
  assert.equal(normalizeArabic(input), expected);

  const alefInput = "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ";
  const expectedAlef = "اياك نعبد واياك نستعين";
  assert.equal(normalizeArabic(alefInput), expectedAlef);

  const taaInput = "الْقَارِعَةُ";
  assert.equal(normalizeArabic(taaInput), "القارعه");
});

test('toArabicNumerals formats numbers in Arabic numerals', () => {
  assert.equal(toArabicNumerals(1), "١");
  assert.equal(toArabicNumerals(7), "٧");
  assert.equal(toArabicNumerals(114), "١١٤");
});

test('isNearMatch handles close phonetic variations', () => {
  assert.equal(isNearMatch("الصراط", "السراط"), true);
  assert.equal(isNearMatch("الرحيم", "الرحيم"), true);
  assert.equal(isNearMatch("الارض", "السماء"), false);
});

test('TasmeeMatcher accurately flags correct words and increments cursor', () => {
  const targetWords = ["بسم", "الله", "الرحمن", "الرحيم"];
  const matcher = new TasmeeMatcher(targetWords);

  matcher.feed(["بسم", "الله"]);
  assert.equal(matcher.cursor(), 2);
  assert.equal(matcher.st[0], 'ok');
  assert.equal(matcher.st[1], 'ok');
  assert.equal(matcher.st[2], null);

  matcher.feed(["الرحمن", "الرحيم"]);
  assert.equal(matcher.cursor(), 4);
  assert.equal(matcher.st[2], 'ok');
  assert.equal(matcher.st[3], 'ok');

  const stats = matcher.getStats();
  assert.equal(stats.ok, 4);
  assert.equal(stats.err, 0);
});

test('getSurahWords returns valid Quran word units for Surah Al-Fatiha', () => {
  const words = getSurahWords(1);
  assert.ok(words.length > 25);
  assert.equal(words[0].word, "بِسْمِ");
  assert.equal(words[0].ayahNumber, 1);
});
