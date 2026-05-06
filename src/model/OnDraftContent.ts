export interface IOnDraftContent {}
export const BIG_BOARD_CREATORS = ["Ryan", "Aleks"] as const;
export type BigBoardCreator = typeof BIG_BOARD_CREATORS[number];

export type BigBoard = {
  year: number;
  creator: BigBoardCreator;
  entries: BigBoardEntry[];
};

export type Position = "QB" | "RB" | "WR" | "TE" | "K" | "OT" | "OG" | "C" | "DE" | "DT" | "LB" | "CB" | "S";

export type Height = {
  feet: number;
  inches: number;
};

export type BigBoardEntry = {
  playerName: string;
  position: Position;
  school: string;
  rank: number;
  posRank: number;
  writeup: string;
  age: number;
  height: Height;
  weight: number;
};

export type ArticleFilter = {
  author?: string;
  published?: boolean;
  sortBy?: "date" | "likes" | "comments";
  sortDirection?: "asc" | "desc";
  publicationDateRange?: {
    from: Date;
    to: Date;
  };
  keyword?: string;
  tags?: string[];
};

export type ArticleContent =
  | {
      type: "plainText";
      text: string;
    }
  | {
      type: "html";
      body: string;
    }
  | {
      type: "pdf";
      url: string;
      originalName: string;
      mimeType: "application/pdf";
      size: number;
    };

export type Article = {
  id: string;
  published: boolean;
  title: string;
  author: string;
  writeup: string;
  tags?: string[];
  publicationDate: Date;
  content: ArticleContent;
  imageUrl?: string;
  comments: Comment[];
  likes: number;
  likedByUserIds: string[];
};

export type ForumPost = {
  id: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: Date;
  likes: number;
  likedByUserIds: string[];
  comments: Comment[];
};

export type ForumPostFilter = {
  userId?: string;
  keyword?: string;
  sortBy?: "date" | "likes" | "comments";
  sortDirection?: "asc" | "desc";
  dateRange?: { from: Date; to: Date };
};

export type Comment = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: Date;
  likes: number;
  likedByUserIds: string[];
  replies: Comment[];
};
