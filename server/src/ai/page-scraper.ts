import axios from 'axios';
import { logger } from '../infra/structured-logger';
import { PageAnalysis } from './alignment-engine';

/**
 * Page Scraper
 * 
 * Lightweight scraper to extract key elements from landing pages:
 * - Title, H1, meta description
 * - CTA buttons
 * - Tracking pixels (Meta, Google)
 * - UTM parameters
 * - Forms
 */

export class PageScraper {
    /**
     * Scrape landing page for analysis
     */
    public async scrapePage(url: string): Promise<PageAnalysis> {
        try {
            // Fetch page HTML
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'LaunchSin-Bot/1.0'
                },
                maxRedirects: 5
            });

            const html = response.data;

            // Extract elements
            const title = this.extractTitle(html);
            const h1 = this.extractH1(html);
            const metaDescription = this.extractMetaDescription(html);
            const ctaButtons = this.extractCTAButtons(html);
            const hasPixel = this.detectPixel(html);
            const hasUTM = this.detectUTM(url);
            const hasForm = this.detectForm(html);

            logger.info('Page scraped successfully', {
                url,
                title,
                has_pixel: hasPixel,
                has_utm: hasUTM,
                cta_count: ctaButtons.length
            });

            return {
                url,
                title,
                h1,
                meta_description: metaDescription,
                has_pixel: hasPixel,
                has_utm: hasUTM,
                has_form: hasForm,
                cta_buttons: ctaButtons
            };

        } catch (error: any) {
            logger.error('Page scraping failed', {
                url,
                error: error.message
            });

            // Return minimal analysis on error
            return {
                url,
                has_pixel: false,
                has_utm: this.detectUTM(url),
                has_form: false,
                cta_buttons: []
            };
        }
    }

    private extractTitle(html: string): string | undefined {
        const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        return match ? match[1].trim() : undefined;
    }

    private extractH1(html: string): string | undefined {
        const match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        return match ? match[1].trim() : undefined;
    }

    private extractMetaDescription(html: string): string | undefined {
        const match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        return match ? match[1].trim() : undefined;
    }

    private extractCTAButtons(html: string): string[] {
        const buttons: string[] = [];

        // Match button elements
        const buttonRegex = /<button[^>]*>([^<]+)<\/button>/gi;
        let match;
        while ((match = buttonRegex.exec(html)) !== null) {
            buttons.push(match[1].trim());
        }

        // Match links that look like buttons
        const linkRegex = /<a[^>]*class=["'][^"']*btn[^"']*["'][^>]*>([^<]+)<\/a>/gi;
        while ((match = linkRegex.exec(html)) !== null) {
            buttons.push(match[1].trim());
        }

        return buttons.slice(0, 5); // Limit to top 5
    }

    private detectPixel(html: string): boolean {
        // Meta Pixel
        if (html.includes('facebook.com/tr') || html.includes('fbq(')) {
            return true;
        }

        // Google Analytics
        if (html.includes('google-analytics.com') || html.includes('gtag(')) {
            return true;
        }

        // Google Tag Manager
        if (html.includes('googletagmanager.com')) {
            return true;
        }

        return false;
    }

    private detectUTM(url: string): boolean {
        return url.includes('utm_source') || url.includes('utm_campaign');
    }

    private detectForm(html: string): boolean {
        return html.includes('<form') || html.includes('type="email"');
    }
}

export const pageScraper = new PageScraper();
