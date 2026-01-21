/**
 * Fuzzy title matching utility for finding project items
 */

import type { ProjectItem, IssueContent, PullRequestContent } from '../github/types.js';
import type { MatchResult } from './types.js';

/**
 * Default minimum score threshold for considering a match valid
 */
export const DEFAULT_MIN_SCORE = 0.3;

/**
 * Normalize a string for comparison (lowercase, trim, collapse whitespace)
 */
export function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings using Levenshtein distance
 * Returns a value between 0 (completely different) and 1 (identical)
 */
export function levenshteinSimilarity(a: string, b: string): number {
  const normalizedA = normalizeString(a);
  const normalizedB = normalizeString(b);

  if (normalizedA === normalizedB) return 1;
  if (normalizedA.length === 0 || normalizedB.length === 0) return 0;

  const distance = levenshteinDistance(normalizedA, normalizedB);
  const maxLength = Math.max(normalizedA.length, normalizedB.length);

  return 1 - distance / maxLength;
}

/**
 * Check if query contains target substring (case-insensitive)
 */
export function containsSubstring(text: string, query: string): boolean {
  return normalizeString(text).includes(normalizeString(query));
}

/**
 * Check if one word is a prefix/abbreviation of another
 * (e.g., "docs" matches "documentation", "auth" matches "authentication")
 */
export function wordMatchesPartial(queryWord: string, textWord: string): boolean {
  // Exact match
  if (queryWord === textWord) return true;

  // Query word is prefix of text word (docs -> documentation)
  if (textWord.startsWith(queryWord) && queryWord.length >= 3) return true;

  // Text word is prefix of query word
  if (queryWord.startsWith(textWord) && textWord.length >= 3) return true;

  // One contains the other
  if (textWord.includes(queryWord) && queryWord.length >= 3) return true;
  if (queryWord.includes(textWord) && textWord.length >= 3) return true;

  // Common abbreviation patterns: check if query word shares same root
  // e.g., "docs" -> "doc" root should match "documentation" -> "doc" root
  const minLen = Math.min(queryWord.length, textWord.length);
  if (minLen >= 3) {
    // Check if they share a common prefix of at least 3 chars
    const commonPrefix = queryWord.substring(0, 3);
    if (textWord.startsWith(commonPrefix)) return true;
  }

  return false;
}

/**
 * Check if all words in query appear in the text (word-based matching)
 * Supports partial word matching (e.g., "docs" matches "documentation")
 */
export function containsAllWords(text: string, query: string): boolean {
  const textWords = normalizeString(text).split(' ').filter(w => w.length > 0);
  const queryWords = normalizeString(query).split(' ').filter(w => w.length > 0);

  return queryWords.every(queryWord =>
    textWords.some(textWord => wordMatchesPartial(queryWord, textWord))
  );
}

/**
 * Calculate word overlap score between query and text
 * Returns a value between 0 and 1
 */
export function wordOverlapScore(text: string, query: string): number {
  const textWords = normalizeString(text).split(' ').filter(w => w.length > 0);
  const queryWords = normalizeString(query).split(' ').filter(w => w.length > 0);

  if (queryWords.length === 0) return 0;

  const matchingWords = queryWords.filter(queryWord =>
    textWords.some(textWord => wordMatchesPartial(queryWord, textWord))
  );

  return matchingWords.length / queryWords.length;
}

/**
 * Calculate combined fuzzy match score
 * Uses multiple strategies and returns the best score
 */
export function calculateMatchScore(title: string, query: string): number {
  const normalizedTitle = normalizeString(title);
  const normalizedQuery = normalizeString(query);

  // Exact match
  if (normalizedTitle === normalizedQuery) {
    return 1.0;
  }

  // Title starts with query (high priority)
  if (normalizedTitle.startsWith(normalizedQuery)) {
    return 0.95;
  }

  // Query is a substring of title
  if (containsSubstring(title, query)) {
    // Score based on how much of the title is covered
    const coverage = normalizedQuery.length / normalizedTitle.length;
    return 0.7 + (coverage * 0.2); // 0.7-0.9 range
  }

  // All words in query appear in title
  if (containsAllWords(title, query)) {
    return 0.65;
  }

  // Word overlap scoring
  const wordScore = wordOverlapScore(title, query);
  if (wordScore > 0.5) {
    return 0.4 + (wordScore * 0.2); // 0.4-0.6 range
  }

  // Levenshtein similarity for typo tolerance
  const levenScore = levenshteinSimilarity(title, query);
  if (levenScore > 0.5) {
    return levenScore * 0.5; // 0.25-0.5 range
  }

  return levenScore * 0.3; // Low confidence match
}

/**
 * Extract title from project item content
 */
export function getItemTitle(item: ProjectItem): string | null {
  if (!item.content) return null;
  return item.content.title;
}

/**
 * Extract number from project item content
 */
export function getItemNumber(item: ProjectItem): number | null {
  if (!item.content) return null;
  return item.content.number;
}

/**
 * Check if a query is an issue/PR number reference (e.g., "#12", "12")
 */
export function parseNumberQuery(query: string): number | null {
  const trimmed = query.trim();

  // Match #123 or just 123
  const match = trimmed.match(/^#?(\d+)$/);
  if (match) {
    return parseInt(match[1], 10);
  }

  return null;
}

/**
 * Find items matching a query by number
 */
export function findByNumber(items: ProjectItem[], number: number): ProjectItem | null {
  return items.find(item => getItemNumber(item) === number) ?? null;
}

/**
 * Find all matching items with scores
 */
export function findMatches(
  items: ProjectItem[],
  query: string,
  minScore: number = DEFAULT_MIN_SCORE
): MatchResult[] {
  // First, check if this is a number query
  const numberQuery = parseNumberQuery(query);
  if (numberQuery !== null) {
    const item = findByNumber(items, numberQuery);
    if (item) {
      const title = getItemTitle(item) ?? `#${numberQuery}`;
      return [{
        item,
        score: 1.0,
        title,
        number: numberQuery,
      }];
    }
    return [];
  }

  // Fuzzy match on titles
  const matches: MatchResult[] = [];

  for (const item of items) {
    const title = getItemTitle(item);
    const number = getItemNumber(item);

    if (!title || number === null) continue;

    const score = calculateMatchScore(title, query);
    if (score >= minScore) {
      matches.push({
        item,
        score,
        title,
        number,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  return matches;
}

/**
 * Find the best matching item, returning null if no good match found
 */
export function findBestMatch(
  items: ProjectItem[],
  query: string,
  minScore: number = DEFAULT_MIN_SCORE
): MatchResult | null {
  const matches = findMatches(items, query, minScore);
  return matches.length > 0 ? matches[0] : null;
}

/**
 * Get suggestions for similar items when no match found
 */
export function getSuggestions(
  items: ProjectItem[],
  query: string,
  maxSuggestions: number = 3
): string[] {
  // Get all items with any non-zero score
  const matches = findMatches(items, query, 0.1);

  return matches
    .slice(0, maxSuggestions)
    .map(m => `#${m.number}: ${m.title}`);
}
