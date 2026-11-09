/** System-prompt guidance for driving the desktop. No `{{` sequences: the host interpolates them. */
import type { AccessMode } from './access.js';
export declare function promptText(mode: AccessMode): string;
