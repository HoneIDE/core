export {
  searchFileContent,
  groupByFile,
  totalMatchCount,
  computeReplace,
  isTextFile,
  TEXT_EXTENSIONS,
  SKIP_DIRS,
  DEFAULT_SEARCH_OPTIONS,
} from './search-model';
export type {
  SearchMatch,
  FileSearchResult,
  SearchOptions,
} from './search-model';
export { RipgrepSearcher } from './ripgrep';
export type { RipgrepOptions } from './ripgrep';
