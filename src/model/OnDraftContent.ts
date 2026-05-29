export interface IOnDraftContent {}
export const BIG_BOARD_CREATORS = ["Ryan", "Aleks", "Consensus"] as const;
export type BigBoardCreator = typeof BIG_BOARD_CREATORS[number];

export type BigBoard = {
  year: number;
  creator: BigBoardCreator;
  entries: BigBoardEntry[];
};

export const POSITIONS = ["QB", "RB", "WR", "TE", "OT", "IOL", "EDGE", "IDL", "LB", "CB", "S"] as const;
export type Position = typeof POSITIONS[number];

export type Height = {
  feet: number;
  inches: number;
};

export type BigBoardWriteup = {
  strengths: string;
  weaknesses: string;
  rundown: string;
};

export type BigBoardEntry = {
  id: string;
  playerName: string;
  position: Position | "";
  school: string;
  rank: number | null;
  posRank: number | null;
  height: Height | null;
  weight: number | null;
  playerInfoPublished: boolean;
  writeup: BigBoardWriteup;
  writeupPublished: boolean;
  notes: string;
  bigDiscrepency?: boolean;
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

export type DraftBoardFilter = {
  position?: Position;
  school?: string;
}

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

export type Video = {
  youtubeUrl: string;
  title: string;
  description: string;
  videoId: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  thumbnailUrl?: string;
  viewCount?: number;
  youtubeStatsFetchedAt?: Date;
}

export type VideoQuery = {
  keyword?: string;
  tags?: string[];
  dateRange?: {
    from: Date;
    to: Date;
  };
  sortBy?: "date" | "popularity";
  sortDirection?: "asc" | "desc";
}

export type ConsensusBigBoard = {
  year: number;
  entries: ConsensusBigBoardEntry[];
};

export type ConsensusBigBoardEntry = {
  playerName: string;
  position: Position;
  school: string;
  rank: number | null;
  posRank: number | null;
  height: Height | null;
  weight: number | null;
  writeup?: ConsensusWriteup;
  bigDiscrepency: boolean;
};

export type ConsensusWriteup = {
  ryanWriteup: string;
  aleksWriteup: string;
};
