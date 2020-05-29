import { CommentsFilterOption } from '@codesandbox/common/es/types';
import { CommentFragment, CommentWithRepliesFragment } from 'app/graphql/types';
import { RootState } from 'app/overmind';
import isToday from 'date-fns/isToday';
import { derived } from 'overmind';

export const OPTIMISTIC_COMMENT_ID = 'OPTIMISTIC_COMMENT_ID';

type FileComments = {
  [path: string]: Array<{
    commentId: string;
    range: [number, number];
  }>;
};

type State = {
  comments: {
    [sandboxId: string]: {
      [commentId: string]: CommentFragment;
    };
  };
  currentComments: CommentFragment[];
  selectedCommentsFilter: CommentsFilterOption;
  currentCommentId: string | null;
  currentCommentPositions: {
    trigger: { left: number; top: number; right: number; bottom: number };
    dialog: { left: number; top: number; right: number; bottom: number } | null;
  } | null;
  currentComment: CommentWithRepliesFragment | null;
  fileComments: FileComments;
  currentCommentsByDate: {
    today: CommentFragment[];
    prev: CommentFragment[];
  };
  multiCommentsSelector: {
    ids: string[];
    x: number;
    y: number;
  } | null;
};

export const state: State = {
  multiCommentsSelector: null,
  currentCommentPositions: null,
  comments: {},
  currentCommentId: null,
  fileComments: derived(
    ({ comments }: State, { editor: { currentSandbox } }: RootState) => {
      if (!currentSandbox || !comments[currentSandbox.id]) {
        return {};
      }
      const rootComments = Object.values(comments[currentSandbox.id]).filter(
        comment => comment.parentComment == null && !comment.isResolved
      );

      return rootComments.reduce<{
        [path: string]: Array<{
          commentId: string;
          range: [number, number];
        }>;
      }>((aggr, comment) => {
        comment.references.forEach(reference => {
          if (reference.type === 'code') {
            if (!aggr[reference.metadata.path]) {
              aggr[reference.metadata.path] = [];
            }
            aggr[reference.metadata.path].push({
              commentId: comment.id,
              range: [reference.metadata.anchor, reference.metadata.head],
            });
          }
        });

        return aggr;
      }, {});
    }
  ),
  currentComment: derived(
    (
      { comments, currentCommentId }: State,
      { editor: { currentSandbox } }: RootState
    ) => {
      if (
        !currentSandbox ||
        !comments[currentSandbox.id] ||
        !currentCommentId
      ) {
        return null;
      }

      function sortByInsertedAt(
        commentA: CommentFragment | null,
        commentB: CommentFragment | null
      ) {
        if (!commentA || !commentB) {
          return 0;
        }

        const aDate = new Date(commentA.insertedAt);
        const bDate = new Date(commentB.insertedAt);

        if (aDate > bDate) {
          return 1;
        }

        if (bDate < aDate) {
          return -1;
        }

        return 0;
      }

      return {
        ...comments[currentSandbox.id][currentCommentId],
        comments: Object.keys(comments[currentSandbox.id])
          .reduce<CommentFragment[]>((aggr, commentId) => {
            if (
              comments[currentSandbox.id][commentId].parentComment?.id ===
              currentCommentId
            ) {
              return aggr.concat(comments[currentSandbox.id][commentId]);
            }

            return aggr;
          }, [])
          .sort(sortByInsertedAt),
      };
    }
  ),
  selectedCommentsFilter: CommentsFilterOption.OPEN,
  currentComments: derived(
    (
      { comments, selectedCommentsFilter }: State,
      { editor: { currentSandbox } }: RootState
    ) => {
      if (!currentSandbox || !comments[currentSandbox.id]) {
        return [];
      }

      function sortByInsertedAt(
        commentA: CommentFragment,
        commentB: CommentFragment
      ) {
        const aDate = new Date(commentA.insertedAt);
        const bDate = new Date(commentB.insertedAt);

        if (aDate > bDate) {
          return -1;
        }

        if (bDate < aDate) {
          return 1;
        }

        return 0;
      }

      const rootComments = Object.values(comments[currentSandbox.id]).filter(
        comment =>
          comment.parentComment == null && comment.id !== OPTIMISTIC_COMMENT_ID
      );
      switch (selectedCommentsFilter) {
        case CommentsFilterOption.ALL:
          return rootComments.sort(sortByInsertedAt);
        case CommentsFilterOption.RESOLVED:
          return rootComments
            .filter(comment => comment.isResolved)
            .sort(sortByInsertedAt);
        case CommentsFilterOption.OPEN:
          return rootComments
            .filter(comment => !comment.isResolved)
            .sort(sortByInsertedAt);
        default:
          return [];
      }
    }
  ),
  currentCommentsByDate: derived(({ currentComments }: State) =>
    currentComments.reduce<{
      today: CommentFragment[];
      prev: CommentFragment[];
    }>(
      (acc, comment) => {
        if (
          isToday(new Date(comment.insertedAt)) ||
          isToday(new Date(comment.updatedAt))
        ) {
          acc.today.push(comment);
        } else {
          acc.prev.push(comment);
        }

        return acc;
      },
      {
        today: [],
        prev: [],
      }
    )
  ),
};
