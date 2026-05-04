export interface IWebsiteContent {}
export type BigBoard = BigBoardEntry[];

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
  title: string;
  author: string;
  tags?: string[];
  publicationDate: Date;
  content: ArticleContent;
  imageUrl?: string;
};
