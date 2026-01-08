import puppeteer, { Browser } from 'puppeteer';
import { logger } from '../infra/structured-logger';
import { PageAnalysis } from './alignment-engine';

/**
 * Page Scraper
 * Uses Puppeteer to render and extract content.
 */
export class PageScraper {
    private static BROWSER_ARGS = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
    ];

    public async scrapePage(url: string): Promise<PageAnalysis> {
        let browser: Browser | null = null;
        try {
            logger.debug(`Starting scrape for URL: ${url}`);

            browser = await puppeteer.launch({
                headless: true,
                args: PageScraper.BROWSER_ARGS
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.88 Safari/537.36');
            await page.setViewport({ width: 1280, height: 800 });

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            const data = await page.evaluate(() => {
                const title = document.title || '';

                const metaDesc = document.querySelector('meta[name="description"], meta[property="description"]');
                const description = metaDesc ? metaDesc.getAttribute('content') || '' : '';

                const metaOgTitle = document.querySelector('meta[name="og:title"], meta[property="og:title"]');
                const ogTitle = metaOgTitle ? metaOgTitle.getAttribute('content') || '' : '';

                const metaOgDesc = document.querySelector('meta[name="og:description"], meta[property="og:description"]');
                const ogDescription = metaOgDesc ? metaOgDesc.getAttribute('content') || '' : '';

                const h1s = Array.from(document.querySelectorAll('h1')).map(el => (el as HTMLElement).innerText.trim()).filter(t => t.length > 0);
                const h2s = Array.from(document.querySelectorAll('h2')).map(el => (el as HTMLElement).innerText.trim()).filter(t => t.length > 0);

                // CTA detection
                const buttons: string[] = [];
                document.querySelectorAll('button, a[class*="btn"], a[class*="button"]').forEach((el: any) => {
                    const text = el.innerText;
                    if (text && text.length < 50) buttons.push(text.trim());
                });

                // Pixel detection
                const html = document.documentElement.innerHTML;
                const hasPixel = html.includes('facebook.com/tr') || !!(window as any).fbq;

                return {
                    title,
                    description,
                    ogTitle,
                    ogDescription,
                    h1: h1s,
                    h2: h2s,
                    bodyText: document.body.innerText,
                    hasPixel: hasPixel,
                    ctaButtons: buttons.slice(0, 5)
                };
            });

            return {
                url,
                title: data.title,
                description: data.description,
                h1: data.h1,
                h2: data.h2,
                visibleText: data.bodyText.replace(/\s+/g, ' ').trim().slice(0, 50000),
                bodyText: data.bodyText,
                meta: {
                    ogTitle: data.ogTitle,
                    ogDescription: data.ogDescription,
                    hasPixel: data.hasPixel
                },
                has_pixel: data.hasPixel,
                has_utm: url.includes('utm_source'),
                cta_buttons: data.ctaButtons,
                has_form: data.bodyText.toLowerCase().includes('email') || data.bodyText.toLowerCase().includes('submit') // Naive
            };

        } catch (error: any) {
            logger.error(`Failed to scrape ${url}`, { error: error.message });
            return {
                url,
                title: '',
                description: '',
                h1: [],
                h2: [],
                visibleText: '',
                bodyText: '',
                meta: {},
                error: error.message
            };
        } finally {
            if (browser) await browser.close();
        }
    }
}

export const pageScraper = new PageScraper();

