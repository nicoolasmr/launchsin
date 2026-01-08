
import { Page } from 'playwright';
import { logger } from '../utils/logger';

export interface ExtractedPage {
    url: string;
    title: string;
    h1: string[];
    ctas: string[];
    pixels: string[];
    utms: Record<string, string>;
    redirectChain: string[];
    screenshotBuffer: Buffer;
    contentText: string;
    meta: {
        description: string;
        ogTitle: string;
    };
}

export class PageExtractor {
    static async extract(page: Page, targetUrl: string): Promise<ExtractedPage> {
        logger.info(`Extracting content from ${targetUrl}`);

        // 1. Navigation (Handled by caller, but we ensure we are ready)
        // Check for redirects
        // Check for redirects (Simian approximation)
        const finalUrl = page.url();
        const redirectChain = targetUrl !== finalUrl ? [targetUrl, finalUrl] : [];

        // 2. Extract SEO/Metadata
        const title = await page.title();
        const meta = await page.evaluate(() => {
            const getMeta = (name: string) => document.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content') || '';
            return {
                description: getMeta('description'),
                ogTitle: getMeta('og:title')
            };
        });

        // 3. Extract Text (H1, Body)
        const h1 = await page.evaluate(() => Array.from(document.querySelectorAll('h1')).map(el => (el as HTMLElement).innerText.trim()).filter(t => t.length > 0));
        const contentText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 50000));

        // 4. Extract CTAs (Heuristic: Buttons/Links with short text)
        const ctas = await page.evaluate(() => {
            const buttons: string[] = [];
            document.querySelectorAll('button, a, [role="button"]').forEach((el) => {
                const text = (el as HTMLElement).innerText?.trim();
                const isVisible = (el as HTMLElement).offsetWidth > 0 && (el as HTMLElement).offsetHeight > 0;
                if (text && text.length > 2 && text.length < 40 && isVisible) {
                    // Check if likely a button (style or tag)
                    const tagName = el.tagName.toLowerCase();
                    const cls = el.className.toLowerCase();
                    if (tagName === 'button' || cls.includes('btn') || cls.includes('button') || cls.includes('cta')) {
                        buttons.push(text);
                    }
                }
            });
            return Array.from(new Set(buttons)).slice(0, 10);
        });

        // 5. Detect Pixels
        const html = await page.content();
        const pixels: string[] = [];
        if (html.includes('facebook.com/tr') || html.includes('fbq(')) pixels.push('meta');
        if (html.includes('googletagmanager.com') || html.includes('gtm.start')) pixels.push('gtm');
        if (html.includes('google-analytics.com') || html.includes('ga(') || html.includes('gtag(')) pixels.push('ga');

        // 6. Detect UTMs
        const urlObj = new URL(finalUrl);
        const utms: Record<string, string> = {};
        urlObj.searchParams.forEach((val, key) => {
            if (key.startsWith('utm_')) utms[key] = val;
        });

        // 7. Screenshot
        const screenshotBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 70 });

        return {
            url: finalUrl,
            title,
            h1,
            ctas,
            pixels,
            utms,
            redirectChain,
            screenshotBuffer,
            contentText,
            meta
        };
    }
}
