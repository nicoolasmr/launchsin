
import { pageScraper } from '../ai/page-scraper';
import { alignmentEngine, AdContent } from '../ai/alignment-engine';
import { logger } from '../infra/structured-logger';

async function main() {
    console.log('--- Starting Alignment Verification ---');

    // 1. Test Scraper
    console.log('\nScanning example.com...');
    try {
        const page = await pageScraper.scrapePage('https://example.com');
        console.log('Scrape Success!');
        console.log('Full Page Object:', JSON.stringify(page, null, 2));
        console.log(`Title: ${page.title}`);
        console.log(`H1: ${page.h1?.join(', ')}`);

        // 2. Test Alignment Engine
        const ad: AdContent = {
            headline: 'Example Domain',
            body: 'This domain is for use in illustrative examples in documents.',
            cta: 'More Information',
            creativeId: 'test-ad-1',
            imageUrl: 'https://example.com/test.png'
        };

        if (process.env.OPENAI_API_KEY) {
            console.log('\nAnalyzing alignment...');
            const result = await alignmentEngine.analyze(ad, page);
            console.log('Analysis Success!');
            console.log(`Score: ${result.score}`);
            console.log(`Summary: ${result.summary}`);
        } else {
            console.log('\nSkipping AI Analysis (OPENAI_API_KEY not found)');
        }

    } catch (error: any) {
        console.error('Verification Failed:', error.message);
        process.exit(1);
    }
}

main();
