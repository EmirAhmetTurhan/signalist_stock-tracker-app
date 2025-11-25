import { Inngest} from "inngest";
import {apiKey} from "better-auth/plugins";

export const inngest = new Inngest({
    id: 'signalist',
    ai: { gemini: { apiKey: process.env.GEMINI_API_KEY! }}
})