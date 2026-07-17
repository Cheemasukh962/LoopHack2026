import type { RequestHandler } from "express";
import type { User } from "@shared/api";
import { DEMO_USER } from "../data/demo";

export const handleMe: RequestHandler = (_req, res) => {
  const user: User = DEMO_USER;
  res.status(200).json(user);
};
