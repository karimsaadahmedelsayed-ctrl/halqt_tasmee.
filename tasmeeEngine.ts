/**
 * Tasmee' Core Engine
 * Speech Recognition Matching, Arabic Text Normalization, and Evaluation
 */

import { SAMPLE_QURAN_VERSES, SURAH_NAMES, SURAH_COUNTS, JUZ_START_INDICES } from './quranData';

/**
 * Remove Arabic diacritics (tashkeel), Quranic pause marks, and tatweel
 */
export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    // Remove Quranic signs and symbols
    .replace(/[\u06D6-\u06ED]/g, '')
    // Remove standard Harakat (fathatan, dammatan, kasratan, fatha, damma, kasra, shadda, sukun, dagger alif)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Tatweel / Kashida
    .replace(/\u0640/g, '')
    // Normalize Alef variations
    .replace(/[إأآٱ]/g, 'ا')
    // Normalize Alif Maqsura to Yaa
    .replace(/[ى]/g, 'ي')
    // Normalize Taa Marbuta to Haa
    .replace(/[ة]/g, 'ه')
    // Normalize Hamza carriers
    .replace(/[ؤئ]/g, 'ء')
    // Strip non-Arabic punctuation, numbers, and symbols
    .replace(/[^\u0600-\u06FF\s]/g, '')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

export const normalizeQuranText = normalizeArabic;

export function normalizeList(words: string[]): string[] {
  return words.map(w => normalizeArabic(w)).filter(Boolean);
}

/**
 * Levenshtein distance for fuzzy speech-to-text match tolerance
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d: number[][] = [];

  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[m][n];
}

/**
 * Determines whether a recognized speech word is a close phonetic match to target Quran word
 */
export function isNearMatch(target: string, spoken: string): boolean {
  if (target === spoken) return true;
  const t = normalizeArabic(target);
  const s = normalizeArabic(spoken);
  if (t === s) return true;
  if (!t || !s) return false;

  const dist = levenshtein(t, s);
  if (dist === 1) return true;
  if (t.length > 5 && dist === 2) return true;

  // Common Arabic phoneme confusions in standard STT models (ar-SA)
  const phoneticEquiv: Record<string, string> = {
    'ص': 'س', 'ض': 'ظ', 'ذ': 'ز', 'ث': 'س', 'ق': 'ك', 'ط': 'ت', 'ء': 'ع'
  };
  let tPhonetic = t;
  let sPhonetic = s;
  for (const [k, v] of Object.entries(phoneticEquiv)) {
    tPhonetic = tPhonetic.replaceAll(k, v);
    sPhonetic = sPhonetic.replaceAll(k, v);
  }
  return tPhonetic === sPhonetic;
}

export type WordMatchState = 'ok' | 'near' | 'err' | 'miss' | null;

export interface QuranWordUnit {
  word: string;
  normalized: string;
  surahNumber: number;
  ayahNumber: number;
  isLastWordOfAyah: boolean;
}

export class TasmeeMatcher {
  private targets: string[];
  public st: WordMatchState[];
  private currentIdx: number = 0;

  constructor(targetWords: string[]) {
    this.targets = targetWords.map(w => normalizeArabic(w));
    this.st = new Array(this.targets.length).fill(null);
  }

  public feed(spokenWords: string[]): void {
    const normalizedSpoken = normalizeList(spokenWords);

    for (const spoken of normalizedSpoken) {
      if (this.currentIdx >= this.targets.length) break;

      const target = this.targets[this.currentIdx];

      if (target === spoken) {
        this.st[this.currentIdx] = 'ok';
        this.currentIdx++;
      } else if (isNearMatch(target, spoken)) {
        this.st[this.currentIdx] = 'near';
        this.currentIdx++;
      } else {
        // Lookahead 1 to see if a word was skipped
        if (this.currentIdx + 1 < this.targets.length && (this.targets[this.currentIdx + 1] === spoken || isNearMatch(this.targets[this.currentIdx + 1], spoken))) {
          this.st[this.currentIdx] = 'miss';
          this.currentIdx++;
          this.st[this.currentIdx] = 'ok';
          this.currentIdx++;
        } else {
          // Word was replaced / wrong
          this.st[this.currentIdx] = 'err';
          this.currentIdx++;
        }
      }
    }
  }

  public preview(interimWords: string[]): { st: WordMatchState[]; cursor: number } {
    const previewSt = [...this.st];
    let tempIdx = this.currentIdx;
    const normalized = normalizeList(interimWords);

    for (const spoken of normalized) {
      if (tempIdx >= this.targets.length) break;
      const target = this.targets[tempIdx];
      if (target === spoken || isNearMatch(target, spoken)) {
        previewSt[tempIdx] = target === spoken ? 'ok' : 'near';
        tempIdx++;
      } else {
        previewSt[tempIdx] = 'err';
        tempIdx++;
      }
    }
    return { st: previewSt, cursor: tempIdx };
  }

  public finalize(): void {
    // Fill remaining unchecked up to current index
    for (let i = 0; i < this.currentIdx; i++) {
      if (!this.st[i]) this.st[i] = 'ok';
    }
  }

  public cursor(): number {
    return this.currentIdx;
  }

  public getStats(): { ok: number; near: number; err: number; miss: number } {
    let ok = 0, near = 0, err = 0, miss = 0;
    for (const s of this.st) {
      if (s === 'ok') ok++;
      else if (s === 'near') near++;
      else if (s === 'err') err++;
      else if (s === 'miss') miss++;
    }
    return { ok, near, err, miss };
  }
}

/**
 * Format numbers into Eastern Arabic numerals (١, ٢, ٣...)
 */
export function toArabicNumerals(num: number | string): string {
  return Number(num).toLocaleString('ar-EG');
}

/**
 * Split text of an ayah into words, preserving markers
 */
export function extractAyahWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/**
 * Get words breakdown for a given Surah
 */
export function getSurahWords(surahNumber: number): QuranWordUnit[] {
  const surah = SAMPLE_QURAN_VERSES[surahNumber] || SAMPLE_QURAN_VERSES[1];
  const units: QuranWordUnit[] = [];

  for (const ayah of surah.ayahs) {
    const words = extractAyahWords(ayah.text);
    words.forEach((w, idx) => {
      units.push({
        word: w,
        normalized: normalizeArabic(w),
        surahNumber,
        ayahNumber: ayah.number,
        isLastWordOfAyah: idx === words.length - 1
      });
    });
  }
  return units;
}
