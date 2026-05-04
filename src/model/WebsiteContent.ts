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

export type ArticleContent =
  | {
      type: "plainText";
      text: string;
    }
  | {
      kind: "html";
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
  title: string;
  author: string;
  publicationDate: Date;
  content: ArticleContent;
  imageUrl?: string;
};
