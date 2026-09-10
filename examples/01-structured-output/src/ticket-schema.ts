import { z } from "zod";

export const ticketSchema = z.object({
  title: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]),
  tags: z.array(z.string().min(1)).min(1),
  dueInDays: z.number().int().positive(),
});

export type Ticket = z.infer<typeof ticketSchema>;
