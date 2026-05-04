export interface IWebsiteContent {}
export type BigBoard = BigBoardEntry[];

type Position = "QB" | "RB" | "WR" | "TE" | "K" | "OT" | "OG" | "C" | "DE" | "DT" | "LB" | "CB" | "S";

type Height = {
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

export type Article = {
  title: string;
  author: string;
  publicationDate: Date;
  content: string;
  imageUrl?: string;
};