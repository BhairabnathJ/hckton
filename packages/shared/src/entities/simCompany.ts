import { z } from "zod";

/** SimCompany entity — owns tickets and a repo template (architecture §3, C3). */
export const simCompany = z.object({
  id: z.string(),
  name: z.string(),
  repoTemplateUrl: z.string().url(),
});

export type SimCompany = z.infer<typeof simCompany>;
