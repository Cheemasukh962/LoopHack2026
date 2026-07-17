import type { RequestHandler } from "express";
import type { FeedItem } from "@shared/api";
import { DEMO_FEED } from "../data/demo";

export const handleFeed: RequestHandler = (_req, res) => {
  const items: FeedItem[] = DEMO_FEED;
  res.status(200).json(items);
};
