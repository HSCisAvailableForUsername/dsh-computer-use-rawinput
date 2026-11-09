import type { HelperLike } from './helper-client.js';
import type { Rect } from './coords.js';
interface BrowserWindow {
    hwnd: number;
    pid: number;
    exe: string;
}
export interface BrowserTab {
    url?: string;
    tab?: string;
    content?: Rect;
    contentFocused?: boolean;
}
export declare function isBrowser(win: BrowserWindow): boolean;
export declare function httpOrigin(value: string): string | undefined;
export declare function isHarnessAddress(address: string | undefined, harnessUrl: string): boolean;
export declare function readBrowserTab(helper: HelperLike, win: BrowserWindow, details?: boolean): Promise<BrowserTab | undefined>;
export declare function safeSharedBrowserKeys(combos: number[][]): boolean;
export {};
