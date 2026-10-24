import { z } from "zod";

/** Company entity — posts marketplace jobs (reconciled architecture §3, C3). */
export const company = z.object({
  id: z.string(),
  name: z.string(),
  size: z.string(),
});

export type Company = z.infer<typeof company>;
