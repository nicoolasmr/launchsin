
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { logger } from '../utils/logger';

let browserInstance: Browser | null = null;

export const BROWSER_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-mjpeg-decode',
    '--disable-gpu'
];

export async function getBrowser(): Promise<Browser> {
    if (browserInstance) return browserInstance;

    logger.info('Launching Playwright Browser...');
    try {
        browserInstance = await chromium.launch({
            headless: process.env.PLAYWRIGHT_HEADLESS !== 'false',
            args: BROWSER_ARGS
        });
        return browserInstance;
    } catch (error: any) {
        logger.error('Failed to launch browser', { error: error.message });
        throw error;
    }
}

export async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
    }
}

/**
 * Wrapper to run a function within a Page context, ensuring cleanup.
 */
export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await getBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();

    try {
        return await fn(page);
    } finally {
        await page.close();
        await context.close();
    }
}
