import { z } from "zod";
export const assetSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
  url: z.string().url().max(3000),
  sourceUrl: z.string().url().max(3000),
  title: z.string().min(1).max(300),
  creator: z.string().min(1).max(500),
  license: z.string().min(1).max(150),
  licenseUrl: z.string().url().max(1000),
  alt: z.string().min(1).max(2000),
});
export const assetsSchema = z.array(assetSchema).max(20).default([]);
