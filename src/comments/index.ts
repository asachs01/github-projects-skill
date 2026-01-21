/**
 * Comment management module exports
 */

export { CommentService, createCommentService } from './service.js';

export type {
  AddCommentInput,
  AddNoteInput,
  GitHubCommentResponse,
  Comment,
  AddNoteResult,
  CommentServiceOptions,
  NoteRequest,
} from './types.js';

export { IssueNotFoundError, AmbiguousIssueMatchError } from './types.js';
