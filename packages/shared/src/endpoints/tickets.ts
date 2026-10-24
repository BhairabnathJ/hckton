import { z } from "zod";
import { ticket } from "../entities/ticket.js";

/** GET /tickets — tickets filtered to the current user's level. */
export const listTicketsResponse = z.array(ticket);

/** GET /tickets/:id — a single public ticket view (no hiddenTestRef). */
export const getTicketResponse = ticket;
