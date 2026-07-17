import type { RequestHandler } from "express";
import { getIssue } from "../data/demo";

export const handleIssue: RequestHandler = (req, res) => {
  const issue = getIssue(req.params.id);
  if (!issue) {
    res.status(404).json({ error: "issue not found", id: req.params.id });
    return;
  }
  res.status(200).json(issue);
};
