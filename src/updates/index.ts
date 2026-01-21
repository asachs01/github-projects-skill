/**
 * Project item status updates module
 */

export { StatusUpdater, createStatusUpdater } from './status-updater.js';

export {
  findBestMatch,
  findMatches,
  getSuggestions,
  calculateMatchScore,
  levenshteinDistance,
  levenshteinSimilarity,
  normalizeString,
  parseNumberQuery,
  findByNumber,
  wordMatchesPartial,
  containsAllWords,
  wordOverlapScore,
  DEFAULT_MIN_SCORE,
} from './matcher.js';

export type {
  StatusUpdateRequest,
  StatusUpdateResult,
  StatusUpdaterOptions,
  StatusUpdateConfig,
  StatusAliasMap,
  MatchResult,
} from './types.js';

export {
  DEFAULT_STATUS_ALIASES,
  ItemNotFoundError,
  AmbiguousMatchError,
  InvalidStatusError,
} from './types.js';
