/** Small input validators shared by several routes. */
import { z } from 'zod';
import { DATE_RE } from './date.js';

/** A calendar day, e.g. "2026-11-19" */
export const dateStr = z.string().regex(DATE_RE, 'Use YYYY-MM-DD');

/** A colour, e.g. "#7C5CFF" */
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex color like #7C5CFF');
