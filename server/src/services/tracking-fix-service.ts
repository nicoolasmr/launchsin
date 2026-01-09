import { logger } from '../infra/structured-logger';

export interface TrackingDetection {
    meta_pixel: boolean;
    gtm: boolean;
    ga4: boolean;
    utm_params: boolean;
}

export interface FixRecommendation {
    type: 'META_PIXEL' | 'GTM' | 'GA4' | 'UTM';
    severity: 'critical' | 'high' | 'medium';
    instructions: string;
    snippet_html?: string;
    snippet_nextjs?: string;
    verification: string;
}

export interface FixPack {
    id: string;
    project_id: string;
    page_url: string;
    detected: TrackingDetection;
    fixes: FixRecommendation[];
}

export class TrackingFixService {

    /**
     * Build fix pack based on detected tracking
     */
    buildFixPack(
        detected: TrackingDetection,
        pageUrl: string,
        projectId: string,
        platformHints?: {
            metaPixelId?: string;
            gtmId?: string;
            ga4Id?: string;
        }
    ): Omit<FixPack, 'id'> {
        const fixes: FixRecommendation[] = [];

        // Meta Pixel
        if (!detected.meta_pixel) {
            const pixelId = platformHints?.metaPixelId || 'YOUR_PIXEL_ID';
            fixes.push({
                type: 'META_PIXEL',
                severity: 'critical',
                instructions: 'Paste this code in the <head> section of your landing page, before the closing </head> tag.',
                snippet_html: this.generateMetaPixelHTML(pixelId),
                snippet_nextjs: this.generateMetaPixelNextJS(pixelId),
                verification: 'After publishing, click "Verify Fix" to confirm the pixel is detected. You can also use Meta Pixel Helper browser extension.'
            });
        }

        // Google Tag Manager
        if (!detected.gtm) {
            const gtmId = platformHints?.gtmId || 'GTM-XXXXXX';
            fixes.push({
                type: 'GTM',
                severity: 'high',
                instructions: 'Add GTM container code to your site. Paste the first snippet in <head> and the second immediately after opening <body> tag.',
                snippet_html: this.generateGTMHTML(gtmId),
                snippet_nextjs: this.generateGTMNextJS(gtmId),
                verification: 'After publishing, verify GTM is firing using Google Tag Assistant or GTM Preview mode.'
            });
        }

        // Google Analytics 4
        if (!detected.ga4) {
            const ga4Id = platformHints?.ga4Id || 'G-XXXXXXXXXX';
            fixes.push({
                type: 'GA4',
                severity: 'high',
                instructions: 'Add GA4 tracking code to your site. Paste in the <head> section.',
                snippet_html: this.generateGA4HTML(ga4Id),
                snippet_nextjs: this.generateGA4NextJS(ga4Id),
                verification: 'After publishing, check real-time reports in Google Analytics to confirm tracking.'
            });
        }

        // UTM Parameters
        if (!detected.utm_params) {
            fixes.push({
                type: 'UTM',
                severity: 'medium',
                instructions: 'Add UTM parameters to your ad destination URL to track campaign performance.',
                verification: 'Verify UTM parameters appear in your analytics platform (GA4, Meta Ads Manager).',
                snippet_html: this.generateUTMExample(pageUrl)
            });
        }

        logger.info('Fix pack generated', {
            project_id: projectId,
            page_url: pageUrl,
            fixes_count: fixes.length,
            types: fixes.map(f => f.type)
        });

        return {
            project_id: projectId,
            page_url: pageUrl,
            detected,
            fixes
        };
    }

    /**
     * Generate Meta Pixel HTML snippet
     */
    private generateMetaPixelHTML(pixelId: string): string {
        return `<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
</script>
<noscript>
  <img height="1" width="1" style="display:none"
       src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/>
</noscript>
<!-- End Meta Pixel Code -->`;
    }

    /**
     * Generate Meta Pixel Next.js snippet
     */
    private generateMetaPixelNextJS(pixelId: string): string {
        return `// In app/layout.tsx or pages/_app.tsx
import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          id="meta-pixel"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: \`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${pixelId}');
              fbq('track', 'PageView');
            \`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}`;
    }

    /**
     * Generate GTM HTML snippet
     */
    private generateGTMHTML(gtmId: string): string {
        return `<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');</script>
<!-- End Google Tag Manager -->

<!-- Google Tag Manager (noscript) - Place immediately after opening <body> tag -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`;
    }

    /**
     * Generate GTM Next.js snippet
     */
    private generateGTMNextJS(gtmId: string): string {
        return `// In app/layout.tsx or pages/_app.tsx
import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          id="gtm"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: \`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');
            \`,
          }}
        />
      </head>
      <body>
        <noscript>
          <iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}"
                  height="0" width="0" style="display:none;visibility:hidden"></iframe>
        </noscript>
        {children}
      </body>
    </html>
  )
}`;
    }

    /**
     * Generate GA4 HTML snippet
     */
    private generateGA4HTML(ga4Id: string): string {
        return `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4Id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${ga4Id}');
</script>`;
    }

    /**
     * Generate GA4 Next.js snippet
     */
    private generateGA4NextJS(ga4Id: string): string {
        return `// In app/layout.tsx or pages/_app.tsx
import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=${ga4Id}"
          strategy="afterInteractive"
        />
        <Script
          id="ga4"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: \`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga4Id}');
            \`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}`;
    }

    /**
     * Generate UTM parameter example
     */
    private generateUTMExample(baseUrl: string): string {
        const url = new URL(baseUrl);
        url.searchParams.set('utm_source', 'facebook');
        url.searchParams.set('utm_medium', 'cpc');
        url.searchParams.set('utm_campaign', 'your_campaign_name');
        url.searchParams.set('utm_content', 'ad_creative_id');

        return `Example URL with UTM parameters:
${url.toString()}

UTM Parameters explained:
- utm_source: Traffic source (e.g., facebook, google, instagram)
- utm_medium: Marketing medium (e.g., cpc, email, social)
- utm_campaign: Campaign name
- utm_content: Ad creative identifier
- utm_term: Keyword (optional, for paid search)

Update your ad destination URL in Meta Ads Manager with these parameters.`;
    }
}

export const trackingFixService = new TrackingFixService();
